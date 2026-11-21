mod display_detector;
mod game_list_source;
mod gamepad_listener;
mod host_discovery;
mod host_environment;
mod moonlight_app_quit;
mod moonlight_command;
mod moonlight_pairing;
mod settings_store;
mod stream_session;

use std::time::Duration;

use tauri::AppHandle;

use display_detector::DisplayDetector;
use game_list_source::GameListSource;
use gamepad_listener::GamepadListener;
use host_discovery::{DiscoveredHost, HostDiscovery};
use moonlight_app_quit::MoonlightAppQuit;
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
            quit_host_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
