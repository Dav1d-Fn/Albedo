use std::path::PathBuf;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Fixed entries that are not games: the desktop (with and without resolution switch)
/// and Steam Big Picture.
pub struct PresetSource;

impl PresetSource
{
    /// The desktop as it is, no monitor switch, whatever the Deck profile says. Sunshine apps keep
    /// this name for good (the Deck keys its per-game settings by it), so it is not translated.
    pub const DESKTOP_WITHOUT_SWITCH: &'static str = "Desktop (no display switch)";
    /// The name before 0.2, renamed by `SunshineAppBuilder::migrate_preset_name`.
    pub const OLD_DESKTOP_WITHOUT_SWITCH: &'static str = "Desktop (ohne Profilwechsel)";

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
                hero: CoverSource::None,
                logo: CoverSource::None,
                screenshots: Vec::new(),
                command: String::new(),
                detached_command: None,
                quit_command: None,
                follows_client_resolution: true,
                system: None,
            },
            LibraryEntry
            {
                id: "preset:desktop-plain".into(),
                name: Self::DESKTOP_WITHOUT_SWITCH.into(),
                group: "Voreinstellungen".into(),
                cover: Self::cover_if_present(covers_directory.join("desktop-rdp.png")),
                hero: CoverSource::None,
                logo: CoverSource::None,
                screenshots: Vec::new(),
                command: String::new(),
                detached_command: None,
                quit_command: None,
                follows_client_resolution: false,
                system: None,
            },
            LibraryEntry
            {
                id: "preset:big-picture".into(),
                name: "Steam Big Picture".into(),
                group: "Voreinstellungen".into(),
                cover: Self::cover_if_present(PathBuf::from("/usr/share/sunshine/steam.png")),
                hero: CoverSource::None,
                logo: CoverSource::None,
                screenshots: Vec::new(),
                command: String::new(),
                detached_command: Some("steam steam://open/bigpicture".into()),
                quit_command: Some("steam steam://close/bigpicture".into()),
                follows_client_resolution: true,
                system: None,
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
