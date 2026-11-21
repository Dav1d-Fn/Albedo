use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use crate::companion_config::home_directory;
use crate::cover_source::CoverSource;

/// Turns any cover (jpg, png, web URL) into a 600x900 PNG with ImageMagick.
pub struct CoverConverter;

impl CoverConverter
{
    pub fn to_png(&self, cover: &CoverSource) -> Result<Vec<u8>, String>
    {
        let source_bytes = match cover
        {
            CoverSource::None => return Err("Kein Cover vorhanden".into()),
            CoverSource::File(cover_path) => fs::read(cover_path)
                .map_err(|error| format!("Cover {} nicht lesbar: {}", cover_path.display(), error))?,
            CoverSource::Url(cover_url) => Self::download(cover_url)?,
        };

        let mut magick_process = Command::new("magick")
            .args(["-", "-resize", "600x900^", "-gravity", "center", "-extent", "600x900", "png:-"])
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
            return Err("Cover konnte nicht umgewandelt werden".into());
        }
        Ok(magick_output.stdout)
    }

    /// Writes the PNG to ~/.config/sunshine/covers/<entry id>.png and returns the path.
    pub fn save_for_sunshine(&self, cover: &CoverSource, entry_id: &str) -> Result<PathBuf, String>
    {
        let png_bytes = self.to_png(cover)?;
        let covers_directory = home_directory().join(".config/sunshine/covers");
        fs::create_dir_all(&covers_directory).map_err(|error| error.to_string())?;
        let safe_file_name: String = entry_id
            .chars()
            .map(|character| if character.is_ascii_alphanumeric() { character } else { '-' })
            .collect();
        let cover_path = covers_directory.join(format!("{}.png", safe_file_name));
        fs::write(&cover_path, png_bytes).map_err(|error| format!("Cover nicht speicherbar: {}", error))?;
        Ok(cover_path)
    }

    fn download(cover_url: &str) -> Result<Vec<u8>, String>
    {
        let curl_output = Command::new("curl")
            .args(["-sfL", "--max-time", "15", cover_url])
            .output()
            .map_err(|error| format!("curl nicht startbar: {}", error))?;
        if !curl_output.status.success()
        {
            return Err("Cover konnte nicht heruntergeladen werden".into());
        }
        Ok(curl_output.stdout)
    }
}
