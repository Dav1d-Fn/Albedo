use std::io::Write;
use std::process::{Command, Stdio};

use crate::request_language::RequestLanguage;

/// SteamGridDB's API with the key stored in config.json. The Deck and this PC's UI never get the
/// key: their picture search asks SteamGridDB through `GET /api/steamgriddb/<path>`, which lands
/// here. The key goes to curl through stdin, so it never shows up in the process list, and it is
/// never logged.
pub struct SteamGridDbClient;

impl SteamGridDbClient
{
    const API_URL: &'static str = "https://www.steamgriddb.com/api/v2/";
    /// The parts of the API the picture search uses; nothing else is passed through.
    const ALLOWED_FIRST_SEGMENTS: [&'static str; 4] = ["search", "grids", "heroes", "logos"];

    /// Keys are 32 hex characters; anything else can't work and must not reach the curl config.
    pub fn is_plausible_key(key: &str) -> bool
    {
        !key.is_empty() && key.len() <= 128 && key.chars().all(|character| character.is_ascii_alphanumeric())
    }

    /// Ok when SteamGridDB accepts the key; else (status code for the client, message).
    pub fn check(key: &str) -> Result<(), (u16, String)>
    {
        let invalid = || (400, RequestLanguage::pick("SteamGridDB-Schlüssel ungültig", "SteamGridDB key invalid"));
        if !Self::is_plausible_key(key)
        {
            return Err(invalid());
        }
        let (status_code, _) = Self::get("search/autocomplete/portal", key)?;
        match status_code
        {
            200 => Ok(()),
            401 | 403 => Err(invalid()),
            _ => Err((502, format!("{} {}", RequestLanguage::pick("SteamGridDB antwortet mit", "SteamGridDB answered with"), status_code))),
        }
    }

    /// `path_and_query` below /api/v2/ as the client sent it (already percent-encoded), e.g.
    /// "grids/steam/1245620?types=static". Answers SteamGridDB's status code and JSON body.
    pub fn get(path_and_query: &str, key: &str) -> Result<(u16, Vec<u8>), (u16, String)>
    {
        if !Self::is_allowed_path(path_and_query)
        {
            return Err((400, RequestLanguage::pick("Unbekannter SteamGridDB-Pfad", "Unknown SteamGridDB path")));
        }
        if !Self::is_plausible_key(key)
        {
            return Err((400, RequestLanguage::pick("SteamGridDB-Schlüssel ungültig", "SteamGridDB key invalid")));
        }

        let mut curl_config = String::new();
        curl_config += &format!("url = \"{}{}\"\n", Self::API_URL, path_and_query);
        curl_config += &format!("header = \"Authorization: Bearer {}\"\n", key);
        curl_config += "header = \"User-Agent: Albedo-Companion\"\n";
        let mut curl_process = Command::new("curl")
            .args(["-s", "--max-time", "15", "--max-filesize", "4000000", "-w", "\n%{http_code}", "-K", "-"])
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

        // curl prints the body, then a line with the status code ("000" when nothing answered).
        let mut body = curl_output.stdout;
        let status_start = body.iter().rposition(|byte| *byte == b'\n').unwrap_or(0);
        let status_code = String::from_utf8_lossy(&body[status_start..]).trim().parse::<u16>().unwrap_or(0);
        body.truncate(status_start);
        if status_code == 0
        {
            return Err((502, RequestLanguage::pick("SteamGridDB nicht erreichbar", "SteamGridDB unreachable")));
        }
        Ok((status_code, body))
    }

    /// Only the picture search's API parts, only URL characters that are safe inside the quoted
    /// curl config value, and no way up out of /api/v2/.
    fn is_allowed_path(path_and_query: &str) -> bool
    {
        let first_segment = path_and_query.split(['/', '?']).next().unwrap_or_default();
        let safe_characters = path_and_query
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-._~%/?&=,:+!*'()@;$".contains(character));
        Self::ALLOWED_FIRST_SEGMENTS.contains(&first_segment) && safe_characters && !path_and_query.contains("..")
    }
}

#[cfg(test)]
mod tests
{
    use super::SteamGridDbClient;

    #[test]
    fn passes_only_picture_search_paths()
    {
        assert!(SteamGridDbClient::is_allowed_path("grids/steam/1245620?dimensions=600x900%2C342x482&types=static"));
        assert!(SteamGridDbClient::is_allowed_path("search/autocomplete/Ratchet%20&%20Clank:%20Rift%2FApart%3F"));
        assert!(!SteamGridDbClient::is_allowed_path("users/me"));
        assert!(!SteamGridDbClient::is_allowed_path("grids/../users"));
        assert!(!SteamGridDbClient::is_allowed_path("grids/x\"\nurl = \"http://evil"));
        assert!(!SteamGridDbClient::is_allowed_path("heroes/game 1"));
    }

    #[test]
    fn plausible_keys_are_short_and_alphanumeric()
    {
        assert!(SteamGridDbClient::is_plausible_key("0123456789abcdef0123456789abcdef"));
        assert!(!SteamGridDbClient::is_plausible_key(""));
        assert!(!SteamGridDbClient::is_plausible_key("abc\"def"));
    }
}
