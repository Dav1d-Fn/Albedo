use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};

use crate::display_backend::DisplayBackend;
use crate::display_setup::DisplaySetup;
use crate::display_target::DisplayTarget;
use crate::request_language::RequestLanguage;
use crate::stream_display_switcher::StreamDisplaySwitcher;

/// "Test" in Albedo Companion's display area: switches one route like a stream would, keeps it
/// for a few seconds and puts the layout back, with the same steps and rollback as a stream
/// (`StreamDisplaySwitcher`). Runs on its own thread; the window polls `status()`.
pub struct DisplayTestRunner
{
    /// `{ "state": "idle" | "switching" | "showing" | "restoring" | "done" | "unchanged" | "failed",
    ///    "target", "mode", "output", "secondsLeft", "message", "dryRun" }`
    status: Arc<Mutex<Value>>,
}

impl DisplayTestRunner
{
    const HOLD_SECONDS: u64 = 10;

    pub fn new() -> DisplayTestRunner
    {
        DisplayTestRunner { status: Arc::new(Mutex::new(json!({ "state": "idle" }))) }
    }

    pub fn status(&self) -> Value
    {
        self.status.lock().expect("status lock").clone()
    }

    /// Starts the test, `Err((status code, message))` when nothing was started.
    pub fn start(&self, target: DisplayTarget, width: u32, height: u32, refresh_rate: u32) -> Result<Value, (u16, String)>
    {
        let state = self.status()["state"].as_str().unwrap_or_default().to_string();
        if state == "switching" || state == "showing" || state == "restoring"
        {
            return Err((409, RequestLanguage::pick("Ein Test läuft schon", "A test is already running")));
        }
        let setup = DisplaySetup::load();
        let route_set_up = match target
        {
            DisplayTarget::Virtual => setup.virtual_output.is_some(),
            DisplayTarget::DummyPlug => setup.dummy_output.is_some(),
            DisplayTarget::MainMonitor => true,
            _ => false,
        };
        if !route_set_up
        {
            return Err((409, RequestLanguage::pick("Dieser Weg ist nicht eingerichtet", "This route is not set up")));
        }
        // The saved layout belongs to a running stream; a test would overwrite it.
        if StreamDisplaySwitcher::has_saved_layout()
        {
            return Err((409, RequestLanguage::pick(
                "Gerade ist ein Stream umgeschaltet (oder sein Zurückschalten fehlt). Erst nach dem Stream testen.",
                "A stream has the monitors switched right now (or its restore is missing). Test after the stream.",
            )));
        }
        // Checked here for a clear answer; the thread builds its own (a backend isn't Send).
        <dyn DisplayBackend>::for_this_desktop().map_err(|message| (502, message))?;
        let dry_run = std::env::var("ALBEDO_DRY_RUN").is_ok();
        let mode_text = format!("{}x{}@{}", width, height, refresh_rate);
        let german = RequestLanguage::is_german();

        *self.status.lock().expect("status lock") = json!({ "state": "switching", "target": target.name(), "mode": mode_text, "dryRun": dry_run });
        let status = self.status.clone();
        std::thread::spawn(move ||
        {
            let pick = |german_text: &str, english_text: &str| if german { german_text.to_string() } else { english_text.to_string() };
            let update = |change: Value|
            {
                let mut current = status.lock().expect("status lock");
                for (key, value) in change.as_object().expect("object")
                {
                    current[key] = value.clone();
                }
            };
            let backend = match <dyn DisplayBackend>::for_this_desktop()
            {
                Ok(backend) => backend,
                Err(message) =>
                {
                    update(json!({ "state": "failed", "message": message }));
                    return;
                }
            };
            let switcher = StreamDisplaySwitcher::new(backend, dry_run);
            match switcher.switch_to(&setup, target, width, height, refresh_rate)
            {
                Err(message) =>
                {
                    update(json!({ "state": "failed", "message": format!("{}: {}", pick("Umschalten fehlgeschlagen, alter Stand ist zurück", "Switching failed, the old layout is back"), message) }));
                }
                Ok(None) =>
                {
                    update(json!({ "state": "unchanged", "message": pick(
                        "Nichts umgeschaltet: Der Bildschirm hat keinen Modus in dieser Bildform (der Hauptmonitor behält dann seinen) oder ist schon so eingestellt.",
                        "Nothing switched: the monitor has no mode of that picture shape (the main monitor then keeps its own) or is set like that already.",
                    ) }));
                }
                Ok(Some(switched_to)) =>
                {
                    for seconds_left in (1..=Self::HOLD_SECONDS).rev()
                    {
                        update(json!({ "state": "showing", "output": switched_to, "secondsLeft": seconds_left }));
                        std::thread::sleep(Duration::from_secs(1));
                    }
                    update(json!({ "state": "restoring", "secondsLeft": 0 }));
                    match switcher.restore()
                    {
                        Ok(()) => update(json!({ "state": "done", "message": format!("{} {}, {}", pick("Umgeschaltet auf", "Switched to"), switched_to, pick("danach wieder zurück.", "then back again.")) })),
                        Err(message) => update(json!({ "state": "failed", "message": format!("{}: {} ({})", pick("Zurückschalten fehlgeschlagen", "Switching back failed"), message, pick("„sunshine-match-client --restore“ versucht es erneut", "\"sunshine-match-client --restore\" tries again")) })),
                    }
                }
            }
        });
        Ok(self.status())
    }
}
