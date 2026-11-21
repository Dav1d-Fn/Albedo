use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;
use crate::process_quitter::ProcessQuitter;

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
            cover: self.find_library_image(&app_id, "library_600x900.jpg"),
            hero: self.find_library_image(&app_id, "library_hero.jpg"),
            logo: self.find_library_image(&app_id, "logo.png"),
            screenshots: self.find_screenshots(&app_id),
            command: String::new(),
            detached_command: Some(format!("steam steam://rungameid/{}", app_id)),
            // Every game process Steam starts carries "SteamLaunch AppId=<id> " in its command line.
            quit_command: Some(ProcessQuitter::command_for(&format!("SteamLaunch AppId={} ", app_id))),
            follows_client_resolution: true,
        })
    }

    /// Steam's library images sit either directly in the app's cache folder or one hash folder deeper.
    fn find_library_image(&self, app_id: &str, file_name: &str) -> CoverSource
    {
        let cache_directory = self.steam_root.join("appcache/librarycache").join(app_id);
        let direct_image = cache_directory.join(file_name);
        if direct_image.exists()
        {
            return CoverSource::File(direct_image);
        }
        let Ok(directory_listing) = fs::read_dir(&cache_directory)
        else
        {
            return CoverSource::None;
        };
        for directory_entry in directory_listing.flatten()
        {
            let nested_image = directory_entry.path().join(file_name);
            if nested_image.exists()
            {
                return CoverSource::File(nested_image);
            }
        }
        CoverSource::None
    }

    /// Screenshots of every Steam account on this PC (userdata/<account>/760/remote/<appid>/screenshots), newest first.
    fn find_screenshots(&self, app_id: &str) -> Vec<PathBuf>
    {
        let mut screenshots: Vec<(SystemTime, PathBuf)> = Vec::new();
        let Ok(account_listing) = fs::read_dir(self.steam_root.join("userdata"))
        else
        {
            return Vec::new();
        };
        for account_entry in account_listing.flatten()
        {
            let screenshot_directory = account_entry.path().join("760/remote").join(app_id).join("screenshots");
            let Ok(screenshot_listing) = fs::read_dir(screenshot_directory)
            else
            {
                continue;
            };
            for screenshot_entry in screenshot_listing.flatten()
            {
                let screenshot_path = screenshot_entry.path();
                let is_jpeg = screenshot_path.extension().is_some_and(|extension| extension == "jpg");
                let modified_time = screenshot_entry.metadata().and_then(|metadata| metadata.modified());
                if let (true, Ok(modified_time)) = (is_jpeg, modified_time)
                {
                    screenshots.push((modified_time, screenshot_path));
                }
            }
        }
        screenshots.sort_by(|first, second| second.0.cmp(&first.0));
        screenshots.into_iter().map(|(_, screenshot_path)| screenshot_path).collect()
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
