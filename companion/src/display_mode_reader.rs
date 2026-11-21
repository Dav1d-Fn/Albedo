use crate::companion_config::home_directory;
use crate::request_language::RequestLanguage;
use std::process::Command;

use serde_json::{json, Value};

/// Reads the modes of the virtual streaming monitor from `kscreen-doctor -j`. Its modes come from
/// the EDID override (pc-setup/make-virtual-edid.py); `sunshine-match-client` picks the
/// closest one when a client connects, so the launcher can warn about a mode the PC does not have.
pub struct DisplayModeReader;

impl DisplayModeReader
{
    /// Written by pc-setup/install.sh, also read by `sunshine-match-client`.
    const CONFIG_FILE: &'static str = ".config/sunshine-match-client.conf";

    /// KWin sometimes hangs on monitor changes, kscreen-doctor then never answers.
    const TIMEOUT_SECONDS: &'static str = "5";

    /// Name of the virtual monitor's connector (`VIRTUAL_OUTPUT=DP-3` in the config file).
    pub fn virtual_output() -> Result<String, String>
    {
        let config_text = std::fs::read_to_string(home_directory().join(Self::CONFIG_FILE))
            .map_err(|_| RequestLanguage::pick("Virtueller Monitor nicht eingerichtet (pc-setup/install.sh)", "Virtual monitor not set up (pc-setup/install.sh)"))?;
        Self::output_from_config(&config_text).ok_or_else(|| RequestLanguage::pick("VIRTUAL_OUTPUT fehlt in sunshine-match-client.conf", "VIRTUAL_OUTPUT missing in sunshine-match-client.conf"))
    }

    fn output_from_config(config_text: &str) -> Option<String>
    {
        config_text
            .lines()
            .filter_map(|line| line.trim().strip_prefix("VIRTUAL_OUTPUT="))
            .map(|value| value.trim().trim_matches('"').to_string())
            .find(|value| !value.is_empty())
    }

    /// `[{ "width", "height", "refreshRate" }]` of the given output, refresh rate rounded,
    /// duplicates removed.
    pub fn read(output_name: &str) -> Result<Vec<Value>, String>
    {
        // The user service has XDG_RUNTIME_DIR, but not the session's Wayland variables.
        let output = Command::new("timeout")
            .args([Self::TIMEOUT_SECONDS, "kscreen-doctor", "-j"])
            .env("WAYLAND_DISPLAY", std::env::var("WAYLAND_DISPLAY").unwrap_or_else(|_| "wayland-1".into()))
            .env("QT_QPA_PLATFORM", "wayland")
            .output()
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("kscreen-doctor nicht startbar", "Cannot start kscreen-doctor"), error))?;
        if !output.status.success()
        {
            return Err(RequestLanguage::pick("kscreen-doctor antwortet nicht (KWin hängt?)", "kscreen-doctor doesn't answer (KWin stuck?)"));
        }
        let screens: Value = serde_json::from_slice(&output.stdout).map_err(|error| format!("{}: {}", RequestLanguage::pick("kscreen-doctor-Ausgabe unlesbar", "Cannot read kscreen-doctor output"), error))?;
        Self::modes_of(&screens, output_name).ok_or_else(|| format!("{} {}", output_name, RequestLanguage::pick("nicht gefunden", "not found")))
    }

    fn modes_of(screens: &Value, output_name: &str) -> Option<Vec<Value>>
    {
        let output = screens["outputs"].as_array()?.iter().find(|output| output["name"] == output_name)?;
        let mut modes: Vec<Value> = Vec::new();
        for mode in output["modes"].as_array()?
        {
            let simple_mode = json!({
                "width": mode["size"]["width"],
                "height": mode["size"]["height"],
                "refreshRate": mode["refreshRate"].as_f64().unwrap_or(0.0).round() as u64
            });
            if !modes.contains(&simple_mode)
            {
                modes.push(simple_mode);
            }
        }
        Some(modes)
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn rounds_and_deduplicates_modes_of_the_named_output()
    {
        let screens = json!({ "outputs": [
            { "name": "DP-2", "modes": [{ "size": { "width": 3440, "height": 1440 }, "refreshRate": 165.0 }] },
            { "name": "DP-3", "modes": [
                { "size": { "width": 1280, "height": 800 }, "refreshRate": 89.82 },
                { "size": { "width": 1280, "height": 800 }, "refreshRate": 90.0 },
                { "size": { "width": 1920, "height": 1080 }, "refreshRate": 59.93 }
            ] }
        ] });
        let modes = DisplayModeReader::modes_of(&screens, "DP-3").unwrap();
        assert_eq!(modes, vec![
            json!({ "width": 1280, "height": 800, "refreshRate": 90 }),
            json!({ "width": 1920, "height": 1080, "refreshRate": 60 })
        ]);
        assert!(DisplayModeReader::modes_of(&screens, "HDMI-A-1").is_none());
    }

    #[test]
    fn reads_the_output_name_from_the_config_file()
    {
        let config_text = "# Written by pc-setup/install.sh\nVIRTUAL_OUTPUT=HDMI-A-2\n";
        assert_eq!(DisplayModeReader::output_from_config(config_text), Some("HDMI-A-2".to_string()));
        assert_eq!(DisplayModeReader::output_from_config("VIRTUAL_OUTPUT=\n"), None);
    }
}
