use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::binary_vdf_reader::BinaryVdfReader;
use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;
use crate::process_quitter::ProcessQuitter;

/// Non-Steam games added to Steam (userdata/<account>/config/shortcuts.vdf of every account),
/// e.g. the EmuDeck entries. Emulators go to the group "Emulation", the rest to "Nicht-Steam".
///
/// Start: native programs run directly as Sunshine "cmd" (exe + LaunchOptions, %command% and
/// leading VAR=value resolved through `env`, StartDir through `env -C`), so Sunshine waits on the
/// game and ends it with the stream, without Steam in between. Windows .exe need Steam's Proton
/// setup, so they start detached through `steam steam://rungameid/<64-bit id>`.
pub struct SteamShortcutSource
{
    steam_root: PathBuf,
}

impl SteamShortcutSource
{
    const EMULATOR_NAMES: [&'static str; 20] = [
        "retroarch", "eden", "yuzu", "ryujinx", "citron", "sudachi", "dolphin", "primehack", "pcsx2", "rpcs3",
        "cemu", "melonds", "duckstation", "ppsspp", "xemu", "mgba", "azahar", "citra", "lichii", "es-de",
    ];

    pub fn new() -> SteamShortcutSource
    {
        SteamShortcutSource { steam_root: home_directory().join(".local/share/Steam") }
    }

    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let mut entries = Vec::new();
        let mut seen_app_ids = HashSet::new();
        let Ok(account_listing) = fs::read_dir(self.steam_root.join("userdata"))
        else
        {
            return Vec::new();
        };
        for account_entry in account_listing.flatten()
        {
            let config_directory = account_entry.path().join("config");
            let Some(vdf_tree) = fs::read(config_directory.join("shortcuts.vdf"))
                .ok()
                .and_then(|vdf_bytes| BinaryVdfReader::parse(&vdf_bytes))
            else
            {
                continue;
            };
            let Some(shortcuts) = vdf_tree["shortcuts"].as_object()
            else
            {
                continue;
            };
            for shortcut in shortcuts.values()
            {
                let app_id = shortcut["appid"].as_u64().unwrap_or_default();
                if seen_app_ids.insert(app_id)
                {
                    if let Some(entry) = Self::entry_from_shortcut(shortcut, app_id, &config_directory.join("grid"))
                    {
                        entries.push((entry, Self::system_name(shortcut)));
                    }
                }
            }
        }
        Self::make_names_unique(entries)
    }

    /// Sunshine and the launcher match apps by name, so two "Breath of the Wild" (Switch, Wii U)
    /// become "… (Nintendo Switch)" and "… (Nintendo Wii U)".
    fn make_names_unique(entries_with_system: Vec<(LibraryEntry, Option<String>)>) -> Vec<LibraryEntry>
    {
        let all_names: Vec<String> = entries_with_system.iter().map(|(entry, _)| entry.name.clone()).collect();
        entries_with_system
            .into_iter()
            .map(|(mut entry, system_name)|
            {
                let name_count = all_names.iter().filter(|name| **name == entry.name).count();
                if let (true, Some(system_name)) = (name_count > 1, system_name)
                {
                    entry.name = format!("{} ({})", entry.name, system_name);
                }
                entry
            })
            .collect()
    }

    /// EmuDeck/Steam ROM Manager tag the system as e.g. "Nintendo Switch - Eden": take the part before " - ".
    fn system_name(shortcut: &Value) -> Option<String>
    {
        let first_tag = shortcut["tags"].as_object()?.values().next()?.as_str()?;
        let system_name = first_tag.split(" - ").next().unwrap_or_default().trim();
        (!system_name.is_empty()).then(|| system_name.to_string())
    }

    fn entry_from_shortcut(shortcut: &Value, app_id: u64, grid_directory: &Path) -> Option<LibraryEntry>
    {
        let name = shortcut["appname"].as_str().unwrap_or_default().to_string();
        let executable = shortcut["exe"].as_str().unwrap_or_default().trim().to_string();
        let launch_options = shortcut["LaunchOptions"].as_str().unwrap_or_default().trim().to_string();
        let is_hidden = shortcut["IsHidden"].as_u64().unwrap_or_default() != 0;
        if name.is_empty() || executable.is_empty() || is_hidden
        {
            return None;
        }

        let launch_line = Self::launch_line(&executable, &launch_options);
        // The Prism source already lists every Minecraft instance.
        if launch_line.contains("org.prismlauncher")
        {
            return None;
        }

        let executable_path = Self::executable_path(&executable);
        // Only the program's file name is matched, so a "dolphin" in some game path does not count.
        let executable_file_name = executable_path.rsplit('/').next().unwrap_or_default().to_lowercase();
        let is_emulation = launch_line.to_lowercase().contains("/emulation/")
            || Self::EMULATOR_NAMES.iter().any(|emulator_name| executable_file_name.contains(emulator_name));
        let needs_proton = executable_path.to_lowercase().ends_with(".exe");

        let (command, detached_command, quit_command) = if needs_proton
        {
            // Steam's id for a shortcut: the 32-bit appid in the upper half, 0x02000000 below.
            let game_id = (app_id << 32) | 0x0200_0000;
            (
                String::new(),
                Some(format!("steam steam://rungameid/{}", game_id)),
                Some(ProcessQuitter::command_for(&executable_path)),
            )
        }
        else
        {
            let start_directory = shortcut["StartDir"].as_str().unwrap_or_default().trim().trim_matches('"');
            let change_directory = if start_directory.is_empty()
            {
                String::new()
            }
            else
            {
                format!("-C \"{}\" ", start_directory)
            };
            (format!("env {}{}", change_directory, launch_line), None, None)
        };

        Some(LibraryEntry
        {
            id: format!("shortcut:{}", app_id),
            name,
            group: if is_emulation { "Emulation".into() } else { "Nicht-Steam".into() },
            cover: Self::grid_image(grid_directory, &format!("{}p", app_id)),
            hero: Self::grid_image(grid_directory, &format!("{}_hero", app_id)),
            screenshots: Vec::new(),
            command,
            detached_command,
            quit_command,
            follows_client_resolution: true,
        })
    }

    /// What Steam runs: LaunchOptions with %command% replaced by the exe field, or exe + options.
    /// The exe field may already carry arguments (EmuDeck's RetroArch entries do).
    fn launch_line(executable: &str, launch_options: &str) -> String
    {
        if launch_options.contains("%command%")
        {
            launch_options.replace("%command%", executable)
        }
        else if launch_options.is_empty()
        {
            executable.to_string()
        }
        else
        {
            format!("{} {}", executable, launch_options)
        }
    }

    /// The program itself: the first (possibly quoted) word of the exe field.
    fn executable_path(executable: &str) -> String
    {
        match executable.strip_prefix('"')
        {
            Some(after_quote) => after_quote.split('"').next().unwrap_or_default().to_string(),
            None => executable.split_whitespace().next().unwrap_or_default().to_string(),
        }
    }

    /// Steam's custom artwork: grid/<appid>p.png (portrait), <appid>_hero.png, as png or jpg.
    fn grid_image(grid_directory: &Path, file_stem: &str) -> CoverSource
    {
        ["png", "jpg"]
            .iter()
            .map(|extension| grid_directory.join(format!("{}.{}", file_stem, extension)))
            .find(|image_path| image_path.exists())
            .map(CoverSource::File)
            .unwrap_or(CoverSource::None)
    }
}

#[cfg(test)]
mod tests
{
    use super::SteamShortcutSource;

    #[test]
    fn builds_the_launch_line_like_steam()
    {
        let eden = "\"/e/eden.sh\"";
        assert_eq!(
            SteamShortcutSource::launch_line(eden, "vblank_mode=0 %command% -f -g \"/r/z.nsp\""),
            "vblank_mode=0 \"/e/eden.sh\" -f -g \"/r/z.nsp\""
        );
        assert_eq!(SteamShortcutSource::launch_line(eden, "\"/r/a.nds\" -f"), "\"/e/eden.sh\" \"/r/a.nds\" -f");
        assert_eq!(SteamShortcutSource::executable_path("\"/a b/c.exe\" -x"), "/a b/c.exe");
    }
}
