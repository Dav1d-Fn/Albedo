use std::fs;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;
use crate::process_quitter::ProcessQuitter;

/// Minecraft instances of the Prism Launcher flatpak.
pub struct PrismSource;

impl PrismSource
{
    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let instances_directory = home_directory().join("Dokumente/Prism Launcher Instances");
        let Ok(directory_listing) = fs::read_dir(&instances_directory)
        else
        {
            return Vec::new();
        };

        let mut entries = Vec::new();
        for directory_entry in directory_listing.flatten()
        {
            let instance_path = directory_entry.path();
            if !instance_path.join("instance.cfg").exists()
            {
                continue;
            }
            let instance_name = directory_entry.file_name().to_string_lossy().to_string();
            entries.push(LibraryEntry
            {
                id: format!("prism:{}", instance_name),
                name: format!("Minecraft {}", instance_name),
                group: "Minecraft".into(),
                cover: CoverSource::None,
                hero: CoverSource::None,
                logo: CoverSource::None,
                screenshots: Vec::new(),
                // Prism stays in the foreground while the game runs, so Sunshine waits on it.
                command: format!("flatpak run org.prismlauncher.PrismLauncher --launch \"{}\"", instance_name),
                detached_command: None,
                // The game's Java process has the instance folder in its arguments.
                quit_command: Some(ProcessQuitter::command_for(&format!("{}/", instance_path.display()))),
                follows_client_resolution: true,
            });
        }
        entries
    }
}
