//! The companion as a library: Albedo Companion (pc-app/) runs its HTTP server in-process (companion/API.md).

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
// Shared with the Deck launcher: strips the AppImage's environment from host programs.
#[path = "../../src-tauri/src/host_environment.rs"]
mod host_environment;
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
mod steam_grid_db_client;
mod steam_shortcut_source;
mod steam_source;
mod sunshine_app_builder;
mod sunshine_client;
mod upload_page;
mod upload_qr_code;
mod upload_token_store;
mod virtual_edid_writer;

mod companion_service;

pub use companion_service::CompanionService;
pub use process_quitter::ProcessQuitter;

