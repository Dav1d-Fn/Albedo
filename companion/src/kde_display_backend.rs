use std::process::Command;

use serde_json::Value;

use crate::display_backend::DisplayBackend;
use crate::display_mode::DisplayMode;
use crate::display_output::DisplayOutput;
use crate::host_environment::HostEnvironment;
use crate::request_language::RequestLanguage;

/// KDE Plasma on Wayland: reads the layout with `kscreen-doctor -j`, switches with
/// `kscreen-doctor output.<name>.<setting>…`.
pub struct KdeDisplayBackend;

impl KdeDisplayBackend
{
    /// KWin sometimes hangs on monitor changes, kscreen-doctor then never answers.
    const READ_TIMEOUT_SECONDS: &'static str = "20";
    const SWITCH_TIMEOUT_SECONDS: &'static str = "60";
    const PROGRAM: &'static str = "kscreen-doctor";

    /// kscreen-doctor wrapped in `timeout`, with the Wayland environment Sunshine's service and
    /// the companion's user service may lack, and without the AppImage's libraries.
    fn command(timeout_seconds: &str, arguments: &[String]) -> Command
    {
        let mut command = Command::new("timeout");
        command.arg(timeout_seconds).args(arguments);
        HostEnvironment::apply_to(&mut command);
        let runtime_directory = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| format!("/run/user/{}", Self::user_id()));
        command
            .env("XDG_RUNTIME_DIR", runtime_directory)
            .env("WAYLAND_DISPLAY", std::env::var("WAYLAND_DISPLAY").unwrap_or_else(|_| "wayland-1".into()))
            .env("QT_QPA_PLATFORM", "wayland");
        command
    }

    fn user_id() -> String
    {
        Command::new("id")
            .arg("-u")
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_else(|_| "1000".into())
    }

    fn with_program(arguments: Vec<String>) -> Vec<String>
    {
        let mut command = vec![Self::PROGRAM.to_string()];
        command.extend(arguments);
        command
    }

    fn mode_of(mode_value: &Value) -> DisplayMode
    {
        DisplayMode {
            id: mode_value["id"].as_str().unwrap_or_default().to_string(),
            width: mode_value["size"]["width"].as_u64().unwrap_or(0) as u32,
            height: mode_value["size"]["height"].as_u64().unwrap_or(0) as u32,
            refresh_rate: mode_value["refreshRate"].as_f64().unwrap_or(0.0),
        }
    }

    fn rotation_name(rotation: &Value) -> &'static str
    {
        match rotation.as_u64()
        {
            Some(2) => "left",
            Some(4) => "inverted",
            Some(8) => "right",
            _ => "none",
        }
    }

    /// The live mode with the saved mode's size and the closest refresh rate. Mode ids change
    /// when the set of connected outputs changes (reboot, new monitor), sizes don't.
    fn matching_live_mode<'a>(saved_output: &Value, live_output: &'a Value) -> Option<&'a Value>
    {
        let saved_mode = saved_output["modes"].as_array()?.iter().find(|mode| mode["id"] == saved_output["currentModeId"])?;
        let saved_rate = saved_mode["refreshRate"].as_f64().unwrap_or(0.0);
        live_output["modes"]
            .as_array()?
            .iter()
            .filter(|mode| mode["size"] == saved_mode["size"])
            .min_by(|first, second|
            {
                let first_distance = (first["refreshRate"].as_f64().unwrap_or(0.0) - saved_rate).abs();
                let second_distance = (second["refreshRate"].as_f64().unwrap_or(0.0) - saved_rate).abs();
                first_distance.total_cmp(&second_distance)
            })
    }
}

impl DisplayBackend for KdeDisplayBackend
{
    fn name(&self) -> &'static str
    {
        "kde"
    }

    fn read_layout(&self) -> Result<Value, String>
    {
        let output = Self::command(Self::READ_TIMEOUT_SECONDS, &[Self::PROGRAM.to_string(), "-j".to_string()])
            .output()
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("kscreen-doctor nicht startbar", "Cannot start kscreen-doctor"), error))?;
        if !output.status.success()
        {
            return Err(RequestLanguage::pick("kscreen-doctor antwortet nicht (KWin hängt?)", "kscreen-doctor doesn't answer (KWin stuck?)"));
        }
        serde_json::from_slice(&output.stdout)
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("kscreen-doctor-Ausgabe unlesbar", "Cannot read kscreen-doctor output"), error))
    }

    fn outputs(&self, layout: &Value) -> Vec<DisplayOutput>
    {
        let output_values = layout["outputs"].as_array().cloned().unwrap_or_default();
        // Primary = the enabled output with the lowest priority (disabled ones keep stale priorities).
        let primary_priority = output_values
            .iter()
            .filter(|output| output["enabled"] == true)
            .filter_map(|output| output["priority"].as_u64())
            .min();
        output_values
            .iter()
            .map(|output|
            {
                let enabled = output["enabled"] == true;
                DisplayOutput {
                    name: output["name"].as_str().unwrap_or_default().to_string(),
                    connected: output["connected"] == true,
                    enabled,
                    primary: enabled && primary_priority.is_some() && output["priority"].as_u64() == primary_priority,
                    current_mode_id: output["currentModeId"].as_str().unwrap_or_default().to_string(),
                    modes: output["modes"].as_array().map(|modes| modes.iter().map(Self::mode_of).collect()).unwrap_or_default(),
                }
            })
            .collect()
    }

    fn show_only_commands(&self, output: &DisplayOutput, mode: &DisplayMode, outputs: &[DisplayOutput]) -> Vec<Vec<String>>
    {
        let name = &output.name;
        let mut arguments = vec![
            format!("output.{}.enable", name),
            format!("output.{}.mode.{}", name, mode.id),
            format!("output.{}.position.0,0", name),
            format!("output.{}.priority.1", name),
        ];
        for other in outputs.iter().filter(|other| other.enabled && other.name != *name)
        {
            arguments.push(format!("output.{}.disable", other.name));
        }
        vec![Self::with_program(arguments)]
    }

    fn set_mode_commands(&self, output: &DisplayOutput, mode: &DisplayMode) -> Vec<Vec<String>>
    {
        vec![Self::with_program(vec![format!("output.{}.mode.{}", output.name, mode.id)])]
    }

    /// Per saved output: enable/disable, mode, scale, rotation, position. Outputs that are gone
    /// are skipped, outputs that are new get disabled (before the switch nothing else was on).
    /// Priority goes into a second call: together with enable/mode/position it doesn't reliably
    /// stick (lowest number = primary).
    fn restore_commands(&self, saved: &Value, live: &Value) -> Result<Vec<Vec<String>>, String>
    {
        let saved_outputs = saved["outputs"].as_array().cloned().unwrap_or_default();
        let live_outputs = live["outputs"].as_array().cloned().unwrap_or_default();
        let mut arguments = Vec::new();
        let mut priority_arguments = Vec::new();
        let mut enabled_count = 0;

        for saved_output in &saved_outputs
        {
            let name = saved_output["name"].as_str().unwrap_or_default();
            let Some(live_output) = live_outputs.iter().find(|output| output["name"] == name) else
            {
                continue;
            };
            if live_output["connected"] != true
            {
                continue;
            }
            if saved_output["enabled"] != true
            {
                arguments.push(format!("output.{}.disable", name));
                continue;
            }
            enabled_count += 1;
            arguments.push(format!("output.{}.enable", name));
            if let Some(live_mode) = Self::matching_live_mode(saved_output, live_output)
            {
                arguments.push(format!("output.{}.mode.{}", name, live_mode["id"].as_str().unwrap_or_default()));
            }
            arguments.push(format!("output.{}.scale.{}", name, saved_output["scale"]));
            arguments.push(format!("output.{}.rotation.{}", name, Self::rotation_name(&saved_output["rotation"])));
            arguments.push(format!("output.{}.position.{},{}", name, saved_output["pos"]["x"], saved_output["pos"]["y"]));
            priority_arguments.push(format!("output.{}.priority.{}", name, saved_output["priority"]));
        }
        for live_output in &live_outputs
        {
            let is_new = !saved_outputs.iter().any(|saved_output| saved_output["name"] == live_output["name"]);
            if live_output["enabled"] == true && is_new
            {
                arguments.push(format!("output.{}.disable", live_output["name"].as_str().unwrap_or_default()));
            }
        }

        if enabled_count == 0
        {
            return Err("saved layout has no monitor that is still connected, refusing an all-off state".into());
        }
        Ok(vec![Self::with_program(arguments), Self::with_program(priority_arguments)])
    }

    fn run(&self, command: &[String]) -> Result<(), String>
    {
        let output = Self::command(Self::SWITCH_TIMEOUT_SECONDS, command).output().map_err(|error| error.to_string())?;
        if output.status.success()
        {
            Ok(())
        }
        else
        {
            Err(format!("{} failed: {}", command.join(" "), String::from_utf8_lossy(&output.stderr).trim()))
        }
    }
}

#[cfg(test)]
mod tests
{
    use super::*;
    use serde_json::json;

    fn layout() -> Value
    {
        json!({ "outputs": [
            { "name": "HDMI-A-1", "enabled": true, "connected": true, "priority": 2, "currentModeId": "1", "scale": 1, "rotation": 2,
              "pos": { "x": 0, "y": 0 }, "modes": [{ "id": "1", "size": { "width": 1920, "height": 1200 }, "refreshRate": 59.999 }] },
            { "name": "DP-3", "enabled": false, "connected": true, "priority": 1, "currentModeId": "11", "scale": 1, "rotation": 1,
              "pos": { "x": 0, "y": 0 }, "modes": [{ "id": "12", "size": { "width": 1280, "height": 800 }, "refreshRate": 90.0 }] },
            { "name": "DP-2", "enabled": true, "connected": true, "priority": 1, "currentModeId": "17", "scale": 1.25, "rotation": 1,
              "pos": { "x": 1200, "y": 0 }, "modes": [{ "id": "17", "size": { "width": 3440, "height": 1440 }, "refreshRate": 165.0 }] }
        ] })
    }

    #[test]
    fn reads_outputs_and_the_primary_one()
    {
        let outputs = KdeDisplayBackend.outputs(&layout());
        assert_eq!(outputs.len(), 3);
        // DP-3 has priority 1 too, but it is off.
        assert_eq!(outputs.iter().filter(|output| output.primary).map(|output| output.name.as_str()).collect::<Vec<_>>(), vec!["DP-2"]);
        assert_eq!(outputs[1].modes[0].text(), "1280x800@90");
    }

    #[test]
    fn shows_only_the_stream_output()
    {
        let outputs = KdeDisplayBackend.outputs(&layout());
        let commands = KdeDisplayBackend.show_only_commands(&outputs[1], &outputs[1].modes[0], &outputs);
        assert_eq!(commands[0].join(" "), "kscreen-doctor output.DP-3.enable output.DP-3.mode.12 output.DP-3.position.0,0 output.DP-3.priority.1 output.HDMI-A-1.disable output.DP-2.disable");
        let mode_only = KdeDisplayBackend.set_mode_commands(&outputs[2], &outputs[2].modes[0]);
        assert_eq!(mode_only[0].join(" "), "kscreen-doctor output.DP-2.mode.17");
    }

    #[test]
    fn restores_the_saved_layout_with_new_mode_ids()
    {
        let saved = layout();
        let mut live = layout();
        // After a reboot: other mode ids, the virtual monitor on alone, a new monitor plugged in.
        live["outputs"][2]["modes"][0]["id"] = json!("23");
        live["outputs"][2]["modes"].as_array_mut().unwrap().push(json!({ "id": "24", "size": { "width": 3440, "height": 1440 }, "refreshRate": 60.0 }));
        live["outputs"][1]["enabled"] = json!(true);
        live["outputs"][0]["enabled"] = json!(false);
        live["outputs"].as_array_mut().unwrap().push(json!({ "name": "HDMI-A-2", "enabled": true, "connected": true, "modes": [] }));

        let commands = KdeDisplayBackend.restore_commands(&saved, &live).unwrap();
        assert_eq!(commands[0].join(" "), "kscreen-doctor \
            output.HDMI-A-1.enable output.HDMI-A-1.mode.1 output.HDMI-A-1.scale.1 output.HDMI-A-1.rotation.left output.HDMI-A-1.position.0,0 \
            output.DP-3.disable \
            output.DP-2.enable output.DP-2.mode.23 output.DP-2.scale.1.25 output.DP-2.rotation.none output.DP-2.position.1200,0 \
            output.HDMI-A-2.disable");
        assert_eq!(commands[1].join(" "), "kscreen-doctor output.HDMI-A-1.priority.2 output.DP-2.priority.1");
    }

    #[test]
    fn refuses_to_turn_everything_off()
    {
        let saved = layout();
        let mut live = layout();
        live["outputs"][0]["connected"] = json!(false);
        live["outputs"][2]["connected"] = json!(false);
        assert!(KdeDisplayBackend.restore_commands(&saved, &live).is_err());
    }
}
