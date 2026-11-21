use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

use crate::moonlight_host_entries::MoonlightHostEntries;

/// Cover images of the host's apps, taken from Moonlight's own cache.
///
/// Moonlight downloads each Sunshine app's image once and keeps it as
/// `<cache>/boxart/<host uuid>/<app id>.png`. Which app id belongs to which name and
/// which uuid belongs to which address is stored in Moonlight.conf (`[hosts]`).
pub struct MoonlightBoxArt
{
    config_file: PathBuf,
    box_art_folder: PathBuf,
}

impl MoonlightBoxArt
{
    const FLATPAK_ID: &'static str = "com.moonlight_stream.Moonlight";
    const MOONLIGHT_FOLDER: &'static str = "Moonlight Game Streaming Project";

    /// Paths for the Flatpak or the system install, depending on the configured Moonlight command.
    pub fn for_command(moonlight_command: &[String]) -> Result<Self, String>
    {
        let home = std::env::var_os("HOME").map(PathBuf::from).ok_or("HOME ist nicht gesetzt")?;
        let uses_flatpak = moonlight_command.iter().any(|argument| argument == Self::FLATPAK_ID);

        let (config_root, cache_root) = if uses_flatpak
        {
            let app_folder = home.join(".var/app").join(Self::FLATPAK_ID);
            (app_folder.join("config"), app_folder.join("cache"))
        }
        else
        {
            (home.join(".config"), home.join(".cache"))
        };

        Ok(Self
        {
            config_file: config_root.join(Self::MOONLIGHT_FOLDER).join("Moonlight.conf"),
            box_art_folder: cache_root.join(Self::MOONLIGHT_FOLDER).join("Moonlight/boxart"),
        })
    }

    /// App name -> `data:image/png;base64,…` URL. Apps without a cached or with Sunshine's grey default image are left out.
    /// `addresses` are all addresses of the PC; Moonlight may know it under any of them.
    pub fn load(&self, addresses: &[String]) -> Result<HashMap<String, String>, String>
    {
        let config_text = fs::read_to_string(&self.config_file)
            .map_err(|error| format!("Moonlight.conf nicht lesbar ({}): {}", self.config_file.display(), error))?;
        let host_entries = MoonlightHostEntries::parse(&config_text);

        let host_number = addresses
            .iter()
            .find_map(|address| host_entries.host_number_for_address(address));
        let Some(host_number) = host_number else
        {
            return Ok(HashMap::new());
        };
        let Some(host_uuid) = host_entries.value(&host_number, "uuid") else
        {
            return Ok(HashMap::new());
        };
        let host_folder = self.box_art_folder.join(host_uuid);

        let mut images = HashMap::new();
        for (app_id, app_name) in host_entries.apps_of(&host_number)
        {
            let image_path = host_folder.join(format!("{}.png", app_id));
            if let Some(image_bytes) = Self::read_colour_png(&image_path)
            {
                images.insert(app_name, format!("data:image/png;base64,{}", BASE64.encode(image_bytes)));
            }
        }
        Ok(images)
    }

    /// Sunshine's default cover is a grey PNG; real covers are in colour. Skips the grey ones.
    fn read_colour_png(image_path: &Path) -> Option<Vec<u8>>
    {
        let image_bytes = fs::read(image_path).ok()?;
        // PNG header: 8 byte signature, IHDR chunk; the colour type is byte 25 (0 = grey, 4 = grey + alpha).
        let colour_type = *image_bytes.get(25)?;
        let is_grey = colour_type == 0 || colour_type == 4;
        if is_grey
        {
            None
        }
        else
        {
            Some(image_bytes)
        }
    }
}
