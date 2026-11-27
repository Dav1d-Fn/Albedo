use crate::request_language::RequestLanguage;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Stdio;

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;
use crate::host_environment::HostEnvironment;

/// Turns any picture (jpg, png, web URL) into what the launcher shows, with ImageMagick:
/// covers as 600x900 PNG, backgrounds (hero, screenshots) as JPEG of at most 1920 px width,
/// logos as PNG (keeps transparency) of at most 1200 px width.
pub struct CoverConverter;

impl CoverConverter
{
    const COVER_ARGUMENTS: [&'static str; 7] = ["-resize", "600x900^", "-gravity", "center", "-extent", "600x900", "png:-"];
    const BACKGROUND_ARGUMENTS: [&'static str; 5] = ["-resize", "1920x>", "-quality", "85", "jpeg:-"];
    const LOGO_ARGUMENTS: [&'static str; 3] = ["-resize", "1200x>", "png:-"];

    pub fn to_png(&self, cover: &CoverSource) -> Result<Vec<u8>, String>
    {
        if let CoverSource::Icon { icon, name } = cover
        {
            return Self::icon_card(icon, name);
        }
        let source_bytes = Self::read_source(cover)?;
        Self::run_magick(source_bytes, &Self::COVER_ARGUMENTS)
    }

    /// Background picture as JPEG, cached (see `cached_conversion`).
    pub fn to_background_jpeg(&self, picture: &CoverSource, cache_name: &str) -> Result<Vec<u8>, String>
    {
        self.cached_conversion(picture, cache_name, "jpg", &Self::BACKGROUND_ARGUMENTS)
    }

    /// Logo as PNG, cached (see `cached_conversion`).
    pub fn to_logo_png(&self, logo: &CoverSource, cache_name: &str) -> Result<Vec<u8>, String>
    {
        self.cached_conversion(logo, cache_name, "png", &Self::LOGO_ARGUMENTS)
    }

    /// An uploaded picture (any format magick reads, phone photos turned upright) in the
    /// launcher's format for that kind of picture: "cover", "hero" or "logo".
    pub fn convert_upload(&self, upload_bytes: Vec<u8>, art_kind: &str) -> Result<Vec<u8>, String>
    {
        let output_arguments: &[&str] = match art_kind
        {
            "cover" => &Self::COVER_ARGUMENTS,
            "hero" => &Self::BACKGROUND_ARGUMENTS,
            _ => &Self::LOGO_ARGUMENTS,
        };
        let mut arguments = vec!["-auto-orient"];
        arguments.extend_from_slice(output_arguments);
        Self::run_magick(upload_bytes, &arguments).map_err(|_| RequestLanguage::pick("Das ist kein lesbares Bild", "That is not a readable image"))
    }

    /// Drops a cached conversion, e.g. when its override was replaced or removed.
    pub fn forget_cached(&self, cache_name: &str, extension: &str)
    {
        let _ = fs::remove_file(Self::cache_path(cache_name, extension));
    }

    /// Converted picture kept in ~/.cache/albedo-companion/<cache name>.<extension>.
    /// A file source is converted again when it is newer than the cached copy; a URL is downloaded once.
    fn cached_conversion(&self, picture: &CoverSource, cache_name: &str, extension: &str, output_arguments: &[&str]) -> Result<Vec<u8>, String>
    {
        let cache_directory = Self::cache_directory();
        let cache_path = Self::cache_path(cache_name, extension);
        if Self::cache_is_fresh(&cache_path, picture)
        {
            if let Ok(cached_bytes) = fs::read(&cache_path)
            {
                return Ok(cached_bytes);
            }
        }

        let source_bytes = Self::read_source(picture)?;
        let converted_bytes = Self::run_magick(source_bytes, output_arguments)?;
        // A failed cache write only costs a conversion next time.
        let _ = fs::create_dir_all(&cache_directory).and_then(|_| fs::write(&cache_path, &converted_bytes));
        Ok(converted_bytes)
    }

    fn cache_directory() -> PathBuf
    {
        home_directory().join(".cache/albedo-companion")
    }

    fn cache_path(cache_name: &str, extension: &str) -> PathBuf
    {
        Self::cache_directory().join(format!("{}.{}", Self::safe_file_name(cache_name), extension))
    }

    fn cache_is_fresh(cache_path: &Path, picture: &CoverSource) -> bool
    {
        let Ok(cache_time) = fs::metadata(cache_path).and_then(|metadata| metadata.modified())
        else
        {
            return false;
        };
        match picture
        {
            CoverSource::File(source_path) => fs::metadata(source_path)
                .and_then(|metadata| metadata.modified())
                .is_ok_and(|source_time| source_time <= cache_time),
            _ => true,
        }
    }

    fn read_source(picture: &CoverSource) -> Result<Vec<u8>, String>
    {
        match picture
        {
            CoverSource::None => Err(RequestLanguage::pick("Kein Bild vorhanden", "No image available")),
            CoverSource::File(picture_path) => fs::read(picture_path)
                .map_err(|error| format!("{} {}: {}", RequestLanguage::pick("Bild nicht lesbar:", "Cannot read image:"), picture_path.display(), error)),
            CoverSource::Url(picture_url) => Self::download(picture_url),
            CoverSource::Icon { icon, .. } => fs::read(icon).map_err(|error| format!("{} {}: {}", RequestLanguage::pick("Bild nicht lesbar:", "Cannot read image:"), icon.display(), error)),
        }
    }

    /// A 600x900 cover for a program without one: its icon big in the middle of a calm
    /// gradient, the name below. ImageMagick reads SVG icons too, so Sunshine gets a PNG as well.
    fn icon_card(icon_path: &Path, name: &str) -> Result<Vec<u8>, String>
    {
        let extension = icon_path.extension().and_then(|extension| extension.to_str()).unwrap_or("png").to_lowercase();
        let icon_input = format!("{}:-", extension);
        // caption: reads "@file" and expands "%" and "\\"; the name is only text.
        let caption = format!("caption:{}", name.trim_start_matches('@').replace('\\', "\\\\").replace('%', "%%"));
        let mut arguments: Vec<&str> = vec!["-size", "600x900", "gradient:#262c3a-#101319",
            "(", "-background", "none", "-density", "384", &icon_input, "-resize", "300x300", ")",
            "-gravity", "center", "-geometry", "+0-90", "-composite",
            "(", "-density", "72", "-background", "none", "-fill", "#e6e9f0", "-size", "500x150", "-pointsize", "44", "-gravity", "center", &caption, ")",
            "-gravity", "center", "-geometry", "+0+200", "-composite"];
        arguments.push("png:-");
        // Cached like logos: a whole program list would otherwise mean one magick run per card.
        let cache_path = Self::cache_path(&format!("icon-card-{}-{}", name, icon_path.display()), "png");
        if Self::cache_is_fresh(&cache_path, &CoverSource::File(icon_path.to_path_buf()))
        {
            if let Ok(cached_bytes) = fs::read(&cache_path)
            {
                return Ok(cached_bytes);
            }
        }
        let icon_bytes = fs::read(icon_path).map_err(|error| format!("{} {}: {}", RequestLanguage::pick("Bild nicht lesbar:", "Cannot read image:"), icon_path.display(), error))?;
        let card_bytes = Self::run_magick_with(icon_bytes, &arguments)?;
        let _ = fs::create_dir_all(Self::cache_directory()).and_then(|_| fs::write(&cache_path, &card_bytes));
        Ok(card_bytes)
    }

    /// Runs `magick - <output arguments>` with the source on stdin and returns stdout.
    fn run_magick(source_bytes: Vec<u8>, output_arguments: &[&str]) -> Result<Vec<u8>, String>
    {
        let mut arguments = vec!["-"];
        arguments.extend_from_slice(output_arguments);
        Self::run_magick_with(source_bytes, &arguments)
    }

    /// Runs `magick <arguments>` with the source on stdin (read where the arguments say `-`).
    fn run_magick_with(source_bytes: Vec<u8>, arguments: &[&str]) -> Result<Vec<u8>, String>
    {
        let mut magick_process = HostEnvironment::command("magick")
            .args(arguments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("ImageMagick (magick) nicht startbar", "Cannot start ImageMagick (magick)"), error))?;
        // Feed stdin from a thread so a big output cannot block the pipe.
        let mut magick_input = magick_process.stdin.take().expect("stdin is piped");
        let writer_thread = std::thread::spawn(move || magick_input.write_all(&source_bytes));
        let magick_output = magick_process.wait_with_output().map_err(|error| error.to_string())?;
        let _ = writer_thread.join();

        if !magick_output.status.success() || magick_output.stdout.is_empty()
        {
            return Err(RequestLanguage::pick("Bild konnte nicht umgewandelt werden", "Image could not be converted"));
        }
        Ok(magick_output.stdout)
    }

    /// Writes the PNG to ~/.config/sunshine/covers/<entry id>.png and returns the path.
    pub fn save_for_sunshine(&self, cover: &CoverSource, entry_id: &str) -> Result<PathBuf, String>
    {
        let png_bytes = self.to_png(cover)?;
        let cover_path = self.sunshine_cover_path(entry_id);
        if let Some(covers_directory) = cover_path.parent()
        {
            fs::create_dir_all(covers_directory).map_err(|error| error.to_string())?;
        }
        fs::write(&cover_path, png_bytes).map_err(|error| format!("{}: {}", RequestLanguage::pick("Cover nicht speicherbar", "Cannot store cover"), error))?;
        Ok(cover_path)
    }

    /// ~/.config/sunshine/covers/<entry id>.png
    pub fn sunshine_cover_path(&self, entry_id: &str) -> PathBuf
    {
        home_directory()
            .join(".config/sunshine/covers")
            .join(format!("{}.png", Self::safe_file_name(entry_id)))
    }

    /// Letters and digits stay, everything else becomes '-' (file names from entry ids).
    pub fn safe_file_name(name: &str) -> String
    {
        name.chars()
            .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
            .collect()
    }

    fn download(cover_url: &str) -> Result<Vec<u8>, String>
    {
        let curl_output = HostEnvironment::command("curl")
            .args(["-sfL", "--max-time", "15", cover_url])
            .output()
            .map_err(|error| format!("{}: {}", RequestLanguage::pick("curl nicht startbar", "Cannot start curl"), error))?;
        if !curl_output.status.success()
        {
            return Err(RequestLanguage::pick("Bild konnte nicht heruntergeladen werden", "Image could not be downloaded"));
        }
        Ok(curl_output.stdout)
    }
}
