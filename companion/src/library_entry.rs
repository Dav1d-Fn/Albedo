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
    /// Sunshine "cmd": a process Sunshine waits on (empty = none).
    pub command: String,
    /// Sunshine "detached": started and left alone (launcher hand-offs like steam://).
    pub detached_command: Option<String>,
    /// Undo step that really ends the game when the stream is quit.
    pub quit_command: Option<String>,
    /// Prep step that switches the PC screen to the client's resolution.
    pub follows_client_resolution: bool,
}

impl LibraryEntry
{
    pub fn has_cover(&self) -> bool
    {
        !matches!(self.cover, CoverSource::None)
    }

    pub fn to_response(&self, in_sunshine: bool) -> LibraryEntryResponse
    {
        LibraryEntryResponse
        {
            id: self.id.clone(),
            name: self.name.clone(),
            group: self.group.clone(),
            has_cover: self.has_cover(),
            in_sunshine,
        }
    }
}
