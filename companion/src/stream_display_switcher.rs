use std::io::Write;
use std::path::PathBuf;

use crate::companion_config::home_directory;
use crate::display_backend::DisplayBackend;
use crate::display_mode_chooser::DisplayModeChooser;
use crate::display_setup::DisplaySetup;
use crate::display_target::DisplayTarget;
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
        if target == DisplayTarget::None
        {
            Self::log("nothing to switch");
            return Ok(());
        }

        let layout = self.backend.read_layout().map_err(|message| format!("{}, nothing changed", message))?;
        let outputs = self.backend.outputs(&layout);
        let output_name = setup.output_name(target, &outputs).ok_or("no main monitor found, nothing changed")?;
        let output = outputs
            .iter()
            .find(|output| output.name == output_name && output.connected)
            .ok_or_else(|| format!("{} is not connected, nothing changed", output_name))?;
        let mode = DisplayModeChooser::choose(&output.modes, width, height, fps).ok_or_else(|| format!("{} has no modes, nothing changed", output_name))?;
        Self::log(&format!("{}: chosen mode {} (id {})", output_name, mode.text(), mode.id));

        // A layout that already is the streaming layout means a stream ended without its undo:
        // the saved file still holds the real layout then.
        let enabled_count = outputs.iter().filter(|output| output.enabled).count();
        let already_switched = output.enabled && output.current_mode_id == mode.id && (!target.is_exclusive() || enabled_count == 1);
        let saved_layout_file = Self::state_file(Self::SAVED_LAYOUT_FILE);
        if already_switched && saved_layout_file.exists()
        {
            Self::log("already in streaming layout, keeping the saved layout");
        }
        else if self.dry_run
        {
            println!("would save the current layout to {}", saved_layout_file.display());
        }
        else
        {
            std::fs::write(&saved_layout_file, layout.to_string()).map_err(|error| format!("cannot save the layout: {}", error))?;
        }

        let commands = if target.is_exclusive()
        {
            self.backend.show_only_commands(output, mode, &outputs)
        }
        else
        {
            self.backend.set_mode_commands(output, mode)
        };
        self.run_all(&commands)?;
        Self::log("done");
        Ok(())
    }

    fn restore(&self) -> Result<(), String>
    {
        let saved_layout_file = Self::state_file(Self::SAVED_LAYOUT_FILE);
        let Ok(saved_text) = std::fs::read_to_string(&saved_layout_file) else
        {
            Self::log("restore: no saved layout, nothing changed");
            return Ok(());
        };
        let saved_layout = serde_json::from_str(&saved_text).map_err(|error| format!("restore: saved layout unreadable: {}", error))?;
        let live_layout = self.backend.read_layout().map_err(|message| format!("restore: {}, nothing changed", message))?;
        let commands = self.backend.restore_commands(&saved_layout, &live_layout).map_err(|message| format!("restore: {}", message))?;
        self.run_all(&commands)?;
        if !self.dry_run
        {
            let _ = std::fs::remove_file(&saved_layout_file);
        }
        Self::log("restore done");
        Ok(())
    }

    fn run_all(&self, commands: &[Vec<String>]) -> Result<(), String>
    {
        for command in commands
        {
            if self.dry_run
            {
                println!("{}", command.join(" "));
                continue;
            }
            Self::log(&format!("run: {}", command.join(" ")));
            self.backend.run(command)?;
        }
        Ok(())
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
