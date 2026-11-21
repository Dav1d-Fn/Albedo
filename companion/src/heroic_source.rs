use std::fs;

use serde_json::Value;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Games installed through Heroic (Epic via Legendary, GOG).
pub struct HeroicSource;

impl HeroicSource
{
    pub fn scan(&self) -> Vec<LibraryEntry>
    {
        let heroic_directory = home_directory().join(".config/heroic");
        let mut entries = Vec::new();

        // Epic: installed.json is a map appName -> {title, install_path}
        let legendary_installed = Self::read_json(&heroic_directory.join("legendaryConfig/legendary/installed.json"));
        let legendary_library = Self::read_json(&heroic_directory.join("store_cache/legendary_library.json"));
        if let Some(installed_games) = legendary_installed.as_object()
        {
            for (app_name, game) in installed_games
            {
                let cover_url = Self::find_cover_url(&legendary_library, app_name);
                entries.push(Self::build_entry(app_name, game, "legendary", cover_url));
            }
        }

        // GOG: installed.json is {installed: [{appName, install_path}]}, titles are in the library cache
        let gog_installed = Self::read_json(&heroic_directory.join("gog_store/installed.json"));
        let gog_library = Self::read_json(&heroic_directory.join("store_cache/gog_library.json"));
        if let Some(installed_games) = gog_installed["installed"].as_array()
        {
            for game in installed_games
            {
                let app_name = game["appName"].as_str().unwrap_or_default();
                let mut game_with_title = game.clone();
                game_with_title["title"] = Self::find_title(&gog_library, app_name).into();
                let cover_url = Self::find_cover_url(&gog_library, app_name);
                entries.push(Self::build_entry(app_name, &game_with_title, "gog", cover_url));
            }
        }
        entries
    }

    fn build_entry(app_name: &str, game: &Value, runner: &str, cover_url: Option<String>) -> LibraryEntry
    {
        let title = game["title"].as_str().filter(|title| !title.is_empty()).unwrap_or(app_name);
        let install_path = game["install_path"].as_str().unwrap_or_default();
        LibraryEntry
        {
            id: format!("heroic:{}", app_name),
            name: title.to_string(),
            group: "Heroic".into(),
            cover: cover_url.map(CoverSource::Url).unwrap_or(CoverSource::None),
            command: String::new(),
            detached_command: Some(format!("xdg-open \"heroic://launch?appName={}&runner={}\"", app_name, runner)),
            quit_command: (!install_path.is_empty()).then(|| format!("pkill -f \"{}\"", install_path)),
            follows_client_resolution: true,
        }
    }

    fn library_game<'library>(library: &'library Value, app_name: &str) -> Option<&'library Value>
    {
        library["library"].as_array()?.iter().find(|game| game["app_name"].as_str() == Some(app_name))
    }

    fn find_title(library: &Value, app_name: &str) -> String
    {
        Self::library_game(library, app_name)
            .and_then(|game| game["title"].as_str())
            .unwrap_or(app_name)
            .to_string()
    }

    /// art_square is the portrait cover.
    fn find_cover_url(library: &Value, app_name: &str) -> Option<String>
    {
        let game = Self::library_game(library, app_name)?;
        let cover_url = game["art_square"].as_str().or(game["art_cover"].as_str())?;
        (!cover_url.is_empty()).then(|| cover_url.to_string())
    }

    fn read_json(path: &std::path::Path) -> Value
    {
        fs::read_to_string(path)
            .ok()
            .and_then(|file_content| serde_json::from_str(&file_content).ok())
            .unwrap_or(Value::Null)
    }
}
