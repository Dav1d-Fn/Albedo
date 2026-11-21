use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;

use crate::art_candidate::ArtCandidate;
use crate::ui_language::UiLanguage;

#[derive(Deserialize)]
struct GitTree
{
    tree: Vec<GitTreeItem>,
}

#[derive(Deserialize)]
struct GitTreeItem
{
    path: String,
    sha: String,
}

/// RetroArch's thumbnail collection (github.com/libretro-thumbnails, one repository per system):
/// box art, title screens, in-game shots and logos of retro games, no key needed.
/// File names are the No-Intro titles ("Legend of Zelda, The - Ocarina of Time (USA).png"),
/// so the typed name is matched word by word. GitHub allows 60 anonymous API requests per hour,
/// so each folder listing is kept on disk for a week.
pub struct LibretroThumbnails
{
    http_client: Client,
    cache_directory: PathBuf,
}

impl LibretroThumbnails
{
    const SOURCE: &'static str = "libretro";
    const MAXIMUM_PICTURES: usize = 12;
    const LISTING_MAXIMUM_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);
    /// Searched when the game's system is unknown (e.g. a stand-alone port of an old game).
    const COMMON_SYSTEMS: [&'static str; 6] = [
        "Nintendo_-_Nintendo_64",
        "Nintendo_-_Super_Nintendo_Entertainment_System",
        "Nintendo_-_Nintendo_Entertainment_System",
        "Nintendo_-_Game_Boy_Advance",
        "Nintendo_-_GameCube",
        "Sony_-_PlayStation",
    ];

    pub fn new(http_client: Client, cache_directory: PathBuf) -> Self
    {
        Self { http_client, cache_directory }
    }

    /// Pictures of `kind` whose title contains every word of `query`. `system` is the
    /// EmuDeck/Steam ROM Manager system name ("Nintendo 64"); None searches the common systems,
    /// a system libretro has no pictures for (e.g. "Nintendo Switch") finds nothing.
    pub async fn pictures(&self, query: &str, system: Option<&str>, kind: &str) -> Result<Vec<ArtCandidate>, String>
    {
        let repositories: Vec<&str> = match system
        {
            Some(system_name) => Self::repository_for_system(system_name).into_iter().collect(),
            None => Self::COMMON_SYSTEMS.to_vec(),
        };
        let query_words = Self::title_words(query);
        if query_words.is_empty() || repositories.is_empty()
        {
            return Ok(Vec::new());
        }

        // (extra words, region rank, repository, folder, file name)
        let mut matches: Vec<(usize, usize, &str, &str, String)> = Vec::new();
        let mut problem = None;
        for repository in &repositories
        {
            for folder in Self::folders_for(kind)
            {
                match self.folder_listing(repository, folder).await
                {
                    Ok(file_names) =>
                    {
                        for file_name in file_names
                        {
                            if let Some(extra_words) = Self::extra_words(&query_words, &file_name)
                            {
                                let region_rank = Self::region_rank(&file_name);
                                matches.push((extra_words, region_rank, repository, folder, file_name));
                            }
                        }
                    }
                    Err(listing_problem) => problem = Some(listing_problem),
                }
            }
        }
        if matches.is_empty()
        {
            if let Some(listing_problem) = problem
            {
                return Err(listing_problem);
            }
        }

        // Closest title first, then region; at equal region the plain release before "(Rev 1)", "(GameCube)" etc.
        matches.sort_by_key(|(extra_words, region_rank, _, _, file_name)| (*extra_words, *region_rank, file_name.matches('(').count()));
        // Rev 1, Rev 2 and other regions of the same game look alike: one picture per title and folder.
        let mut shown_titles: Vec<String> = Vec::new();
        let mut candidates = Vec::new();
        for (_, _, repository, folder, file_name) in matches
        {
            let title_key = format!("{}|{}", folder, Self::title_words(&file_name).join(" "));
            if shown_titles.contains(&title_key)
            {
                continue;
            }
            shown_titles.push(title_key);
            let image_url = Self::picture_url(repository, folder, &file_name).to_string();
            candidates.push(ArtCandidate
            {
                thumbnail_url: image_url.clone(),
                image_url,
                source: Self::SOURCE.into(),
                label: format!("{} · {}", file_name.trim_end_matches(".png"), Self::system_label(repository)),
            });
            if candidates.len() == Self::MAXIMUM_PICTURES
            {
                break;
            }
        }
        Ok(candidates)
    }

    /// libretro folders per picture kind; the wide backdrop takes title screens and in-game shots.
    pub fn folders_for(kind: &str) -> &'static [&'static str]
    {
        match kind
        {
            "hero" => &["Named_Titles", "Named_Snaps"],
            "logo" => &["Named_Logos"],
            _ => &["Named_Boxarts"],
        }
    }

    /// Repository for an EmuDeck/Steam ROM Manager system name, None when libretro has none.
    pub fn repository_for_system(system_name: &str) -> Option<&'static str>
    {
        let repository = match system_name.trim().to_lowercase().as_str()
        {
            "nintendo 64" => "Nintendo_-_Nintendo_64",
            "nintendo ds" => "Nintendo_-_Nintendo_DS",
            "nintendo 3ds" => "Nintendo_-_Nintendo_3DS",
            "nintendo entertainment system" | "nes" => "Nintendo_-_Nintendo_Entertainment_System",
            "nintendo game boy" | "nintendo super game boy" => "Nintendo_-_Game_Boy",
            "nintendo game boy color" => "Nintendo_-_Game_Boy_Color",
            "nintendo game boy advance" => "Nintendo_-_Game_Boy_Advance",
            "nintendo gamecube" => "Nintendo_-_GameCube",
            "nintendo snes (super nintendo)" | "nintendo snes (super nintendo) hd" | "super nintendo" | "snes" =>
            {
                "Nintendo_-_Super_Nintendo_Entertainment_System"
            }
            "nintendo virtual boy" => "Nintendo_-_Virtual_Boy",
            "nintendo wii" | "nintendo metroid prime trilogy" => "Nintendo_-_Wii",
            "nintendo wii u" => "Nintendo_-_Wii_U",
            "sony playstation" => "Sony_-_PlayStation",
            "sony playstation 2" => "Sony_-_PlayStation_2",
            "sony playstation 3" => "Sony_-_PlayStation_3",
            "sony playstation 4" => "Sony_-_PlayStation_4",
            "sony playstation portable" => "Sony_-_PlayStation_Portable",
            "sony playstation vita" => "Sony_-_PlayStation_Vita",
            "sega 32x" => "Sega_-_32X",
            "sega cd/mega cd" => "Sega_-_Mega-CD_-_Sega_CD",
            "sega dreamcast" => "Sega_-_Dreamcast",
            "sega game gear" => "Sega_-_Game_Gear",
            "sega genesis/mega drive" | "sega genesis/mega drive widescreen" => "Sega_-_Mega_Drive_-_Genesis",
            "sega master system" => "Sega_-_Master_System_-_Mark_III",
            "sega saturn" => "Sega_-_Saturn",
            "snk neo geo cd" => "SNK_-_Neo_Geo_CD",
            "snk neo geo pocket" => "SNK_-_Neo_Geo_Pocket",
            "snk neo geo pocket color" => "SNK_-_Neo_Geo_Pocket_Color",
            "nec pc engine/turbografx 16" => "NEC_-_PC_Engine_-_TurboGrafx_16",
            "nec pc engine/turbografx 16 cd" => "NEC_-_PC_Engine_CD_-_TurboGrafx-CD",
            "nec pc-98" => "NEC_-_PC-98",
            "pcfx" => "NEC_-_PC-FX",
            "atari 2600" => "Atari_-_2600",
            "atari jaguar" => "Atari_-_Jaguar",
            "atari lynx" => "Atari_-_Lynx",
            "bandai wonderswan" => "Bandai_-_WonderSwan",
            "bandai wonderswan color" => "Bandai_-_WonderSwan_Color",
            "commodore 64" => "Commodore_-_64",
            "commodore vic-20" => "Commodore_-_VIC-20",
            "amiga" | "amiga 600" | "amiga 1200" => "Commodore_-_Amiga",
            "amiga cd" => "Commodore_-_CD32",
            "amstrad cpc" => "Amstrad_-_CPC",
            "dos" => "DOS",
            "microsoft xbox" => "Microsoft_-_Xbox",
            "intellivision" => "Mattel_-_Intellivision",
            "philips cd-i" => "Philips_-_CD-i",
            "sharp x68000" => "Sharp_-_X68000",
            "sinclair zx spectrum" => "Sinclair_-_ZX_Spectrum",
            "scummvm" => "ScummVM",
            "tic-80" => "TIC-80",
            "arcade" => "MAME",
            _ => return None,
        };
        Some(repository)
    }

    /// Lower-case words of a title without "(USA)", "[!]", "the" and punctuation;
    /// "Legend of Zelda, The - Ocarina of Time (USA).png" -> legend of zelda ocarina of time.
    pub fn title_words(title: &str) -> Vec<String>
    {
        let title = title.trim_end_matches(".png");
        let mut plain_title = String::new();
        let mut bracket_depth = 0;
        for character in title.chars()
        {
            match character
            {
                '(' | '[' => bracket_depth += 1,
                ')' | ']' => bracket_depth = (bracket_depth - 1).max(0),
                _ if bracket_depth > 0 => {}
                _ => plain_title.push(Self::without_accent(character)),
            }
        }
        plain_title
            .to_lowercase()
            .split(|character: char| !character.is_alphanumeric())
            .filter(|word| !word.is_empty() && *word != "the")
            .map(String::from)
            .collect()
    }

    /// None when a query word is missing from the title, else how many title words are extra (fewer = closer).
    pub fn extra_words(query_words: &[String], file_name: &str) -> Option<usize>
    {
        let title_words = Self::title_words(file_name);
        if query_words.iter().all(|query_word| title_words.contains(query_word))
        {
            Some(title_words.len().saturating_sub(query_words.len()))
        }
        else
        {
            None
        }
    }

    /// USA and Europe releases first, betas, prototypes and Japanese titles last.
    fn region_rank(file_name: &str) -> usize
    {
        if ["(Beta", "(Proto", "(Debug", "(Demo", "(Sample"].iter().any(|marker| file_name.contains(marker))
        {
            3
        }
        else if file_name.contains("(USA") || file_name.contains("(World")
        {
            0
        }
        else if file_name.contains("(Europe") || file_name.contains("Germany")
        {
            1
        }
        else
        {
            2
        }
    }

    /// "Pokémon" in Steam is "Pokemon" in No-Intro.
    fn without_accent(character: char) -> char
    {
        match character
        {
            'á' | 'à' | 'â' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            '’' => '\'',
            other => other,
        }
    }

    fn system_label(repository: &str) -> String
    {
        repository.rsplit("_-_").next().unwrap_or(repository).replace('_', " ")
    }

    /// Segments are percent-encoded: titles carry spaces, commas and "&".
    pub fn picture_url(repository: &str, folder: &str, file_name: &str) -> Url
    {
        let mut url = Url::parse("https://raw.githubusercontent.com/libretro-thumbnails/").expect("fixed URL");
        if let Ok(mut segments) = url.path_segments_mut()
        {
            segments.pop_if_empty();
            segments.extend([repository, "HEAD", folder, file_name]);
        }
        url
    }

    /// File names in one folder of a repository, from the disk cache while it is younger than a week.
    async fn folder_listing(&self, repository: &str, folder: &str) -> Result<Vec<String>, String>
    {
        let cache_file = self.cache_directory.join(format!("{}-{}.txt", repository, folder));
        let cache_age = fs::metadata(&cache_file)
            .and_then(|metadata| metadata.modified())
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok());
        let cached_names = || -> Option<Vec<String>>
        {
            let text = fs::read_to_string(&cache_file).ok()?;
            Some(text.lines().map(String::from).collect())
        };
        if cache_age.is_some_and(|age| age < Self::LISTING_MAXIMUM_AGE)
        {
            if let Some(names) = cached_names()
            {
                return Ok(names);
            }
        }

        match self.fetch_folder_listing(repository, folder).await
        {
            Ok(names) =>
            {
                if fs::create_dir_all(&self.cache_directory).is_ok()
                {
                    let _ = fs::write(&cache_file, names.join("\n"));
                }
                Ok(names)
            }
            // An old listing is better than none (e.g. GitHub's hourly limit is used up).
            Err(problem) => cached_names().ok_or(problem),
        }
    }

    /// Two small requests: the repository's top folders, then the one folder's files.
    /// (One recursive listing fails for big systems like the PlayStation 2.)
    async fn fetch_folder_listing(&self, repository: &str, folder: &str) -> Result<Vec<String>, String>
    {
        let root = self.git_tree(repository, "HEAD").await?;
        let Some(folder_item) = root.tree.into_iter().find(|item| item.path == folder)
        else
        {
            return Ok(Vec::new());
        };
        let folder_tree = self.git_tree(repository, &folder_item.sha).await?;
        Ok(folder_tree
            .tree
            .into_iter()
            .map(|item| item.path)
            .filter(|path| path.ends_with(".png"))
            .collect())
    }

    async fn git_tree(&self, repository: &str, tree_reference: &str) -> Result<GitTree, String>
    {
        let url = format!(
            "https://api.github.com/repos/libretro-thumbnails/{}/git/trees/{}",
            repository, tree_reference
        );
        let response = self
            .http_client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| UiLanguage::pick("libretro nicht erreichbar", "libretro unreachable"))?;
        match response.status()
        {
            StatusCode::FORBIDDEN | StatusCode::TOO_MANY_REQUESTS =>
            {
                return Err(UiLanguage::pick(
                    "libretro: GitHub-Limit erreicht, in einer Stunde wieder",
                    "libretro: GitHub limit reached, try again in an hour",
                ));
            }
            status if !status.is_success() =>
            {
                return Err(format!("{} {}", UiLanguage::pick("libretro antwortet mit", "libretro answered with"), status));
            }
            _ =>
            {}
        }
        response.json().await.map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests
{
    use super::LibretroThumbnails;

    fn words(text: &str) -> Vec<String>
    {
        LibretroThumbnails::title_words(text)
    }

    #[test]
    fn no_intro_title_matches_a_short_name()
    {
        let query = words("Zelda: Ocarina of Time");
        assert_eq!(
            LibretroThumbnails::extra_words(&query, "Legend of Zelda, The - Ocarina of Time (USA).png"),
            Some(2)
        );
        assert_eq!(
            LibretroThumbnails::extra_words(&query, "Legend of Zelda, The - Ocarina of Time - Master Quest (USA) (GameCube).png"),
            Some(4)
        );
        assert_eq!(LibretroThumbnails::extra_words(&query, "Legend of Zelda, The - Majora's Mask (USA).png"), None);
    }

    #[test]
    fn accents_and_brackets_do_not_count()
    {
        assert_eq!(words("Pokémon SoulSilver Version"), words("Pokemon - SoulSilver Version (USA) [!].png"));
    }

    #[test]
    fn emudeck_system_names_map_to_repositories()
    {
        assert_eq!(LibretroThumbnails::repository_for_system("Nintendo 64"), Some("Nintendo_-_Nintendo_64"));
        assert_eq!(
            LibretroThumbnails::repository_for_system("Nintendo SNES (Super Nintendo)"),
            Some("Nintendo_-_Super_Nintendo_Entertainment_System")
        );
        assert_eq!(LibretroThumbnails::repository_for_system("Nintendo Switch"), None);
    }

    #[test]
    fn picture_url_encodes_the_title()
    {
        let url = LibretroThumbnails::picture_url(
            "Nintendo_-_Nintendo_64",
            "Named_Boxarts",
            "Legend of Zelda, The - Ocarina of Time (USA).png",
        );
        assert_eq!(
            url.as_str(),
            "https://raw.githubusercontent.com/libretro-thumbnails/Nintendo_-_Nintendo_64/HEAD/Named_Boxarts/Legend%20of%20Zelda,%20The%20-%20Ocarina%20of%20Time%20(USA).png"
        );
    }
}
