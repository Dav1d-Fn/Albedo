use serde::{Deserialize, Serialize};

/// One game, program or preset the companion on the PC can turn into a Sunshine app.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry
{
    /// Stable "<source>:<source id>", e.g. "steam:1245620".
    pub id: String,
    pub name: String,
    /// Display group, e.g. "Steam", "Voreinstellungen".
    pub group: String,
    pub has_cover: bool,
    pub in_sunshine: bool,
}
