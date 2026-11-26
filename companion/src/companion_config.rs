use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Settings David fills in once: where Sunshine's web API is, its web UI login and the
/// SteamGridDB API key the Deck and the PC app share. Stored in ~/.config/albedo-companion/config.json (mode 600).
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionConfig
{
    pub port: u16,
    pub sunshine_url: String,
    pub sunshine_user: String,
    pub sunshine_password: String,
    /// Empty = none. Never sent to clients; they search SteamGridDB through the companion.
    #[serde(default)]
    pub steam_grid_db_key: String,
}

impl CompanionConfig
{
    pub fn config_path() -> PathBuf
    {
        home_directory().join(".config/albedo-companion/config.json")
    }

    /// Reads the config. On first start it writes a template with an empty login,
    /// so the service still lists games and only adding/removing needs the login.
    pub fn load_or_create() -> Result<CompanionConfig, String>
    {
        let config_path = Self::config_path();
        if !config_path.exists()
        {
            let template = CompanionConfig
            {
                port: 47995,
                sunshine_url: "https://localhost:47990".into(),
                sunshine_user: String::new(),
                sunshine_password: String::new(),
                steam_grid_db_key: String::new(),
            };
            template.write_to(&config_path)?;
            eprintln!("Neue Config angelegt: {} – bitte Sunshine-Login eintragen", config_path.display());
            return Ok(template);
        }

        let file_content = fs::read_to_string(&config_path)
            .map_err(|error| format!("Config {} nicht lesbar: {}", config_path.display(), error))?;
        serde_json::from_str(&file_content)
            .map_err(|error| format!("Config {} ist kein gültiges JSON: {}", config_path.display(), error))
    }

    pub fn write_to(&self, config_path: &PathBuf) -> Result<(), String>
    {
        if let Some(config_directory) = config_path.parent()
        {
            fs::create_dir_all(config_directory).map_err(|error| error.to_string())?;
        }
        let file_content = serde_json::to_string_pretty(self).map_err(|error| error.to_string())?;
        fs::write(config_path, file_content + "\n").map_err(|error| error.to_string())?;
        // The file holds a password and an API key: only David may read it.
        fs::set_permissions(config_path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
    }

    pub fn has_sunshine_login(&self) -> bool
    {
        !self.sunshine_user.is_empty() && !self.sunshine_password.is_empty()
    }
}

/// $HOME of the user the service runs as.
pub fn home_directory() -> PathBuf
{
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/root".into()))
}
