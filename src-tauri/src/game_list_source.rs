use std::process::Command;
use std::time::Duration;

use serde::Deserialize;

use crate::host_environment::HostEnvironment;

/// Where the app list comes from, sent by the frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameListSource
{
    pub host: String,
    pub moonlight_command: Vec<String>,
    /// e.g. "https://192.168.1.10:47990"; empty = use `moonlight list` instead.
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
    pub async fn fetch(&self) -> Result<Vec<String>, String>
    {
        if self.sunshine_api_url.trim().is_empty()
        {
            self.fetch_with_moonlight()
        }
        else
        {
            self.fetch_from_sunshine_api().await
        }
    }

    /// Sunshine web API. Needs the web UI login; the certificate is self-signed.
    async fn fetch_from_sunshine_api(&self) -> Result<Vec<String>, String>
    {
        let client = reqwest::Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|error| error.to_string())?;

        let url = format!("{}/api/apps", self.sunshine_api_url.trim_end_matches('/'));
        let response = client
            .get(&url)
            .basic_auth(&self.sunshine_user, Some(&self.sunshine_password))
            .send()
            .await
            .map_err(|error| format!("Sunshine nicht erreichbar: {}", error))?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED
        {
            return Err("Sunshine-Login falsch oder nicht eingetragen".into());
        }
        if !response.status().is_success()
        {
            return Err(format!("Sunshine antwortet mit {}", response.status()));
        }

        let app_list: SunshineAppList = response.json().await.map_err(|error| error.to_string())?;
        Ok(app_list.apps.into_iter().map(|app| app.name).collect())
    }

    /// `moonlight list <host>` prints one app name per line; needs a paired client.
    fn fetch_with_moonlight(&self) -> Result<Vec<String>, String>
    {
        let (program, base_arguments) = self.moonlight_command.split_first().ok_or("Moonlight-Befehl ist leer")?;

        let mut command = Command::new(program);
        HostEnvironment::apply_to(&mut command);
        let output = command
            .args(base_arguments)
            .arg("list")
            .arg(&self.host)
            .output()
            .map_err(|error| format!("Moonlight nicht gefunden ({}): {}", program, error))?;

        if !output.status.success()
        {
            // Moonlight logs driver noise first; the actual reason is the last line.
            let error_text = String::from_utf8_lossy(&output.stderr);
            let last_line = error_text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("").trim();
            return Err(format!("moonlight list fehlgeschlagen: {}", last_line));
        }

        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect())
    }
}
