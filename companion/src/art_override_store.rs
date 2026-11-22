use crate::request_language::RequestLanguage;
use std::fs;
use std::path::PathBuf;

use crate::companion_config::home_directory;
use crate::cover_converter::CoverConverter;
use crate::cover_source::CoverSource;
use crate::library_entry::LibraryEntry;

/// Pictures the user picked for an entry (uploaded from the phone), stored in
/// ~/.config/albedo-companion/art/<entry id>-<kind>.<png|jpg>.
/// They replace the automatic cover, hero or logo of that entry everywhere.
pub struct ArtOverrideStore;

impl ArtOverrideStore
{
    pub const ART_KINDS: [&'static str; 3] = ["cover", "hero", "logo"];

    pub fn is_art_kind(art_kind: &str) -> bool
    {
        Self::ART_KINDS.contains(&art_kind)
    }

    /// Puts the overrides of this entry in place of its automatic pictures.
    pub fn apply(&self, entry: &mut LibraryEntry)
    {
        for art_kind in Self::ART_KINDS
        {
            let override_path = Self::override_path(&entry.id, art_kind);
            if !override_path.exists()
            {
                continue;
            }
            let override_source = CoverSource::File(override_path);
            match art_kind
            {
                "cover" => entry.cover = override_source,
                "hero" => entry.hero = override_source,
                _ => entry.logo = override_source,
            }
        }
    }

    /// Kinds this entry has a picture set by hand for, e.g. ["hero"].
    pub fn custom_kinds(&self, entry_id: &str) -> Vec<String>
    {
        Self::ART_KINDS
            .iter()
            .filter(|art_kind| Self::override_path(entry_id, art_kind).exists())
            .map(|art_kind| art_kind.to_string())
            .collect()
    }

    /// Converts the upload to the launcher's format for that kind and stores it.
    pub fn save(&self, entry_id: &str, art_kind: &str, upload_bytes: Vec<u8>) -> Result<(), String>
    {
        let converted_bytes = CoverConverter.convert_upload(upload_bytes, art_kind)?;
        let override_path = Self::override_path(entry_id, art_kind);
        if let Some(art_directory) = override_path.parent()
        {
            fs::create_dir_all(art_directory).map_err(|error| error.to_string())?;
        }
        fs::write(&override_path, converted_bytes).map_err(|error| format!("{}: {}", RequestLanguage::pick("Bild nicht speicherbar", "Cannot store image"), error))?;
        Self::forget_cached_conversion(entry_id, art_kind);
        Ok(())
    }

    /// Back to the automatic picture. Removing a missing override is fine.
    pub fn remove(&self, entry_id: &str, art_kind: &str)
    {
        let _ = fs::remove_file(Self::override_path(entry_id, art_kind));
        Self::forget_cached_conversion(entry_id, art_kind);
    }

    /// The cache would otherwise keep serving the previous picture (a URL source counts as fresh forever).
    fn forget_cached_conversion(entry_id: &str, art_kind: &str)
    {
        match art_kind
        {
            "hero" => CoverConverter.forget_cached(&format!("hero-{}", entry_id), "jpg"),
            "logo" => CoverConverter.forget_cached(&format!("logo-{}", entry_id), "png"),
            _ => {} // covers are not cached
        }
    }

    fn override_path(entry_id: &str, art_kind: &str) -> PathBuf
    {
        let extension = if art_kind == "hero" { "jpg" } else { "png" };
        home_directory()
            .join(".config/albedo-companion/art")
            .join(format!("{}-{}.{}", CoverConverter::safe_file_name(entry_id), art_kind, extension))
    }
}
