use crate::art_override_store::ArtOverrideStore;
use crate::desktop_file_source::DesktopFileSource;
use crate::heroic_source::HeroicSource;
use crate::library_entry::LibraryEntry;
use crate::lutris_source::LutrisSource;
use crate::preset_source::PresetSource;
use crate::prism_source::PrismSource;
use crate::steam_shortcut_source::SteamShortcutSource;
use crate::steam_source::SteamSource;

/// Collects everything addable from all sources, sorted by group, then name.
pub struct LibraryScanner;

impl LibraryScanner
{
    const GROUP_ORDER: [&'static str; 8] =
        ["Voreinstellungen", "Steam", "Nicht-Steam", "Emulation", "Heroic", "Lutris", "Minecraft", "Programme"];

    pub fn scan_all(&self) -> Vec<LibraryEntry>
    {
        let mut entries = Vec::new();
        entries.extend(PresetSource.scan());
        entries.extend(SteamSource::new().scan());
        entries.extend(SteamShortcutSource::new().scan());
        entries.extend(HeroicSource.scan());
        entries.extend(LutrisSource.scan());
        entries.extend(PrismSource.scan());
        entries.extend(DesktopFileSource.scan());
        for entry in entries.iter_mut()
        {
            ArtOverrideStore.apply(entry);
        }

        entries.sort_by_key(|entry|
        {
            let group_rank = Self::GROUP_ORDER.iter().position(|group| *group == entry.group).unwrap_or(99);
            // Presets keep their fixed order, everything else is alphabetical.
            let sort_name = if group_rank == 0 { String::new() } else { entry.name.to_lowercase() };
            (group_rank, sort_name)
        });
        entries
    }

    pub fn find(&self, entry_id: &str) -> Option<LibraryEntry>
    {
        self.scan_all().into_iter().find(|entry| entry.id == entry_id)
    }
}
