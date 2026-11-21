use std::process::Command;

use serde_json::Value;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Games installed through Lutris (read from its pga.db with the sqlite3 tool).
pub struct LutrisSource;

impl LutrisSource
{
    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let lutris_directory = home_directory().join(".local/share/lutris");
        let database_path = lutris_directory.join("pga.db");
        if !database_path.exists()
        {
            return Vec::new();
        }

        let query_output = Command::new("sqlite3")
            .arg("-json")
            .arg("-readonly")
            .arg(&database_path)
            .arg("SELECT id, slug, name, directory FROM games WHERE installed = 1")
            .output();
        let Ok(query_output) = query_output
        else
        {
            eprintln!("sqlite3 fehlt, Lutris-Spiele werden übersprungen");
            return Vec::new();
        };
        let rows: Value = serde_json::from_slice(&query_output.stdout).unwrap_or(Value::Null);

        let mut entries = Vec::new();
        for row in rows.as_array().cloned().unwrap_or_default()
        {
            let game_id = row["id"].as_i64().unwrap_or_default();
            let slug = row["slug"].as_str().unwrap_or_default().to_string();
            let directory = row["directory"].as_str().unwrap_or_default();
            let cover_path = lutris_directory.join("coverart").join(format!("{}.jpg", slug));
            entries.push(LibraryEntry
            {
                id: format!("lutris:{}", slug),
                name: row["name"].as_str().unwrap_or(&slug).to_string(),
                group: "Lutris".into(),
                cover: if cover_path.exists() { CoverSource::File(cover_path) } else { CoverSource::None },
                hero: CoverSource::None,
                screenshots: Vec::new(),
                command: String::new(),
                detached_command: Some(format!("lutris lutris:rungameid/{}", game_id)),
                quit_command: (!directory.is_empty()).then(|| format!("pkill -f \"{}\"", directory)),
                follows_client_resolution: true,
            });
        }
        entries
    }
}
