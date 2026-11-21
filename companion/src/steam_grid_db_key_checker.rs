use std::io::Write;
use std::process::{Command, Stdio};

use crate::request_language::RequestLanguage;

/// Checks a SteamGridDB API key with one real request (an autocomplete search), so the clients can
/// say "works" or "invalid" right when the key is entered. The key goes to curl through stdin, so
/// it never shows up in the process list, and it is never logged or stored here.
pub struct SteamGridDbKeyChecker;

impl SteamGridDbKeyChecker
{
    const TEST_URL: &'static str = "https://www.steamgriddb.com/api/v2/search/autocomplete/portal";

    /// Ok when SteamGridDB accepts the key; else (status code for the client, message).
    pub fn check(&self, key: &str) -> Result<(), (u16, String)>
    {
        let invalid = || (400, RequestLanguage::pick("SteamGridDB-Schlüssel ungültig", "SteamGridDB key invalid"));
        // Keys are 32 hex characters; anything else can't work and must not reach the curl config.
        if key.is_empty() || key.len() > 128 || !key.chars().all(|character| character.is_ascii_alphanumeric())
        {
            return Err(invalid());
        }

        let mut curl_config = String::new();
        curl_config += &format!("url = \"{}\"\n", Self::TEST_URL);
        curl_config += &format!("header = \"Authorization: Bearer {}\"\n", key);
        curl_config += "header = \"User-Agent: Albedo-Companion\"\n";
        let mut curl_process = Command::new("curl")
            .args(["-s", "-o", "/dev/null", "--max-time", "10", "-w", "%{http_code}", "-K", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| (500, format!("{}: {}", RequestLanguage::pick("curl nicht startbar", "Cannot start curl"), error)))?;
        curl_process
            .stdin
            .take()
            .expect("stdin is piped")
            .write_all(curl_config.as_bytes())
            .map_err(|error| (500, error.to_string()))?;
        let curl_output = curl_process.wait_with_output().map_err(|error| (500, error.to_string()))?;

        match String::from_utf8_lossy(&curl_output.stdout).trim().parse::<u16>().unwrap_or(0)
        {
            200 => Ok(()),
            401 | 403 => Err(invalid()),
            0 => Err((502, RequestLanguage::pick("SteamGridDB nicht erreichbar", "SteamGridDB unreachable"))),
            status_code => Err((502, format!("{} {}", RequestLanguage::pick("SteamGridDB antwortet mit", "SteamGridDB answered with"), status_code))),
        }
    }
}
