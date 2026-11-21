use std::fs;
use std::path::{Path, PathBuf};

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Installed Steam games from every library folder in libraryfolders.vdf.
pub struct SteamSource
{
    steam_root: PathBuf,
}

impl SteamSource
{
    /// Tools and VR-only titles that make no sense on the Deck.
    const HIDDEN_APP_IDS: [&'static str; 3] = ["228980", "431960", "546560"];
    const HIDDEN_NAME_PREFIXES: [&'static str; 3] = ["Proton", "Steam Linux Runtime", "Steamworks"];

    pub fn new() -> SteamSource
    {
        SteamSource { steam_root: home_directory().join(".local/share/Steam") }
    }

    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let mut entries = Vec::new();
        for library_folder in self.library_folders()
        {
            let Ok(directory_listing) = fs::read_dir(library_folder.join("steamapps"))
            else
            {
                continue; // drive not mounted
            };
            for directory_entry in directory_listing.flatten()
            {
                let file_name = directory_entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with("appmanifest_") && file_name.ends_with(".acf")
                {
                    if let Some(entry) = self.entry_from_manifest(&directory_entry.path())
                    {
                        entries.push(entry);
                    }
                }
            }
        }
        entries
    }

    fn library_folders(&self) -> Vec<PathBuf>
    {
        let vdf_path = self.steam_root.join("steamapps/libraryfolders.vdf");
        let vdf_content = fs::read_to_string(vdf_path).unwrap_or_default();
        let mut folders: Vec<PathBuf> = vdf_content
            .lines()
            .filter_map(|line| Self::quoted_value(line, "path"))
            .map(PathBuf::from)
            .collect();
        if folders.is_empty()
        {
            folders.push(self.steam_root.clone());
        }
        folders
    }

    fn entry_from_manifest(&self, manifest_path: &Path) -> Option<LibraryEntry>
    {
        let manifest_content = fs::read_to_string(manifest_path).ok()?;
        let app_id = manifest_content.lines().find_map(|line| Self::quoted_value(line, "appid"))?;
        let name = manifest_content.lines().find_map(|line| Self::quoted_value(line, "name"))?;

        let is_hidden_id = Self::HIDDEN_APP_IDS.contains(&app_id.as_str());
        let is_hidden_name = Self::HIDDEN_NAME_PREFIXES.iter().any(|prefix| name.starts_with(prefix));
        if is_hidden_id || is_hidden_name
        {
            return None;
        }

        Some(LibraryEntry
        {
            id: format!("steam:{}", app_id),
            name,
            group: "Steam".into(),
            cover: self.find_cover(&app_id),
            command: String::new(),
            detached_command: Some(format!("steam steam://rungameid/{}", app_id)),
            // Every game process Steam starts carries "SteamLaunch AppId=<id> " in its command line.
            quit_command: Some(format!("pkill -f \"SteamLaunch AppId={} \"", app_id)),
            follows_client_resolution: true,
        })
    }

    /// library_600x900.jpg sits either directly in the app's cache folder or one hash folder deeper.
    fn find_cover(&self, app_id: &str) -> CoverSource
    {
        let cache_directory = self.steam_root.join("appcache/librarycache").join(app_id);
        let direct_cover = cache_directory.join("library_600x900.jpg");
        if direct_cover.exists()
        {
            return CoverSource::File(direct_cover);
        }
        let Ok(directory_listing) = fs::read_dir(&cache_directory)
        else
        {
            return CoverSource::None;
        };
        for directory_entry in directory_listing.flatten()
        {
            let nested_cover = directory_entry.path().join("library_600x900.jpg");
            if nested_cover.exists()
            {
                return CoverSource::File(nested_cover);
            }
        }
        CoverSource::None
    }

    /// Reads `"key"   "value"` from one VDF/ACF line.
    fn quoted_value(line: &str, key: &str) -> Option<String>
    {
        let quoted_parts: Vec<&str> = line.split('"').collect();
        // ["\t\t", key, "\t\t", value, ""]
        if quoted_parts.len() >= 5 && quoted_parts[1] == key
        {
            Some(quoted_parts[3].replace("\\\\", "\\"))
        }
        else
        {
            None
        }
    }
}
