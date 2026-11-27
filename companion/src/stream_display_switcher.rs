use std::io::Write;

use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use crate::companion_config::home_directory;
use crate::display_backend::DisplayBackend;
use crate::display_mode_chooser::DisplayModeChooser;
use crate::display_setup::DisplaySetup;
use crate::display_step::DisplayStep;
use crate::display_target::DisplayTarget;
use crate::host_environment::HostEnvironment;
use crate::stream_display_request::StreamDisplayRequest;

/// Sunshine's prep command for the stream's monitor (`albedo-companion display`, called by
/// `~/.local/bin/sunshine-match-client`, which every Sunshine app Albedo created runs):
///   display              before the stream: saves the layout, switches the profile's target
///                        to the client's resolution/FPS (SUNSHINE_CLIENT_WIDTH/HEIGHT/FPS)
///   display --restore    after the stream: puts the saved layout back
///   --dry-run            only prints what would be done, changes nothing
pub struct StreamDisplaySwitcher
{
    backend: Box<dyn DisplayBackend>,
    dry_run: bool,
}

impl StreamDisplaySwitcher
{
    const STATE_DIRECTORY: &'static str = ".local/state";
    /// Same names as the shell script before, so a layout saved by it is still restored.
    const LOG_FILE: &'static str = "sunshine-match-client.log";
    const SAVED_LAYOUT_FILE: &'static str = "sunshine-match-client-layout.json";
    /// How long a step may take until the desktop reports the expected state.
    const STEP_WAIT: Duration = Duration::from_secs(10);
    const POLL_INTERVAL: Duration = Duration::from_millis(500);

    /// Runs the command line after `display`; the process exit code.
    pub fn run_command_line(arguments: &[String]) -> i32
    {
        let mut restore = false;
        let mut dry_run = false;
        for argument in arguments
        {
            match argument.as_str()
            {
                "--restore" => restore = true,
                "--dry-run" => dry_run = true,
                _ =>
                {
                    eprintln!("Unknown option: {}", argument);
                    return 2;
                }
            }
        }
        let backend = match <dyn DisplayBackend>::for_this_desktop()
        {
            Ok(backend) => backend,
            Err(message) =>
            {
                Self::log(&format!("{}, nothing changed", message));
                return 1;
            }
        };
        let switcher = StreamDisplaySwitcher { backend, dry_run };
        let result = if restore { switcher.restore() } else { switcher.switch() };
        match result
        {
            Ok(()) => 0,
            Err(message) =>
            {
                Self::log(&message);
                1
            }
        }
    }

    /// For the display test of Albedo Companion: the same switch and restore as a stream.
    pub fn new(backend: Box<dyn DisplayBackend>, dry_run: bool) -> StreamDisplaySwitcher
    {
        StreamDisplaySwitcher { backend, dry_run }
    }

    fn switch(&self) -> Result<(), String>
    {
        let width = Self::client_number("SUNSHINE_CLIENT_WIDTH", 1920);
        let height = Self::client_number("SUNSHINE_CLIENT_HEIGHT", 1080);
        let fps = Self::client_number("SUNSHINE_CLIENT_FPS", 60);
        let wanted_target = StreamDisplayRequest::take(self.dry_run);
        let setup = DisplaySetup::load();
        let target = setup.resolve(wanted_target);
        Self::log(&format!(
            "client {} wants {}x{}@{} (hdr={}), display target {} -> {}",
            std::env::var("SUNSHINE_CLIENT_NAME").unwrap_or_else(|_| "?".into()),
            width,
            height,
            fps,
            std::env::var("SUNSHINE_CLIENT_HDR").unwrap_or_else(|_| "?".into()),
            wanted_target.name(),
            target.name()
        ));
        self.switch_to(&setup, target, width, height, fps).map(|_| ())
    }

    /// Switches a resolved target to the mode closest to width×height@fps. Ok(Some("DP-3 1280x800@60"))
    /// when it switched, Ok(None) when nothing needed to (or should) change, Err after a rollback.
    pub fn switch_to(&self, setup: &DisplaySetup, target: DisplayTarget, width: u32, height: u32, fps: u32) -> Result<Option<String>, String>
    {
        if target == DisplayTarget::None
        {
            Self::log("nothing to switch");
            return Ok(None);
        }

        let layout = self.backend.read_layout().map_err(|message| format!("{}, nothing changed", message))?;
        let outputs = self.backend.outputs(&layout);
        let output_name = setup.output_name(target, &outputs).ok_or("no main monitor found, nothing changed")?;
        let output = outputs
            .iter()
            .find(|output| output.name == output_name && output.connected)
            .ok_or_else(|| format!("{} is not connected, nothing changed", output_name))?;
        let mode = DisplayModeChooser::choose(&output.modes, width, height, fps).ok_or_else(|| format!("{} has no modes, nothing changed", output_name))?;
        if target == DisplayTarget::MainMonitor && !DisplayModeChooser::keeps_picture_shape(mode, width, height)
        {
            // An ultrawide or HDR monitor dropped to a small mode of another shape looks worse
            // than its native mode scaled by Sunshine, and the mode change itself is the risk.
            Self::log(&format!("{}: no mode with the shape of {}x{} (closest {}), keeping its mode", output_name, width, height, mode.text()));
            return Ok(None);
        }
        Self::log(&format!("{}: chosen mode {} (id {})", output_name, mode.text(), mode.id));

        // A layout that already is the streaming layout means a stream ended without its undo:
        // the saved file still holds the real layout then.
        let enabled_count = outputs.iter().filter(|output| output.enabled).count();
        let already_switched = output.enabled && output.current_mode_id == mode.id && (!target.is_exclusive() || enabled_count == 1);
        let saved_layout_file = Self::state_file(Self::SAVED_LAYOUT_FILE);
        if already_switched && saved_layout_file.exists()
        {
            Self::log("already in streaming layout, keeping the saved layout");
            return Ok(None);
        }
        if self.dry_run
        {
            println!("would save the current layout to {}", saved_layout_file.display());
        }
        else
        {
            std::fs::write(&saved_layout_file, layout.to_string()).map_err(|error| format!("cannot save the layout: {}", error))?;
        }

        let steps = if target.is_exclusive()
        {
            self.backend.show_only_steps(output, mode, &outputs)
        }
        else
        {
            self.backend.set_mode_steps(output, mode)
        };
        self.run_extras(&self.backend.before_switch_commands());
        if let Err(message) = self.run_steps(&steps)
        {
            Self::log(&format!("{}, rolling back", message));
            self.roll_back(&layout);
            return Err("switch failed, layout rolled back".into());
        }
        Self::log("done");
        Ok(Some(format!("{} {}", output_name, mode.text())))
    }

    /// After a failed step: back to the layout from before the switch. When the desktop doesn't
    /// answer any more, the saved layout itself stands in for the live one (ids are unchanged).
    fn roll_back(&self, saved_layout: &Value)
    {
        let live_layout = self.backend.read_layout().unwrap_or_else(|_| saved_layout.clone());
        let result = self
            .backend
            .restore_steps(saved_layout, &live_layout)
            .and_then(|steps| self.run_steps(&steps));
        match result
        {
            Ok(()) =>
            {
                if !self.dry_run
                {
                    let _ = std::fs::remove_file(Self::state_file(Self::SAVED_LAYOUT_FILE));
                }
                Self::log("rollback done");
            }
            Err(message) => Self::log(&format!("rollback failed: {} (sunshine-match-client --restore tries again)", message)),
        }
        self.run_extras(&self.backend.after_restore_commands());
    }

    /// A layout saved before a switch that wasn't put back yet: a stream (or a test) is on.
    pub fn has_saved_layout() -> bool
    {
        Self::state_file(Self::SAVED_LAYOUT_FILE).exists()
    }

    pub fn restore(&self) -> Result<(), String>
    {
        let saved_layout_file = Self::state_file(Self::SAVED_LAYOUT_FILE);
        let Ok(saved_text) = std::fs::read_to_string(&saved_layout_file) else
        {
            Self::log("restore: no saved layout, nothing changed");
            return Ok(());
        };
        let saved_layout: Value = serde_json::from_str(&saved_text).map_err(|error| format!("restore: saved layout unreadable: {}", error))?;
        let live_layout = self.backend.read_layout().map_err(|message| format!("restore: {}, nothing changed", message))?;
        let steps = self.backend.restore_steps(&saved_layout, &live_layout).map_err(|message| format!("restore: {}", message))?;
        let result = self.run_steps(&steps);
        self.run_extras(&self.backend.after_restore_commands());
        result.map_err(|message| format!("restore: {}", message))?;
        if !self.dry_run
        {
            let _ = std::fs::remove_file(&saved_layout_file);
        }
        Self::log("restore done");
        Ok(())
    }

    /// Runs the steps one by one; after each it waits until the desktop reports the expected
    /// state (which also proves it still answers). Err at the first step that fails or times out.
    fn run_steps(&self, steps: &[DisplayStep]) -> Result<(), String>
    {
        for step in steps
        {
            if self.dry_run
            {
                println!("{}", step.text());
                continue;
            }
            Self::log(&format!("run: {}", step.text()));
            self.backend.run(&step.command)?;
            self.wait_for(step)?;
        }
        Ok(())
    }

    fn wait_for(&self, step: &DisplayStep) -> Result<(), String>
    {
        let started = Instant::now();
        loop
        {
            let layout = self.backend.read_layout()?;
            let outputs = self.backend.outputs(&layout);
            let reached = step.expected.iter().all(|(name, enabled, mode_id)|
            {
                outputs.iter().any(|output|
                {
                    output.name == *name
                        && output.enabled == *enabled
                        && mode_id.as_ref().map(|mode_id| output.current_mode_id == *mode_id).unwrap_or(true)
                })
            });
            if reached
            {
                return Ok(());
            }
            if started.elapsed() > Self::STEP_WAIT
            {
                return Err(format!("{} didn't take effect within {} s", step.text(), Self::STEP_WAIT.as_secs()));
            }
            std::thread::sleep(Self::POLL_INTERVAL);
        }
    }

    /// Helpers around the switch (pausing programs); a failure is only logged.
    fn run_extras(&self, commands: &[Vec<String>])
    {
        for command in commands
        {
            if self.dry_run
            {
                println!("{}", command.join(" "));
                continue;
            }
            Self::log(&format!("run: {}", command.join(" ")));
            let mut process = std::process::Command::new(&command[0]);
            process.args(&command[1..]);
            HostEnvironment::apply_to(&mut process);
            if let Err(error) = process.status()
            {
                Self::log(&format!("{} failed: {}", command.join(" "), error));
            }
        }
    }

    fn client_number(variable: &str, fallback: u32) -> u32
    {
        std::env::var(variable).ok().and_then(|value| value.trim().parse().ok()).unwrap_or(fallback)
    }

    fn state_file(file_name: &str) -> PathBuf
    {
        let state_directory = home_directory().join(Self::STATE_DIRECTORY);
        let _ = std::fs::create_dir_all(&state_directory);
        state_directory.join(file_name)
    }

    /// To stdout (Sunshine's log) and to ~/.local/state/sunshine-match-client.log.
    fn log(message: &str)
    {
        let line = format!("{} {}", Self::timestamp(), message);
        println!("{}", line);
        if let Ok(mut log_file) = std::fs::OpenOptions::new().create(true).append(true).open(Self::state_file(Self::LOG_FILE))
        {
            let _ = writeln!(log_file, "{}", line);
        }
    }

    /// Local time from `date`, like the shell script's log; no time crate for one log line.
    fn timestamp() -> String
    {
        std::process::Command::new("date")
            .arg("+%F %T")
            .output()
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_default()
    }
}
