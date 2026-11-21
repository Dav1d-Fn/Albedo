use std::path::PathBuf;
use std::time::Duration;

use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;

use crate::art_candidate::ArtCandidate;
use crate::art_search_result::ArtSearchResult;
use crate::libretro_thumbnails::LibretroThumbnails;
use crate::ui_language::UiLanguage;

#[derive(Deserialize)]
struct ShopSearchResponse
{
    items: Vec<ShopSearchItem>,
}

#[derive(Deserialize)]
struct ShopSearchItem
{
    id: u64,
    name: String,
}

#[derive(Deserialize)]
struct GridDbResponse<T>
{
    data: T,
}

#[derive(Deserialize)]
struct GridDbGame
{
    id: u64,
}

#[derive(Deserialize)]
struct GridDbImage
{
    url: String,
    thumb: String,
    #[serde(default)]
    author: Option<GridDbAuthor>,
}

#[derive(Deserialize)]
struct GridDbAuthor
{
    name: String,
}

/// Finds pictures for a game on the internet, for the "Bild setzen" dialog:
/// the Steam shop (no key needed; covers, title images and logos of games sold on Steam),
/// libretro's thumbnails (no key needed; retro and emulated games)
/// and SteamGridDB when the user stored an API key (community art, also for non-Steam games).
/// The SteamGridDB key is only sent as Authorization header and never logged.
pub struct ArtSearch
{
    http_client: Client,
    libretro: LibretroThumbnails,
}

impl ArtSearch
{
    const GRID_DB_SOURCE: &'static str = "SteamGridDB";
    const GRID_DB_API: &'static str = "https://www.steamgriddb.com/api/v2/";
    /// Shop games tried per search; each costs one request to check its picture exists.
    const MAXIMUM_SHOP_GAMES: usize = 5;
    const MAXIMUM_GRID_DB_PICTURES: usize = 24;
    /// Same limit as the companion's phone upload.
    const MAXIMUM_DOWNLOAD_BYTES: usize = 15 * 1024 * 1024;

    /// `cache_directory` keeps libretro's folder listings.
    pub fn new(cache_directory: PathBuf) -> Result<Self, String>
    {
        let http_client = Client::builder()
            .timeout(Duration::from_secs(20))
            .user_agent("Albedo-Launcher")
            .build()
            .map_err(|error| error.to_string())?;
        let libretro = LibretroThumbnails::new(http_client.clone(), cache_directory);
        Ok(Self { http_client, libretro })
    }

    /// Pictures of `kind` ("cover", "hero", "logo") for the game named `game_name` (the search text).
    /// `entry_id` is the companion's id; for "steam:<appid>" the exact game is asked first instead of
    /// only searching by name (empty when the user typed another name). `system` is the emulated
    /// system ("Nintendo 64") of an EmuDeck game, its libretro pictures then come first.
    pub async fn search(
        &self,
        game_name: &str,
        entry_id: &str,
        system: Option<&str>,
        kind: &str,
        grid_db_key: &str,
    ) -> ArtSearchResult
    {
        let steam_app_id = entry_id
            .strip_prefix("steam:")
            .and_then(|app_id| app_id.parse::<u64>().ok());
        let mut candidates = Vec::new();
        let mut problems = Vec::new();

        if !grid_db_key.trim().is_empty()
        {
            match self
                .grid_db_pictures(game_name, steam_app_id, kind, grid_db_key.trim())
                .await
            {
                Ok(grid_db_candidates) => candidates.extend(grid_db_candidates),
                Err(problem) => problems.push(problem),
            }
        }
        if system.is_some()
        {
            self.add_libretro_pictures(game_name, system, kind, &mut candidates, &mut problems).await;
        }
        match self.shop_pictures(game_name, steam_app_id, kind).await
        {
            Ok(shop_candidates) => candidates.extend(shop_candidates),
            Err(problem) => problems.push(problem),
        }
        // Steam games have no retro pictures; for other games without a known system
        // (e.g. a stand-alone port of an old game) the common retro systems are searched last.
        if system.is_none() && steam_app_id.is_none()
        {
            self.add_libretro_pictures(game_name, None, kind, &mut candidates, &mut problems).await;
        }

        let problem = if problems.is_empty()
        {
            None
        }
        else
        {
            Some(problems.join(" · "))
        };
        ArtSearchResult
        {
            candidates,
            problem,
        }
    }

    async fn add_libretro_pictures(
        &self,
        game_name: &str,
        system: Option<&str>,
        kind: &str,
        candidates: &mut Vec<ArtCandidate>,
        problems: &mut Vec<String>,
    )
    {
        match self.libretro.pictures(game_name, system, kind).await
        {
            Ok(libretro_candidates) => candidates.extend(libretro_candidates),
            Err(problem) => problems.push(problem),
        }
    }

    /// Downloads a picture the user picked, at most 15 MB.
    pub async fn download(&self, image_url: &str) -> Result<Vec<u8>, String>
    {
        let response = self
            .http_client
            .get(image_url)
            .send()
            .await
            .map_err(|error| format!("{}: {}", UiLanguage::pick("Bild nicht ladbar", "Cannot load image"), error))?;
        if !response.status().is_success()
        {
            return Err(format!("{} ({})", UiLanguage::pick("Bild nicht ladbar", "Cannot load image"), response.status()));
        }
        let image_bytes = response
            .bytes()
            .await
            .map_err(|error| format!("{}: {}", UiLanguage::pick("Bild nicht ladbar", "Cannot load image"), error))?;
        if image_bytes.len() > Self::MAXIMUM_DOWNLOAD_BYTES
        {
            return Err(UiLanguage::pick("Bild zu groß (höchstens 15 MB)", "Image too large (15 MB at most)"));
        }
        Ok(image_bytes.to_vec())
    }

    // ------------------------------------------------------------ Steam shop

    async fn shop_pictures(
        &self,
        game_name: &str,
        steam_app_id: Option<u64>,
        kind: &str,
    ) -> Result<Vec<ArtCandidate>, String>
    {
        let mut shop_games: Vec<(u64, String)> = Vec::new();
        if let Some(app_id) = steam_app_id
        {
            shop_games.push((app_id, game_name.to_string()));
        }
        for item in self.shop_search(game_name).await?
        {
            if !shop_games.iter().any(|(known_id, _)| *known_id == item.id)
            {
                shop_games.push((item.id, item.name));
            }
        }
        shop_games.truncate(Self::MAXIMUM_SHOP_GAMES);

        let mut candidates = Vec::new();
        for (app_id, shop_name) in shop_games
        {
            let image_url = Self::shop_picture_url(app_id, kind);
            // DLCs and old games often lack library pictures; only offer what really exists.
            if self.exists(&image_url).await
            {
                candidates.push(ArtCandidate
                {
                    thumbnail_url: image_url.clone(),
                    image_url,
                    source: UiLanguage::pick("Steam-Shop", "Steam store"),
                    label: shop_name,
                });
            }
        }
        Ok(candidates)
    }

    async fn shop_search(&self, game_name: &str) -> Result<Vec<ShopSearchItem>, String>
    {
        let response = self
            .http_client
            .get("https://store.steampowered.com/api/storesearch/")
            .query(&[("term", game_name), ("cc", "de"), ("l", "german")])
            .send()
            .await
            .map_err(|_| UiLanguage::pick("Steam-Shop nicht erreichbar", "Steam store unreachable"))?;
        if !response.status().is_success()
        {
            return Err(format!("{} {}", UiLanguage::pick("Steam-Shop antwortet mit", "Steam store answered with"), response.status()));
        }
        let search: ShopSearchResponse =
            response.json().await.map_err(|error| error.to_string())?;
        Ok(search.items)
    }

    pub fn shop_picture_url(app_id: u64, kind: &str) -> String
    {
        let file_name = match kind
        {
            "hero" => "library_hero.jpg",
            "logo" => "logo.png",
            _ => "library_600x900_2x.jpg",
        };
        format!(
            "https://shared.steamstatic.com/store_item_assets/steam/apps/{}/{}",
            app_id, file_name
        )
    }

    async fn exists(&self, image_url: &str) -> bool
    {
        match self.http_client.head(image_url).send().await
        {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }

    // ------------------------------------------------------------ SteamGridDB

    async fn grid_db_pictures(
        &self,
        game_name: &str,
        steam_app_id: Option<u64>,
        kind: &str,
        key: &str,
    ) -> Result<Vec<ArtCandidate>, String>
    {
        let (collection, filters) = Self::grid_db_collection(kind);
        // Steam games are looked up by appid; everything else by its name.
        let game_path: Vec<String> = match steam_app_id
        {
            Some(app_id) => vec!["steam".into(), app_id.to_string()],
            None =>
            {
                let search_url = Self::grid_db_url(&["search", "autocomplete", game_name], &[]);
                let games: Vec<GridDbGame> = self.grid_db_get(search_url, key).await?;
                match games.first()
                {
                    Some(game) => vec!["game".into(), game.id.to_string()],
                    None => return Ok(Vec::new()),
                }
            }
        };
        let mut path_segments = vec![collection];
        path_segments.extend(game_path.iter().map(String::as_str));
        let images: Vec<GridDbImage> = self
            .grid_db_get(Self::grid_db_url(&path_segments, &filters), key)
            .await?;

        Ok(images
            .into_iter()
            .take(Self::MAXIMUM_GRID_DB_PICTURES)
            .map(|image| ArtCandidate
            {
                image_url: image.url,
                thumbnail_url: image.thumb,
                source: Self::GRID_DB_SOURCE.into(),
                label: image.author.map(|author| author.name).unwrap_or_default(),
            })
            .collect())
    }

    /// SteamGridDB collection and filters for a picture kind; only still pictures, covers upright.
    pub fn grid_db_collection(kind: &str) -> (&'static str, Vec<(&'static str, &'static str)>)
    {
        match kind
        {
            "hero" => ("heroes", vec![("types", "static")]),
            "logo" => ("logos", vec![("types", "static")]),
            _ => (
                "grids",
                vec![
                    ("dimensions", "600x900,342x482,660x930"),
                    ("types", "static"),
                ],
            ),
        }
    }

    /// Path segments are percent-encoded, so a game name with "/" or "?" stays one segment.
    pub fn grid_db_url(path_segments: &[&str], query: &[(&str, &str)]) -> Url
    {
        let mut url = Url::parse(Self::GRID_DB_API).expect("fixed URL");
        if let Ok(mut segments) = url.path_segments_mut()
        {
            segments.pop_if_empty();
            segments.extend(path_segments);
        }
        if !query.is_empty()
        {
            url.query_pairs_mut().extend_pairs(query);
        }
        url
    }

    async fn grid_db_get<T: for<'de> Deserialize<'de>>(
        &self,
        url: Url,
        key: &str,
    ) -> Result<T, String>
    {
        let response = self
            .http_client
            .get(url)
            .bearer_auth(key)
            .send()
            .await
            .map_err(|_| UiLanguage::pick("SteamGridDB nicht erreichbar", "SteamGridDB unreachable"))?;
        match response.status()
        {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN =>
            {
                return Err(UiLanguage::pick("SteamGridDB-Schlüssel ungültig", "SteamGridDB key invalid"));
            }
            // Unknown game (e.g. a Steam appid SteamGridDB does not have): simply nothing found.
            StatusCode::NOT_FOUND => return Err(UiLanguage::pick("SteamGridDB kennt das Spiel nicht", "SteamGridDB doesn't know this game")),
            status if !status.is_success() =>
            {
                return Err(format!("{} {}", UiLanguage::pick("SteamGridDB antwortet mit", "SteamGridDB answered with"), status));
            }
            _ =>
            {}
        }
        let answer: GridDbResponse<T> = response.json().await.map_err(|error| error.to_string())?;
        Ok(answer.data)
    }
}

#[cfg(test)]
mod tests
{
    use super::ArtSearch;

    #[test]
    fn grid_db_url_keeps_game_name_in_one_segment()
    {
        let url = ArtSearch::grid_db_url(
            &["search", "autocomplete", "Ratchet & Clank: Rift/Apart?"],
            &[],
        );
        assert_eq!(
            url.as_str(),
            "https://www.steamgriddb.com/api/v2/search/autocomplete/Ratchet%20&%20Clank:%20Rift%2FApart%3F"
        );
    }

    #[test]
    fn grid_db_url_for_covers_asks_only_upright_still_pictures()
    {
        let (collection, filters) = ArtSearch::grid_db_collection("cover");
        let url = ArtSearch::grid_db_url(&[collection, "steam", "1245620"], &filters);
        assert_eq!(
            url.as_str(),
            "https://www.steamgriddb.com/api/v2/grids/steam/1245620?dimensions=600x900%2C342x482%2C660x930&types=static"
        );
    }

    /// Needs internet: `cargo test -- --ignored finds_shop_pictures`.
    #[test]
    #[ignore]
    fn finds_shop_pictures_without_a_key()
    {
        let result = tauri::async_runtime::block_on(async {
            ArtSearch::new(std::env::temp_dir().join("albedo-art-test"))
                .unwrap()
                .search("Dead Island 2", "heroic:Crow", None, "cover", "")
                .await
        });
        println!("{:?}", result);
        assert!(
            result
                .candidates
                .iter()
                .any(|candidate| candidate.image_url.contains("/934700/"))
        );
        assert!(result.problem.is_none());
    }

    /// Needs internet: `cargo test -- --ignored finds_libretro_pictures`.
    #[test]
    #[ignore]
    fn finds_libretro_pictures_for_an_emulated_game()
    {
        let result = tauri::async_runtime::block_on(async {
            ArtSearch::new(std::env::temp_dir().join("albedo-art-test"))
                .unwrap()
                .search("Zelda Ocarina of Time", "", Some("Nintendo 64"), "cover", "")
                .await
        });
        println!("{:?}", result);
        assert_eq!(result.candidates[0].source, "libretro");
        assert!(result.candidates[0].image_url.ends_with("Ocarina%20of%20Time%20(USA).png"));
    }

    #[test]
    fn shop_picture_url_per_kind()
    {
        assert!(
            ArtSearch::shop_picture_url(934700, "cover")
                .ends_with("/934700/library_600x900_2x.jpg")
        );
        assert!(ArtSearch::shop_picture_url(934700, "hero").ends_with("/934700/library_hero.jpg"));
        assert!(ArtSearch::shop_picture_url(934700, "logo").ends_with("/934700/logo.png"));
    }
}
