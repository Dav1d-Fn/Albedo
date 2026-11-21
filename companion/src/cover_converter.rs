use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;

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
        Self::run_magick(upload_bytes, &arguments).map_err(|_| "Das ist kein lesbares Bild".to_string())
    }

    /// Drops a cached conversion, e.g. when its override was replaced or removed.
    pub fn forget_cached(&self, cache_name: &str, extension: &str)
    {
        let _ = fs::remove_file(Self::cache_path(cache_name, extension));
    }

    /// Converted picture kept in ~/.cache/streaming-launcher-companion/<cache name>.<extension>.
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
        home_directory().join(".cache/streaming-launcher-companion")
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
            CoverSource::None => Err("Kein Bild vorhanden".into()),
            CoverSource::File(picture_path) => fs::read(picture_path)
                .map_err(|error| format!("Bild {} nicht lesbar: {}", picture_path.display(), error)),
            CoverSource::Url(picture_url) => Self::download(picture_url),
        }
    }

    /// Runs `magick - <output arguments>` with the source on stdin and returns stdout.
    fn run_magick(source_bytes: Vec<u8>, output_arguments: &[&str]) -> Result<Vec<u8>, String>
    {
        let mut magick_process = Command::new("magick")
            .arg("-")
            .args(output_arguments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| format!("ImageMagick (magick) nicht startbar: {}", error))?;
        // Feed stdin from a thread so a big output cannot block the pipe.
        let mut magick_input = magick_process.stdin.take().expect("stdin is piped");
        let writer_thread = std::thread::spawn(move || magick_input.write_all(&source_bytes));
        let magick_output = magick_process.wait_with_output().map_err(|error| error.to_string())?;
        let _ = writer_thread.join();

        if !magick_output.status.success() || magick_output.stdout.is_empty()
        {
            return Err("Bild konnte nicht umgewandelt werden".into());
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
        fs::write(&cover_path, png_bytes).map_err(|error| format!("Cover nicht speicherbar: {}", error))?;
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
        let curl_output = Command::new("curl")
            .args(["-sfL", "--max-time", "15", cover_url])
            .output()
            .map_err(|error| format!("curl nicht startbar: {}", error))?;
        if !curl_output.status.success()
        {
            return Err("Bild konnte nicht heruntergeladen werden".into());
        }
        Ok(curl_output.stdout)
    }
}
