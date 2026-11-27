use std::path::PathBuf;

/// Where the cover image of a library entry comes from. Converted to PNG on demand.
#[derive(Clone)]
pub enum CoverSource
{
    None,
    File(PathBuf),
    Url(String),
    /// No real cover: a card made from the program's icon file with its name below.
    Icon { icon: PathBuf, name: String },
}
