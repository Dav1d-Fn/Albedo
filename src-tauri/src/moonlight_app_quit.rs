use std::process::Command;

use crate::host_environment::HostEnvironment;

/// Ends the app that is still running on the host: `moonlight quit <host>`.
/// Moonlight's quit combo only disconnects; Sunshine keeps the game running for a reconnect.
pub struct MoonlightAppQuit;

impl MoonlightAppQuit
{
    /// Blocking; run it off the main thread.
    pub fn quit(moonlight_command: &[String], host: &str) -> Result<(), String>
    {
        // Matches the stream dry run: nothing was started on the host, so nothing to end.
        if std::env::var_os("STREAMING_LAUNCHER_DRY_RUN").is_some()
        {
            println!("[quit] dry run, moonlight quit {} not run", host);
            return Ok(());
        }

        let (program, base_arguments) = moonlight_command.split_first().ok_or("Moonlight-Befehl ist leer")?;

        let mut command = Command::new(program);
        HostEnvironment::apply_to(&mut command);
        let output = command
            .args(base_arguments)
            .args(["quit", host])
            .output()
            .map_err(|error| format!("Moonlight nicht gefunden ({}): {}", program, error))?;

        if output.status.success()
        {
            return Ok(());
        }
        let error_text = String::from_utf8_lossy(&output.stderr);
        let last_line = error_text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("").trim();
        Err(format!("Beenden fehlgeschlagen (Code {:?}) {}", output.status.code(), last_line))
    }
}
