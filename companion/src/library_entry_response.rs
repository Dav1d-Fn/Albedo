use serde::Serialize;

/// What GET /api/library sends per entry.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntryResponse
{
    pub id: String,
    pub name: String,
    pub group: String,
    /// The group the detection picked; differs from `group` when the user changed it.
    pub detected_group: String,
    pub custom_group: bool,
    pub has_cover: bool,
    pub has_hero: bool,
    pub has_logo: bool,
    pub screenshot_count: usize,
    pub in_sunshine: bool,
    /// Picture kinds set by hand ("cover", "hero", "logo").
    pub custom_art: Vec<String>,
    /// Emulated system, e.g. "Nintendo 64"; null for other games.
    pub system: Option<String>,
}
