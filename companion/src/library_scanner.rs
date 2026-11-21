use crate::art_override_store::ArtOverrideStore;
use crate::desktop_file_source::DesktopFileSource;
use crate::group_override_store::GroupOverrideStore;
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

        // Sorted by the group the user sees, so a changed group moves the entry; own groups come
        // after the built-in ones, alphabetically.
        let group_overrides = GroupOverrideStore.load();
        entries.sort_by_key(|entry|
        {
            let shown_group = group_overrides.get(&entry.id).unwrap_or(&entry.group);
            let group_rank = Self::GROUP_ORDER.iter().position(|group| *group == shown_group.as_str()).unwrap_or(99);
            let own_group_name = if group_rank == 99 { shown_group.to_lowercase() } else { String::new() };
            // Presets keep their fixed order, everything else is alphabetical.
            let sort_name = if group_rank == 0 { String::new() } else { entry.name.to_lowercase() };
            (group_rank, own_group_name, sort_name)
        });
        entries
    }

    pub fn find(&self, entry_id: &str) -> Option<LibraryEntry>
    {
        self.scan_all().into_iter().find(|entry| entry.id == entry_id)
    }
}
