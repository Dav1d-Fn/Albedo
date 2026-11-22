use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::AppHandle;

use crate::main_window::MainWindow;

/// Icon in the system tray (KDE StatusNotifier): "Open" shows the window, "Quit" ends the app
/// and with it the companion API. Linux trays only show the menu, so both clicks open it.
pub struct TrayIcon;

impl TrayIcon
{
    const OPEN_ID: &'static str = "open";
    const QUIT_ID: &'static str = "quit";

    pub fn create(app_handle: &AppHandle) -> tauri::Result<()>
    {
        // The tray exists before any window, so the system language decides, not the settings.
        let german = std::env::var("LANG").unwrap_or_default().starts_with("de");
        let (open_text, quit_text) = if german
        {
            ("Albedo Companion öffnen", "Beenden")
        }
        else
        {
            ("Open Albedo Companion", "Quit")
        };

        let open_item = MenuItem::with_id(app_handle, Self::OPEN_ID, open_text, true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app_handle, Self::QUIT_ID, quit_text, true, None::<&str>)?;
        let menu = Menu::with_items(app_handle, &[&open_item, &quit_item])?;

        let mut builder = TrayIconBuilder::with_id("albedo-companion")
            .tooltip("Albedo Companion")
            .menu(&menu)
            .show_menu_on_left_click(true)
            .on_menu_event(|app_handle, event| match event.id().as_ref()
            {
                Self::OPEN_ID => MainWindow::show(app_handle),
                Self::QUIT_ID => app_handle.exit(0),
                _ =>
                {}
            });
        if let Some(icon) = app_handle.default_window_icon()
        {
            builder = builder.icon(icon.clone());
        }
        builder.build(app_handle)?;
        Ok(())
    }
}
