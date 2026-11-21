use serde::Serialize;

/// One picture the user can pick in the "Bild setzen" dialog instead of sending one from the phone.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtCandidate
{
    /// Full-size picture; the launcher downloads it and hands it to the companion like a phone upload.
    pub image_url: String,
    /// Smaller version for the dialog (same picture).
    pub thumbnail_url: String,
    /// "Steam-Shop" or "SteamGridDB".
    pub source: String,
    /// Shown under the picture, e.g. the shop's game name or the SteamGridDB author.
    pub label: String,
}
