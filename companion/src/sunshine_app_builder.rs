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
            let match_client_command = Self::match_client_command();
            let restore_screen_command = format!("{} --restore", match_client_command);
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

    fn match_client_command() -> String
    {
        home_directory().join(".local/bin/sunshine-match-client").display().to_string()
    }

    /// Apps created before pc-setup/ restored the screen with `screenprofilercmd load main`.
    /// Returns the app with that undo replaced by `sunshine-match-client --restore`, or None if
    /// the app has no such step. Only steps whose do is `sunshine-match-client` are touched,
    /// so prep commands the user wrote around screenprofiler stay as they are.
    pub fn migrate_restore_command(&self, app: &Value) -> Option<Value>
    {
        let mut migrated_app = app.clone();
        let mut changed = false;
        for prep_command in migrated_app["prep-cmd"].as_array_mut()?
        {
            let do_command = prep_command["do"].as_str().unwrap_or_default().to_string();
            let undo_command = prep_command["undo"].as_str().unwrap_or_default();
            let runs_match_client = do_command.trim_end().ends_with("sunshine-match-client");
            let restores_with_screenprofiler = undo_command.contains("screenprofilercmd") && undo_command.ends_with("load main");
            if runs_match_client && restores_with_screenprofiler
            {
                prep_command["undo"] = json!(format!("{} --restore", do_command.trim_end()));
                changed = true;
            }
        }
        if changed
        {
            Some(migrated_app)
        }
        else
        {
            None
        }
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn replaces_only_the_screenprofiler_undo_after_match_client()
    {
        let old_app = json!({ "name": "Desktop", "prep-cmd": [
            { "do": "/home/user/.local/bin/sunshine-match-client", "undo": "/home/user/.local/bin/screenprofilercmd load main" },
            { "do": "", "undo": "pkill -f game" }
        ] });
        let migrated_app = SunshineAppBuilder.migrate_restore_command(&old_app).unwrap();
        assert_eq!(migrated_app["prep-cmd"][0]["undo"], "/home/user/.local/bin/sunshine-match-client --restore");
        assert_eq!(migrated_app["prep-cmd"][1], old_app["prep-cmd"][1]);
        assert_eq!(migrated_app["name"], "Desktop");

        let own_profile_app = json!({ "prep-cmd": [
            { "do": "/home/user/.local/bin/screenprofilercmd load steamdeck", "undo": "/home/user/.local/bin/screenprofilercmd load main" }
        ] });
        assert!(SunshineAppBuilder.migrate_restore_command(&own_profile_app).is_none());
        assert!(SunshineAppBuilder.migrate_restore_command(&migrated_app).is_none());
        assert!(SunshineAppBuilder.migrate_restore_command(&json!({ "name": "No prep" })).is_none());
    }
}
