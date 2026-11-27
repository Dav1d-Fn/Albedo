use std::io::Read;
use std::sync::Arc;

use percent_encoding::percent_decode_str;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::art_override_store::ArtOverrideStore;
use crate::client_address_filter::ClientAddressFilter;
use crate::companion_config::CompanionConfig;
use crate::cover_converter::CoverConverter;
use crate::cover_source::CoverSource;
use crate::display_backend::DisplayBackend;
use crate::display_setup::DisplaySetup;
use crate::display_target::DisplayTarget;
use crate::display_test_runner::DisplayTestRunner;
use crate::stream_display_request::StreamDisplayRequest;
use crate::group_override_store::GroupOverrideStore;
use crate::library_entry::LibraryEntry;
use crate::library_scanner::LibraryScanner;
use crate::process_quitter::ProcessQuitter;
use crate::request_language::RequestLanguage;
use crate::self_update::SelfUpdate;
use crate::steam_grid_db_client::SteamGridDbClient;
use crate::sunshine_app_builder::SunshineAppBuilder;
use crate::sunshine_client::SunshineClient;
use crate::upload_page::UploadPage;
use crate::upload_qr_code::UploadQrCode;
use crate::upload_token_store::UploadTokenStore;
use crate::virtual_edid_writer::VirtualEdidWriter;

/// The HTTP API from companion/API.md. Requests are handled one after another;
/// the only client is the launcher.
pub struct ApiServer
{
    config: CompanionConfig,
    upload_tokens: UploadTokenStore,
    /// Goes up with every override change, so the launcher knows when to reload pictures.
    art_version: u64,
    virtual_edid: VirtualEdidWriter,
    display_test: DisplayTestRunner,
    /// None when the host program can't update itself (headless).
    self_update: Option<Arc<dyn SelfUpdate>>,
}

/// Status code + body (JSON, PNG, JPEG or HTML) + content type of one answer.
type ApiAnswer = (u16, Vec<u8>, &'static str);

impl ApiServer
{
    /// Goes up only when a change breaks existing clients (a field or endpoint removed or changed),
    /// not for additions. The Deck has the same number and warns when they differ. Companions
    /// from before the number count as 1.
    pub const API_VERSION: u32 = 1;

    pub fn new(config: CompanionConfig, self_update: Option<Arc<dyn SelfUpdate>>) -> ApiServer
    {
        ApiServer { config, upload_tokens: UploadTokenStore::new(), art_version: 0, virtual_edid: VirtualEdidWriter::new(), display_test: DisplayTestRunner::new(), self_update }
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
            (Method::Get, "/api/update") => Ok(self.update_status(200)),
            (Method::Post, "/api/update") => self.install_update(),
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
            (Method::Post, "/api/display-modes") => Self::read_body(request).and_then(|body| self.add_display_mode(&body)),
            (Method::Get, "/api/display-modes/request") => Ok(Self::json(200, self.virtual_edid.status())),
            (Method::Put, "/api/display-setup") => Self::read_body(request).and_then(|body| Self::set_display_setup(&body)),
            (Method::Get, "/api/display-test") => Ok(Self::json(200, self.display_test.status())),
            (Method::Post, "/api/display-test") => Self::read_body(request).and_then(|body| self.start_display_test(&body)),
            (Method::Post, "/api/stream-display") => Self::read_body(request).and_then(|body| Self::set_stream_display(&body)),
            (Method::Post, "/api/apps") => Self::read_body(request).and_then(|body| self.add_app(&body)),
            (Method::Delete, "/api/apps") => Self::read_body(request).and_then(|body| self.delete_app(&body)),
            (Method::Put, "/api/sunshine-login") => Self::read_body(request).and_then(|body| self.set_sunshine_login(&body)),
            (Method::Put, "/api/group") => Self::read_body(request).and_then(|body| Self::set_group(&body)),
            (Method::Get, "/api/clients") => self.paired_clients(),
            (Method::Delete, client_path) if client_path.starts_with("/api/clients/") =>
            {
                let client_uuid = percent_decode_str(&client_path["/api/clients/".len()..]).decode_utf8_lossy().to_string();
                self.unpair_client(&client_uuid)
            }
            (Method::Get, "/api/steamgriddb-key") => Ok(self.steam_grid_db_key_state()),
            (Method::Put, "/api/steamgriddb-key") => Self::read_body(request).and_then(|body| self.set_steam_grid_db_key(&body)),
            (Method::Delete, "/api/steamgriddb-key") => self.store_steam_grid_db_key(""),
            (Method::Post, "/api/steamgriddb-key/test") => Self::read_body(request).and_then(|body| self.test_steam_grid_db_key(&body)),
            (Method::Get, grid_db_path) if grid_db_path.starts_with("/api/steamgriddb/") =>
            {
                // With the query: it carries the search filters.
                let path_and_query = request.url()["/api/steamgriddb/".len()..].to_string();
                self.steam_grid_db(&path_and_query)
            }
            (Method::Get, "/api/pairings") => self.pending_pairings(),
            (Method::Post, "/api/pair") => Self::read_body(request).and_then(|body| self.pair_client(&body)),
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
            "name": "albedo-companion",
            "version": env!("CARGO_PKG_VERSION"),
            "apiVersion": Self::API_VERSION,
            "host": host_name.trim()
        }))
    }

    /// Version of the running program, API version and the updater's state (`SelfUpdate::status`).
    fn update_status(&self, status_code: u16) -> ApiAnswer
    {
        let mut status = match &self.self_update
        {
            Some(self_update) => self_update.status(),
            None => json!({
                "version": env!("CARGO_PKG_VERSION"),
                "state": "unsupported",
                "available": null,
                "progress": null,
                "message": RequestLanguage::pick("Ohne Fenster (--headless) kein Selbst-Update: Installer erneut ausführen", "No self-update without a window (--headless): run the installer again")
            }),
        };
        status["apiVersion"] = json!(Self::API_VERSION);
        Self::json(status_code, status)
    }

    /// Starts installing the release the updater found; answers 202 with the status to poll.
    /// No body: what gets installed is only ever the updater's signed GitHub release.
    fn install_update(&self) -> Result<ApiAnswer, (u16, String)>
    {
        let self_update = self.self_update.as_ref().ok_or_else(|| (501, RequestLanguage::pick("Ohne Fenster (--headless) kein Selbst-Update", "No self-update without a window (--headless)")))?;
        self_update.request_install().map_err(|message| (409, message))?;
        eprintln!("Companion-Update angefordert");
        Ok(self.update_status(202))
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
        let group_overrides = GroupOverrideStore.load();
        let entries: Vec<Value> = LibraryScanner
            .scan_all()
            .iter()
            .map(|entry| json!(entry.to_response(sunshine_app_names.contains(&entry.name), group_overrides.get(&entry.id))))
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
        let backend = <dyn DisplayBackend>::for_this_desktop().map_err(|message| (502, message))?;
        let layout = backend.read_layout().map_err(|message| (502, message))?;
        let description = DisplaySetup::load().describe(backend.name(), &backend.outputs(&layout));
        Ok(Self::json(200, description))
    }

    /// Body { "dummy"?: "HDMI-A-1" | null, "main"?: "DP-2" | null }: the dummy plug's connector and
    /// the main monitor (null = none / the desktop's primary one), saved in
    /// ~/.config/sunshine-match-client.conf. Fields left out stay. Answers like GET /api/display-modes.
    fn set_display_setup(body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let backend = <dyn DisplayBackend>::for_this_desktop().map_err(|message| (502, message))?;
        let layout = backend.read_layout().map_err(|message| (502, message))?;
        let outputs = backend.outputs(&layout);
        let setup = DisplaySetup::load();
        let mut changes: Vec<(&str, Option<String>)> = Vec::new();
        for (field, key) in [("dummy", "DUMMY_OUTPUT"), ("main", "MAIN_OUTPUT")]
        {
            let Some(value) = body.get(field) else
            {
                continue;
            };
            if value.is_null()
            {
                changes.push((key, None));
                continue;
            }
            // Only a connector the desktop reports: the value goes into a file the installer reads with sed.
            let output_name = value.as_str().unwrap_or_default();
            if !outputs.iter().any(|output| output.name == output_name)
            {
                return Err((400, format!("{} „{}“: {}", RequestLanguage::pick("Unbekannter Ausgang für", "Unknown output for"), field, output_name)));
            }
            if setup.virtual_output.as_deref() == Some(output_name)
            {
                return Err((400, RequestLanguage::pick("Das ist der Anschluss des virtuellen Monitors", "That is the virtual monitor's connector")));
            }
            changes.push((key, Some(output_name.to_string())));
        }
        for (key, value) in changes
        {
            DisplaySetup::save_value(key, value.as_deref()).map_err(|message| (500, message))?;
        }
        Ok(Self::json(200, DisplaySetup::load().describe(backend.name(), &outputs)))
    }

    /// Body { "target": "virtual" | "dummy" | "main", "width"?, "height"?, "refreshRate"? }: switches
    /// that route once (default 1280×800@60) and back after 10 s; outcome from GET /api/display-test.
    fn start_display_test(&self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let target = body["target"]
            .as_str()
            .and_then(DisplayTarget::from_name)
            .filter(|target| matches!(target, DisplayTarget::Virtual | DisplayTarget::DummyPlug | DisplayTarget::MainMonitor))
            .ok_or_else(|| (400, format!("{} „target“", RequestLanguage::pick("Feld fehlt oder unbekannt:", "Field missing or unknown:"))))?;
        let number = |field: &str, fallback: u64, range: std::ops::RangeInclusive<u64>| -> Result<u32, (u16, String)>
        {
            let value = body.get(field).and_then(Value::as_u64).unwrap_or(fallback);
            if range.contains(&value)
            {
                Ok(value as u32)
            }
            else
            {
                Err((400, format!("{} „{}“", RequestLanguage::pick("Wert außerhalb des Bereichs:", "Value out of range:"), field)))
            }
        };
        let width = number("width", 1280, 320..=8192)?;
        let height = number("height", 800, 200..=8192)?;
        let refresh_rate = number("refreshRate", 60, 1..=500)?;
        let status = self.display_test.start(target, width, height, refresh_rate)?;
        eprintln!("Bildschirmtest: {} {}x{}@{}", target.name(), width, height, refresh_rate);
        Ok(Self::json(202, status))
    }

    /// Body { "target": "auto" | "virtual" | "dummy" | "main" | "none" }: the monitor the stream
    /// that starts next uses (the Deck profile's choice), taken by Sunshine's prep command.
    fn set_stream_display(body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let target = body["target"]
            .as_str()
            .and_then(DisplayTarget::from_name)
            .ok_or_else(|| (400, format!("{} „target“", RequestLanguage::pick("Feld fehlt oder unbekannt:", "Field missing or unknown:"))))?;
        StreamDisplayRequest::save(target).map_err(|message| (500, message))?;
        Ok(Self::json(200, json!({ "target": target.name() })))
    }

    /// Body { "width", "height", "refreshRate" }: puts the mode into the virtual monitor's EDID
    /// after the PC user confirms the root prompt. Answers at once, the outcome comes from
    /// `GET /api/display-modes/request`.
    fn add_display_mode(&self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let number = |field: &str| body[field].as_u64().ok_or_else(|| (400, format!("{} „{}“", RequestLanguage::pick("Feld fehlt:", "Field missing:"), field)));
        let status = self.virtual_edid.add_mode(number("width")?, number("height")?, number("refreshRate")?)?;
        eprintln!("Neuer Bildschirmmodus angefragt: {}", status["mode"]);
        Ok(Self::json(202, status))
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
        Self::migrate_apps(&sunshine);
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

    /// Moves apps created before pc-setup/ from screenprofiler to `sunshine-match-client --restore`,
    /// old `streaming-launcher-companion quit` undo steps to this companion and renames the old
    /// German desktop preset.
    /// Runs at start and before every add. A failure is only logged: the old undo steps still work
    /// (screenprofiler where installed, pc-setup/install.sh links the old companion name).
    pub fn migrate_apps(sunshine: &SunshineClient)
    {
        let companion_program = ProcessQuitter::companion_program();
        let apps = match sunshine.list_apps()
        {
            Ok(apps) => apps,
            Err(message) =>
            {
                eprintln!("Migration übersprungen: {}", message);
                return;
            }
        };
        for (app_index, app) in apps.iter().enumerate()
        {
            let restore_migrated = SunshineAppBuilder.migrate_restore_command(app);
            let base_app = restore_migrated.as_ref().unwrap_or(app);
            let quit_migrated = SunshineAppBuilder.migrate_quit_command(base_app, &companion_program);
            let base_app = quit_migrated.as_ref().unwrap_or(base_app);
            let name_migrated = SunshineAppBuilder.migrate_preset_name(base_app);
            if let Some(migrated_app) = name_migrated.or(quit_migrated).or(restore_migrated)
            {
                let app_name = app["name"].as_str().unwrap_or("?");
                match sunshine.update_app(app_index, &migrated_app)
                {
                    Ok(()) => eprintln!("Sunshine-App umgestellt: {}", app_name),
                    Err(message) => eprintln!("Umstellen fehlgeschlagen ({}): {}", app_name, message),
                }
            }
        }
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

    /// Body { "id", "group" }: `group` is a label as /api/library sends it (any language) or an own
    /// name; null, empty or the detected group goes back to the detection.
    fn set_group(body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let entry_id = body["id"].as_str().ok_or_else(|| (400, RequestLanguage::pick("Feld „id“ fehlt", "Field \"id\" missing")))?;
        let entry = LibraryScanner.find(entry_id).ok_or_else(|| (404, RequestLanguage::pick("Eintrag nicht gefunden", "Entry not found")))?;
        let group_key = body["group"].as_str().map(|label| LibraryEntry::group_key(label.trim()));
        let group_override = group_key.filter(|group| !group.is_empty() && *group != entry.group);
        if group_override.as_ref().is_some_and(|group| group.chars().count() > 40)
        {
            return Err((400, RequestLanguage::pick("Gruppenname zu lang (höchstens 40 Zeichen)", "Group name too long (40 characters at most)")));
        }
        GroupOverrideStore.set(entry_id, group_override.as_deref()).map_err(|message| (500, message))?;
        eprintln!("Gruppe: {} -> {}", entry_id, group_override.as_deref().unwrap_or("(erkannt)"));
        Ok((204, Vec::new(), "application/json"))
    }

    /// Body { "key": "…" }: one real request to SteamGridDB with that key, nothing is stored or
    /// logged. Without "key" the stored key is tested.
    fn test_steam_grid_db_key(&self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let key = body["key"].as_str().unwrap_or(&self.config.steam_grid_db_key).trim();
        SteamGridDbClient::check(key)?;
        Ok((204, Vec::new(), "application/json"))
    }

    /// Whether a key is stored and its last four characters, so the UIs can show which one.
    /// The key itself never leaves the PC.
    fn steam_grid_db_key_state(&self) -> ApiAnswer
    {
        let key = &self.config.steam_grid_db_key;
        let last_characters: Vec<char> = key.chars().rev().take(4).collect();
        let hint = (!key.is_empty()).then(|| last_characters.iter().rev().collect::<String>());
        Self::json(200, json!({ "set": !key.is_empty(), "hint": hint }))
    }

    /// Body { "key": "…" }: stored without asking SteamGridDB, so it also works offline;
    /// the UIs test it afterwards with `POST /api/steamgriddb-key/test`.
    fn set_steam_grid_db_key(&mut self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let key = body["key"].as_str().unwrap_or_default().trim();
        if !SteamGridDbClient::is_plausible_key(key)
        {
            return Err((400, RequestLanguage::pick("SteamGridDB-Schlüssel ungültig", "SteamGridDB key invalid")));
        }
        self.store_steam_grid_db_key(key)
    }

    /// "" removes the key.
    fn store_steam_grid_db_key(&mut self, key: &str) -> Result<ApiAnswer, (u16, String)>
    {
        let mut new_config = self.config.clone();
        new_config.steam_grid_db_key = key.to_string();
        new_config
            .write_to(&CompanionConfig::config_path())
            .map_err(|message| (500, format!("{}: {}", RequestLanguage::pick("Config nicht speicherbar", "Cannot store config"), message)))?;
        self.config = new_config;
        eprintln!("SteamGridDB-Schlüssel {}", if key.is_empty() { "gelöscht" } else { "gespeichert" });
        Ok((204, Vec::new(), "application/json"))
    }

    /// SteamGridDB's answer with the stored key, status code and body passed through.
    /// 409 when no key is stored: the picture search then simply skips SteamGridDB.
    fn steam_grid_db(&self, path_and_query: &str) -> Result<ApiAnswer, (u16, String)>
    {
        if self.config.steam_grid_db_key.is_empty()
        {
            return Err((409, RequestLanguage::pick("Kein SteamGridDB-Schlüssel gespeichert", "No SteamGridDB key stored")));
        }
        let (status_code, body) = SteamGridDbClient::get(path_and_query, &self.config.steam_grid_db_key)?;
        Ok((status_code, body, "application/json; charset=utf-8"))
    }

    fn paired_clients(&self) -> Result<ApiAnswer, (u16, String)>
    {
        let clients: Vec<Value> = SunshineClient::new(self.config.clone())
            .paired_clients()
            .map_err(|message| (502, message))?
            .into_iter()
            .map(|(uuid, name)| json!({ "uuid": uuid, "name": name }))
            .collect();
        Ok(Self::json(200, json!({ "clients": clients })))
    }

    fn unpair_client(&self, client_uuid: &str) -> Result<ApiAnswer, (u16, String)>
    {
        SunshineClient::new(self.config.clone()).unpair(client_uuid).map_err(|message| (502, message))?;
        eprintln!("Gerät entkoppelt: {}", client_uuid);
        Ok((204, Vec::new(), "application/json"))
    }

    fn pending_pairings(&self) -> Result<ApiAnswer, (u16, String)>
    {
        let pairings: Vec<Value> = SunshineClient::new(self.config.clone())
            .pending_pairings()
            .map_err(|message| (502, message))?
            .into_iter()
            .map(|(id, name, address)| json!({ "id": id, "name": name, "address": address }))
            .collect();
        Ok(Self::json(200, json!({ "pairings": pairings })))
    }

    /// Body { "pin": "1234", "name": "Steam Deck", "pairingId": "…" }. Without `pairingId` the one
    /// waiting device is meant; Sunshine versions without a waiting list get the PIN alone.
    fn pair_client(&self, body: &Value) -> Result<ApiAnswer, (u16, String)>
    {
        let pin = body["pin"].as_str().unwrap_or_default().trim();
        if pin.len() != 4 || !pin.chars().all(|character| character.is_ascii_digit())
        {
            return Err((400, RequestLanguage::pick("Die PIN hat vier Ziffern", "The PIN has four digits")));
        }
        let device_name = body["name"].as_str().map(str::trim).filter(|name| !name.is_empty()).unwrap_or("Moonlight");
        let sunshine = SunshineClient::new(self.config.clone());

        let pairing_id = match body["pairingId"].as_str()
        {
            Some(pairing_id) => Some(pairing_id.to_string()),
            None => match sunshine.pending_pairings()
            {
                Ok(pairings) if pairings.is_empty() =>
                {
                    return Err((409, RequestLanguage::pick(
                        "Kein Gerät wartet aufs Koppeln. Erst in Moonlight den PC wählen.",
                        "No device is waiting to pair. Pick this PC in Moonlight first.",
                    )));
                }
                Ok(pairings) if pairings.len() > 1 =>
                {
                    return Err((409, RequestLanguage::pick("Mehrere Geräte warten, bitte eins wählen", "Several devices are waiting, please pick one")));
                }
                Ok(pairings) => Some(pairings[0].0.clone()),
                Err(_) => None,
            },
        };
        sunshine.pair(pin, device_name, pairing_id.as_deref()).map_err(|message| (400, message))?;
        eprintln!("Gerät gekoppelt: {}", device_name);
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
