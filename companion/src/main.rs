mod api_server;
mod client_address_filter;
mod companion_config;
mod cover_converter;
mod cover_source;
mod desktop_file_source;
mod heroic_source;
mod library_entry;
mod library_entry_response;
mod library_scanner;
mod lutris_source;
mod preset_source;
mod prism_source;
mod steam_source;
mod sunshine_app_builder;
mod sunshine_client;

use api_server::ApiServer;
use companion_config::CompanionConfig;

/// Entry point: load the config (creates a template on first start) and serve the API.
fn main()
{
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
