use serde::Serialize;

use crate::art_candidate::ArtCandidate;

/// Answer of the picture search: what was found, and why a source failed (German, for the dialog).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtSearchResult
{
    pub candidates: Vec<ArtCandidate>,
    /// e.g. "SteamGridDB-Schlüssel ungültig"; None when every source answered.
    pub problem: Option<String>,
}
