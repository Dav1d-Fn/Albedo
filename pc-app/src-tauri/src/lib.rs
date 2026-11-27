mod companion_proxy;
mod companion_updater;
mod language_setting_file;
mod main_window;
mod tray_icon;

// The picture search is the Deck launcher's (src-tauri), used as it is so both apps find the same pictures.
#[path = "../../../src-tauri/src/art_candidate.rs"]
mod art_candidate;
#[path = "../../../src-tauri/src/art_search.rs"]
mod art_search;
#[path = "../../../src-tauri/src/art_search_result.rs"]
mod art_search_result;
#[path = "../../../src-tauri/src/host_environment.rs"]
mod host_environment;
#[path = "../../../src-tauri/src/libretro_thumbnails.rs"]
mod libretro_thumbnails;
#[path = "../../../src-tauri/src/ui_language.rs"]
mod ui_language;

use std::sync::Arc;

use percent_encoding::percent_decode_str;
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use albedo_companion_core::{CompanionService, ProcessQuitter, StreamDisplaySwitcher};
use art_search::ArtSearch;
use art_search_result::ArtSearchResult;
use companion_proxy::CompanionProxy;
use companion_updater::CompanionUpdater;
use host_environment::HostEnvironment;
use language_setting_file::LanguageSettingFile;
use main_window::MainWindow;
use tray_icon::TrayIcon;
use ui_language::UiLanguage;

/// Language of the Rust side's messages ("de" or "en", the language in use).
#[tauri::command]
fn set_language(language: String)
{
    UiLanguage::set(&language);
}

/// The stored UI language setting: "" = system, "de" or "en".
#[tauri::command]
fn load_language_setting() -> String
{
    LanguageSettingFile::load()
}

#[tauri::command]
fn save_language_setting(language: String) -> Result<(), String>
{
    LanguageSettingFile::save(&language)
}

/// Any companion endpoint, e.g. ("GET", "api/library", None). The frontend knows the API.
#[tauri::command]
async fn companion(method: String, path: String, body: Option<Value>) -> Result<Value, String>
{
    let result = CompanionProxy::new()?.request(&method, &path, body).await;
    if let Err(message) = &result
    {
        println!("[companion] {} {} -> {}", method, path, message);
    }
    result
}

/// A picture file the user picked or dropped: raw bytes as body, entry id and kind as headers
/// (no JSON number array for up to 15 MB).
#[tauri::command]
async fn upload_art(request: Request<'_>) -> Result<(), String>
{
    let InvokeBody::Raw(image_bytes) = request.body()
    else
    {
        return Err("expected raw image bytes".into());
    };
    let header_text = |name: &str| -> Result<String, String> {
        let value = request
            .headers()
            .get(name)
            .ok_or(format!("header {} missing", name))?;
        let text = value.to_str().map_err(|error| error.to_string())?;
        // Header values only carry ASCII, so the frontend sends them with encodeURIComponent.
        Ok(percent_decode_str(text).decode_utf8_lossy().to_string())
    };
    let entry_id = header_text("entry-id")?;
    let kind = header_text("art-kind")?;
    let result = CompanionProxy::new()?
        .upload_art(&entry_id, &kind, image_bytes.clone())
        .await;
    println!(
        "[art] upload {} {} ({} bytes) -> {:?}",
        entry_id,
        kind,
        image_bytes.len(),
        result
    );
    result
}

/// Pictures of one kind from the Steam shop, libretro and SteamGridDB (through this app's
/// companion, which holds the key).
#[tauri::command]
async fn search_art(
    app_handle: AppHandle,
    game_name: String,
    entry_id: String,
    system: Option<String>,
    kind: String,
) -> Result<ArtSearchResult, String>
{
    let grid_db_proxy = CompanionProxy::new()?.steam_grid_db_proxy_url()?;
    let result = art_search(&app_handle)?
        .search(&game_name, &entry_id, system.as_deref(), &kind, &grid_db_proxy)
        .await;
    println!(
        "[art] search \"{}\" {} -> {} found, problem {:?}",
        game_name,
        kind,
        result.candidates.len(),
        result.problem
    );
    Ok(result)
}

/// Downloads the picked search result and hands it to the companion like a phone upload.
#[tauri::command]
async fn apply_art(
    app_handle: AppHandle,
    entry_id: String,
    kind: String,
    image_url: String,
) -> Result<(), String>
{
    let image_bytes = art_search(&app_handle)?.download(&image_url).await?;
    let result = CompanionProxy::new()?
        .upload_art(&entry_id, &kind, image_bytes)
        .await;
    println!(
        "[art] set {} {} from {} -> {:?}",
        entry_id, kind, image_url, result
    );
    result
}

/// Opens the page where users get a SteamGridDB API key in the system browser. A fixed URL, so the
/// webview can't open anything else through here.
#[tauri::command]
fn open_steam_grid_db_key_page() -> Result<(), String>
{
    let mut command = std::process::Command::new("xdg-open");
    command.arg("https://www.steamgriddb.com/profile/preferences/api");
    // An AppImage's library paths would break the host's browser.
    HostEnvironment::apply_to(&mut command);
    command.spawn().map(|_| ()).map_err(|error| error.to_string())
}

fn art_search(app_handle: &AppHandle) -> Result<ArtSearch, String>
{
    let cache_directory = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    ArtSearch::new(cache_directory.join("libretro"))
}

/// Albedo Companion, one program for the PC side:
///   albedo-companion                    window + tray icon, serves the companion API for the Deck
///   albedo-companion --hidden           the same, starting in the tray (login autostart)
///   albedo-companion --headless         only the companion API, no window or tray (PCs without a desktop)
///   albedo-companion --exit             ends the running instance (the installer uses it to update)
///                                       (the app also updates itself: companion_updater.rs)
///   albedo-companion quit "<pattern>"   undo step of a Sunshine app: ends the game's processes
///   albedo-companion display [--restore] [--dry-run]
///                                       prep/undo step of a Sunshine app (via sunshine-match-client):
///                                       switches the stream's monitor and puts it back
pub fn run()
{
    let arguments: Vec<String> = std::env::args().collect();
    if arguments.len() == 3 && arguments[1] == "quit"
    {
        ProcessQuitter::new(&arguments[2]).quit();
        return;
    }
    if arguments.len() >= 2 && arguments[1] == "display"
    {
        std::process::exit(StreamDisplaySwitcher::run_command_line(&arguments[2..]));
    }
    if arguments.iter().any(|argument| argument == "--headless")
    {
        // Blocks while serving; only returns with an error (e.g. the port is taken).
        if let Err(message) = CompanionService::load().and_then(|service| service.run())
        {
            eprintln!("{}", message);
            std::process::exit(1);
        }
        return;
    }
    let start_hidden = arguments.iter().any(|argument| argument == "--hidden");
    let exit_requested = arguments.iter().any(|argument| argument == "--exit");

    tauri::Builder::default()
        // First: a second start only hands its arguments to the running instance and ends.
        .plugin(tauri_plugin_single_instance::init(|app_handle, arguments, _working_directory| {
            if arguments.iter().any(|argument| argument == "--exit")
            {
                app_handle.exit(0);
            }
            else if !arguments.iter().any(|argument| argument == "--hidden")
            {
                MainWindow::show(app_handle);
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            set_language,
            load_language_setting,
            save_language_setting,
            companion,
            upload_art,
            search_art,
            apply_art,
            open_steam_grid_db_key_page
        ])
        .setup(move |app| {
            if exit_requested
            {
                // No instance was running to hand --exit to: nothing to end.
                app.handle().exit(0);
                return Ok(());
            }
            TrayIcon::create(app.handle())?;
            let updater = CompanionUpdater::start(app.handle().clone());
            app.manage(updater.clone());
            start_companion(updater);
            if !start_hidden
            {
                MainWindow::show(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            // Closing the window only drops it; the app (and the Deck's API) stays in the tray
            // until "Quit" ends it with an exit code.
            if let tauri::RunEvent::ExitRequested { api, code: None, .. } = event
            {
                api.prevent_exit();
            }
        });
}

/// The companion API on its own thread, for the Deck and this app's UI. A failure (port taken,
/// config not writable) is logged; the UI then reports the companion as not answering.
fn start_companion(updater: Arc<CompanionUpdater>)
{
    let service = match CompanionService::load()
    {
        Ok(service) => service.with_self_update(updater),
        Err(message) =>
        {
            eprintln!("[companion] {}", message);
            return;
        }
    };
    CompanionProxy::set_port(service.port());
    std::thread::spawn(move || {
        if let Err(message) = service.run()
        {
            eprintln!("[companion] {}", message);
        }
    });
}
