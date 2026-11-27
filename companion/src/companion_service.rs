use std::sync::Arc;

use crate::api_server::ApiServer;
use crate::companion_config::{home_directory, CompanionConfig};
use crate::legacy_directory_mover::LegacyDirectoryMover;
use crate::self_update::SelfUpdate;
use crate::sunshine_client::SunshineClient;

/// The whole companion for its host program (Albedo Companion): takes over old folders, loads the
/// config (writes a template on first start) and serves the API until the process ends.
pub struct CompanionService
{
    config: CompanionConfig,
    self_update: Option<Arc<dyn SelfUpdate>>,
}

impl CompanionService
{
    pub fn load() -> Result<CompanionService, String>
    {
        Self::move_legacy_directories();
        let config = CompanionConfig::load_or_create()?;
        Ok(CompanionService { config, self_update: None })
    }

    /// The host program's updater, offered as `GET/POST /api/update`.
    pub fn with_self_update(mut self, self_update: Arc<dyn SelfUpdate>) -> CompanionService
    {
        self.self_update = Some(self_update);
        self
    }

    /// Port of the API from config.json (47995 unless changed there).
    pub fn port(&self) -> u16
    {
        self.config.port
    }

    /// Serves the API; blocks, so the host program runs it on its own thread.
    /// Only returns with an error, e.g. when the port is taken.
    pub fn run(self) -> Result<(), String>
    {
        if self.config.has_sunshine_login()
        {
            // In the background: Sunshine may still be starting, the API must not wait for it.
            let sunshine = SunshineClient::new(self.config.clone());
            std::thread::spawn(move || ApiServer::migrate_apps(&sunshine));
        }
        ApiServer::new(self.config, self.self_update).run()
    }

    /// Config (Sunshine login, picture overrides, groups) and cache of the companion from before
    /// the rename to Albedo: moved once, the config keeps its mode 600.
    fn move_legacy_directories()
    {
        for base_directory in [".config", ".cache"]
        {
            // Old folder name, kept only for this move.
            let old_directory = home_directory().join(base_directory).join("streaming-launcher-companion");
            let new_directory = home_directory().join(base_directory).join("albedo-companion");
            match LegacyDirectoryMover::move_if_needed(&old_directory, &new_directory)
            {
                Ok(true) => eprintln!("Übernommen: {} -> {}", old_directory.display(), new_directory.display()),
                Ok(false) =>
                {}
                Err(message) => eprintln!("Alter Ordner nicht übernommen: {}", message),
            }
        }
    }
}
