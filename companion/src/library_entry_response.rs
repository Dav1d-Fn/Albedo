use serde::Serialize;

/// What GET /api/library sends per entry.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntryResponse
{
    pub id: String,
    pub name: String,
    pub group: String,
    pub has_cover: bool,
    pub in_sunshine: bool,
}
