use std::time::Duration;

use serde::Serialize;

use crate::moonlight_box_art::MoonlightBoxArt;

/// The Sunshine app that is running on the PC right now (a stream may be connected or not).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningHostApp
{
    pub app_id: String,
    /// From Moonlight's app cache; None when Moonlight does not know this id (yet).
    pub app_name: Option<String>,
}

impl RunningHostApp
{
    /// Sunshine's plain HTTP port; `serverinfo` there answers without a client certificate.
    const SUNSHINE_HTTP_PORT: u16 = 47989;

    /// Asks Sunshine's `serverinfo` for `currentgame`; None when nothing runs.
    /// The name comes from Moonlight.conf, which maps app ids to names per host.
    pub async fn query(host: &str, moonlight_command: &[String], addresses: &[String]) -> Result<Option<Self>, String>
    {
        let host = host.trim().trim_start_matches('[').trim_end_matches(']');
        let host_for_url = if host.contains(':')
        {
            format!("[{}]", host)
        }
        else
        {
            host.to_string()
        };
        // Sunshine wants a uniqueid; any value works for serverinfo.
        let url = format!("http://{}:{}/serverinfo?uniqueid=0123456789ABCDEF", host_for_url, Self::SUNSHINE_HTTP_PORT);
        let client = reqwest::Client::builder().timeout(Duration::from_secs(3)).build().map_err(|error| error.to_string())?;
        let response_text = client
            .get(&url)
            .send()
            .await
            .map_err(|error| error.to_string())?
            .text()
            .await
            .map_err(|error| error.to_string())?;

        let Some(app_id) = Self::current_game_id(&response_text) else
        {
            return Ok(None);
        };
        let app_name = MoonlightBoxArt::for_command(moonlight_command)?.app_name(addresses, &app_id);
        Ok(Some(Self { app_id, app_name }))
    }

    /// `<currentgame>123</currentgame>` from the serverinfo XML; "0" or missing = nothing runs.
    fn current_game_id(serverinfo_xml: &str) -> Option<String>
    {
        let start_tag = "<currentgame>";
        let value_start = serverinfo_xml.find(start_tag)? + start_tag.len();
        let value_length = serverinfo_xml[value_start..].find("</currentgame>")?;
        let app_id = serverinfo_xml[value_start..value_start + value_length].trim();
        if app_id.is_empty() || app_id == "0"
        {
            None
        }
        else
        {
            Some(app_id.to_string())
        }
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn reads_current_game_from_serverinfo()
    {
        let busy = "<root status_code=\"200\"><PairStatus>0</PairStatus><currentgame>231427376</currentgame><state>SUNSHINE_SERVER_BUSY</state></root>";
        let free = "<root status_code=\"200\"><currentgame>0</currentgame><state>SUNSHINE_SERVER_FREE</state></root>";

        assert_eq!(RunningHostApp::current_game_id(busy), Some("231427376".to_string()));
        assert_eq!(RunningHostApp::current_game_id(free), None);
        assert_eq!(RunningHostApp::current_game_id("<root/>"), None);
    }

    /// Needs the PC at home with Sunshine running: `cargo test -- --ignored`. Prints what runs.
    #[test]
    #[ignore]
    fn asks_the_real_pc()
    {
        let moonlight_command: Vec<String> = ["flatpak", "run", "com.moonlight_stream.Moonlight"].iter().map(|part| part.to_string()).collect();
        let addresses = vec!["192.168.178.36".to_string()];
        let running = tauri::async_runtime::block_on(RunningHostApp::query("192.168.178.36", &moonlight_command, &addresses));
        println!("running on the PC: {:?}", running);
        assert!(running.is_ok());
    }
}
