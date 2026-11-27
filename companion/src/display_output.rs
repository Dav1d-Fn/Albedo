use serde_json::Value;

use crate::display_mode::DisplayMode;

/// One monitor output (connector) of the PC, as the display backend reports it.
#[derive(Debug, Clone)]
pub struct DisplayOutput
{
    /// Connector name, e.g. "DP-3".
    pub name: String,
    pub connected: bool,
    pub enabled: bool,
    /// The main monitor of the desktop (KDE: the enabled output with the lowest priority).
    pub primary: bool,
    pub current_mode_id: String,
    pub modes: Vec<DisplayMode>,
}

impl DisplayOutput
{
    /// The modes in the API's form, refresh rate rounded, duplicates removed.
    pub fn modes_json(&self) -> Vec<Value>
    {
        let mut modes: Vec<Value> = Vec::new();
        for mode in &self.modes
        {
            let simple_mode = mode.to_json();
            if !modes.contains(&simple_mode)
            {
                modes.push(simple_mode);
            }
        }
        modes
    }
}
