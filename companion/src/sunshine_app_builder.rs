use std::path::Path;

use serde_json::{json, Value};

use crate::companion_config::home_directory;
use crate::library_entry::LibraryEntry;

/// Builds the app object Sunshine's POST /api/apps expects for a library entry.
pub struct SunshineAppBuilder;

impl SunshineAppBuilder
{
    pub fn build(&self, entry: &LibraryEntry, cover_path: Option<&Path>) -> Value
    {
        let mut prep_commands = Vec::new();
        if entry.follows_client_resolution
        {
            let local_bin = home_directory().join(".local/bin");
            let match_client_command = local_bin.join("sunshine-match-client").display().to_string();
            let restore_screen_command = format!("{} load main", local_bin.join("screenprofilercmd").display());
            prep_commands.push(json!({ "do": match_client_command, "undo": restore_screen_command }));
        }
        if let Some(quit_command) = &entry.quit_command
        {
            // Undo steps run in reverse order: the game ends before the screen switches back.
            prep_commands.push(json!({ "do": "", "undo": quit_command }));
        }

        // No [""] placeholder: an empty detached list means "nothing detached".
        let detached_commands: Vec<&String> = entry.detached_command.iter().collect();

        json!({
            "index": -1,
            "name": entry.name,
            "output": "",
            "cmd": entry.command,
            "detached": detached_commands,
            "prep-cmd": prep_commands,
            "image-path": cover_path.map(|path| path.display().to_string()).unwrap_or_default(),
            "exclude-global-prep-cmd": false,
            "elevated": false,
            "auto-detach": true,
            "wait-all": true,
            "exit-timeout": 5
        })
    }
}
