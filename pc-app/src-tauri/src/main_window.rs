use tauri::{AppHandle, Manager, WebviewWindowBuilder};

/// The one window of Albedo PC. It only exists while it is open: closing destroys it with its
/// webview (the app keeps running in the tray), opening builds it again from tauri.conf.json.
pub struct MainWindow;

impl MainWindow
{
    const LABEL: &'static str = "main";

    pub fn show(app_handle: &AppHandle)
    {
        if let Some(window) = app_handle.get_webview_window(Self::LABEL)
        {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            return;
        }
        let Some(window_config) = app_handle.config().app.windows.first()
        else
        {
            eprintln!("[window] no window in tauri.conf.json");
            return;
        };
        let build_result = WebviewWindowBuilder::from_config(app_handle, window_config)
            .and_then(|builder| builder.build());
        if let Err(error) = build_result
        {
            eprintln!("[window] cannot open: {}", error);
        }
    }
}
