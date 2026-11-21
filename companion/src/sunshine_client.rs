use crate::request_language::RequestLanguage;
use std::io::Write;
use std::process::{Command, Stdio};

use serde_json::Value;

use crate::companion_config::CompanionConfig;

/// Sunshine's web API (self-signed HTTPS, Basic Auth). Uses curl; the login goes in through
/// stdin so it never shows up in the process list.
pub struct SunshineClient
{
    config: CompanionConfig,
}

impl SunshineClient
{
    pub fn new(config: CompanionConfig) -> SunshineClient
    {
        SunshineClient { config }
    }

    pub fn list_apps(&self) -> Result<Vec<Value>, String>
    {
        let response_body = self.request("GET", "/api/apps", None)?;
        let app_list: Value = serde_json::from_str(&response_body)
            .map_err(|_| RequestLanguage::pick("Sunshine liefert keine gültige App-Liste", "Sunshine returned no valid app list"))?;
        Ok(app_list["apps"].as_array().cloned().unwrap_or_default())
    }

    pub fn app_names(&self) -> Result<Vec<String>, String>
    {
        Ok(self
            .list_apps()?
            .iter()
            .filter_map(|app| app["name"].as_str().map(String::from))
            .collect())
    }

    pub fn add_app(&self, app: &Value) -> Result<(), String>
    {
        self.request("POST", "/api/apps", Some(&app.to_string())).map(|_| ())
    }

    /// Sunshine deletes by list position, so look the name up first.
    pub fn delete_app(&self, app_name: &str) -> Result<(), String>
    {
        let app_index = self
            .app_names()?
            .iter()
            .position(|name| name == app_name)
            .ok_or_else(|| RequestLanguage::pick(&format!("„{}“ gibt es in Sunshine nicht", app_name), &format!("\"{}\" doesn't exist in Sunshine", app_name)))?;
        self.request("DELETE", &format!("/api/apps/{}", app_index), None).map(|_| ())
    }

    /// Devices paired with Sunshine (Moonlight clients) as (uuid, name).
    pub fn paired_clients(&self) -> Result<Vec<(String, String)>, String>
    {
        let response_body = self.request("GET", "/api/clients/list", None)?;
        let client_list: Value = serde_json::from_str(&response_body)
            .map_err(|_| RequestLanguage::pick("Sunshine liefert keine gültige Geräteliste", "Sunshine returned no valid device list"))?;
        Ok(client_list["named_certs"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|client| Some((client["uuid"].as_str()?.to_string(), client["name"].as_str().unwrap_or_default().to_string())))
            .collect())
    }

    pub fn unpair(&self, client_uuid: &str) -> Result<(), String>
    {
        let body = serde_json::json!({ "uuid": client_uuid }).to_string();
        self.request("POST", "/api/clients/unpair", Some(&body)).map(|_| ())
    }

    /// Moonlight clients waiting for their PIN, as (pairing id, device name, address).
    /// Sunshine before 2026 has no such list: then this fails and the PIN goes without an id.
    pub fn pending_pairings(&self) -> Result<Vec<(String, String, String)>, String>
    {
        let response_body = self.request("GET", "/api/pin", None)?;
        let answer: Value = serde_json::from_str(&response_body).unwrap_or_default();
        let pairings = answer["pairings"]
            .as_array()
            .ok_or_else(|| RequestLanguage::pick("Sunshine kennt keine Liste wartender Geräte", "Sunshine has no list of waiting devices"))?;
        Ok(pairings
            .iter()
            .filter_map(|pairing|
            {
                Some((
                    pairing["id"].as_str()?.to_string(),
                    pairing["name"].as_str().unwrap_or_default().to_string(),
                    pairing["address"].as_str().unwrap_or_default().to_string(),
                ))
            })
            .collect())
    }

    /// Answers the PIN a Moonlight client shows while it waits for pairing. `pairing_id` picks the
    /// waiting client (Sunshine 2026 needs it). Sunshine says `"status": true` when the client
    /// took the PIN.
    pub fn pair(&self, pin: &str, device_name: &str, pairing_id: Option<&str>) -> Result<(), String>
    {
        let mut body = serde_json::json!({ "pin": pin, "name": device_name });
        if let Some(pairing_id) = pairing_id
        {
            body["pairing_id"] = Value::String(pairing_id.to_string());
        }
        let response_body = self.request("POST", "/api/pin", Some(&body.to_string()))?;
        let answer: Value = serde_json::from_str(&response_body).unwrap_or_default();
        // Older Sunshine versions sent the string "true".
        let paired = answer["status"] == Value::Bool(true) || answer["status"] == "true";
        if paired
        {
            Ok(())
        }
        else
        {
            Err(RequestLanguage::pick("Koppeln fehlgeschlagen: PIN falsch?", "Pairing failed: wrong PIN?"))
        }
    }

    fn request(&self, method: &str, path: &str, json_body: Option<&str>) -> Result<String, String>
    {
        if !self.config.has_sunshine_login()
        {
            // Shown on the Deck, so no PC file path here.
            return Err(RequestLanguage::pick("Sunshine-Login fehlt im PC-Helfer", "The PC companion has no Sunshine login"));
        }

        let base_url = self.config.sunshine_url.trim_end_matches('/');
        let mut curl_config = String::new();
        curl_config += &format!("user = \"{}:{}\"\n", Self::escape(&self.config.sunshine_user), Self::escape(&self.config.sunshine_password));
        curl_config += &format!("url = \"{}{}\"\n", base_url, path);
        curl_config += &format!("request = \"{}\"\n", method);
        // Sunshine's CSRF check wants a same-origin request.
        curl_config += &format!("header = \"Origin: {}\"\n", base_url);
        if let Some(json_body) = json_body
        {
            curl_config += "header = \"Content-Type: application/json\"\n";
            curl_config += &format!("data-binary = \"{}\"\n", Self::escape(json_body));
        }

        let mut curl_process = Command::new("curl")
            .args(["-sk", "--max-time", "10", "-w", "\n%{http_code}", "-K", "-"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("curl nicht startbar", "Cannot start curl"), error))?;
        curl_process
            .stdin
            .take()
            .expect("stdin is piped")
            .write_all(curl_config.as_bytes())
            .map_err(|error| error.to_string())?;
        let curl_output = curl_process.wait_with_output().map_err(|error| error.to_string())?;

        let response_text = String::from_utf8_lossy(&curl_output.stdout).to_string();
        let (response_body, status_text) = response_text.rsplit_once('\n').unwrap_or(("", "000"));
        match status_text.trim().parse::<u16>().unwrap_or(0)
        {
            200..=299 => Ok(response_body.to_string()),
            0 => Err(RequestLanguage::pick("Sunshine nicht erreichbar", "Sunshine unreachable")),
            401 => Err(RequestLanguage::pick("Sunshine-Login falsch", "Sunshine login wrong")),
            status_code => Err(format!("{} {}: {}", RequestLanguage::pick("Sunshine antwortet mit", "Sunshine answered with"), status_code, response_body.trim())),
        }
    }

    /// Escaping for a double-quoted value in a curl config file.
    fn escape(value: &str) -> String
    {
        value.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n")
    }
}
