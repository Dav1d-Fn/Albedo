use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};

use crate::companion_config::home_directory;
use crate::display_mode_reader::DisplayModeReader;
use crate::host_environment::HostEnvironment;
use crate::request_language::RequestLanguage;

/// Adds a mode to the virtual streaming monitor: builds a new EDID with
/// pc-setup/make-virtual-edid.py (built into the companion) that keeps every installed mode, and
/// installs it with a root prompt on the PC (pkexec; the password never passes the companion).
/// The prompt can take as long as the user likes, so that part runs on its own thread and the
/// Deck asks for the outcome with `status()`.
pub struct VirtualEdidWriter
{
    /// `{ "state": "idle" | "waiting" | "done" | "reboot" | "cancelled" | "failed" | "dryRun", "mode", "message" }`
    status: Arc<Mutex<Value>>,
}

impl VirtualEdidWriter
{
    const GENERATOR_SCRIPT: &'static str = include_str!("../../pc-setup/make-virtual-edid.py");
    /// Installed by pc-setup/install.sh --virtual-monitor, readable by everyone.
    const INSTALLED_EDID: &'static str = "/etc/virtual-display-edid.bin";
    /// Runs as root: puts the new EDID in place and lets the boot service apply it right away.
    const ROOT_SCRIPT: &'static str = "install -m 644 \"$1\" /etc/virtual-display-edid.bin && systemctl restart virtual-display-edid.service";
    /// The script leaves with this code when a mode can't go into an EDID.
    const IMPOSSIBLE_EXIT_CODE: i32 = 2;
    /// pkexec's code when the user closes the password dialog.
    const DIALOG_DISMISSED_EXIT_CODE: i32 = 126;

    pub fn new() -> VirtualEdidWriter
    {
        VirtualEdidWriter { status: Arc::new(Mutex::new(json!({ "state": "idle" }))) }
    }

    pub fn status(&self) -> Value
    {
        self.status.lock().expect("status lock").clone()
    }

    /// Builds the EDID now (so an impossible mode is answered right away) and starts the
    /// install. `Err((status code, message))` when nothing was started.
    pub fn add_mode(&self, width: u64, height: u64, refresh_rate: u64) -> Result<Value, (u16, String)>
    {
        let mode_text = format!("{}x{}@{}", width, height, refresh_rate);
        if self.status()["state"] == "waiting"
        {
            return Err((409, RequestLanguage::pick("Am PC wartet schon eine Bestätigung", "A confirmation is already waiting on the PC")));
        }
        let output_name = DisplayModeReader::virtual_output().map_err(|message| (409, message))?;
        let installed_edid = std::fs::read(Self::INSTALLED_EDID)
            .map_err(|_| (409, RequestLanguage::pick("Kein EDID installiert (pc-setup/install.sh --virtual-monitor)", "No EDID installed (pc-setup/install.sh --virtual-monitor)")))?;

        let new_edid_file = Self::build(&mode_text)?;
        let already_installed = std::fs::read(&new_edid_file).map(|new_edid| new_edid == installed_edid).unwrap_or(false);

        self.set_status(json!({ "state": "waiting", "mode": mode_text }));
        let status = self.status.clone();
        std::thread::spawn(move ||
        {
            let mut final_status = if already_installed
            {
                Self::check_applied(&output_name, width, height, refresh_rate)
            }
            else
            {
                match Self::install(&new_edid_file)
                {
                    Ok(true) => Self::check_applied(&output_name, width, height, refresh_rate),
                    Ok(false) => json!({ "state": "dryRun" }),
                    Err(failed_status) => failed_status,
                }
            };
            final_status["mode"] = json!(mode_text);
            *status.lock().expect("status lock") = final_status;
        });
        Ok(self.status())
    }

    fn set_status(&self, new_status: Value)
    {
        *self.status.lock().expect("status lock") = new_status;
    }

    /// Runs the generator with the installed modes plus the new one, returns the new EDID file.
    fn build(mode_text: &str) -> Result<PathBuf, (u16, String)>
    {
        let work_directory = home_directory().join(".cache/albedo-companion");
        std::fs::create_dir_all(&work_directory).map_err(|error| (500, error.to_string()))?;
        let new_edid_file = work_directory.join("virtual-display-edid.bin");

        let mut command = Command::new("python3");
        command
            .arg("-")
            .args(["--keep", Self::INSTALLED_EDID, "--mode", mode_text])
            .arg(&new_edid_file)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        HostEnvironment::apply_to(&mut command);
        let mut generator = command
            .spawn()
            .map_err(|error| (500, format!("{}: {}", RequestLanguage::pick("python3 nicht startbar", "Cannot start python3"), error)))?;
        generator
            .stdin
            .take()
            .expect("piped stdin")
            .write_all(Self::GENERATOR_SCRIPT.as_bytes())
            .map_err(|error| (500, error.to_string()))?;
        let result = generator.wait_with_output().map_err(|error| (500, error.to_string()))?;

        let reason = String::from_utf8_lossy(&result.stderr).trim().to_string();
        match result.status.code()
        {
            Some(0) => Ok(new_edid_file),
            Some(Self::IMPOSSIBLE_EXIT_CODE) => Err((400, format!("{} {}: {}", mode_text, RequestLanguage::pick("passt nicht in ein EDID", "can't go into an EDID"), reason))),
            _ => Err((500, format!("{}: {}", RequestLanguage::pick("EDID-Bau fehlgeschlagen", "Building the EDID failed"), reason))),
        }
    }

    /// Asks for root on the PC and installs the EDID. `Ok(false)` in a dry run (nothing installed).
    fn install(new_edid_file: &PathBuf) -> Result<bool, Value>
    {
        let mut command = Command::new("pkexec");
        command.args(["sh", "-c", Self::ROOT_SCRIPT, "sh"]).arg(new_edid_file);
        if std::env::var("ALBEDO_DRY_RUN").is_ok()
        {
            eprintln!("[dry-run] {:?}", command);
            return Ok(false);
        }
        HostEnvironment::apply_to(&mut command);
        let result = command.output().map_err(|error| json!({ "state": "failed", "message": error.to_string() }))?;
        match result.status.code()
        {
            Some(0) => Ok(true),
            Some(Self::DIALOG_DISMISSED_EXIT_CODE) => Err(json!({ "state": "cancelled" })),
            _ => Err(json!({ "state": "failed", "message": String::from_utf8_lossy(&result.stderr).trim() })),
        }
    }

    /// The service applies the EDID live, but KWin does not always take new modes of a forced
    /// connector before the next login. "done" when the mode shows up, else "reboot".
    fn check_applied(output_name: &str, width: u64, height: u64, refresh_rate: u64) -> Value
    {
        let wanted_mode = json!({ "width": width, "height": height, "refreshRate": refresh_rate });
        for _attempt in 0..5
        {
            std::thread::sleep(Duration::from_secs(2));
            if DisplayModeReader::read(output_name).map(|modes| modes.contains(&wanted_mode)).unwrap_or(false)
            {
                return json!({ "state": "done" });
            }
        }
        json!({ "state": "reboot" })
    }
}
