use crate::ui_language::UiLanguage;

use crate::host_environment::HostEnvironment;

/// Pairs Moonlight with a host: `moonlight pair <host> --pin <pin>`.
/// The user types the same PIN into Sunshine's web UI (PIN page); the call
/// returns once Sunshine accepted it or Moonlight gave up.
pub struct MoonlightPairing;

impl MoonlightPairing
{
    /// Blocking; run it off the main thread.
    pub fn pair(moonlight_command: &[String], host: &str, pin: &str) -> Result<(), String>
    {
        if pin.len() != 4 || !pin.chars().all(|character| character.is_ascii_digit())
        {
            return Err("PIN muss vierstellig sein".into());
        }
        let (program, base_arguments) = moonlight_command.split_first().ok_or_else(|| UiLanguage::pick("Moonlight-Befehl ist leer", "Moonlight command is empty"))?;

        let mut command = HostEnvironment::command(program);
        let output = command
            .args(base_arguments)
            .args(["pair", host, "--pin", pin])
            .output()
            .map_err(|error| format!("{} ({}): {}", UiLanguage::pick("Moonlight nicht gefunden", "Moonlight not found"), program, error))?;

        if output.status.success()
        {
            return Ok(());
        }
        let error_text = String::from_utf8_lossy(&output.stderr);
        let last_line = error_text.lines().rev().find(|line| !line.trim().is_empty()).unwrap_or("").trim();
        Err(format!("{} {:?} {}", UiLanguage::pick("Koppeln fehlgeschlagen, Code", "Pairing failed, code"), output.status.code(), last_line))
    }
}
