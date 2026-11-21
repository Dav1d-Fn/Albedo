use std::path::PathBuf;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Fixed entries that are not games: the desktop (with and without resolution switch)
/// and Steam Big Picture.
pub struct PresetSource;

impl PresetSource
{
    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let covers_directory = home_directory().join(".config/sunshine/covers");
        vec![
            LibraryEntry
            {
                id: "preset:desktop-auto".into(),
                name: "Desktop".into(),
                group: "Voreinstellungen".into(),
                cover: Self::cover_if_present(covers_directory.join("desktop.png")),
                command: String::new(),
                detached_command: None,
                quit_command: None,
                follows_client_resolution: true,
            },
            LibraryEntry
            {
                id: "preset:desktop-plain".into(),
                name: "Desktop (ohne Profilwechsel)".into(),
                group: "Voreinstellungen".into(),
                cover: Self::cover_if_present(covers_directory.join("desktop-rdp.png")),
                command: String::new(),
                detached_command: None,
                quit_command: None,
                follows_client_resolution: false,
            },
            LibraryEntry
            {
                id: "preset:big-picture".into(),
                name: "Steam Big Picture".into(),
                group: "Voreinstellungen".into(),
                cover: Self::cover_if_present(PathBuf::from("/usr/share/sunshine/steam.png")),
                command: String::new(),
                detached_command: Some("steam steam://open/bigpicture".into()),
                quit_command: Some("steam steam://close/bigpicture".into()),
                follows_client_resolution: true,
            },
        ]
    }

    fn cover_if_present(cover_path: PathBuf) -> CoverSource
    {
        if cover_path.exists()
        {
            CoverSource::File(cover_path)
        }
        else
        {
            CoverSource::None
        }
    }
}
