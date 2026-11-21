use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Programs from the .desktop files the KDE menu shows (system, flatpak and user entries).
pub struct DesktopFileSource;

impl DesktopFileSource
{
    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let home = home_directory();
        // Later folders override earlier ones with the same desktop id, like the menu does.
        let application_directories: Vec<PathBuf> = vec![
            PathBuf::from("/usr/share/applications"),
            PathBuf::from("/var/lib/flatpak/exports/share/applications"),
            home.join(".local/share/flatpak/exports/share/applications"),
            home.join(".local/share/applications"),
        ];

        let mut entries_by_desktop_id: HashMap<String, Option<LibraryEntry>> = HashMap::new();
        for application_directory in application_directories
        {
            let Ok(directory_listing) = fs::read_dir(&application_directory)
            else
            {
                continue;
            };
            for directory_entry in directory_listing.flatten()
            {
                let desktop_path = directory_entry.path();
                if desktop_path.extension().and_then(|extension| extension.to_str()) != Some("desktop")
                {
                    continue;
                }
                let desktop_id = desktop_path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                // A hidden user entry also hides the system entry, so keep the None.
                entries_by_desktop_id.insert(desktop_id.clone(), Self::entry_from_file(&desktop_id, &desktop_path));
            }
        }
        entries_by_desktop_id.into_values().flatten().collect()
    }

    fn entry_from_file(desktop_id: &str, desktop_path: &Path) -> Option<LibraryEntry>
    {
        let file_content = fs::read_to_string(desktop_path).ok()?;
        let mut values: HashMap<String, String> = HashMap::new();
        let mut is_in_main_section = false;
        for line in file_content.lines()
        {
            let line = line.trim();
            if line.starts_with('[')
            {
                is_in_main_section = line == "[Desktop Entry]";
                continue;
            }
            if !is_in_main_section
            {
                continue;
            }
            if let Some((key, value)) = line.split_once('=')
            {
                values.entry(key.trim().to_string()).or_insert_with(|| value.trim().to_string());
            }
        }

        let is_true = |key: &str| values.get(key).map(|value| value == "true").unwrap_or(false);
        let exec_line = values.get("Exec").cloned().unwrap_or_default();
        let is_application = values.get("Type").map(String::as_str) == Some("Application");
        // Game shortcuts from Steam/Heroic/Lutris would duplicate their own groups.
        let is_game_shortcut = exec_line.contains("steam://rungameid") || exec_line.contains("heroic://launch") || exec_line.contains("lutris:rungameid");
        if !is_application || exec_line.is_empty() || is_game_shortcut
            || is_true("NoDisplay") || is_true("Hidden") || is_true("Terminal")
        {
            return None;
        }

        let name = values.get("Name[de]").or(values.get("Name"))?.clone();
        Some(LibraryEntry
        {
            id: format!("desktop:{}", desktop_id),
            name,
            group: "Programme".into(),
            cover: CoverSource::None,
            command: String::new(),
            // gio starts the entry exactly like the menu would (field codes, flatpak wrapper, ...).
            detached_command: Some(format!("gio launch \"{}\"", desktop_path.display())),
            quit_command: None,
            follows_client_resolution: true,
        })
    }
}
