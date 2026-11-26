use std::fs;
use std::path::PathBuf;

/// The PC app's UI language ("" = system, "de", "en") in ~/.config/albedo-companion/ui-language.
/// The webview's localStorage is not kept by release builds (WebKitGTK, tauri://localhost), so the
/// setting lives in a plain file next to the companion's config.
pub struct LanguageSettingFile;

impl LanguageSettingFile
{
    fn path() -> PathBuf
    {
        let home_directory = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
        PathBuf::from(home_directory).join(".config/albedo-companion/ui-language")
    }

    /// "" when nothing (or nothing known) was stored.
    pub fn load() -> String
    {
        let stored = fs::read_to_string(Self::path()).unwrap_or_default();
        match stored.trim()
        {
            "de" => "de".into(),
            "en" => "en".into(),
            _ => String::new(),
        }
    }

    pub fn save(language: &str) -> Result<(), String>
    {
        let file_path = Self::path();
        if let Some(directory) = file_path.parent()
        {
            fs::create_dir_all(directory).map_err(|error| error.to_string())?;
        }
        fs::write(&file_path, format!("{}\n", language)).map_err(|error| error.to_string())
    }
}
