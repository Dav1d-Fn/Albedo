mod api_server;
mod art_override_store;
mod binary_vdf_reader;
mod client_address_filter;
mod companion_config;
mod cover_converter;
mod cover_source;
mod desktop_file_source;
mod display_mode_reader;
mod group_override_store;
mod heroic_source;
mod library_entry;
mod library_entry_response;
mod library_scanner;
// Shared with the Deck launcher: takes over the folders from before the rename to Albedo.
#[path = "../../src-tauri/src/legacy_directory_mover.rs"]
mod legacy_directory_mover;
mod lutris_source;
mod preset_source;
mod process_quitter;
mod request_language;
mod shortcut_name_cleaner;
mod prism_source;
mod steam_grid_db_key_checker;
mod steam_shortcut_source;
mod steam_source;
mod sunshine_app_builder;
mod sunshine_client;
mod upload_page;
mod upload_qr_code;
mod upload_token_store;

use api_server::ApiServer;
use companion_config::{home_directory, CompanionConfig};
use legacy_directory_mover::LegacyDirectoryMover;
use sunshine_client::SunshineClient;
use process_quitter::ProcessQuitter;

/// Entry point: run the quit helper, or load the config (creates a template on first start) and serve the API.
fn main()
{
    // Undo step of a Sunshine app: `albedo-companion quit "<pattern>"`.
    let arguments: Vec<String> = std::env::args().collect();
    if arguments.len() == 3 && arguments[1] == "quit"
    {
        ProcessQuitter::new(&arguments[2]).quit();
        return;
    }

    move_legacy_directories();
    let config = match CompanionConfig::load_or_create()
    {
        Ok(config) => config,
        Err(message) =>
        {
            eprintln!("{}", message);
            std::process::exit(1);
        }
    };

    if config.has_sunshine_login()
    {
        // In the background: Sunshine may still be starting, the API must not wait for it.
        let sunshine = SunshineClient::new(config.clone());
        std::thread::spawn(move || ApiServer::migrate_apps(&sunshine));
    }

    let mut server = ApiServer::new(config);
    if let Err(message) = server.run()
    {
        eprintln!("{}", message);
        std::process::exit(1);
    }
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
