use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

use crate::companion_config::home_directory;
use crate::display_target::DisplayTarget;

/// The display target of the stream that is about to start. The Deck sends it with
/// `POST /api/stream-display` right before it starts Moonlight; Sunshine's prep command
/// (`sunshine-match-client` → `albedo-companion display`) takes it moments later. Sunshine apps
/// stay the same for every profile this way, and apps created before the routes keep working.
pub struct StreamDisplayRequest;

impl StreamDisplayRequest
{
    const FILE: &'static str = ".local/state/albedo-stream-display.json";
    /// Older requests belong to a stream that never started (or to another client): ignored.
    const MAX_AGE_SECONDS: u64 = 120;

    pub fn save(target: DisplayTarget) -> Result<(), String>
    {
        let request_file = home_directory().join(Self::FILE);
        if let Some(state_directory) = request_file.parent()
        {
            std::fs::create_dir_all(state_directory).map_err(|error| error.to_string())?;
        }
        let request = json!({ "target": target.name(), "time": Self::now() });
        std::fs::write(&request_file, request.to_string()).map_err(|error| error.to_string())
    }

    /// The requested target, `Auto` when there is none or it is too old. A request counts for one
    /// stream only, so it is removed (unless `keep`, for dry runs).
    pub fn take(keep: bool) -> DisplayTarget
    {
        let request_file = home_directory().join(Self::FILE);
        let request_text = std::fs::read_to_string(&request_file).unwrap_or_default();
        if !keep
        {
            let _ = std::fs::remove_file(&request_file);
        }
        Self::target_of(&request_text, Self::now())
    }

    fn target_of(request_text: &str, now: u64) -> DisplayTarget
    {
        let Ok(request) = serde_json::from_str::<Value>(request_text) else
        {
            return DisplayTarget::Auto;
        };
        let age_seconds = now.saturating_sub(request["time"].as_u64().unwrap_or(0));
        if age_seconds > Self::MAX_AGE_SECONDS
        {
            return DisplayTarget::Auto;
        }
        request["target"].as_str().and_then(DisplayTarget::from_name).unwrap_or(DisplayTarget::Auto)
    }

    fn now() -> u64
    {
        SystemTime::now().duration_since(UNIX_EPOCH).map(|duration| duration.as_secs()).unwrap_or(0)
    }
}

#[cfg(test)]
mod tests
{
    use super::*;

    #[test]
    fn only_a_fresh_request_counts()
    {
        assert_eq!(StreamDisplayRequest::target_of("{\"target\":\"main\",\"time\":1000}", 1030), DisplayTarget::MainMonitor);
        assert_eq!(StreamDisplayRequest::target_of("{\"target\":\"main\",\"time\":1000}", 1500), DisplayTarget::Auto);
        assert_eq!(StreamDisplayRequest::target_of("{\"target\":\"sideways\",\"time\":1000}", 1000), DisplayTarget::Auto);
        assert_eq!(StreamDisplayRequest::target_of("", 1000), DisplayTarget::Auto);
    }
}
