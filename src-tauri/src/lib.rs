mod display_detector;
mod game_list_source;
mod gamepad_listener;
mod moonlight_command;
mod settings_store;
mod stream_session;

use tauri::AppHandle;

use display_detector::DisplayDetector;
use game_list_source::GameListSource;
use gamepad_listener::GamepadListener;
use moonlight_command::MoonlightCommand;
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
            start_stream
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
