use serde_json::Value;

/// Updating the program the companion runs in. The library crate cannot update itself: the host
/// program (Albedo Companion, pc-app/) checks GitHub for its signed release and installs it, and
/// hands itself to the API through this trait. Headless runs have none (`GET /api/update` then says
/// "unsupported").
pub trait SelfUpdate: Send + Sync
{
    /// `{ "version", "state", "available": { "version", "notes" } | null, "progress": { "downloaded", "total" } | null, "message" }`
    /// state: "idle" | "available" | "postponed" | "downloading" | "installing" | "restarting" | "failed" | "unsupported"
    fn status(&self) -> Value;

    /// Installs the available release in the background (later while a game runs on Sunshine).
    /// Only ever the signed release from the updater's own endpoint, never anything from a request.
    /// Err = nothing to install (no update known or self-update unsupported).
    fn request_install(&self) -> Result<(), String>;
}
