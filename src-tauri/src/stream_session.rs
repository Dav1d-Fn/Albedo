use crate::ui_language::UiLanguage;
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::host_environment::HostEnvironment;
use crate::moonlight_command::MoonlightCommand;

/// Payload of the "stream-ended" event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamEndedEvent
{
    exit_code: Option<i32>,
    error_tail: String,
    /// Lines of Moonlight's "Global video stats" summary (English, as Moonlight logs them), empty when none was logged.
    video_stats: Vec<String>,
}

/// Runs Moonlight as a child process and reports back when it exits.
///
/// Moonlight can hang (no answer from the PC, an error dialog nobody sees, a dead connection
/// after the Deck slept), and the launcher only comes back on "stream-ended". So the running
/// process is remembered and `stop` can end it; the wait thread then sends the event as usual.
#[derive(Default)]
pub struct StreamSession
{
    /// Process group id of the running Moonlight, None when nothing runs.
    running_group: Arc<Mutex<Option<u32>>>,
}

impl StreamSession
{
    /// Time Moonlight gets to quit on SIGTERM before it is killed.
    const TERMINATE_GRACE: Duration = Duration::from_secs(3);

    /// Spawns Moonlight. Returns the command line on success; the "stream-ended" event follows later.
    pub fn start(&self, app_handle: AppHandle, moonlight_command: MoonlightCommand) -> Result<String, String>
    {
        let mut running_group = self.running_group.lock().map_err(|error| error.to_string())?;
        if running_group.is_some()
        {
            return Err(UiLanguage::pick("Es läuft schon ein Stream", "A stream is already running"));
        }

        let mut arguments = moonlight_command.to_arguments();
        let command_line = moonlight_command.to_display_string();
        println!("[stream] {}", command_line);

        if let Some(dry_run_arguments) = Self::dry_run_arguments()
        {
            println!("[stream] dry run, Moonlight not started: {:?}", dry_run_arguments);
            arguments = dry_run_arguments;
        }

        let (program, program_arguments) = arguments.split_first().ok_or_else(|| UiLanguage::pick("Moonlight-Befehl ist leer", "Moonlight command is empty"))?;

        let mut command = Command::new(program);
        HostEnvironment::apply_to(&mut command);
        // Own process group: `flatpak run` starts Moonlight as a grandchild, a group signal reaches both.
        command.process_group(0);
        let child = command
            .args(program_arguments)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("{} ({}): {}", UiLanguage::pick("Moonlight ließ sich nicht starten", "Moonlight could not be started"), error, command_line))?;
        *running_group = Some(child.id());

        let running_group_for_thread = Arc::clone(&self.running_group);
        thread::spawn(move ||
        {
            let event = match child.wait_with_output()
            {
                Ok(output) =>
                {
                    let error_text = String::from_utf8_lossy(&output.stderr);
                    StreamEndedEvent
                    {
                        exit_code: output.status.code(),
                        error_tail: Self::last_characters(&error_text, 600),
                        video_stats: Self::video_stats_summary(&error_text),
                    }
                }
                Err(error) => StreamEndedEvent { exit_code: None, error_tail: error.to_string(), video_stats: Vec::new() },
            };
            if let Ok(mut running_group) = running_group_for_thread.lock()
            {
                *running_group = None;
            }
            println!("[stream] ended, exit code {:?}", event.exit_code);
            let _ = app_handle.emit("stream-ended", event);
        });

        Ok(command_line)
    }

    /// Ends a hanging Moonlight: SIGTERM to its process group, SIGKILL if it is still there after a grace time.
    /// Returns false when no stream was running. "stream-ended" follows from the wait thread.
    pub fn stop(&self) -> bool
    {
        let Some(group_id) = self.current_group()
        else
        {
            return false;
        };
        println!("[stream] stopping process group {}", group_id);
        Self::signal_group(group_id, "TERM");

        let running_group = Arc::clone(&self.running_group);
        thread::spawn(move ||
        {
            thread::sleep(Self::TERMINATE_GRACE);
            let still_running = running_group.lock().map(|group| *group == Some(group_id)).unwrap_or(false);
            if still_running
            {
                println!("[stream] still running, killing process group {}", group_id);
                Self::signal_group(group_id, "KILL");
            }
        });
        true
    }

    fn current_group(&self) -> Option<u32>
    {
        self.running_group.lock().ok().and_then(|group| *group)
    }

    fn signal_group(group_id: u32, signal_name: &str)
    {
        // A negative pid addresses the whole process group.
        let result = Command::new("kill")
            .arg(format!("-{}", signal_name))
            .arg("--")
            .arg(format!("-{}", group_id))
            .status();
        if let Err(error) = result
        {
            eprintln!("[stream] kill -{} failed: {}", signal_name, error);
        }
    }

    /// `ALBEDO_DRY_RUN=1` runs a 2 s sleep instead of Moonlight (testing on the host PC),
    /// `=hang` one that never ends, like a Moonlight waiting for a PC that does not answer.
    fn dry_run_arguments() -> Option<Vec<String>>
    {
        let dry_run = std::env::var("ALBEDO_DRY_RUN").ok()?;
        let seconds = if dry_run == "hang"
        {
            "86400"
        }
        else
        {
            "2"
        };
        Some(vec!["sleep".into(), seconds.into()])
    }

    /// Moonlight logs its stream statistics to stderr when the video decoder closes:
    /// "Global video stats", a dashed line, then one "Label: value" line each, until the next log line.
    /// Returns the stat lines of the last such block.
    fn video_stats_summary(log_text: &str) -> Vec<String>
    {
        let Some(title_position) = log_text.rfind("Global video stats")
        else
        {
            return Vec::new();
        };

        let mut stat_lines = Vec::new();
        for line in log_text[title_position..].lines().skip(1)
        {
            let line = line.trim();
            if line.starts_with("---")
            {
                continue;
            }
            if line.is_empty() || Self::is_log_line_start(line)
            {
                break;
            }
            stat_lines.push(line.to_string());
        }
        stat_lines
    }

    /// Moonlight's log lines start with a timestamp, e.g. "00:01:23 - SDL Info (0): …".
    fn is_log_line_start(line: &str) -> bool
    {
        let bytes = line.as_bytes();
        bytes.len() > 10 && bytes[0].is_ascii_digit() && bytes[2] == b':' && line[8..].starts_with(" - ")
    }

    fn last_characters(text: &str, count: usize) -> String
    {
        let characters: Vec<char> = text.trim().chars().collect();
        let start = characters.len().saturating_sub(count);
        characters[start..].iter().collect()
    }
}

#[cfg(test)]
mod tests
{
    use std::os::unix::process::{CommandExt, ExitStatusExt};
    use std::process::Command;

    use super::StreamSession;

    #[test]
    fn reads_the_last_video_stats_block_from_the_log()
    {
        let log_text = "00:00:01 - SDL Info (0): Connecting\n\
                        00:05:00 - SDL Info (0): \n\
                        Global video stats\n\
                        ------------------\n\
                        Video stream: 1280x800 90.00 FPS (Codec: HEVC Main)\n\
                        Frames dropped by your network connection: 0.12%\n\
                        Average decoding time: 2.10 ms\n\
                        \n\
                        00:05:01 - SDL Info (0): Quit\n";

        assert_eq!(
            StreamSession::video_stats_summary(log_text),
            vec![
                "Video stream: 1280x800 90.00 FPS (Codec: HEVC Main)",
                "Frames dropped by your network connection: 0.12%",
                "Average decoding time: 2.10 ms",
            ]
        );
        assert!(StreamSession::video_stats_summary("no stats here").is_empty());
    }

    /// A hanging Moonlight with a child process (like `flatpak run`): the group signal ends both.
    #[test]
    fn group_signal_ends_a_hanging_process_and_its_child()
    {
        let mut hanging = Command::new("sh")
            .args(["-c", "sleep 600 & wait"])
            .process_group(0)
            .spawn()
            .expect("sh starts");

        StreamSession::signal_group(hanging.id(), "TERM");

        let status = hanging.wait().expect("sh ends");
        assert_eq!(status.signal(), Some(15));
    }
}
