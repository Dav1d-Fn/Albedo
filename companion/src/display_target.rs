/// Which monitor a stream uses on the PC, picked per profile on the Deck (`displayTarget` in its
/// settings, sent with `POST /api/stream-display` right before the stream starts).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DisplayTarget
{
    /// Whatever the PC is set up for: the virtual connector, else the dummy plug, else nothing.
    Auto,
    /// A free connector with a forced EDID (pc-setup/install.sh --virtual-monitor, AMD/Intel).
    Virtual,
    /// A real connector with an HDMI/DP dummy plug (pc-setup/install.sh --dummy-plug, any GPU).
    DummyPlug,
    /// No second output: the main monitor only changes its mode for the stream.
    MainMonitor,
    /// Nothing switches, the stream shows the desktop as it is.
    None,
}

impl DisplayTarget
{
    pub const ALL: [DisplayTarget; 5] = [DisplayTarget::Auto, DisplayTarget::Virtual, DisplayTarget::DummyPlug, DisplayTarget::MainMonitor, DisplayTarget::None];

    /// The name used in the API, the Deck's settings and the request file.
    pub fn name(&self) -> &'static str
    {
        match self
        {
            DisplayTarget::Auto => "auto",
            DisplayTarget::Virtual => "virtual",
            DisplayTarget::DummyPlug => "dummy",
            DisplayTarget::MainMonitor => "main",
            DisplayTarget::None => "none",
        }
    }

    pub fn from_name(name: &str) -> Option<DisplayTarget>
    {
        DisplayTarget::ALL.into_iter().find(|target| target.name() == name)
    }

    /// Virtual connector and dummy plug show only their own output during the stream; the main
    /// monitor keeps the other monitors as they are.
    pub fn is_exclusive(&self) -> bool
    {
        matches!(self, DisplayTarget::Virtual | DisplayTarget::DummyPlug)
    }
}
