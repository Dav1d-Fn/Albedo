use std::sync::Arc;

use albedo_companion_core::SelfUpdate;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};

use crate::companion_updater::CompanionUpdater;
use crate::main_window::MainWindow;

/// Icon in the system tray (KDE StatusNotifier): "Open" shows the window, "Quit" ends the app
/// and with it the companion API, "Update verfügbar" (only while there is one) installs it.
/// Linux trays only show the menu, so both clicks open it.
pub struct TrayIcon;

impl TrayIcon
{
    const TRAY_ID: &'static str = "albedo-companion";
    const OPEN_ID: &'static str = "open";
    const QUIT_ID: &'static str = "quit";
    const UPDATE_ID: &'static str = "update";

    pub fn create(app_handle: &AppHandle) -> tauri::Result<()>
    {
        let mut builder = TrayIconBuilder::with_id(Self::TRAY_ID)
            .tooltip("Albedo Companion")
            .menu(&Self::menu(app_handle, None)?)
            .show_menu_on_left_click(true)
            .on_menu_event(|app_handle, event| match event.id().as_ref()
            {
                Self::OPEN_ID => MainWindow::show(app_handle),
                Self::QUIT_ID => app_handle.exit(0),
                Self::UPDATE_ID =>
                {
                    if let Some(updater) = app_handle.try_state::<Arc<CompanionUpdater>>()
                    {
                        if let Err(message) = updater.request_install()
                        {
                            eprintln!("[updater] {}", message);
                        }
                    }
                }
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

    /// Adds or removes the "Update verfügbar" entry.
    pub fn show_update(app_handle: &AppHandle, available_version: Option<&str>)
    {
        let Some(tray) = app_handle.tray_by_id(Self::TRAY_ID)
        else
        {
            return;
        };
        match Self::menu(app_handle, available_version)
        {
            Ok(menu) =>
            {
                let _ = tray.set_menu(Some(menu));
            }
            Err(error) => eprintln!("[tray] {}", error),
        }
    }

    fn menu(app_handle: &AppHandle, available_version: Option<&str>) -> tauri::Result<Menu<tauri::Wry>>
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
        let Some(version) = available_version
        else
        {
            return Menu::with_items(app_handle, &[&open_item, &quit_item]);
        };
        let update_text = if german
        {
            format!("Update verfügbar ({}) – installieren", version)
        }
        else
        {
            format!("Update available ({}) – install", version)
        };
        let update_item = MenuItem::with_id(app_handle, Self::UPDATE_ID, update_text, true, None::<&str>)?;
        Menu::with_items(app_handle, &[&update_item, &open_item, &quit_item])
    }
}
