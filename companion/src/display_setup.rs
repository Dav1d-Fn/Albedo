use serde_json::{json, Value};

use crate::companion_config::home_directory;
use crate::display_output::DisplayOutput;
use crate::display_target::DisplayTarget;

/// Which outputs the PC has for streaming, from ~/.config/sunshine-match-client.conf (written by
/// pc-setup/install.sh):
///   VIRTUAL_OUTPUT=DP-3      connector with the forced EDID (--virtual-monitor)
///   DUMMY_OUTPUT=HDMI-A-1    connector with a dummy plug (--dummy-plug)
///   MAIN_OUTPUT=DP-2         optional: the main monitor, else the desktop's primary one
#[derive(Debug, Default, PartialEq)]
pub struct DisplaySetup
{
    pub virtual_output: Option<String>,
    pub dummy_output: Option<String>,
    pub main_output: Option<String>,
}

impl DisplaySetup
{
    const CONFIG_FILE: &'static str = ".config/sunshine-match-client.conf";

    /// An empty setup when the file is missing: then only the main monitor route is there.
    pub fn load() -> DisplaySetup
    {
        let config_text = std::fs::read_to_string(home_directory().join(Self::CONFIG_FILE)).unwrap_or_default();
        Self::from_text(&config_text)
    }

    fn from_text(config_text: &str) -> DisplaySetup
    {
        let value_of = |key: &str| -> Option<String>
        {
            let prefix = format!("{}=", key);
            config_text
                .lines()
                .filter_map(|line| line.trim().strip_prefix(prefix.as_str()))
                .map(|value| value.trim().trim_matches('"').to_string())
                .find(|value| !value.is_empty())
        };
        DisplaySetup { virtual_output: value_of("VIRTUAL_OUTPUT"), dummy_output: value_of("DUMMY_OUTPUT"), main_output: value_of("MAIN_OUTPUT") }
    }

    /// What "auto" means here, the behaviour of profiles that never picked a target.
    pub fn default_target(&self) -> DisplayTarget
    {
        if self.virtual_output.is_some()
        {
            DisplayTarget::Virtual
        }
        else if self.dummy_output.is_some()
        {
            DisplayTarget::DummyPlug
        }
        else
        {
            DisplayTarget::None
        }
    }

    /// The target that really applies: "auto" and a route this PC isn't set up for become the default.
    pub fn resolve(&self, wanted: DisplayTarget) -> DisplayTarget
    {
        match wanted
        {
            DisplayTarget::Virtual if self.virtual_output.is_some() => wanted,
            DisplayTarget::DummyPlug if self.dummy_output.is_some() => wanted,
            DisplayTarget::MainMonitor | DisplayTarget::None => wanted,
            _ => self.default_target(),
        }
    }

    /// The output a (resolved) target switches; None for `DisplayTarget::None` or an unknown main monitor.
    pub fn output_name(&self, target: DisplayTarget, outputs: &[DisplayOutput]) -> Option<String>
    {
        match target
        {
            DisplayTarget::Virtual => self.virtual_output.clone(),
            DisplayTarget::DummyPlug => self.dummy_output.clone(),
            DisplayTarget::MainMonitor => self
                .main_output
                .clone()
                .or_else(|| outputs.iter().find(|output| output.primary).map(|output| output.name.clone())),
            DisplayTarget::Auto => self.output_name(self.default_target(), outputs),
            DisplayTarget::None => None,
        }
    }

    /// `GET /api/display-modes`: the routes this PC has, with the modes of their outputs. `output`
    /// and `modes` describe the default route, the form Deck versions before the routes read.
    pub fn describe(&self, backend_name: &str, outputs: &[DisplayOutput]) -> Value
    {
        let mut routes = Vec::new();
        for target in [DisplayTarget::Virtual, DisplayTarget::DummyPlug, DisplayTarget::MainMonitor]
        {
            let Some(output_name) = self.output_name(target, outputs) else
            {
                continue;
            };
            let output = outputs.iter().find(|output| output.name == output_name);
            routes.push(json!({
                "target": target.name(),
                "output": output_name,
                "connected": output.map(|output| output.connected).unwrap_or(false),
                // Only the virtual connector's EDID is ours to extend.
                "canAddModes": target == DisplayTarget::Virtual,
                "modes": output.map(|output| output.modes_json()).unwrap_or_default()
            }));
        }
        let default_target = self.default_target();
        let default_route = routes.iter().find(|route| route["target"] == default_target.name());
        json!({
            "backend": backend_name,
            "defaultTarget": default_target.name(),
            "routes": routes,
            "output": default_route.map(|route| route["output"].clone()).unwrap_or(json!("")),
            "modes": default_route.map(|route| route["modes"].clone()).unwrap_or(json!([]))
        })
    }
}

#[cfg(test)]
mod tests
{
    use super::*;
    use crate::display_mode::DisplayMode;

    fn output(name: &str, primary: bool) -> DisplayOutput
    {
        let mode = DisplayMode { id: "1".into(), width: 1920, height: 1080, refresh_rate: 59.94 };
        DisplayOutput { name: name.into(), connected: true, enabled: primary, primary, current_mode_id: "1".into(), right_edge: 1920, modes: vec![mode] }
    }

    #[test]
    fn reads_the_outputs_from_the_config_file()
    {
        let setup = DisplaySetup::from_text("# Written by pc-setup/install.sh\nVIRTUAL_OUTPUT=DP-3\nDUMMY_OUTPUT=\"HDMI-A-2\"\nMAIN_OUTPUT=\n");
        assert_eq!(setup.virtual_output.as_deref(), Some("DP-3"));
        assert_eq!(setup.dummy_output.as_deref(), Some("HDMI-A-2"));
        assert_eq!(setup.main_output, None);
    }

    #[test]
    fn auto_and_missing_routes_fall_back_to_the_default()
    {
        let only_dummy = DisplaySetup { dummy_output: Some("HDMI-A-2".into()), ..Default::default() };
        assert_eq!(only_dummy.resolve(DisplayTarget::Auto), DisplayTarget::DummyPlug);
        assert_eq!(only_dummy.resolve(DisplayTarget::Virtual), DisplayTarget::DummyPlug);
        assert_eq!(only_dummy.resolve(DisplayTarget::MainMonitor), DisplayTarget::MainMonitor);
        assert_eq!(DisplaySetup::default().resolve(DisplayTarget::Auto), DisplayTarget::None);
        let both = DisplaySetup { virtual_output: Some("DP-3".into()), dummy_output: Some("HDMI-A-2".into()), ..Default::default() };
        assert_eq!(both.resolve(DisplayTarget::Auto), DisplayTarget::Virtual);
        assert_eq!(both.resolve(DisplayTarget::DummyPlug), DisplayTarget::DummyPlug);
    }

    #[test]
    fn main_monitor_is_the_configured_or_the_primary_output()
    {
        let outputs = [output("HDMI-A-1", false), output("DP-2", true)];
        assert_eq!(DisplaySetup::default().output_name(DisplayTarget::MainMonitor, &outputs).as_deref(), Some("DP-2"));
        let configured = DisplaySetup { main_output: Some("HDMI-A-1".into()), ..Default::default() };
        assert_eq!(configured.output_name(DisplayTarget::MainMonitor, &outputs).as_deref(), Some("HDMI-A-1"));
    }

    #[test]
    fn describes_the_routes_and_the_default_for_old_decks()
    {
        let outputs = [output("DP-3", false), output("DP-2", true)];
        let setup = DisplaySetup { virtual_output: Some("DP-3".into()), ..Default::default() };
        let description = setup.describe("kde", &outputs);
        assert_eq!(description["defaultTarget"], "virtual");
        assert_eq!(description["output"], "DP-3");
        assert_eq!(description["modes"], json!([{ "width": 1920, "height": 1080, "refreshRate": 60 }]));
        assert_eq!(description["routes"][0]["canAddModes"], true);
        assert_eq!(description["routes"][1]["target"], "main");
        assert_eq!(description["routes"][1]["output"], "DP-2");
        assert_eq!(description["routes"][1]["canAddModes"], false);
        assert_eq!(DisplaySetup::default().describe("kde", &outputs)["modes"], json!([]));
    }
}
