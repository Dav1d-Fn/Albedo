use std::fs;

/// Checks the kernel's DRM connectors for a connected external screen (dock/TV).
pub struct DisplayDetector;

impl DisplayDetector
{
    const INTERNAL_PREFIXES: [&'static str; 3] = ["eDP", "LVDS", "DSI"];

    pub fn has_external_display() -> bool
    {
        let Ok(entries) = fs::read_dir("/sys/class/drm") else
        {
            return false;
        };

        entries.flatten().any(|entry|
        {
            let entry_name = entry.file_name().to_string_lossy().to_string();
            // Connector entries look like "card1-DP-1"; plain "card1" has no status file.
            let Some((_, connector_name)) = entry_name.split_once('-') else
            {
                return false;
            };
            let is_internal = Self::INTERNAL_PREFIXES.iter().any(|prefix| connector_name.starts_with(prefix));
            let status = fs::read_to_string(entry.path().join("status")).unwrap_or_default();

            !is_internal && status.trim() == "connected"
        })
    }
}
