use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::companion_config::home_directory;
use crate::request_language::RequestLanguage;

/// Groups the user picked by hand for single entries, e.g. an emulator game the detection put into
/// "Nicht-Steam", or an own group like "Couch-Koop". Stored as one JSON object
/// { "<entry id>": "<group>" } in ~/.config/albedo-companion/groups.json.
/// Built-in groups are stored with their German name (the companion's internal one).
pub struct GroupOverrideStore;

impl GroupOverrideStore
{
    /// All overrides; an unreadable or missing file means none.
    pub fn load(&self) -> HashMap<String, String>
    {
        fs::read_to_string(Self::store_path())
            .ok()
            .and_then(|file_text| serde_json::from_str(&file_text).ok())
            .unwrap_or_default()
    }

    /// `group` None (or the detected group itself) goes back to the detected group.
    pub fn set(&self, entry_id: &str, group: Option<&str>) -> Result<(), String>
    {
        let mut overrides = self.load();
        match group
        {
            Some(group_name) => overrides.insert(entry_id.to_string(), group_name.to_string()),
            None => overrides.remove(entry_id),
        };

        let store_path = Self::store_path();
        if let Some(store_directory) = store_path.parent()
        {
            fs::create_dir_all(store_directory).map_err(|error| error.to_string())?;
        }
        let file_text =
            serde_json::to_string_pretty(&overrides).map_err(|error| error.to_string())?;
        fs::write(&store_path, file_text).map_err(|error| {
            format!(
                "{}: {}",
                RequestLanguage::pick("Gruppe nicht speicherbar", "Cannot store group"),
                error
            )
        })
    }

    fn store_path() -> PathBuf
    {
        home_directory().join(".config/albedo-companion/groups.json")
    }
}
