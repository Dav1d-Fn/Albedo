use std::process::Command;

use serde_json::Value;

use crate::display_backend::DisplayBackend;
use crate::display_mode::DisplayMode;
use crate::display_output::DisplayOutput;
use crate::display_step::DisplayStep;
use crate::host_environment::HostEnvironment;
use crate::request_language::RequestLanguage;

/// KDE Plasma on Wayland: reads the layout with `kscreen-doctor -j`, switches with
/// `kscreen-doctor output.<name>.<setting>…`.
pub struct KdeDisplayBackend;

impl KdeDisplayBackend
{
    /// KWin sometimes hangs on monitor changes, kscreen-doctor then never answers. Short limits,
    /// so a hanging KWin is noticed and the layout rolled back instead of waiting a minute.
    const READ_TIMEOUT_SECONDS: &'static str = "10";
    const SWITCH_TIMEOUT_SECONDS: &'static str = "15";
    const PROGRAM: &'static str = "kscreen-doctor";
    /// Holds a screen cast open; with it running, KWin and Xwayland can deadlock while monitors
    /// change (seen 2026-11-21 and 2026-11-27). Sunshine's global_prep_cmd from pc-setup stops it
    /// during streams, the switcher does it too so a switch outside Sunshine is just as safe.
    const VIDEO_BRIDGE_UNIT: &'static str = "app-org.kde.xwaylandvideobridge@autostart.service";

    /// kscreen-doctor wrapped in `timeout`, with the Wayland environment Sunshine's service and
    /// the companion's user service may lack, and without the AppImage's libraries.
    fn command(timeout_seconds: &str, arguments: &[String]) -> Command
    {
        let mut command = HostEnvironment::command("timeout");
        command.arg(timeout_seconds).args(arguments);
        let runtime_directory = std::env::var("XDG_RUNTIME_DIR").unwrap_or_else(|_| format!("/run/user/{}", Self::user_id()));
        command
            .env("XDG_RUNTIME_DIR", runtime_directory)
            .env("WAYLAND_DISPLAY", std::env::var("WAYLAND_DISPLAY").unwrap_or_else(|_| "wayland-1".into()))
            .env("QT_QPA_PLATFORM", "wayland");
        command
    }

    fn user_id() -> String
    {
        HostEnvironment::command("id")
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

    fn step(arguments: Vec<String>, expected: Vec<(String, bool, Option<String>)>) -> DisplayStep
    {
        DisplayStep { command: Self::with_program(arguments), expected }
    }

    /// An x position right of every enabled output in these layouts: an output turned on there
    /// overlaps nothing while the others are still on.
    fn free_x_position(layouts: &[&Value]) -> i64
    {
        layouts
            .iter()
            .flat_map(|layout| layout["outputs"].as_array().cloned().unwrap_or_default())
            .filter(|output| output["enabled"] == true)
            .map(|output| Self::right_edge(&output))
            .max()
            .unwrap_or(0)
    }

    /// x + the larger side of the current mode, so a rotated monitor is covered too.
    fn right_edge(output: &Value) -> i64
    {
        let current_mode = output["modes"].as_array().into_iter().flatten().find(|mode| mode["id"] == output["currentModeId"]);
        let mode_width = current_mode.and_then(|mode| mode["size"]["width"].as_i64()).unwrap_or(0);
        let mode_height = current_mode.and_then(|mode| mode["size"]["height"].as_i64()).unwrap_or(0);
        output["pos"]["x"].as_i64().unwrap_or(0) + mode_width.max(mode_height)
    }

    fn systemctl(arguments: &[&str]) -> bool
    {
        let mut command = HostEnvironment::command("systemctl");
        command.arg("--user").args(arguments);
        command.output().map(|output| output.status.success()).unwrap_or(false)
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
                    right_edge: Self::right_edge(output),
                    modes: output["modes"].as_array().map(|modes| modes.iter().map(Self::mode_of).collect()).unwrap_or_default(),
                }
            })
            .collect()
    }

    /// 1. the stream output on, right of the others (nothing overlaps, nothing goes dark yet),
    /// 2. the others off, the stream output to 0,0, 3. it becomes primary.
    fn show_only_steps(&self, output: &DisplayOutput, mode: &DisplayMode, outputs: &[DisplayOutput]) -> Vec<DisplayStep>
    {
        let name = &output.name;
        let others: Vec<&DisplayOutput> = outputs.iter().filter(|other| other.enabled && other.name != *name).collect();
        let mut steps = Vec::new();
        let free_x = outputs.iter().filter(|other| other.enabled).map(|other| other.right_edge).max().unwrap_or(0);
        steps.push(Self::step(
            vec![format!("output.{}.enable", name), format!("output.{}.mode.{}", name, mode.id), format!("output.{}.position.{},0", name, free_x)],
            vec![(name.clone(), true, Some(mode.id.clone()))],
        ));
        let mut off_arguments: Vec<String> = others.iter().map(|other| format!("output.{}.disable", other.name)).collect();
        off_arguments.push(format!("output.{}.position.0,0", name));
        let off_expected = others.iter().map(|other| (other.name.clone(), false, None)).collect();
        steps.push(Self::step(off_arguments, off_expected));
        steps.push(Self::step(vec![format!("output.{}.priority.1", name)], Vec::new()));
        steps
    }

    fn set_mode_steps(&self, output: &DisplayOutput, mode: &DisplayMode) -> Vec<DisplayStep>
    {
        vec![Self::step(vec![format!("output.{}.mode.{}", output.name, mode.id)], vec![(output.name.clone(), true, Some(mode.id.clone()))])]
    }

    /// 1. every saved monitor on with its mode, scale, rotation and position; outputs that go off
    /// later move out of their way first, 2. the stream output (and any new one) off,
    /// 3. priorities (together with the rest they don't reliably stick; lowest = primary).
    /// Outputs that are gone are skipped.
    fn restore_steps(&self, saved: &Value, live: &Value) -> Result<Vec<DisplayStep>, String>
    {
        let saved_outputs = saved["outputs"].as_array().cloned().unwrap_or_default();
        let live_outputs = live["outputs"].as_array().cloned().unwrap_or_default();
        let saved_enabled = |name: &str| saved_outputs.iter().any(|output| output["name"] == name && output["enabled"] == true);
        let free_x = Self::free_x_position(&[saved, live]);

        let mut on_arguments = Vec::new();
        let mut on_expected = Vec::new();
        let mut priority_arguments = Vec::new();
        for saved_output in saved_outputs.iter().filter(|output| output["enabled"] == true)
        {
            let name = saved_output["name"].as_str().unwrap_or_default();
            let Some(live_output) = live_outputs.iter().find(|output| output["name"] == name && output["connected"] == true) else
            {
                continue;
            };
            on_arguments.push(format!("output.{}.enable", name));
            let live_mode_id = Self::matching_live_mode(saved_output, live_output).and_then(|mode| mode["id"].as_str()).map(String::from);
            if let Some(mode_id) = &live_mode_id
            {
                on_arguments.push(format!("output.{}.mode.{}", name, mode_id));
            }
            on_arguments.push(format!("output.{}.scale.{}", name, saved_output["scale"]));
            on_arguments.push(format!("output.{}.rotation.{}", name, Self::rotation_name(&saved_output["rotation"])));
            on_arguments.push(format!("output.{}.position.{},{}", name, saved_output["pos"]["x"], saved_output["pos"]["y"]));
            on_expected.push((name.to_string(), true, live_mode_id));
            priority_arguments.push(format!("output.{}.priority.{}", name, saved_output["priority"]));
        }
        if on_expected.is_empty()
        {
            return Err("saved layout has no monitor that is still connected, refusing an all-off state".into());
        }

        let mut off_arguments = Vec::new();
        let mut off_expected = Vec::new();
        for live_output in live_outputs.iter().filter(|output| output["enabled"] == true && output["connected"] == true)
        {
            let name = live_output["name"].as_str().unwrap_or_default();
            if saved_enabled(name)
            {
                continue;
            }
            // Out of the way while the saved monitors come back, off in the next step.
            on_arguments.push(format!("output.{}.position.{},0", name, free_x));
            off_arguments.push(format!("output.{}.disable", name));
            off_expected.push((name.to_string(), false, None));
        }

        let mut steps = vec![Self::step(on_arguments, on_expected)];
        if !off_arguments.is_empty()
        {
            steps.push(Self::step(off_arguments, off_expected));
        }
        steps.push(Self::step(priority_arguments, Vec::new()));
        Ok(steps)
    }

    fn before_switch_commands(&self) -> Vec<Vec<String>>
    {
        if Self::systemctl(&["is-active", "--quiet", Self::VIDEO_BRIDGE_UNIT])
        {
            return vec![vec!["systemctl".into(), "--user".into(), "stop".into(), Self::VIDEO_BRIDGE_UNIT.into()]];
        }
        Vec::new()
    }

    /// Starts it again when the login's autostart has it (the unit exists) and it isn't running.
    fn after_restore_commands(&self) -> Vec<Vec<String>>
    {
        let unit_exists = Self::systemctl(&["cat", Self::VIDEO_BRIDGE_UNIT]);
        if unit_exists && !Self::systemctl(&["is-active", "--quiet", Self::VIDEO_BRIDGE_UNIT])
        {
            return vec![vec!["systemctl".into(), "--user".into(), "start".into(), "--no-block".into(), Self::VIDEO_BRIDGE_UNIT.into()]];
        }
        Vec::new()
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

    fn texts(steps: &[DisplayStep]) -> Vec<String>
    {
        steps.iter().map(|step| step.text()).collect()
    }

    #[test]
    fn turns_the_stream_output_on_before_the_others_off()
    {
        let outputs = KdeDisplayBackend.outputs(&layout());
        let steps = KdeDisplayBackend.show_only_steps(&outputs[1], &outputs[1].modes[0], &outputs);
        assert_eq!(texts(&steps), vec![
            // DP-2 ends at 1200 + 3440: the stream output starts right of it.
            "kscreen-doctor output.DP-3.enable output.DP-3.mode.12 output.DP-3.position.4640,0",
            "kscreen-doctor output.HDMI-A-1.disable output.DP-2.disable output.DP-3.position.0,0",
            "kscreen-doctor output.DP-3.priority.1",
        ]);
        assert_eq!(steps[0].expected, vec![("DP-3".to_string(), true, Some("12".to_string()))]);
        assert_eq!(steps[1].expected, vec![("HDMI-A-1".to_string(), false, None), ("DP-2".to_string(), false, None)]);

        let mode_only = KdeDisplayBackend.set_mode_steps(&outputs[2], &outputs[2].modes[0]);
        assert_eq!(texts(&mode_only), vec!["kscreen-doctor output.DP-2.mode.17"]);
    }

    #[test]
    fn restores_the_saved_monitors_before_turning_the_stream_output_off()
    {
        let saved = layout();
        let mut live = layout();
        // After a reboot: other mode ids, the virtual monitor on alone, a new monitor plugged in.
        live["outputs"][2]["modes"][0]["id"] = json!("23");
        live["outputs"][2]["modes"].as_array_mut().unwrap().push(json!({ "id": "24", "size": { "width": 3440, "height": 1440 }, "refreshRate": 60.0 }));
        live["outputs"][1]["enabled"] = json!(true);
        live["outputs"][0]["enabled"] = json!(false);
        live["outputs"][2]["enabled"] = json!(false);
        live["outputs"].as_array_mut().unwrap().push(json!({ "name": "HDMI-A-2", "enabled": true, "connected": true, "modes": [], "pos": { "x": 0, "y": 0 } }));

        let steps = KdeDisplayBackend.restore_steps(&saved, &live).unwrap();
        assert_eq!(texts(&steps), vec![
            "kscreen-doctor \
            output.HDMI-A-1.enable output.HDMI-A-1.mode.1 output.HDMI-A-1.scale.1 output.HDMI-A-1.rotation.left output.HDMI-A-1.position.0,0 \
            output.DP-2.enable output.DP-2.mode.23 output.DP-2.scale.1.25 output.DP-2.rotation.none output.DP-2.position.1200,0 \
            output.DP-3.position.4640,0 output.HDMI-A-2.position.4640,0",
            "kscreen-doctor output.DP-3.disable output.HDMI-A-2.disable",
            "kscreen-doctor output.HDMI-A-1.priority.2 output.DP-2.priority.1",
        ]);
        assert_eq!(steps[0].expected, vec![("HDMI-A-1".to_string(), true, Some("1".to_string())), ("DP-2".to_string(), true, Some("23".to_string()))]);
    }

    #[test]
    fn refuses_to_turn_everything_off()
    {
        let saved = layout();
        let mut live = layout();
        live["outputs"][0]["connected"] = json!(false);
        live["outputs"][2]["connected"] = json!(false);
        assert!(KdeDisplayBackend.restore_steps(&saved, &live).is_err());
    }
}
