mod companion_proxy;

// The picture search is the Deck launcher's (src-tauri), used as it is so both apps find the same pictures.
#[path = "../../../src-tauri/src/art_candidate.rs"]
mod art_candidate;
#[path = "../../../src-tauri/src/art_search.rs"]
mod art_search;
#[path = "../../../src-tauri/src/art_search_result.rs"]
mod art_search_result;
#[path = "../../../src-tauri/src/libretro_thumbnails.rs"]
mod libretro_thumbnails;
#[path = "../../../src-tauri/src/ui_language.rs"]
mod ui_language;

use percent_encoding::percent_decode_str;
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager};

use art_search::ArtSearch;
use art_search_result::ArtSearchResult;
use companion_proxy::CompanionProxy;
use ui_language::UiLanguage;

#[tauri::command]
fn set_language(language: String)
{
    UiLanguage::set(&language);
}

/// Any companion endpoint, e.g. ("GET", "api/library", None). The frontend knows the API.
#[tauri::command]
async fn companion(method: String, path: String, body: Option<Value>) -> Result<Value, String>
{
    let result = CompanionProxy::new()?.request(&method, &path, body).await;
    if let Err(message) = &result
    {
        println!("[companion] {} {} -> {}", method, path, message);
    }
    result
}

/// A picture file the user picked or dropped: raw bytes as body, entry id and kind as headers
/// (no JSON number array for up to 15 MB).
#[tauri::command]
async fn upload_art(request: Request<'_>) -> Result<(), String>
{
    let InvokeBody::Raw(image_bytes) = request.body()
    else
    {
        return Err("expected raw image bytes".into());
    };
    let header_text = |name: &str| -> Result<String, String> {
        let value = request
            .headers()
            .get(name)
            .ok_or(format!("header {} missing", name))?;
        let text = value.to_str().map_err(|error| error.to_string())?;
        // Header values only carry ASCII, so the frontend sends them with encodeURIComponent.
        Ok(percent_decode_str(text).decode_utf8_lossy().to_string())
    };
    let entry_id = header_text("entry-id")?;
    let kind = header_text("art-kind")?;
    let result = CompanionProxy::new()?
        .upload_art(&entry_id, &kind, image_bytes.clone())
        .await;
    println!(
        "[art] upload {} {} ({} bytes) -> {:?}",
        entry_id,
        kind,
        image_bytes.len(),
        result
    );
    result
}

/// Pictures of one kind from the Steam shop, libretro and, with a key, SteamGridDB. The key is never logged.
#[tauri::command]
async fn search_art(
    app_handle: AppHandle,
    game_name: String,
    entry_id: String,
    system: Option<String>,
    kind: String,
    steam_grid_db_key: String,
) -> Result<ArtSearchResult, String>
{
    let result = art_search(&app_handle)?
        .search(
            &game_name,
            &entry_id,
            system.as_deref(),
            &kind,
            &steam_grid_db_key,
        )
        .await;
    println!(
        "[art] search \"{}\" {} -> {} found, problem {:?}",
        game_name,
        kind,
        result.candidates.len(),
        result.problem
    );
    Ok(result)
}

/// Downloads the picked search result and hands it to the companion like a phone upload.
#[tauri::command]
async fn apply_art(
    app_handle: AppHandle,
    entry_id: String,
    kind: String,
    image_url: String,
) -> Result<(), String>
{
    let image_bytes = art_search(&app_handle)?.download(&image_url).await?;
    let result = CompanionProxy::new()?
        .upload_art(&entry_id, &kind, image_bytes)
        .await;
    println!(
        "[art] set {} {} from {} -> {:?}",
        entry_id, kind, image_url, result
    );
    result
}

fn art_search(app_handle: &AppHandle) -> Result<ArtSearch, String>
{
    let cache_directory = app_handle
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    ArtSearch::new(cache_directory.join("libretro"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run()
{
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            set_language,
            companion,
            upload_art,
            search_art,
            apply_art
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
