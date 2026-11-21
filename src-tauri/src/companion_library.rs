use serde::{Deserialize, Serialize};

use crate::library_entry::LibraryEntry;

/// Answer of the companion's `GET /api/library`: the entries plus why adding cannot work right now.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanionLibrary
{
    pub entries: Vec<LibraryEntry>,
    /// None when the companion can reach Sunshine, otherwise the German reason for the UI.
    #[serde(default)]
    pub sunshine_problem: Option<String>,
}
