use std::io::Read;

use percent_encoding::percent_decode_str;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::art_override_store::ArtOverrideStore;
use crate::client_address_filter::ClientAddressFilter;
use crate::companion_config::CompanionConfig;
use crate::cover_converter::CoverConverter;
use crate::cover_source::CoverSource;
use crate::display_mode_reader::DisplayModeReader;
use crate::library_scanner::LibraryScanner;
use crate::request_language::RequestLanguage;
use crate::sunshine_app_builder::SunshineAppBuilder;
use crate::sunshine_client::SunshineClient;
use crate::upload_page::UploadPage;
use crate::upload_qr_code::UploadQrCode;
use crate::upload_token_store::UploadTokenStore;

/// The HTTP API from companion/API.md. Requests are handled one after another;
/// the only client is the launcher.
pub struct ApiServer
{
    config: CompanionConfig,
    upload_tokens: UploadTokenStore,
    /// Goes up with every override change, so the launcher knows when to reload pictures.
    art_version: u64,
}

/// Status code + body (JSON, PNG, JPEG or HTML) + content type of one answer.
type ApiAnswer = (u16, Vec<u8>, &'static str);

impl ApiServer
{
    pub fn new(config: CompanionConfig) -> ApiServer
    {
        ApiServer { config, upload_tokens: UploadTokenStore::new(), art_version: 0 }
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
        let accept_language = request
            .headers()
            .iter()
            .find(|header| header.field.equiv("Accept-Language"))
            .map(|header| header.value.as_str().to_string());
        RequestLanguage::set_from_header(accept_language.as_deref());

        let client_allowed = request
            .remote_addr()
            .map(|address| ClientAddressFilter::is_allowed(address.ip()))
            .unwrap_or(false);
        if !client_allowed
        {
            return Self::error(403, &RequestLanguage::pick("Nur aus dem Heimnetz oder über Tailscale erreichbar", "Only reachable from the home network or via Tailscale"));
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
            (Method::Get, logo_path) if logo_path.starts_with("/api/logo/") =>
            {
                let entry_id = percent_decode_str(&logo_path["/api/logo/".len()..]).decode_utf8_lossy().to_string();
                self.logo(&entry_id)
            }
            (Method::Delete, art_path) if art_path.starts_with("/api/art/") =>
            {
                self.delete_art_override(&art_path["/api/art/".len()..])
            }
            (Method::Get, "/api/art-version") => Ok(Self::json(200, json!({ "version": self.art_version }))),
            (Method::Post, "/api/upload-token") =>
            {
                let request_host = Self::request_host(request);
                Self::read_body(request).and_then(|body| self.issue_upload_token(&body, request_host))
            }
            (Method::Get, upload_path) if upload_path.starts_with("/upload/") =>
            {
                self.upload_page(&upload_path["/upload/".len()..])
            }
            (Method::Post, upload_path) if upload_path.starts_with("/upload/") =>
            {
                let token = upload_path["/upload/".len()..].to_string();
                Self::read_upload(request).and_then(|upload_bytes| self.receive_upload(&token, upload_bytes))
            }
            (Method::Get, screenshot_path) if screenshot_path.starts_with("/api/screenshot/") =>
            {
                self.screenshot(&screenshot_path["/api/screenshot/".len()..])
            }
            (Method::Get, "/api/apps") => self.sunshine_apps(),
            (Method::Get, "/api/display-modes") => Self::display_modes(),
            (Method::Post, "/api/apps") => Self::read_body(request).and_then(|body| self.add_app(&body)),
            (Method::Delete, "/api/apps") => Self::read_body(request).and_then(|body| self.delete_app(&body)),
            (Method::Put, "/api/sunshine-login") => Self::read_body(request).and_then(|body| self.set_sunshine_login(&body)),
            _ => Err((404, RequestLanguage::pick("Unbekannter Pfad", "Unknown path"))),
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

    fn display_modes() -> Result<ApiAnswer, (u16, String)>
    {
        let modes = DisplayModeReader::read().map_err(|message| (502, message))?;
        Ok(Self::json(200, json!({ "output": DisplayModeReader::VIRTUAL_OUTPUT, "modes": modes })))
    }

    fn cover(&self, entry_id: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let entry = LibraryScanner.find(entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;
        if !entry.has_cover()
        {
            return Err((404, RequestLanguage::pick("Kein Cover vorhanden", "No cover available")));
        }
        let png_bytes = CoverConverter.to_png(&entry.cover).map_err(|message| (502, message))?;
        Ok((200, png_bytes, "image/png"))
    }

    fn hero(&self, entry_id: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let entry = LibraryScanner.find(entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;
        if matches!(entry.hero, CoverSource::None)
        {
            return Err((404, RequestLanguage::pick("Kein Titelbild vorhanden", "No title art available")));
        }
        let jpeg_bytes = CoverConverter
            .to_background_jpeg(&entry.hero, &format!("hero-{}", entry.id))
            .map_err(|message| (502, message))?;
        Ok((200, jpeg_bytes, "image/jpeg"))
    }

    fn logo(&self, entry_id: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let entry = LibraryScanner.find(entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;
        if matches!(entry.logo, CoverSource::None)
        {
            return Err((404, RequestLanguage::pick("Kein Logo vorhanden", "No logo available")));
        }
        let png_bytes = CoverConverter
            .to_logo_png(&entry.logo, &format!("logo-{}", entry.id))
            .map_err(|message| (502, message))?;
        Ok((200, png_bytes, "image/png"))
    }

    /// `<id>/<kind>`: back to the automatic picture.
    fn delete_art_override(&mut self, id_and_kind: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let (encoded_entry_id, art_kind) = id_and_kind.rsplit_once('/').ok_or_else(|| (404, RequestLanguage::pick("Bildart fehlt", "Image kind missing")))?;
        if !ArtOverrideStore::is_art_kind(art_kind)
        {
            return Err((400, RequestLanguage::pick("Bildart muss cover, hero oder logo sein", "Image kind must be cover, hero or logo")));
        }
        let entry_id = percent_decode_str(encoded_entry_id).decode_utf8_lossy().to_string();
        ArtOverrideStore.remove(&entry_id, art_kind);
        self.after_art_change(&entry_id, art_kind);
        Ok((204, Vec::new(), "application/json"))
    }

    /// The URL uses the address the launcher reached us through (home network or Tailscale),
    /// so a phone in the same network can open it.
    fn issue_upload_token(&mut self, body: &Value, request_host: Option<String>) -> Result<ApiAnswer, (u16, String)>
    {
        let entry_id = body["id"].as_str().ok_or_else(|| (400, RequestLanguage::pick("Feld „id“ fehlt", "Field \"id\" missing")))?;
        let art_kind = body["kind"].as_str().unwrap_or_default();
        if !ArtOverrideStore::is_art_kind(art_kind)
        {
            return Err((400, RequestLanguage::pick("Feld „kind“ muss cover, hero oder logo sein", "Field \"kind\" must be cover, hero or logo")));
        }
        LibraryScanner.find(entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;

        let token = self.upload_tokens.issue(entry_id, art_kind).map_err(|message| (500, message))?;
        let host = request_host.unwrap_or_else(||
        {
            let host_name = std::fs::read_to_string("/proc/sys/kernel/hostname").unwrap_or_else(|_| "pc".into());
            format!("{}:{}", host_name.trim(), self.config.port)
        });
        let upload_url = format!("http://{}/upload/{}", host, token);
        let qr_svg = UploadQrCode::svg_for(&upload_url).map_err(|message| (500, message))?;
        Ok(Self::json(200, json!({
            "url": upload_url,
            "qrSvg": qr_svg,
            "expiresInSeconds": UploadTokenStore::LIFETIME.as_secs()
        })))
    }

    fn upload_page(&self, token: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let ticket = self.upload_tokens.find(token).ok_or_else(|| (410, RequestLanguage::pick("Link abgelaufen oder schon benutzt", "Link expired or already used")))?;
        let entry_name = LibraryScanner
            .find(&ticket.entry_id)
            .map(|entry| entry.name)
            .unwrap_or(ticket.entry_id.clone());
        let page = UploadPage::render(&entry_name, &ticket.art_kind);
        Ok((200, page.into_bytes(), "text/html; charset=utf-8"))
    }

    /// The link is used up only when the picture was stored, so a wrong file can be retried.
    fn receive_upload(&mut self, token: &str, upload_bytes: Vec<u8>) -> Result<ApiAnswer, (u16, String)>
    {
        let ticket = self.upload_tokens.find(token).ok_or_else(|| (410, RequestLanguage::pick("Link abgelaufen oder schon benutzt", "Link expired or already used")))?;
        ArtOverrideStore
            .save(&ticket.entry_id, &ticket.art_kind, upload_bytes)
            .map_err(|message| (400, message))?;
        self.upload_tokens.use_up(token);
        self.after_art_change(&ticket.entry_id, &ticket.art_kind);
        eprintln!("Bild hochgeladen: {} {}", ticket.entry_id, ticket.art_kind);
        Ok((204, Vec::new(), "application/json"))
    }

    /// Counts the change and keeps a Sunshine app's cover (made when it was added) in step.
    fn after_art_change(&mut self, entry_id: &str, art_kind: &str)
    {
        self.art_version += 1;
        if art_kind != "cover"
        {
            return;
        }
        let Some(entry) = LibraryScanner.find(entry_id)
        else
        {
            return;
        };
        if entry.has_cover() && CoverConverter.sunshine_cover_path(&entry.id).exists()
        {
            if let Err(message) = CoverConverter.save_for_sunshine(&entry.cover, &entry.id)
            {
                eprintln!("{}", message);
            }
        }
    }

    /// `<id>/<index>`: the id is URL-encoded, so the last '/' separates the index.
    fn screenshot(&self, id_and_index: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let (encoded_entry_id, index_text) = id_and_index.rsplit_once('/').ok_or_else(|| (404, RequestLanguage::pick("Index fehlt", "Index missing")))?;
        let screenshot_index: usize = index_text.parse().map_err(|_| (404, RequestLanguage::pick("Index ist keine Zahl", "Index is not a number")))?;
        let entry_id = percent_decode_str(encoded_entry_id).decode_utf8_lossy().to_string();
        let entry = LibraryScanner.find(&entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;
        let screenshot_path = entry
            .screenshots
            .get(screenshot_index)
            .ok_or_else(|| (404, RequestLanguage::pick("Kein Screenshot mit diesem Index", "No screenshot with this index")))?;

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
        let entry_id = body["id"].as_str().ok_or_else(|| (400, RequestLanguage::pick("Feld „id“ fehlt", "Field \"id\" missing")))?;
        let entry = LibraryScanner.find(entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;

        let sunshine = SunshineClient::new(self.config.clone());
        let existing_names = sunshine.app_names().map_err(|message| (502, message))?;
        if existing_names.contains(&entry.name)
        {
            return Err((409, RequestLanguage::pick(&format!("„{}“ ist schon in Sunshine", entry.name), &format!("\"{}\" is already in Sunshine", entry.name))));
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
        let app_name = body["name"].as_str().ok_or_else(|| (400, RequestLanguage::pick("Feld „name“ fehlt", "Field \"name\" missing")))?;
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
            return Err((400, RequestLanguage::pick("Benutzername und Passwort eingeben", "Enter username and password")));
        }

        let mut new_config = self.config.clone();
        new_config.sunshine_user = user.to_string();
        new_config.sunshine_password = password.to_string();
        SunshineClient::new(new_config.clone()).list_apps().map_err(|message| (400, message))?;

        new_config
            .write_to(&CompanionConfig::config_path())
            .map_err(|message| (500, format!("{}: {}", RequestLanguage::pick("Config nicht speicherbar", "Cannot store config"), message)))?;
        self.config = new_config;
        eprintln!("Sunshine-Login gespeichert");
        Ok((204, Vec::new(), "application/json"))
    }

    /// The Host header ("192.168.178.20:47995", "[fd7a::1]:47995"), only if it looks like a host,
    /// since it ends up in a link and a QR code.
    fn request_host(request: &Request) -> Option<String>
    {
        let host_header = request.headers().iter().find(|header| header.field.equiv("Host"))?;
        let host = host_header.value.as_str().trim().to_string();
        let looks_like_host = !host.is_empty()
            && host
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || ".-:[]".contains(character));
        looks_like_host.then_some(host)
    }

    /// A picture sent as the raw request body, at most 15 MB.
    fn read_upload(request: &mut Request) -> Result<Vec<u8>, (u16, String)>
    {
        const MAXIMUM_UPLOAD_BYTES: u64 = 15 * 1024 * 1024;
        let mut upload_bytes = Vec::new();
        request
            .as_reader()
            .take(MAXIMUM_UPLOAD_BYTES + 1)
            .read_to_end(&mut upload_bytes)
            .map_err(|_| (400, RequestLanguage::pick("Upload nicht lesbar", "Cannot read upload")))?;
        if upload_bytes.len() as u64 > MAXIMUM_UPLOAD_BYTES
        {
            return Err((413, RequestLanguage::pick("Bild zu groß (höchstens 15 MB)", "Image too large (15 MB at most)")));
        }
        if upload_bytes.is_empty()
        {
            return Err((400, RequestLanguage::pick("Kein Bild empfangen", "No image received")));
        }
        Ok(upload_bytes)
    }

    fn read_body(request: &mut Request) -> Result<Value, (u16, String)>
    {
        let mut body_text = String::new();
        request
            .as_reader()
            .take(64 * 1024)
            .read_to_string(&mut body_text)
            .map_err(|_| (400, RequestLanguage::pick("Anfrage nicht lesbar", "Cannot read request")))?;
        serde_json::from_str(&body_text).map_err(|_| (400, RequestLanguage::pick("Anfrage ist kein gültiges JSON", "Request is not valid JSON")))
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
