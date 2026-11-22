use std::fs;
use std::process::Command;
use std::thread::sleep;
use std::time::{Duration, Instant};

/// Ends a game when its stream is quit: SIGTERM to every process whose command line contains
/// the pattern (like `pkill -f`), SIGKILL to whatever still runs after a few seconds.
/// Runs as `Albedo-PC-x86_64.AppImage quit "<pattern>"` from a Sunshine undo step. Its own
/// process and its parents are skipped: their command lines contain the pattern too
/// (a shell that runs `… quit "x"` would otherwise kill itself).
pub struct ProcessQuitter
{
    pattern: String,
}

impl ProcessQuitter
{
    const GRACE_PERIOD: Duration = Duration::from_secs(5);

    pub fn new(pattern: &str) -> ProcessQuitter
    {
        ProcessQuitter { pattern: pattern.to_string() }
    }

    /// The Sunshine undo command that runs this quitter with the pattern.
    pub fn command_for(pattern: &str) -> String
    {
        format!("{} quit \"{}\"", Self::companion_program(), pattern.replace('"', ""))
    }

    /// Path of the running program (Albedo PC) as the program part of an undo command.
    pub fn companion_program() -> String
    {
        // Inside an AppImage the executable lives in a mount that is gone after the app ends;
        // the AppImage runtime names the file itself in APPIMAGE.
        let appimage_path = std::env::var("APPIMAGE").ok().filter(|path| !path.is_empty());
        let companion_path = match appimage_path
        {
            Some(path) => path,
            None => std::env::current_exe()
                .map(|path| path.display().to_string())
                .unwrap_or_else(|_| "albedo-pc".into()),
        };
        // Quotes around the program only when needed: Sunshine's undo log stays readable.
        if companion_path.contains(' ')
        {
            format!("\"{}\"", companion_path)
        }
        else
        {
            companion_path
        }
    }

    pub fn quit(&self)
    {
        if self.pattern.trim().is_empty()
        {
            return; // an empty pattern would match every process
        }
        let terminated_ids = self.matching_process_ids();
        self.send_signal("TERM", &terminated_ids);

        let deadline = Instant::now() + Self::GRACE_PERIOD;
        while Instant::now() < deadline
        {
            if self.matching_process_ids().is_empty()
            {
                return;
            }
            sleep(Duration::from_millis(250));
        }
        let remaining_ids = self.matching_process_ids();
        eprintln!("Nach {} s noch aktiv, SIGKILL: {:?}", Self::GRACE_PERIOD.as_secs(), remaining_ids);
        self.send_signal("KILL", &remaining_ids);
    }

    fn matching_process_ids(&self) -> Vec<u32>
    {
        let own_lineage = Self::own_lineage();
        let Ok(proc_listing) = fs::read_dir("/proc")
        else
        {
            return Vec::new();
        };
        proc_listing
            .flatten()
            .filter_map(|proc_entry| proc_entry.file_name().to_str()?.parse::<u32>().ok())
            .filter(|process_id| !own_lineage.contains(process_id))
            .filter(|process_id|
            {
                let command_line = fs::read(format!("/proc/{}/cmdline", process_id)).unwrap_or_default();
                // Arguments are NUL-separated; joined with spaces like pkill -f sees them.
                let command_line = String::from_utf8_lossy(&command_line).replace('\0', " ");
                command_line.contains(&self.pattern)
            })
            .collect()
    }

    /// This process and all its parents up to init.
    fn own_lineage() -> Vec<u32>
    {
        let mut lineage = vec![std::process::id()];
        while let Some(parent_id) = Self::parent_of(*lineage.last().expect("never empty"))
        {
            if parent_id <= 1 || lineage.contains(&parent_id)
            {
                break;
            }
            lineage.push(parent_id);
        }
        lineage
    }

    /// The 4th field of /proc/<pid>/stat, after the ")" that ends the process name.
    fn parent_of(process_id: u32) -> Option<u32>
    {
        let stat_text = fs::read_to_string(format!("/proc/{}/stat", process_id)).ok()?;
        let after_name = &stat_text[stat_text.rfind(')')? + 1..];
        after_name.split_whitespace().nth(1)?.parse().ok()
    }

    fn send_signal(&self, signal_name: &str, process_ids: &[u32])
    {
        if process_ids.is_empty()
        {
            return;
        }
        let _ = Command::new("kill")
            .arg(format!("-{}", signal_name))
            .args(process_ids.iter().map(|process_id| process_id.to_string()))
            .status();
    }
}
