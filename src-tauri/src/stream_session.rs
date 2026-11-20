use std::process::{Command, Stdio};
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::moonlight_command::MoonlightCommand;

/// Payload of the "stream-ended" event.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamEndedEvent
{
    exit_code: Option<i32>,
    error_tail: String,
}

/// Runs Moonlight as a child process and reports back when it exits.
pub struct StreamSession;

impl StreamSession
{
    /// Spawns Moonlight. Returns the command line on success; the "stream-ended" event follows later.
    pub fn start(app_handle: AppHandle, moonlight_command: MoonlightCommand) -> Result<String, String>
    {
        let mut arguments = moonlight_command.to_arguments();
        let command_line = moonlight_command.to_display_string();
        println!("[stream] {}", command_line);

        // Test on the host PC without streaming to itself: run a short sleep instead of Moonlight.
        if std::env::var_os("STREAMING_LAUNCHER_DRY_RUN").is_some()
        {
            println!("[stream] dry run, Moonlight not started");
            arguments = vec!["sleep".into(), "2".into()];
        }

        let (program, program_arguments) = arguments.split_first().ok_or("Moonlight-Befehl ist leer")?;

        let child = Command::new(program)
            .args(program_arguments)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Moonlight ließ sich nicht starten ({}): {}", error, command_line))?;

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
                    }
                }
                Err(error) => StreamEndedEvent { exit_code: None, error_tail: error.to_string() },
            };
            let _ = app_handle.emit("stream-ended", event);
        });

        Ok(command_line)
    }

    fn last_characters(text: &str, count: usize) -> String
    {
        let characters: Vec<char> = text.trim().chars().collect();
        let start = characters.len().saturating_sub(count);
        characters[start..].iter().collect()
    }
}
