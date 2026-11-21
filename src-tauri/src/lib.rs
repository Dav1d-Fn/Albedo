mod companion_client;
mod companion_library;
mod display_detector;
mod game_list_source;
mod gamepad_listener;
mod host_discovery;
mod host_environment;
mod library_entry;
mod moonlight_app_quit;
mod moonlight_box_art;
mod moonlight_command;
mod moonlight_host_entries;
mod moonlight_pairing;
mod settings_store;
mod stream_session;

use std::collections::HashMap;
use std::time::Duration;

use tauri::AppHandle;

use companion_client::CompanionClient;
use companion_library::CompanionLibrary;
use display_detector::DisplayDetector;
use game_list_source::GameListSource;
use gamepad_listener::GamepadListener;
use host_discovery::{DiscoveredHost, HostDiscovery};
use moonlight_app_quit::MoonlightAppQuit;
use moonlight_box_art::MoonlightBoxArt;
use moonlight_command::MoonlightCommand;
use moonlight_pairing::MoonlightPairing;
use settings_store::SettingsStore;
use stream_session::StreamSession;

// Tauri commands must be free functions; each one only forwards to its class.

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
fn start_stream(app_handle: AppHandle, command: MoonlightCommand) -> Result<String, String>
{
    StreamSession::start(app_handle, command)
}

#[tauri::command]
async fn discover_hosts() -> Result<Vec<DiscoveredHost>, String>
{
    tauri::async_runtime::spawn_blocking(|| HostDiscovery::search(Duration::from_secs(3)))
        .await
        .map_err(|error| error.to_string())?
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

#[tauri::command]
async fn load_box_art(moonlight_command: Vec<String>, host: String) -> Result<HashMap<String, String>, String>
{
    let result = tauri::async_runtime::spawn_blocking(move || MoonlightBoxArt::for_command(&moonlight_command)?.load(&host))
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
async fn companion_set_sunshine_login(host: String, user: String, password: String) -> Result<(), String>
{
    let result = CompanionClient::for_host(&host)?.set_sunshine_login(&user, &password).await;
    // The password itself is never logged.
    println!("[companion] Sunshine login for {} -> {:?}", user, result);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run()
{
    tauri::Builder::default()
        .setup(|app|
        {
            GamepadListener::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            has_external_display,
            fetch_games,
            start_stream,
            discover_hosts,
            pair_host,
            quit_host_app,
            load_box_art,
            companion_library,
            companion_cover,
            companion_add_app,
            companion_remove_app,
            companion_set_sunshine_login
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
