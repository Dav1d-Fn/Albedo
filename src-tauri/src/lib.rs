mod app_updater;
mod art_candidate;
mod art_search;
mod art_search_result;
mod companion_client;
mod companion_library;
mod display_detector;
mod game_list_source;
mod gamepad_listener;
mod host_address_picker;
mod host_discovery;
mod host_environment;
mod legacy_directory_mover;
mod library_entry;
mod libretro_thumbnails;
mod moonlight_app_quit;
mod moonlight_box_art;
mod moonlight_command;
mod moonlight_host_entries;
mod moonlight_pairing;
mod pc_display_mode;
mod running_host_app;
mod settings_store;
mod stream_session;
mod ui_language;
mod upload_token;

use std::collections::HashMap;
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use app_updater::{AppUpdater, AvailableUpdate};
use art_search::ArtSearch;
use art_search_result::ArtSearchResult;
use companion_client::CompanionClient;
use companion_library::CompanionLibrary;
use display_detector::DisplayDetector;
use game_list_source::GameListSource;
use gamepad_listener::GamepadListener;
use host_address_picker::HostAddressPicker;
use host_discovery::{DiscoveredHost, HostDiscovery};
use legacy_directory_mover::LegacyDirectoryMover;
use moonlight_app_quit::MoonlightAppQuit;
use moonlight_box_art::MoonlightBoxArt;
use moonlight_command::MoonlightCommand;
use moonlight_pairing::MoonlightPairing;
use pc_display_mode::PcDisplayMode;
use running_host_app::RunningHostApp;
use settings_store::SettingsStore;
use stream_session::StreamSession;
use ui_language::UiLanguage;
use upload_token::UploadToken;

// Tauri commands must be free functions; each one only forwards to its class.

#[tauri::command]
fn set_language(language: String)
{
    UiLanguage::set(&language);
}

#[tauri::command]
fn load_settings(app_handle: AppHandle) -> Result<Option<String>, String>
{
    Ok(SettingsStore::new(&app_handle)?.load())
}

#[tauri::command]
fn save_settings(app_handle: AppHandle, settings_json: String) -> Result<String, String>
{
    let store = SettingsStore::new(&app_handle)?;
    store.save(&settings_json)?;
    Ok(store.path_string())
}

#[tauri::command]
fn has_external_display() -> bool
{
    DisplayDetector::has_external_display()
}

/// Names of the connected external screens (from their EDID), for picking a device automatically.
#[tauri::command]
fn external_display_names() -> Vec<String>
{
    DisplayDetector::external_display_names()
}

#[tauri::command]
async fn fetch_games(source: GameListSource) -> Result<Vec<String>, String>
{
    let result = source.fetch().await;
    match &result
    {
        Ok(games) => println!("[games] {} apps: {:?}", games.len(), games),
        Err(error) => eprintln!("[games] {}", error),
    }
    result
}

#[tauri::command]
fn start_stream(app_handle: AppHandle, stream_session: State<StreamSession>, command: MoonlightCommand) -> Result<String, String>
{
    stream_session.start(app_handle, command)
}

/// Ends a Moonlight that hangs; false when none was running.
#[tauri::command]
fn stop_stream(stream_session: State<StreamSession>) -> bool
{
    stream_session.stop()
}

#[tauri::command]
async fn discover_hosts() -> Result<Vec<DiscoveredHost>, String>
{
    tauri::async_runtime::spawn_blocking(|| HostDiscovery::search(Duration::from_secs(3)))
        .await
        .map_err(|error| error.to_string())?
}

/// First reachable address of the PC (home network before Tailscale), None when none answers.
#[tauri::command]
async fn pick_host_address(addresses: Vec<String>) -> Result<Option<String>, String>
{
    let picker = HostAddressPicker::new(addresses.clone(), Duration::from_secs(2));
    let picked = tauri::async_runtime::spawn_blocking(move || picker.pick())
        .await
        .map_err(|error| error.to_string())?;
    println!("[host] {:?} -> {:?}", addresses, picked);
    Ok(picked)
}

#[tauri::command]
async fn pair_host(moonlight_command: Vec<String>, host: String, pin: String) -> Result<(), String>
{
    let result = tauri::async_runtime::spawn_blocking(move || MoonlightPairing::pair(&moonlight_command, &host, &pin))
        .await
        .map_err(|error| error.to_string())?;
    println!("[pair] {:?}", result);
    result
}

#[tauri::command]
async fn quit_host_app(moonlight_command: Vec<String>, host: String) -> Result<(), String>
{
    let result = tauri::async_runtime::spawn_blocking(move || MoonlightAppQuit::quit(&moonlight_command, &host))
        .await
        .map_err(|error| error.to_string())?;
    println!("[quit] {:?}", result);
    result
}

/// The app running on the PC (streamed or paused), None when Sunshine is idle.
#[tauri::command]
async fn running_host_app(moonlight_command: Vec<String>, host: String, addresses: Vec<String>) -> Result<Option<RunningHostApp>, String>
{
    let result = RunningHostApp::query(&host, &moonlight_command, &addresses).await;
    println!("[running] {} -> {:?}", host, result);
    result
}

#[tauri::command]
async fn load_box_art(moonlight_command: Vec<String>, addresses: Vec<String>) -> Result<HashMap<String, String>, String>
{
    let result = tauri::async_runtime::spawn_blocking(move || MoonlightBoxArt::for_command(&moonlight_command)?.load(&addresses))
        .await
        .map_err(|error| error.to_string())?;
    match &result
    {
        Ok(images) => println!("[art] {} covers", images.len()),
        Err(error) => eprintln!("[art] {}", error),
    }
    result
}

#[tauri::command]
async fn companion_library(host: String) -> Result<CompanionLibrary, String>
{
    let result = CompanionClient::for_host(&host)?.library().await;
    match &result
    {
        Ok(library) => println!("[companion] {} library entries, Sunshine problem: {:?}", library.entries.len(), library.sunshine_problem),
        Err(error) => eprintln!("[companion] {}", error),
    }
    result
}

#[tauri::command]
async fn companion_cover(host: String, entry_id: String) -> Result<Option<String>, String>
{
    CompanionClient::for_host(&host)?.cover(&entry_id).await
}

#[tauri::command]
async fn companion_hero(host: String, entry_id: String) -> Result<Option<String>, String>
{
    CompanionClient::for_host(&host)?.hero(&entry_id).await
}

#[tauri::command]
async fn companion_screenshot(host: String, entry_id: String, index: u32) -> Result<Option<String>, String>
{
    CompanionClient::for_host(&host)?.screenshot(&entry_id, index).await
}

#[tauri::command]
async fn companion_logo(host: String, entry_id: String) -> Result<Option<String>, String>
{
    CompanionClient::for_host(&host)?.logo(&entry_id).await
}

#[tauri::command]
async fn companion_upload_token(host: String, entry_id: String, kind: String) -> Result<UploadToken, String>
{
    let result = CompanionClient::for_host(&host)?.upload_token(&entry_id, &kind).await;
    println!("[companion] upload page for {} {} -> {:?}", entry_id, kind, result.as_ref().map(|token| &token.url));
    result
}

#[tauri::command]
async fn companion_art_version(host: String) -> Result<u64, String>
{
    CompanionClient::for_host(&host)?.art_version().await
}

#[tauri::command]
async fn companion_reset_art(host: String, entry_id: String, kind: String) -> Result<(), String>
{
    let result = CompanionClient::for_host(&host)?.reset_art(&entry_id, &kind).await;
    println!("[companion] reset {} {} -> {:?}", entry_id, kind, result);
    result
}

/// Pictures of one kind from the Steam shop, libretro and, with a key, SteamGridDB. The key is never logged.
#[tauri::command]
async fn search_art(
    app_handle: AppHandle,
    game_name: String,
    entry_id: String,
    system: Option<String>,
    kind: String,
    steam_grid_db_key: String,
) -> Result<ArtSearchResult, String>
{
    let result = art_search(&app_handle)?
        .search(&game_name, &entry_id, system.as_deref(), &kind, &steam_grid_db_key)
        .await;
    println!(
        "[art] search \"{}\" {} {:?} {} -> {} found, problem {:?}",
        game_name,
        entry_id,
        system,
        kind,
        result.candidates.len(),
        result.problem
    );
    Ok(result)
}

fn art_search(app_handle: &AppHandle) -> Result<ArtSearch, String>
{
    let cache_directory = app_handle.path().app_cache_dir().map_err(|error| error.to_string())?;
    ArtSearch::new(cache_directory.join("libretro"))
}

/// Downloads the picked picture and hands it to the companion like a phone upload.
#[tauri::command]
async fn apply_art(app_handle: AppHandle, host: String, entry_id: String, kind: String, image_url: String) -> Result<(), String>
{
    let image_bytes = art_search(&app_handle)?.download(&image_url).await?;
    let result = CompanionClient::for_host(&host)?.upload_art(&entry_id, &kind, image_bytes).await;
    println!("[art] set {} {} from {} -> {:?}", entry_id, kind, image_url, result);
    result
}

#[tauri::command]
async fn companion_add_app(host: String, entry_id: String) -> Result<String, String>
{
    let result = CompanionClient::for_host(&host)?.add_app(&entry_id).await;
    println!("[companion] add {} -> {:?}", entry_id, result);
    result
}

#[tauri::command]
async fn companion_remove_app(host: String, app_name: String) -> Result<(), String>
{
    let result = CompanionClient::for_host(&host)?.remove_app(&app_name).await;
    println!("[companion] remove {} -> {:?}", app_name, result);
    result
}

#[tauri::command]
async fn companion_display_modes(host: String) -> Result<Vec<PcDisplayMode>, String>
{
    CompanionClient::for_host(&host)?.display_modes().await
}

#[tauri::command]
async fn companion_set_sunshine_login(host: String, user: String, password: String) -> Result<(), String>
{
    let result = CompanionClient::for_host(&host)?.set_sunshine_login(&user, &password).await;
    // The password itself is never logged.
    println!("[companion] Sunshine login for {} -> {:?}", user, result);
    result
}

#[tauri::command]
async fn companion_test_steam_grid_db_key(host: String, key: String) -> Result<String, String>
{
    let result = CompanionClient::for_host(&host)?.test_steam_grid_db_key(&key).await;
    // The key itself is never logged.
    println!("[companion] SteamGridDB key check -> {}", result);
    Ok(result)
}

#[tauri::command]
async fn check_for_update(app: AppHandle) -> Option<AvailableUpdate>
{
    AppUpdater::check(&app).await
}

#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String>
{
    AppUpdater::install(&app).await
}

/// Takes over settings.json and the picture cache from the old app id once, before the UI loads
/// the settings. The WebKit data in ~/.local/share/<old id> holds nothing of the app and stays.
fn move_legacy_directories(app_handle: &AppHandle)
{
    // Old app id from before the rename to Albedo, kept only for this move.
    const LEGACY_IDENTIFIER: &str = "de.davidf.streaminglauncher";
    let paths = app_handle.path();
    for new_directory in [paths.app_config_dir(), paths.app_cache_dir()].into_iter().flatten()
    {
        let old_directory = match new_directory.parent()
        {
            Some(parent_directory) => parent_directory.join(LEGACY_IDENTIFIER),
            None => continue,
        };
        match LegacyDirectoryMover::move_if_needed(&old_directory, &new_directory)
        {
            Ok(true) => println!("[setup] moved {} to {}", old_directory.display(), new_directory.display()),
            Ok(false) =>
            {}
            Err(message) => eprintln!("[setup] could not take over old folder: {}", message),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run()
{
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(StreamSession::default())
        .setup(|app|
        {
            move_legacy_directories(app.handle());
            GamepadListener::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_language,
            load_settings,
            save_settings,
            has_external_display,
            external_display_names,
            fetch_games,
            start_stream,
            stop_stream,
            discover_hosts,
            pick_host_address,
            pair_host,
            quit_host_app,
            running_host_app,
            load_box_art,
            companion_library,
            companion_cover,
            companion_hero,
            companion_screenshot,
            companion_logo,
            companion_upload_token,
            companion_art_version,
            companion_reset_art,
            search_art,
            apply_art,
            companion_add_app,
            companion_remove_app,
            companion_set_sunshine_login,
            companion_test_steam_grid_db_key,
            companion_display_modes,
            check_for_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
