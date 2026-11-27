use std::os::unix::process::CommandExt;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use albedo_companion_core::SelfUpdate;
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

use crate::host_environment::HostEnvironment;
use crate::tray_icon::TrayIcon;
use crate::ui_language::UiLanguage;

/// What the updater knows right now; `SelfUpdate::status` turns it into JSON.
struct UpdaterState
{
    /// "idle" | "available" | "postponed" | "downloading" | "installing" | "restarting" | "failed" | "unsupported"
    phase: &'static str,
    /// Version and release notes of the newer release, None while there is none.
    available: Option<(String, String)>,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
    message: String,
    install_requested: bool,
}

/// Self-update of Albedo Companion from its signed GitHub release (`latest-companion.json`, own
/// endpoint in tauri.conf.json, same signing key as the Deck app). Checks at start and every few
/// hours; installs only when asked (tray, window or Deck through `POST /api/update`) and never
/// while Sunshine runs a game. The updater replaces the AppImage at its path (`$APPIMAGE`, the
/// stable ~/Applications/Albedo-Companion-x86_64.AppImage the Sunshine undo steps call), then
/// the app starts again in the tray.
pub struct CompanionUpdater
{
    app_handle: AppHandle,
    state: Mutex<UpdaterState>,
    /// Wakes the worker thread at once when an install is requested.
    wake_sender: Sender<()>,
}

impl CompanionUpdater
{
    const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
    /// How often a postponed install looks again whether the game has ended.
    const WORKER_TICK: Duration = Duration::from_secs(60);
    /// Sunshine's plain HTTP port; `serverinfo` there answers without a client certificate.
    // ponytail: Sunshine's default port; read it from Sunshine's config if someone moves it.
    const SUNSHINE_SERVERINFO_URL: &'static str = "http://127.0.0.1:47989/serverinfo?uniqueid=0123456789ABCDEF";

    /// Starts the worker thread (check now, then every CHECK_INTERVAL). Outside an AppImage
    /// (`tauri dev`, rpm) there is nothing to replace: the state stays "unsupported".
    pub fn start(app_handle: AppHandle) -> Arc<CompanionUpdater>
    {
        let (wake_sender, wake_receiver) = channel();
        let runs_as_appimage = std::env::var_os("APPIMAGE").is_some();
        let updater = Arc::new(CompanionUpdater {
            app_handle,
            state: Mutex::new(UpdaterState {
                phase: if runs_as_appimage { "idle" } else { "unsupported" },
                available: None,
                downloaded_bytes: 0,
                total_bytes: None,
                message: String::new(),
                install_requested: false,
            }),
            wake_sender,
        });
        if runs_as_appimage
        {
            let worker = updater.clone();
            std::thread::spawn(move || worker.run_worker(wake_receiver));
        }
        updater
    }

    fn run_worker(&self, wake_receiver: Receiver<()>)
    {
        let mut last_check: Option<Instant> = None;
        loop
        {
            let check_due = last_check.map_or(true, |checked_at| checked_at.elapsed() >= Self::CHECK_INTERVAL);
            if check_due && !self.lock().install_requested
            {
                tauri::async_runtime::block_on(self.check());
                last_check = Some(Instant::now());
            }
            if self.lock().install_requested
            {
                if tauri::async_runtime::block_on(Self::sunshine_runs_a_game())
                {
                    self.set_phase("postponed", "");
                }
                else
                {
                    tauri::async_runtime::block_on(self.install());
                }
            }
            match wake_receiver.recv_timeout(Self::WORKER_TICK)
            {
                Ok(()) | Err(RecvTimeoutError::Timeout) =>
                {}
                Err(RecvTimeoutError::Disconnected) => return,
            }
        }
    }

    async fn check(&self)
    {
        let check_result = match self.app_handle.updater()
        {
            Ok(updater) => updater.check().await,
            Err(error) => Err(error),
        };
        let available = match check_result
        {
            Ok(Some(update)) => Some((update.version.clone(), update.body.clone().unwrap_or_default())),
            Ok(None) => None,
            Err(error) =>
            {
                // Offline or GitHub unreachable: keep what was known, try again next time.
                println!("[updater] check failed: {}", error);
                return;
            }
        };
        println!("[updater] check: {:?}", available.as_ref().map(|(version, _)| version));
        TrayIcon::show_update(&self.app_handle, available.as_ref().map(|(version, _)| version.as_str()));
        let mut state = self.lock();
        state.phase = if available.is_some() { "available" } else { "idle" };
        state.available = available;
    }

    /// Downloads, verifies the signature, swaps the AppImage and restarts. On failure the old
    /// AppImage stays (the plugin restores it) and the state says why.
    async fn install(&self)
    {
        let result = self.download_and_install().await;
        self.lock().install_requested = false;
        match result
        {
            Ok(()) =>
            {
                self.set_phase("restarting", "");
                println!("[updater] installed, restarting");
                if let Err(message) = self.restart_in_tray()
                {
                    self.set_phase("failed", &message);
                }
            }
            Err(message) =>
            {
                println!("[updater] install failed: {}", message);
                self.set_phase("failed", &message);
            }
        }
    }

    async fn download_and_install(&self) -> Result<(), String>
    {
        let updater = self.app_handle.updater().map_err(|error| error.to_string())?;
        let update = updater
            .check()
            .await
            .map_err(|error| error.to_string())?
            .ok_or_else(|| UiLanguage::pick("Kein Update mehr verfügbar", "No update available anymore"))?;
        println!("[updater] installing {}", update.version);
        {
            let mut state = self.lock();
            state.phase = "downloading";
            state.downloaded_bytes = 0;
            state.total_bytes = None;
            state.message.clear();
        }
        update
            .download_and_install(
                |chunk_length, content_length| {
                    let mut state = self.lock();
                    state.downloaded_bytes += chunk_length as u64;
                    state.total_bytes = content_length;
                },
                || self.set_phase("installing", ""),
            )
            .await
            .map_err(|error| error.to_string())
    }

    /// Starts the new AppImage with `--hidden` once this process is gone (single instance and the
    /// API port are free by then), then ends this one. Sunshine's undo steps start their own
    /// processes from the AppImage path, so a running stream is not touched.
    fn restart_in_tray(&self) -> Result<(), String>
    {
        let appimage_path = std::env::var("APPIMAGE").map_err(|error| error.to_string())?;
        let mut command = HostEnvironment::command("sh");
        command
            .arg("-c")
            .arg("while kill -0 \"$1\" 2>/dev/null; do sleep 0.2; done; exec \"$0\" --hidden")
            .arg(&appimage_path)
            .arg(std::process::id().to_string());
        // Own process group: not ended together with this process.
        command.process_group(0);
        command.spawn().map_err(|error| error.to_string())?;
        self.app_handle.exit(0);
        Ok(())
    }

    /// `currentgame` in Sunshine's serverinfo; Sunshine not answering counts as no game.
    async fn sunshine_runs_a_game() -> bool
    {
        let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(3)).build()
        else
        {
            return false;
        };
        let Ok(response) = client.get(Self::SUNSHINE_SERVERINFO_URL).send().await
        else
        {
            return false;
        };
        let serverinfo_xml = response.text().await.unwrap_or_default();
        Self::current_game_running(&serverinfo_xml)
    }

    /// `<currentgame>123</currentgame>`; "0" or missing = nothing runs.
    fn current_game_running(serverinfo_xml: &str) -> bool
    {
        let start_tag = "<currentgame>";
        let Some(tag_position) = serverinfo_xml.find(start_tag)
        else
        {
            return false;
        };
        let value_start = tag_position + start_tag.len();
        let value_length = serverinfo_xml[value_start..].find("</currentgame>").unwrap_or(0);
        let app_id = serverinfo_xml[value_start..value_start + value_length].trim();
        !app_id.is_empty() && app_id != "0"
    }

    fn set_phase(&self, phase: &'static str, message: &str)
    {
        let mut state = self.lock();
        state.phase = phase;
        state.message = message.to_string();
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, UpdaterState>
    {
        self.state.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl SelfUpdate for CompanionUpdater
{
    fn status(&self) -> Value
    {
        let state = self.lock();
        let busy = matches!(state.phase, "downloading" | "installing");
        json!({
            "version": self.app_handle.package_info().version.to_string(),
            "state": state.phase,
            "available": state.available.as_ref().map(|(version, notes)| json!({ "version": version, "notes": notes })),
            "progress": if busy { json!({ "downloaded": state.downloaded_bytes, "total": state.total_bytes }) } else { Value::Null },
            "message": state.message,
        })
    }

    fn request_install(&self) -> Result<(), String>
    {
        {
            let mut state = self.lock();
            if state.phase == "unsupported"
            {
                return Err(UiLanguage::pick(
                    "Selbst-Update nur im installierten AppImage",
                    "Self-update only works in the installed AppImage",
                ));
            }
            if state.available.is_none()
            {
                return Err(UiLanguage::pick("Kein Update verfügbar", "No update available"));
            }
            if state.install_requested || matches!(state.phase, "downloading" | "installing" | "restarting")
            {
                return Ok(());
            }
            state.install_requested = true;
            // A retry after a failure must not read as failed again before the worker starts.
            state.phase = "available";
            state.message.clear();
        }
        let _ = self.wake_sender.send(());
        Ok(())
    }
}

#[cfg(test)]
mod tests
{
    use super::CompanionUpdater;

    #[test]
    fn reads_current_game_from_serverinfo()
    {
        assert!(CompanionUpdater::current_game_running("<root><currentgame>231427376</currentgame></root>"));
        assert!(!CompanionUpdater::current_game_running("<root><currentgame>0</currentgame></root>"));
        assert!(!CompanionUpdater::current_game_running("<root/>"));
    }
}
