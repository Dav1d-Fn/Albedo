use std::path::PathBuf;

/// Where the cover image of a library entry comes from. Converted to PNG on demand.
#[derive(Clone)]
pub enum CoverSource
{
    None,
    File(PathBuf),
    Url(String),
}
