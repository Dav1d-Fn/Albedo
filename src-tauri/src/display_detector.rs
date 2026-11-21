use std::fs;
use std::path::Path;

/// Checks the kernel's DRM connectors for connected external screens (dock/TV) and their names.
pub struct DisplayDetector;

impl DisplayDetector
{
    const INTERNAL_PREFIXES: [&'static str; 3] = ["eDP", "LVDS", "DSI"];

    /// The four 18-byte display descriptors of an EDID base block start here.
    const DESCRIPTOR_OFFSETS: [usize; 4] = [54, 72, 90, 108];

    /// Descriptor tag of "monitor name".
    const MONITOR_NAME_TAG: u8 = 0xFC;

    pub fn has_external_display() -> bool
    {
        !Self::external_display_names().is_empty()
    }

    /// Names of the connected external screens, e.g. "LG TV SSCR2"; the connector name ("HDMI-A-1")
    /// when the screen sends no name. Devices can be picked automatically by these names.
    pub fn external_display_names() -> Vec<String>
    {
        let Ok(entries) = fs::read_dir("/sys/class/drm") else
        {
            return Vec::new();
        };

        let mut names = Vec::new();
        for entry in entries.flatten()
        {
            let entry_name = entry.file_name().to_string_lossy().to_string();
            // Connector entries look like "card1-DP-1"; plain "card1" has no status file.
            let Some((_, connector_name)) = entry_name.split_once('-') else
            {
                continue;
            };
            let is_internal = Self::INTERNAL_PREFIXES.iter().any(|prefix| connector_name.starts_with(prefix));
            let status = fs::read_to_string(entry.path().join("status")).unwrap_or_default();
            if is_internal || status.trim() != "connected"
            {
                continue;
            }
            let name = Self::monitor_name_of(&entry.path()).unwrap_or_else(|| connector_name.to_string());
            names.push(name);
        }
        names.sort();
        names
    }

    fn monitor_name_of(connector_path: &Path) -> Option<String>
    {
        let edid = fs::read(connector_path.join("edid")).ok()?;
        Self::monitor_name(&edid)
    }

    /// Reads the "monitor name" descriptor of an EDID: up to 13 characters, ended by a line feed.
    pub fn monitor_name(edid: &[u8]) -> Option<String>
    {
        for offset in Self::DESCRIPTOR_OFFSETS
        {
            let descriptor = edid.get(offset..offset + 18)?;
            // Display descriptors (not timings) start with three zero bytes, then the tag.
            let is_name = descriptor[0..3] == [0, 0, 0] && descriptor[3] == Self::MONITOR_NAME_TAG;
            if !is_name
            {
                continue;
            }
            let text_bytes = &descriptor[5..18];
            let text_end = text_bytes.iter().position(|&byte| byte == b'\n').unwrap_or(text_bytes.len());
            let name: String = text_bytes[..text_end].iter().map(|&byte| byte as char).collect();
            let name = name.trim().to_string();
            if !name.is_empty()
            {
                return Some(name);
            }
        }
        None
    }
}

#[cfg(test)]
mod tests
{
    use super::DisplayDetector;

    fn edid_with_name_descriptor(descriptor_offset: usize, name: &[u8]) -> Vec<u8>
    {
        let mut edid = vec![0xAB; 128];
        // The other descriptors are timings (first bytes not zero).
        let mut descriptor = vec![0, 0, 0, 0xFC, 0];
        descriptor.extend_from_slice(name);
        descriptor.resize(18, b' ');
        edid[descriptor_offset..descriptor_offset + 18].copy_from_slice(&descriptor);
        edid
    }

    #[test]
    fn reads_the_monitor_name_up_to_the_line_feed()
    {
        let edid = edid_with_name_descriptor(90, b"LG TV SSCR2\n");
        assert_eq!(DisplayDetector::monitor_name(&edid), Some("LG TV SSCR2".to_string()));
    }

    #[test]
    fn no_name_descriptor_and_short_edid_give_none()
    {
        assert_eq!(DisplayDetector::monitor_name(&[0xAB; 128]), None);
        assert_eq!(DisplayDetector::monitor_name(&[0; 10]), None);
    }
}
