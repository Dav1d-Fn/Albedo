use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use reqwest::{Client, RequestBuilder, Response, Url};
use serde::Deserialize;
use serde_json::json;

use crate::library_entry::LibraryEntry;

#[derive(Deserialize)]
struct LibraryResponse
{
    entries: Vec<LibraryEntry>,
}

#[derive(Deserialize)]
struct AddedAppResponse
{
    name: String,
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
        let base_url = Url::parse(&format!("http://{}:{}/", host_part, Self::PORT)).map_err(|error| error.to_string())?;
        let http_client = Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|error| error.to_string())?;

        Ok(Self { base_url, http_client })
    }

    pub async fn library(&self) -> Result<Vec<LibraryEntry>, String>
    {
        let response = self.send(self.http_client.get(self.url(&["api", "library"]))).await?;
        let library: LibraryResponse = response.json().await.map_err(|error| error.to_string())?;
        Ok(library.entries)
    }

    /// The entry's cover as `data:image/png;base64,…`, or None when the PC has none.
    pub async fn cover(&self, entry_id: &str) -> Result<Option<String>, String>
    {
        let response = self
            .http_client
            .get(self.url(&["api", "cover", entry_id]))
            .send()
            .await
            .map_err(|error| Self::connection_error(&error))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND
        {
            return Ok(None);
        }
        let response = Self::check_status(response).await?;
        let image_bytes = response.bytes().await.map_err(|error| error.to_string())?;
        Ok(Some(format!("data:image/png;base64,{}", BASE64.encode(image_bytes))))
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
            Err(_) => Err(format!("PC-Helfer antwortet mit {}", status)),
        }
    }

    fn connection_error(error: &reqwest::Error) -> String
    {
        if error.is_connect() || error.is_timeout()
        {
            format!("PC-Helfer nicht erreichbar (Port {}). Läuft der Companion auf dem PC?", Self::PORT)
        }
        else
        {
            error.to_string()
        }
    }
}
