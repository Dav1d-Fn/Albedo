use std::fs;
use std::path::Path;

/// Takes over a folder from the time the project was called "streaming-launcher".
/// A rename keeps every file with its mode (the companion's config.json stays 600) and leaves
/// no second copy of the Sunshine password behind. Also used by the companion via #[path].
pub struct LegacyDirectoryMover;

impl LegacyDirectoryMover
{
    /// Moves `old_directory` to `new_directory` when only the old one exists.
    /// Returns true when it moved; a folder that is already there is never touched.
    pub fn move_if_needed(old_directory: &Path, new_directory: &Path) -> Result<bool, String>
    {
        if new_directory.exists() || !old_directory.is_dir()
        {
            return Ok(false);
        }
        if let Some(parent_directory) = new_directory.parent()
        {
            fs::create_dir_all(parent_directory).map_err(|error| error.to_string())?;
        }
        fs::rename(old_directory, new_directory)
            .map_err(|error| format!("{} -> {}: {}", old_directory.display(), new_directory.display(), error))?;
        Ok(true)
    }
}

#[cfg(test)]
mod tests
{
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[test]
    fn moves_only_when_the_new_folder_is_missing()
    {
        let test_root = std::env::temp_dir().join(format!("legacy-directory-mover-{}", std::process::id()));
        let old_directory = test_root.join("old");
        let new_directory = test_root.join("nested/new");
        fs::create_dir_all(old_directory.join("art")).unwrap();
        fs::write(old_directory.join("config.json"), "{\"sunshineUser\":\"david\"}").unwrap();
        fs::set_permissions(old_directory.join("config.json"), fs::Permissions::from_mode(0o600)).unwrap();
        fs::write(old_directory.join("art/steam-1-cover.png"), "png").unwrap();

        assert!(LegacyDirectoryMover::move_if_needed(&old_directory, &new_directory).unwrap());
        assert!(!old_directory.exists());
        assert_eq!(fs::read_to_string(new_directory.join("config.json")).unwrap(), "{\"sunshineUser\":\"david\"}");
        assert_eq!(fs::metadata(new_directory.join("config.json")).unwrap().permissions().mode() & 0o777, 0o600);
        assert!(new_directory.join("art/steam-1-cover.png").exists());

        // Second start, or an old folder appearing again: the new folder wins and nothing moves.
        fs::create_dir_all(&old_directory).unwrap();
        assert!(!LegacyDirectoryMover::move_if_needed(&old_directory, &new_directory).unwrap());
        assert!(old_directory.exists());
        // Nothing to take over at all.
        assert!(!LegacyDirectoryMover::move_if_needed(&test_root.join("missing"), &test_root.join("other")).unwrap());

        fs::remove_dir_all(&test_root).unwrap();
    }
}
