use serde_json::Value;

use crate::display_mode::DisplayMode;
use crate::display_output::DisplayOutput;
use crate::kde_display_backend::KdeDisplayBackend;
use crate::request_language::RequestLanguage;

/// The one place that knows how a desktop lists its outputs and modes, switches them and puts
/// them back. Only KDE Plasma (kscreen-doctor) exists so far; GNOME (`gdctl`), wlroots
/// (`wlr-randr`) or X11 (`xrandr`) would each be one more file implementing this trait, picked in
/// `for_this_desktop`.
///
/// Commands are returned as argument lists (program first) instead of being run right away, so
/// a dry run can print exactly what would happen.
pub trait DisplayBackend
{
    /// Short name for the API and the log, e.g. "kde".
    fn name(&self) -> &'static str;

    /// The current layout in the backend's own form. It is saved before a switch and handed
    /// back to `restore_commands` afterwards.
    fn read_layout(&self) -> Result<Value, String>;

    fn outputs(&self, layout: &Value) -> Vec<DisplayOutput>;

    /// Turns `output` on in `mode` as the only (and primary) monitor, every other output off.
    fn show_only_commands(&self, output: &DisplayOutput, mode: &DisplayMode, outputs: &[DisplayOutput]) -> Vec<Vec<String>>;

    /// Only changes the mode of `output`, everything else stays.
    fn set_mode_commands(&self, output: &DisplayOutput, mode: &DisplayMode) -> Vec<Vec<String>>;

    /// Puts the `saved` layout back, matched against the `live` one (outputs may have come or gone).
    fn restore_commands(&self, saved: &Value, live: &Value) -> Result<Vec<Vec<String>>, String>;

    fn run(&self, command: &[String]) -> Result<(), String>;
}

impl dyn DisplayBackend
{
    /// The backend of the desktop this PC runs, an error when there is none for it yet.
    pub fn for_this_desktop() -> Result<Box<dyn DisplayBackend>, String>
    {
        // Sunshine's service doesn't always have XDG_CURRENT_DESKTOP, so the tool decides.
        if Self::program_exists("kscreen-doctor")
        {
            return Ok(Box::new(KdeDisplayBackend));
        }
        Err(RequestLanguage::pick(
            "Bildschirme umschalten geht bisher nur unter KDE Plasma (kscreen-doctor fehlt)",
            "Switching monitors only works on KDE Plasma so far (kscreen-doctor missing)",
        ))
    }

    fn program_exists(program: &str) -> bool
    {
        let search_path = std::env::var_os("PATH").unwrap_or_default();
        std::env::split_paths(&search_path).any(|directory| directory.join(program).is_file())
    }
}
