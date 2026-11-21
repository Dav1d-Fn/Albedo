use crate::request_language::RequestLanguage;
use std::path::PathBuf;

use crate::art_override_store::ArtOverrideStore;
use crate::cover_source::CoverSource;
use crate::library_entry_response::LibraryEntryResponse;

/// One game or program the launcher can add. Knows how Sunshine has to start and stop it.
#[derive(Clone)]
pub struct LibraryEntry
{
    pub id: String,
    pub name: String,
    pub group: String,
    pub cover: CoverSource,
    /// Wide title picture for the launcher's background.
    pub hero: CoverSource,
    /// Transparent game logo (shown over the hero).
    pub logo: CoverSource,
    /// The user's screenshots of this game, newest first.
    pub screenshots: Vec<PathBuf>,
    /// Sunshine "cmd": a process Sunshine waits on (empty = none).
    pub command: String,
    /// Sunshine "detached": started and left alone (launcher hand-offs like steam://).
    pub detached_command: Option<String>,
    /// Undo step that really ends the game when the stream is quit.
    pub quit_command: Option<String>,
    /// Prep step that switches the PC screen to the client's resolution.
    pub follows_client_resolution: bool,
    /// Emulated system from the EmuDeck/Steam ROM Manager tag ("Nintendo 64"), for the launcher's picture search.
    pub system: Option<String>,
}

impl LibraryEntry
{
    pub fn has_cover(&self) -> bool
    {
        !matches!(self.cover, CoverSource::None)
    }

    /// Group names are German inside the companion (sort order); English requests get them translated.
    fn group_label(group: &str) -> String
    {
        match group
        {
            "Voreinstellungen" => RequestLanguage::pick(group, "Presets"),
            "Nicht-Steam" => RequestLanguage::pick(group, "Non-Steam"),
            "Programme" => RequestLanguage::pick(group, "Apps"),
            _ => group.to_string(),
        }
    }

    pub fn to_response(&self, in_sunshine: bool) -> LibraryEntryResponse
    {
        LibraryEntryResponse
        {
            id: self.id.clone(),
            name: self.name.clone(),
            group: Self::group_label(&self.group),
            has_cover: self.has_cover(),
            has_hero: !matches!(self.hero, CoverSource::None),
            has_logo: !matches!(self.logo, CoverSource::None),
            screenshot_count: self.screenshots.len(),
            in_sunshine,
            custom_art: ArtOverrideStore.custom_kinds(&self.id),
            system: self.system.clone(),
        }
    }
}
