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
mod lutris_source;
mod preset_source;
mod prism_source;
mod process_quitter;
mod request_language;
mod shortcut_name_cleaner;
mod steam_grid_db_key_checker;
mod steam_shortcut_source;
mod steam_source;
mod sunshine_app_builder;
mod sunshine_client;
mod upload_page;
mod upload_qr_code;
mod upload_token_store;

use api_server::ApiServer;
use companion_config::CompanionConfig;
use process_quitter::ProcessQuitter;

/// Entry point: run the quit helper, or load the config (creates a template on first start) and serve the API.
fn main()
{
    // Undo step of a Sunshine app: `streaming-launcher-companion quit "<pattern>"`.
    let arguments: Vec<String> = std::env::args().collect();
    if arguments.len() == 3 && arguments[1] == "quit"
    {
        ProcessQuitter::new(&arguments[2]).quit();
        return;
    }

    let config = match CompanionConfig::load_or_create()
    {
        Ok(config) => config,
        Err(message) =>
        {
            eprintln!("{}", message);
            std::process::exit(1);
        }
    };

    let mut server = ApiServer::new(config);
    if let Err(message) = server.run()
    {
        eprintln!("{}", message);
        std::process::exit(1);
    }
}
