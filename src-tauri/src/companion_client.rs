use crate::ui_language::UiLanguage;
use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE};
use reqwest::{Client, RequestBuilder, Response, StatusCode, Url};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::companion_library::CompanionLibrary;
use crate::pc_display_mode::PcDisplayMode;
use crate::upload_token::UploadToken;

#[derive(Deserialize)]
struct ArtVersionResponse
{
    version: u64,
}

#[derive(Deserialize)]
struct SunshineAppsResponse
{
    apps: Vec<String>,
}

#[derive(Deserialize)]
struct AddedAppResponse
{
    name: String,
}

#[derive(Deserialize)]
struct KeyStateResponse
{
    hint: Option<String>,
}

#[derive(Deserialize)]
struct ErrorResponse
{
    error: String,
}

/// Talks to the companion service on the gaming PC (see companion/API.md).
pub struct CompanionClient
{
    base_url: Url,
    http_client: Client,
}

impl CompanionClient
{
    const PORT: u16 = 47995;

    /// 47995; `ALBEDO_COMPANION_PORT` points a dev build at a test companion on another port.
    fn port() -> u16
    {
        std::env::var("ALBEDO_COMPANION_PORT").ok().and_then(|port| port.parse().ok()).unwrap_or(Self::PORT)
    }

    pub fn for_host(host: &str) -> Result<Self, String>
    {
        let host = host.trim();
        // IPv6 addresses need brackets inside a URL.
        let host_part = if host.contains(':')
        {
            format!("[{}]", host)
        }
        else
        {
            host.to_string()
        };
        let base_url = Url::parse(&format!("http://{}:{}/", host_part, Self::port())).map_err(|error| error.to_string())?;
        // The companion answers in this language (errors, group names); a client lives for one command,
        // so a language change applies to the next call.
        let mut default_headers = HeaderMap::new();
        default_headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static(UiLanguage::code()));
        let http_client = Client::builder()
            .timeout(Duration::from_secs(20))
            .default_headers(default_headers)
            .build()
            .map_err(|error| error.to_string())?;

        Ok(Self { base_url, http_client })
    }

    /// App names Sunshine offers right now (`GET /api/apps`), unlike `moonlight list` never a stale cache.
    pub async fn sunshine_apps(&self) -> Result<Vec<String>, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "apps"]))).await?;
        let sunshine_apps: SunshineAppsResponse = response.json().await.map_err(|error| error.to_string())?;
        Ok(sunshine_apps.apps)
    }

    /// The PC's streaming outputs with their modes (`GET /api/display-modes`):
    /// `{ "defaultTarget", "routes": [{ "target", "output", "connected", "canAddModes", "modes" }] }`.
    /// A companion from before the routes only knows the virtual monitor (`output`, `modes`).
    pub async fn display_modes(&self) -> Result<Value, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "display-modes"]))).await?;
        let display_modes: Value = response.json().await.map_err(|error| error.to_string())?;
        if display_modes["routes"].is_array()
        {
            return Ok(display_modes);
        }
        let modes: Vec<PcDisplayMode> = serde_json::from_value(display_modes["modes"].clone()).map_err(|error| error.to_string())?;
        Ok(json!({
            "defaultTarget": "virtual",
            "routes": [{ "target": "virtual", "output": display_modes["output"], "connected": true, "canAddModes": true, "modes": modes }]
        }))
    }

    /// The monitor the next stream uses on the PC (`POST /api/stream-display`). Short timeout: the
    /// stream waits for this, and a PC without companion must not hold it up.
    pub async fn set_stream_display(&self, target: &str) -> Result<(), String>
    {
        let request = self
            .http_client
            .post(self.url(&["api", "stream-display"]))
            .timeout(Duration::from_secs(3))
            .json(&json!({ "target": target }));
        self.send(request).await.map(|_| ())
    }

    /// Asks the PC to put a mode into its virtual monitor's EDID (`POST /api/display-modes`).
    /// The PC user confirms with a root prompt; the answer is the request status, see `display_mode_request`.
    pub async fn add_display_mode(&self, width: u32, height: u32, refresh_rate: u32) -> Result<Value, String>
    {
        let request = self
            .http_client
            .post(self.url(&["api", "display-modes"]))
            .json(&json!({ "width": width, "height": height, "refreshRate": refresh_rate }));
        let response = self.send(request).await?;
        response.json().await.map_err(|error| error.to_string())
    }

    /// `{ "state": "idle" | "waiting" | "done" | "reboot" | "cancelled" | "failed" | "dryRun", "mode", "message" }`
    pub async fn display_mode_request(&self) -> Result<Value, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "display-modes", "request"]))).await?;
        response.json().await.map_err(|error| error.to_string())
    }

    pub async fn library(&self) -> Result<CompanionLibrary, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "library"]))).await?;
        response.json().await.map_err(|error| error.to_string())
    }

    /// Hands the Sunshine web UI login to the companion; it checks it against Sunshine before saving.
    pub async fn set_sunshine_login(&self, user: &str, password: &str) -> Result<(), String>
    {
        let request = self
            .http_client
            .put(self.url(&["api", "sunshine-login"]))
            .json(&json!({ "user": user, "password": password }));
        self.send(request).await?;
        Ok(())
    }

    /// Checks the SteamGridDB key stored on the PC (`POST /api/steamgriddb-key/test`).
    /// Returns "valid", "invalid", "unreachable" (SteamGridDB or the companion did not answer)
    /// or "unchecked" (an older companion without the endpoint).
    pub async fn test_steam_grid_db_key(&self) -> String
    {
        let request = self
            .http_client
            .post(self.url(&["api", "steamgriddb-key", "test"]))
            .json(&json!({}));
        let result = match request.send().await
        {
            Ok(response) if response.status().is_success() => "valid",
            Ok(response) if response.status() == StatusCode::BAD_REQUEST => "invalid",
            Ok(response) if response.status() == StatusCode::NOT_FOUND => "unchecked",
            _ => "unreachable",
        };
        result.to_string()
    }

    /// Last four characters of the SteamGridDB key the companion holds, "" when it has none.
    /// The key itself never leaves the PC.
    pub async fn steam_grid_db_key_hint(&self) -> Result<String, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "steamgriddb-key"]))).await?;
        let key_state: KeyStateResponse = response.json().await.map_err(|error| error.to_string())?;
        Ok(key_state.hint.unwrap_or_default())
    }

    /// Stores the SteamGridDB key in the companion (shared with its PC app); "" removes it.
    pub async fn set_steam_grid_db_key(&self, key: &str) -> Result<(), String>
    {
        let url = self.url(&["api", "steamgriddb-key"]);
        let request = if key.is_empty()
        {
            self.http_client.delete(url)
        }
        else
        {
            self.http_client.put(url).json(&json!({ "key": key }))
        };
        self.send(request).await?;
        Ok(())
    }

    /// The companion's SteamGridDB pass-through; it adds the stored key (see `ArtSearch`).
    pub fn steam_grid_db_proxy_url(&self) -> Url
    {
        let mut url = self.url(&["api", "steamgriddb"]);
        // Trailing slash: the search appends SteamGridDB's own path segments.
        url.path_segments_mut().expect("http URL").push("");
        url
    }

    /// The entry's cover as `data:image/png;base64,…`, or None when the PC has none.
    pub async fn cover(&self, entry_id: &str) -> Result<Option<String>, String>
    {
        self.image(&["api", "cover", entry_id], "image/png").await
    }

    /// The entry's wide title image for the backdrop as `data:image/jpeg;base64,…`, or None.
    pub async fn hero(&self, entry_id: &str) -> Result<Option<String>, String>
    {
        self.image(&["api", "hero", entry_id], "image/jpeg").await
    }

    /// The entry's logo (name lettering, transparent) as `data:image/png;base64,…`, or None.
    pub async fn logo(&self, entry_id: &str) -> Result<Option<String>, String>
    {
        self.image(&["api", "logo", entry_id], "image/png").await
    }

    /// One-time upload page for a picture of `kind` ("cover", "hero" or "logo") from the phone.
    pub async fn upload_token(&self, entry_id: &str, kind: &str) -> Result<UploadToken, String>
    {
        let request = self
            .http_client
            .post(self.url(&["api", "upload-token"]))
            .json(&json!({ "id": entry_id, "kind": kind }));
        self.send(request).await?.json().await.map_err(|error| error.to_string())
    }

    /// Sets a picture the way the phone does: a fresh upload page, then the image as raw body.
    /// The companion converts and stores it like any phone upload.
    pub async fn upload_art(&self, entry_id: &str, kind: &str, image_bytes: Vec<u8>) -> Result<(), String>
    {
        let upload_token = self.upload_token(entry_id, kind).await?;
        let upload_url = Url::parse(&upload_token.url).map_err(|error| error.to_string())?;
        self.send(self.http_client.post(upload_url).body(image_bytes)).await?;
        Ok(())
    }

    /// Goes up whenever a picture of any entry was set or reset.
    pub async fn art_version(&self) -> Result<u64, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "art-version"]))).await?;
        let art_version: ArtVersionResponse = response.json().await.map_err(|error| error.to_string())?;
        Ok(art_version.version)
    }

    /// Drops the picture set by hand, so the automatic one is used again.
    pub async fn reset_art(&self, entry_id: &str, kind: &str) -> Result<(), String>
    {
        self.send(self.http_client.delete(self.url(&["api", "art", entry_id, kind]))).await?;
        Ok(())
    }

    /// One of the user's screenshots of the entry (0 = newest) as `data:image/jpeg;base64,…`, or None.
    pub async fn screenshot(&self, entry_id: &str, index: u32) -> Result<Option<String>, String>
    {
        let index_text = index.to_string();
        self.image(&["api", "screenshot", entry_id, &index_text], "image/jpeg").await
    }

    /// GETs an image as `data:` URL; 404 means the PC has none and gives None.
    async fn image(&self, path_segments: &[&str], mime_type: &str) -> Result<Option<String>, String>
    {
        let response = self
            .http_client
            .get(self.url(path_segments))
            .send()
            .await
            .map_err(|error| Self::connection_error(&error))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND
        {
            return Ok(None);
        }
        let response = Self::check_status(response).await?;
        let image_bytes = response.bytes().await.map_err(|error| error.to_string())?;
        Ok(Some(format!("data:{};base64,{}", mime_type, BASE64.encode(image_bytes))))
    }

    /// Creates the Sunshine app; returns its name as Sunshine lists it.
    pub async fn add_app(&self, entry_id: &str) -> Result<String, String>
    {
        let request = self.http_client.post(self.url(&["api", "apps"])).json(&json!({ "id": entry_id }));
        let added_app: AddedAppResponse = self.send(request).await?.json().await.map_err(|error| error.to_string())?;
        Ok(added_app.name)
    }

    pub async fn remove_app(&self, app_name: &str) -> Result<(), String>
    {
        let request = self.http_client.delete(self.url(&["api", "apps"])).json(&json!({ "name": app_name }));
        self.send(request).await?;
        Ok(())
    }

    /// Path segments are percent-encoded, so ids like "prism:26.3 Modpack Test" stay one segment.
    fn url(&self, path_segments: &[&str]) -> Url
    {
        let mut url = self.base_url.clone();
        if let Ok(mut segments) = url.path_segments_mut()
        {
            segments.clear();
            segments.extend(path_segments);
        }
        url
    }

    async fn send(&self, request: RequestBuilder) -> Result<Response, String>
    {
        let response = request.send().await.map_err(|error| Self::connection_error(&error))?;
        Self::check_status(response).await
    }

    async fn check_status(response: Response) -> Result<Response, String>
    {
        if response.status().is_success()
        {
            return Ok(response);
        }
        let status = response.status();
        // The companion explains errors as {"error": "..."}; fall back to the HTTP status.
        match response.json::<ErrorResponse>().await
        {
            Ok(error_response) => Err(error_response.error),
            Err(_) => Err(format!("{} {}", UiLanguage::pick("PC-Helfer antwortet mit", "PC companion answered with"), status)),
        }
    }

    fn connection_error(error: &reqwest::Error) -> String
    {
        if error.is_connect() || error.is_timeout()
        {
            UiLanguage::pick(
                &format!("PC-Helfer nicht erreichbar (Port {}). Läuft der Companion auf dem PC?", Self::port()),
                &format!("PC companion unreachable (port {}). Is it running on the PC?", Self::port()),
            )
        }
        else
        {
            error.to_string()
        }
    }
}
