use std::io::Read;

use percent_encoding::percent_decode_str;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::client_address_filter::ClientAddressFilter;
use crate::companion_config::CompanionConfig;
use crate::cover_converter::CoverConverter;
use crate::cover_source::CoverSource;
use crate::library_scanner::LibraryScanner;
use crate::sunshine_app_builder::SunshineAppBuilder;
use crate::sunshine_client::SunshineClient;

/// The HTTP API from companion/API.md. Requests are handled one after another;
/// the only client is the launcher.
pub struct ApiServer
{
    config: CompanionConfig,
}

/// Status code + body (JSON or PNG) of one answer.
type ApiAnswer = (u16, Vec<u8>, &'static str);

impl ApiServer
{
    pub fn new(config: CompanionConfig) -> ApiServer
    {
        ApiServer { config }
    }

    pub fn run(&mut self) -> Result<(), String>
    {
        let listen_address = format!("0.0.0.0:{}", self.config.port);
        let server = Server::http(&listen_address)
            .map_err(|error| format!("Port {} nicht verfügbar: {}", self.config.port, error))?;
        eprintln!("Companion hört auf {}", listen_address);

        for mut request in server.incoming_requests()
        {
            let (status_code, body, content_type) = self.answer(&mut request);
            let content_type_header = Header::from_bytes("Content-Type", content_type).expect("static header");
            let response = Response::from_data(body).with_status_code(status_code).with_header(content_type_header);
            let _ = request.respond(response);
        }
        Ok(())
    }

    fn answer(&mut self, request: &mut Request) -> ApiAnswer
    {
        let client_allowed = request
            .remote_addr()
            .map(|address| ClientAddressFilter::is_allowed(address.ip()))
            .unwrap_or(false);
        if !client_allowed
        {
            return Self::error(403, "Nur aus dem Heimnetz oder über Tailscale erreichbar");
        }

        let path = request.url().split('?').next().unwrap_or_default().to_string();
        let method = request.method().clone();
        let result = match (method, path.as_str())
        {
            (Method::Get, "/api/health") => Ok(self.health()),
            (Method::Get, "/api/library") => Ok(self.library()),
            (Method::Get, cover_path) if cover_path.starts_with("/api/cover/") =>
            {
                let entry_id = percent_decode_str(&cover_path["/api/cover/".len()..]).decode_utf8_lossy().to_string();
                self.cover(&entry_id)
            }
            (Method::Get, hero_path) if hero_path.starts_with("/api/hero/") =>
            {
                let entry_id = percent_decode_str(&hero_path["/api/hero/".len()..]).decode_utf8_lossy().to_string();
                self.hero(&entry_id)
            }
            (Method::Get, screenshot_path) if screenshot_path.starts_with("/api/screenshot/") =>
            {
                self.screenshot(&screenshot_path["/api/screenshot/".len()..])
            }
            (Method::Get, "/api/apps") => self.sunshine_apps(),
            (Method::Post, "/api/apps") => Self::read_body(request).and_then(|body| self.add_app(&body)),
            (Method::Delete, "/api/apps") => Self::read_body(request).and_then(|body| self.delete_app(&body)),
            (Method::Put, "/api/sunshine-login") => Self::read_body(request).and_then(|body| self.set_sunshine_login(&body)),
            _ => Err((404, "Unbekannter Pfad".to_string())),
        };
        match result
        {
            Ok(answer) => answer,
            Err((status_code, message)) =>
            {
                eprintln!("{} {} -> {} {}", request.method(), path, status_code, message);
                Self::error(status_code, &message)
            }
        }
    }

    fn health(&self) -> ApiAnswer
    {
        let host_name = std::fs::read_to_string("/proc/sys/kernel/hostname").unwrap_or_else(|_| "pc".into());
        Self::json(200, json!({
            "name": "streaming-launcher-companion",
            "version": env!("CARGO_PKG_VERSION"),
            "host": host_name.trim()
        }))
    }

    fn library(&self) -> ApiAnswer
    {
        // Without the Sunshine login the list still works: inSunshine stays false and
        // sunshineProblem tells the launcher why adding cannot work right now.
        let (sunshine_app_names, sunshine_problem) = match SunshineClient::new(self.config.clone()).app_names()
        {
            Ok(app_names) => (app_names, None),
            Err(message) => (Vec::new(), Some(message)),
        };
        let entries: Vec<Value> = LibraryScanner
            .scan_all()
            .iter()
            .map(|entry| json!(entry.to_response(sunshine_app_names.contains(&entry.name))))
            .collect();
        Self::json(200, json!({ "entries": entries, "sunshineProblem": sunshine_problem }))
    }

    /// The app names Sunshine offers right now, in Sunshine's order. Moonlight's own list on the
    /// Deck is a cache that only refreshes inside Moonlight's UI, so the launcher asks here first.
    fn sunshine_apps(&self) -> Result<ApiAnswer, (u16, String)>
    {
        let app_names = SunshineClient::new(self.config.clone())
            .app_names()
            .map_err(|message| (502, message))?;
        Ok(Self::json(200, json!({ "apps": app_names })))
    }

    fn cover(&self, entry_id: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let entry = LibraryScanner.find(entry_id).ok_or((404, "Eintrag nicht gefunden".to_string()))?;
        if !entry.has_cover()
        {
            return Err((404, "Kein Cover vorhanden".into()));
        }
        let png_bytes = CoverConverter.to_png(&entry.cover).map_err(|message| (502, message))?;
        Ok((200, png_bytes, "image/png"))
    }

    fn hero(&self, entry_id: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let entry = LibraryScanner.find(entry_id).ok_or((404, "Eintrag nicht gefunden".to_string()))?;
        if matches!(entry.hero, CoverSource::None)
        {
            return Err((404, "Kein Titelbild vorhanden".into()));
        }
        let jpeg_bytes = CoverConverter
            .to_background_jpeg(&entry.hero, &format!("hero-{}", entry.id))
            .map_err(|message| (502, message))?;
        Ok((200, jpeg_bytes, "image/jpeg"))
    }

    /// `<id>/<index>`: the id is URL-encoded, so the last '/' separates the index.
    fn screenshot(&self, id_and_index: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let (encoded_entry_id, index_text) = id_and_index.rsplit_once('/').ok_or((404, "Index fehlt".to_string()))?;
        let screenshot_index: usize = index_text.parse().map_err(|_| (404, "Index ist keine Zahl".to_string()))?;
        let entry_id = percent_decode_str(encoded_entry_id).decode_utf8_lossy().to_string();
        let entry = LibraryScanner.find(&entry_id).ok_or((404, "Eintrag nicht gefunden".to_string()))?;
        let screenshot_path = entry
            .screenshots
            .get(screenshot_index)
            .ok_or((404, "Kein Screenshot mit diesem Index".to_string()))?;

        // Cached by file name, so a new screenshot shifting the indices does not mix them up.
        let file_stem = screenshot_path.file_stem().unwrap_or_default().to_string_lossy();
        let cache_name = format!("screenshot-{}-{}", entry.id, file_stem);
        let jpeg_bytes = CoverConverter
            .to_background_jpeg(&CoverSource::File(screenshot_path.clone()), &cache_name)
            .map_err(|message| (502, message))?;
        Ok((200, jpeg_bytes, "image/jpeg"))
    }

    fn add_app(&self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let entry_id = body["id"].as_str().ok_or((400, "Feld „id“ fehlt".to_string()))?;
        let entry = LibraryScanner.find(entry_id).ok_or((404, "Eintrag nicht gefunden".to_string()))?;

        let sunshine = SunshineClient::new(self.config.clone());
        let existing_names = sunshine.app_names().map_err(|message| (502, message))?;
        if existing_names.contains(&entry.name)
        {
            return Err((409, format!("„{}“ ist schon in Sunshine", entry.name)));
        }

        // A missing cover is not worth failing over: Sunshine shows its default box then.
        let cover_path = if entry.has_cover()
        {
            CoverConverter.save_for_sunshine(&entry.cover, &entry.id).map_err(|message| eprintln!("{}", message)).ok()
        }
        else
        {
            None
        };
        let sunshine_app = SunshineAppBuilder.build(&entry, cover_path.as_deref());
        sunshine.add_app(&sunshine_app).map_err(|message| (502, message))?;
        eprintln!("Hinzugefügt: {}", entry.name);
        Ok(Self::json(200, json!({ "name": entry.name })))
    }

    fn delete_app(&self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let app_name = body["name"].as_str().ok_or((400, "Feld „name“ fehlt".to_string()))?;
        SunshineClient::new(self.config.clone()).delete_app(app_name).map_err(|message| (502, message))?;
        eprintln!("Entfernt: {}", app_name);
        Ok((204, Vec::new(), "application/json"))
    }

    /// Checks the login against Sunshine before saving it, so a typo never replaces a working login.
    /// The password is neither logged nor sent back.
    fn set_sunshine_login(&mut self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let user = body["user"].as_str().unwrap_or_default();
        let password = body["password"].as_str().unwrap_or_default();
        if user.is_empty() || password.is_empty()
        {
            return Err((400, "Benutzername und Passwort eingeben".to_string()));
        }

        let mut new_config = self.config.clone();
        new_config.sunshine_user = user.to_string();
        new_config.sunshine_password = password.to_string();
        SunshineClient::new(new_config.clone()).list_apps().map_err(|message| (400, message))?;

        new_config
            .write_to(&CompanionConfig::config_path())
            .map_err(|message| (500, format!("Config nicht speicherbar: {}", message)))?;
        self.config = new_config;
        eprintln!("Sunshine-Login gespeichert");
        Ok((204, Vec::new(), "application/json"))
    }

    fn read_body(request: &mut Request) -> Result<Value, (u16, String)>
    {
        let mut body_text = String::new();
        request
            .as_reader()
            .take(64 * 1024)
            .read_to_string(&mut body_text)
            .map_err(|_| (400, "Anfrage nicht lesbar".to_string()))?;
        serde_json::from_str(&body_text).map_err(|_| (400, "Anfrage ist kein gültiges JSON".to_string()))
    }

    fn json(status_code: u16, body: Value) -> ApiAnswer
    {
        (status_code, body.to_string().into_bytes(), "application/json; charset=utf-8")
    }

    fn error(status_code: u16, message: &str) -> ApiAnswer
    {
        Self::json(status_code, json!({ "error": message }))
    }
}
