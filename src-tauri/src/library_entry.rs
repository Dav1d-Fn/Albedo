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
    /// A wide title image for the backdrop exists (`GET /api/hero/<id>`).
    #[serde(default)]
    pub has_hero: bool,
    /// A logo with the game's name exists (`GET /api/logo/<id>`).
    #[serde(default)]
    pub has_logo: bool,
    /// Number of the user's screenshots (`GET /api/screenshot/<id>/<index>`, 0 = newest).
    #[serde(default)]
    pub screenshot_count: u32,
    /// Emulated system from the EmuDeck tag ("Nintendo 64"); None for other games and older companions.
    #[serde(default)]
    pub system: Option<String>,
    /// Picture kinds set by hand on the PC ("cover", "hero", "logo"); older companions send none.
    #[serde(default)]
    pub custom_art: Vec<String>,
}
