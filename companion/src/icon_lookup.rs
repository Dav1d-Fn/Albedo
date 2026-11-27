use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::companion_config::home_directory;

/// Finds a program's icon file by its `Icon=` name, roughly like the freedesktop icon theme spec:
/// the desktop's icon theme and the themes it inherits, then hicolor, then /usr/share/pixmaps.
/// Within a theme the biggest picture wins (SVG counts as the biggest).
/// Built once per library scan. Only the themes' `apps` folders are listed, not every file:
/// Papirus and Breeze together hold over 100 000 files.
pub struct IconLookup
{
    /// Theme name -> its `apps` folders ("hicolor/256x256/apps", "breeze/apps/48"), in `theme_order`.
    themes: HashMap<String, Vec<PathBuf>>,
    theme_order: Vec<String>,
    icon_directories: Vec<PathBuf>,
}

impl IconLookup
{
    const FILE_EXTENSIONS: [&'static str; 3] = ["svg", "png", "xpm"];

    pub fn new() -> IconLookup
    {
        let home = home_directory();
        let icon_directories = vec![
            home.join(".local/share/icons"),
            home.join(".icons"),
            home.join(".local/share/flatpak/exports/share/icons"),
            PathBuf::from("/var/lib/flatpak/exports/share/icons"),
            PathBuf::from("/usr/share/icons"),
        ];
        let current_theme = Self::current_theme(&home.join(".config/kdeglobals"));
        let mut lookup = IconLookup { themes: HashMap::new(), theme_order: Vec::new(), icon_directories };
        lookup.add_theme(&current_theme);
        lookup.add_theme("hicolor");
        lookup
    }

    /// The icon file for an `Icon=` value: an absolute path as it is, a name looked up in the themes.
    pub fn find(&self, icon_value: &str) -> Option<PathBuf>
    {
        let icon_value = icon_value.trim();
        if icon_value.is_empty()
        {
            return None;
        }
        let as_path = Path::new(icon_value);
        if as_path.is_absolute()
        {
            return as_path.is_file().then(|| as_path.to_path_buf());
        }
        for theme_name in &self.theme_order
        {
            let best_icon = self.themes.get(theme_name).into_iter().flatten()
                .flat_map(|apps_directory| Self::FILE_EXTENSIONS.iter().map(move |extension| apps_directory.join(format!("{}.{}", icon_value, extension))))
                .filter(|icon_path| icon_path.is_file())
                .max_by_key(|icon_path| Self::score(icon_path));
            if best_icon.is_some()
            {
                return best_icon;
            }
        }
        Self::FILE_EXTENSIONS
            .iter()
            .map(|extension| PathBuf::from("/usr/share/pixmaps").join(format!("{}.{}", icon_value, extension)))
            .find(|pixmap_path| pixmap_path.is_file())
    }

    /// `[Icons] Theme=` from kdeglobals; breeze when KDE never wrote one.
    fn current_theme(kdeglobals_path: &Path) -> String
    {
        let content = fs::read_to_string(kdeglobals_path).unwrap_or_default();
        let mut is_in_icons_section = false;
        for line in content.lines()
        {
            let line = line.trim();
            if line.starts_with('[')
            {
                is_in_icons_section = line == "[Icons]";
            }
            else if let (true, Some(theme_name)) = (is_in_icons_section, line.strip_prefix("Theme="))
            {
                return theme_name.trim().to_string();
            }
        }
        "breeze".to_string()
    }

    /// Adds the theme and, depth first, the themes its index.theme inherits.
    fn add_theme(&mut self, theme_name: &str)
    {
        if theme_name.is_empty() || self.theme_order.iter().any(|known| known == theme_name)
        {
            return;
        }
        self.theme_order.push(theme_name.to_string());
        let mut apps_directories = Vec::new();
        let mut inherited_themes = Vec::new();
        for icon_directory in self.icon_directories.clone()
        {
            let theme_directory = icon_directory.join(theme_name);
            apps_directories.extend(Self::apps_directories(&theme_directory));
            let index_content = fs::read_to_string(theme_directory.join("index.theme")).unwrap_or_default();
            if let Some(inherits_line) = index_content.lines().find_map(|line| line.trim().strip_prefix("Inherits="))
            {
                inherited_themes.extend(inherits_line.split(',').map(|name| name.trim().to_string()));
            }
        }
        self.themes.insert(theme_name.to_string(), apps_directories);
        for inherited_theme in inherited_themes
        {
            self.add_theme(&inherited_theme);
        }
    }

    /// `<size>/apps` (hicolor, Papirus) and `apps/<size>` (Breeze) below the theme folder.
    fn apps_directories(theme_directory: &Path) -> Vec<PathBuf>
    {
        let subdirectories = |directory: &Path| -> Vec<PathBuf>
        {
            fs::read_dir(directory)
                .map(|listing| listing.flatten().map(|entry| entry.path()).filter(|path| path.is_dir()).collect())
                .unwrap_or_default()
        };
        let mut apps_directories = Vec::new();
        for child in subdirectories(theme_directory)
        {
            if child.file_name().is_some_and(|name| name == "apps")
            {
                apps_directories.extend(subdirectories(&child));
            }
            else if child.join("apps").is_dir()
            {
                apps_directories.push(child.join("apps"));
            }
        }
        apps_directories
    }

    /// Bigger is better; SVG beats every bitmap ("scalable/apps/x.svg", Papirus' "64x64/apps/x.svg").
    fn score(icon_path: &Path) -> u32
    {
        let size = icon_path
            .components()
            .filter_map(|component| component.as_os_str().to_str())
            .filter_map(|component| component.split(['x', '@']).next().and_then(|number| number.parse::<u32>().ok()))
            .max()
            .unwrap_or(if icon_path.to_string_lossy().contains("scalable") { 512 } else { 0 });
        let is_svg = icon_path.extension().is_some_and(|extension| extension == "svg");
        size + if is_svg { 10_000 } else { 0 }
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn prefers_svg_and_big_pictures()
    {
        let icon_root = std::env::temp_dir().join(format!("albedo-icon-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&icon_root);
        for file in ["hicolor/48x48/apps/retroarch.png", "hicolor/256x256/apps/retroarch.png", "hicolor/scalable/apps/dolphin-emu.svg",
                     "hicolor/128x128/apps/dolphin-emu.png", "hicolor/48x48/actions/retroarch-symbolic.svg"]
        {
            let path = icon_root.join(file);
            fs::create_dir_all(path.parent().expect("parent")).expect("folder");
            fs::write(&path, b"icon").expect("file");
        }
        let mut lookup = IconLookup { themes: HashMap::new(), theme_order: Vec::new(), icon_directories: vec![icon_root.clone()] };
        lookup.add_theme("hicolor");

        assert!(lookup.find("retroarch").expect("retroarch").ends_with("256x256/apps/retroarch.png"));
        assert!(lookup.find("dolphin-emu").expect("dolphin").ends_with("scalable/apps/dolphin-emu.svg"));
        assert!(lookup.find("missing-program").is_none());
        let _ = fs::remove_dir_all(icon_root);
    }
}
