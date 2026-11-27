use serde_json::{json, Value};

/// One mode of a monitor output, as the display backend reports it.
#[derive(Debug, Clone, PartialEq)]
pub struct DisplayMode
{
    /// The backend's own id of the mode (kscreen-doctor: "12"), needed to switch to it.
    pub id: String,
    pub width: u32,
    pub height: u32,
    pub refresh_rate: f64,
}

impl DisplayMode
{
    pub fn rounded_refresh_rate(&self) -> u32
    {
        self.refresh_rate.round() as u32
    }

    /// "1280x800@90"
    pub fn text(&self) -> String
    {
        format!("{}x{}@{}", self.width, self.height, self.rounded_refresh_rate())
    }

    /// `{ "width", "height", "refreshRate" }`, refresh rate rounded, the API's form.
    pub fn to_json(&self) -> Value
    {
        json!({ "width": self.width, "height": self.height, "refreshRate": self.rounded_refresh_rate() })
    }
}
