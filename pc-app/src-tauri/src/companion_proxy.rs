use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;

use reqwest::{Client, Method, Url};
use serde_json::Value;

use crate::ui_language::UiLanguage;

/// Port of the companion API this app runs (config.json), set once at start.
static COMPANION_PORT: AtomicU16 = AtomicU16::new(47995);

/// HTTP client for the companion API this app serves on its own thread (companion/API.md). The
/// webview cannot call it itself (no CORS headers there), so every request goes through here.
pub struct CompanionProxy
{
    http_client: Client,
    base_url: Url,
}

impl CompanionProxy
{
    pub fn set_port(port: u16)
    {
        COMPANION_PORT.store(port, Ordering::Relaxed);
    }

    pub fn new() -> Result<Self, String>
    {
        let http_client = Client::builder()
            // Adding an app converts its cover and asks Sunshine, that can take a while.
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| error.to_string())?;
        let base_url_text = format!("http://127.0.0.1:{}/", COMPANION_PORT.load(Ordering::Relaxed));
        let base_url = Url::parse(&base_url_text).map_err(|error| error.to_string())?;
        Ok(Self {
            http_client,
            base_url,
        })
    }

    /// `path` like "api/library". Answers the JSON body, `null` for 204.
    /// Errors carry the companion's message (in the UI language), or say that it does not run.
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, String>
    {
        let method = Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
        let url = self
            .base_url
            .join(path)
            .map_err(|error| error.to_string())?;
        let mut request = self
            .http_client
            .request(method, url)
            .header("Accept-Language", UiLanguage::code());
        if let Some(body) = body
        {
            request = request.json(&body);
        }
        let response = request
            .send()
            .await
            .map_err(|_| Self::not_running_message())?;

        let status = response.status();
        let response_text = response.text().await.map_err(|error| error.to_string())?;
        let response_json: Value = serde_json::from_str(&response_text).unwrap_or(Value::Null);
        if status.is_success()
        {
            return Ok(response_json);
        }
        match response_json["error"].as_str()
        {
            Some(message) => Err(message.to_string()),
            None => Err(format!(
                "{} {}",
                UiLanguage::pick("PC-Helfer antwortet mit", "PC companion answered with"),
                status
            )),
        }
    }

    /// Sets a picture like the phone does: a fresh upload link, then the image as raw body.
    pub async fn upload_art(
        &self,
        entry_id: &str,
        kind: &str,
        image_bytes: Vec<u8>,
    ) -> Result<(), String>
    {
        let token_body = serde_json::json!({ "id": entry_id, "kind": kind });
        let upload_token = self
            .request("POST", "api/upload-token", Some(token_body))
            .await?;
        let upload_url = upload_token["url"]
            .as_str()
            .ok_or("upload-token without url")?;
        // The link names the address we reached the companion through, which is this PC.
        let upload_path = Url::parse(upload_url)
            .map_err(|error| error.to_string())?
            .path()
            .trim_start_matches('/')
            .to_string();

        let url = self
            .base_url
            .join(&upload_path)
            .map_err(|error| error.to_string())?;
        let response = self
            .http_client
            .post(url)
            .header("Accept-Language", UiLanguage::code())
            .body(image_bytes)
            .send()
            .await
            .map_err(|_| Self::not_running_message())?;
        if response.status().is_success()
        {
            return Ok(());
        }
        let response_json: Value = response.json().await.unwrap_or(Value::Null);
        Err(response_json["error"]
            .as_str()
            .unwrap_or("upload failed")
            .to_string())
    }

    fn not_running_message() -> String
    {
        let port = COMPANION_PORT.load(Ordering::Relaxed);
        UiLanguage::pick(
            &format!("PC-Helfer antwortet nicht (Port {} belegt?)", port),
            &format!("PC companion does not answer (port {} taken?)", port),
        )
    }
}
