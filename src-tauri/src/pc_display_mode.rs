use serde::{Deserialize, Serialize};

/// One mode of a PC monitor output, from the companion's `GET /api/display-modes`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcDisplayMode
{
    pub width: u32,
    pub height: u32,
    /// Rounded to whole Hz.
    pub refresh_rate: u32,
}
