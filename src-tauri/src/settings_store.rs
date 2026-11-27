use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Persists the settings JSON (profiles, host, remembered modes) in the app config dir, and the
/// home screen's last game list with its pictures in the cache dir (`home_cache`).
/// The frontend owns the structure; this side only reads and writes the file.
pub struct SettingsStore
{
    file_path: PathBuf,
}

impl SettingsStore
{
    pub fn new(app_handle: &AppHandle) -> Result<Self, String>
    {
        let config_directory = app_handle.path().app_config_dir().map_err(|error| error.to_string())?;
        Ok(Self { file_path: config_directory.join("settings.json") })
    }

    /// Games, covers and logos from the last visit, so the home screen shows them before the PC answers.
    pub fn home_cache(app_handle: &AppHandle) -> Result<Self, String>
    {
        let cache_directory = app_handle.path().app_cache_dir().map_err(|error| error.to_string())?;
        Ok(Self { file_path: cache_directory.join("home-cache.json") })
    }

    /// Returns None when no settings were saved yet.
    pub fn load(&self) -> Option<String>
    {
        fs::read_to_string(&self.file_path).ok()
    }

    /// Writes via a temp file so a crash never leaves a half-written settings file.
    pub fn save(&self, settings_json: &str) -> Result<(), String>
    {
        if let Some(parent) = self.file_path.parent()
        {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let temporary_path = self.file_path.with_extension("json.tmp");
        fs::write(&temporary_path, settings_json).map_err(|error| error.to_string())?;
        fs::rename(&temporary_path, &self.file_path).map_err(|error| error.to_string())
    }

    pub fn path_string(&self) -> String
    {
        self.file_path.to_string_lossy().to_string()
    }
}
