use crate::ui_language::UiLanguage;
use std::process::Command;
use std::time::Duration;

use serde::Deserialize;

use crate::companion_client::CompanionClient;
use crate::host_environment::HostEnvironment;

/// Where the app list comes from, sent by the frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameListSource
{
    pub host: String,
    pub moonlight_command: Vec<String>,
    /// e.g. "https://192.168.1.10:47990"; empty = use `moonlight list` instead.
    /// Its host part is replaced by `host`, the address of the PC that answered (home or Tailscale).
    pub sunshine_api_url: String,
    pub sunshine_user: String,
    pub sunshine_password: String,
}

#[derive(Deserialize)]
struct SunshineAppList
{
    apps: Vec<SunshineApp>,
}

#[derive(Deserialize)]
struct SunshineApp
{
    name: String,
}

impl GameListSource
{
    /// Returns the app names offered by the host.
    /// The companion on the PC comes first: it asks Sunshine live. `moonlight list` only prints
    /// Moonlight's cache, which misses newly added games until the Moonlight UI refreshed it.
    pub async fn fetch(&self) -> Result<Vec<String>, String>
    {
        match self.fetch_from_companion().await
        {
            Ok(games) => return Ok(games),
            Err(error) => eprintln!("[games] companion not usable, falling back: {}", error),
        }

        if self.sunshine_api_url.trim().is_empty()
        {
            self.fetch_with_moonlight()
        }
        else
        {
            self.fetch_from_sunshine_api().await
        }
    }

    async fn fetch_from_companion(&self) -> Result<Vec<String>, String>
    {
        CompanionClient::for_host(&self.host)?.sunshine_apps().await
    }

    /// Sunshine web API. Needs the web UI login; the certificate is self-signed.
    async fn fetch_from_sunshine_api(&self) -> Result<Vec<String>, String>
    {
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|error| error.to_string())?;

        let url = format!("{}/api/apps", self.sunshine_api_base_url()?.trim_end_matches('/'));
        let response = client
            .get(&url)
            .basic_auth(&self.sunshine_user, Some(&self.sunshine_password))
            .send()
            .await
            .map_err(|error| format!("{}: {}", UiLanguage::pick("Sunshine nicht erreichbar", "Sunshine unreachable"), error))?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED
        {
            return Err(UiLanguage::pick("Sunshine-Login falsch oder nicht eingetragen", "Sunshine login wrong or missing"));
        }
        if !response.status().is_success()
        {
            return Err(format!("{} {}", UiLanguage::pick("Sunshine antwortet mit", "Sunshine answered with"), response.status()));
        }

        let app_list: SunshineAppList = response.json().await.map_err(|error| error.to_string())?;
        Ok(app_list.apps.into_iter().map(|app| app.name).collect())
    }

    /// The configured API URL, pointed at the address that is reachable right now.
    fn sunshine_api_base_url(&self) -> Result<String, String>
    {
        let mut url = reqwest::Url::parse(self.sunshine_api_url.trim()).map_err(|error| format!("{}: {}", UiLanguage::pick("Sunshine-API-Adresse ungültig", "Invalid Sunshine API address"), error))?;
        let host = self.host.trim().trim_start_matches('[').trim_end_matches(']');
        if !host.is_empty()
        {
            let host_for_url = if host.contains(':')
            {
                format!("[{}]", host)
            }
            else
            {
                host.to_string()
            };
            url.set_host(Some(&host_for_url)).map_err(|error| format!("{}: {}", UiLanguage::pick("Sunshine-API-Adresse ungültig", "Invalid Sunshine API address"), error))?;
        }
        Ok(url.to_string())
    }

    /// `moonlight list <host>` prints one app name per line; needs a paired client.
    fn fetch_with_moonlight(&self) -> Result<Vec<String>, String>
    {
        let (program, base_arguments) = self.moonlight_command.split_first().ok_or_else(|| UiLanguage::pick("Moonlight-Befehl ist leer", "Moonlight command is empty"))?;

        let mut command = Command::new(program);
        HostEnvironment::apply_to(&mut command);
        let output = command
            .args(base_arguments)
            .arg("list")
            .arg(&self.host)
            .output()
            .map_err(|error| format!("{} ({}): {}", UiLanguage::pick("Moonlight nicht gefunden", "Moonlight not found"), program, error))?;

        if !output.status.success()
        {
            // Moonlight logs driver noise first; the actual reason is the last line.
            let error_text = String::from_utf8_lossy(&output.stderr);
            let last_line = error_text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("").trim();
            return Err(format!("{}: {}", UiLanguage::pick("moonlight list fehlgeschlagen", "moonlight list failed"), last_line));
        }

        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect())
    }
}
