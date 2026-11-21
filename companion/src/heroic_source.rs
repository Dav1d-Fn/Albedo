use std::fs;

use serde_json::Value;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;
use crate::process_quitter::ProcessQuitter;

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
                let art_urls = Self::find_art_urls(&legendary_library, app_name);
                entries.push(Self::build_entry(app_name, game, "legendary", art_urls));
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
                let art_urls = Self::find_art_urls(&gog_library, app_name);
                entries.push(Self::build_entry(app_name, &game_with_title, "gog", art_urls));
            }
        }
        entries
    }

    fn build_entry(app_name: &str, game: &Value, runner: &str, art_urls: [CoverSource; 3]) -> LibraryEntry
    {
        let title = game["title"].as_str().filter(|title| !title.is_empty()).unwrap_or(app_name);
        let install_path = game["install_path"].as_str().unwrap_or_default();
        let [cover, hero, logo] = art_urls;
        LibraryEntry
        {
            id: format!("heroic:{}", app_name),
            name: title.to_string(),
            group: "Heroic".into(),
            cover,
            hero,
            logo,
            screenshots: Vec::new(),
            command: String::new(),
            detached_command: Some(format!("xdg-open \"heroic://launch?appName={}&runner={}\"", app_name, runner)),
            quit_command: (!install_path.is_empty()).then(|| ProcessQuitter::command_for(install_path)),
            follows_client_resolution: true,
            system: None,
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

    /// Cover, hero and logo from the store cache: art_square is the portrait cover (art_cover
    /// stands in when it is missing), art_cover the wide (2560x1440) picture, art_logo the logo.
    fn find_art_urls(library: &Value, app_name: &str) -> [CoverSource; 3]
    {
        let game = Self::library_game(library, app_name).cloned().unwrap_or(Value::Null);
        let art_url = |key: &str|
        {
            game[key]
                .as_str()
                .filter(|url| !url.is_empty())
                .map(|url| CoverSource::Url(url.to_string()))
        };
        let cover = art_url("art_square").or_else(|| art_url("art_cover")).unwrap_or(CoverSource::None);
        let hero = art_url("art_cover").unwrap_or(CoverSource::None);
        let logo = art_url("art_logo").unwrap_or(CoverSource::None);
        [cover, hero, logo]
    }

    fn read_json(path: &std::path::Path) -> Value
    {
        fs::read_to_string(path)
            .ok()
            .and_then(|file_content| serde_json::from_str(&file_content).ok())
            .unwrap_or(Value::Null)
    }
}
