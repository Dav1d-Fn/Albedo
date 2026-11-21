use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// What the frontend shows in the "Update verfügbar" dialog.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate
{
    pub version: String,
    pub current_version: String,
    pub notes: String,
}

/// Looks for a newer signed release on GitHub (`latest.json`) and replaces the AppImage with it.
pub struct AppUpdater;

impl AppUpdater
{
    /// Only the installed AppImage can replace itself; `tauri dev` and the rpm never update.
    fn runs_as_appimage() -> bool
    {
        std::env::var_os("APPIMAGE").is_some()
    }

    /// None when there is no newer version or the check fails (offline, private repository).
    pub async fn check(app: &AppHandle) -> Option<AvailableUpdate>
    {
        if !Self::runs_as_appimage()
        {
            return None;
        }
        let check_result = match app.updater()
        {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        };
        match check_result
        {
            Ok(Some(update)) => Some(AvailableUpdate {
                version: update.version.clone(),
                current_version: update.current_version.clone(),
                notes: update.body.clone().unwrap_or_default(),
            }),
            Ok(None) => None,
            Err(error) =>
            {
                println!("[updater] check failed: {}", error);
                None
            }
        }
    }

    /// Downloads, verifies the signature, swaps the AppImage and restarts into the new version.
    pub async fn install(app: &AppHandle) -> Result<(), String>
    {
        let updater = app.updater().map_err(|error| error.to_string())?;
        let update = updater
            .check()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Kein Update mehr verfügbar".to_string())?;
        println!("[updater] installing {}", update.version);
        update
            .download_and_install(|_chunk_length, _content_length| {}, || {})
            .await
            .map_err(|error| error.to_string())?;
        // Under Steam the restarted process stays a child of Steam's reaper, so the game keeps running.
        app.restart();
    }
}
