use std::ffi::OsStr;
use std::process::Command;

/// Removes the AppImage's own environment from commands that start host programs.
///
/// The AppImage runtime points LD_LIBRARY_PATH, PATH, XDG_DATA_DIRS, GIO_MODULE_DIR and more
/// into its mount (/tmp/.mount_…). Host programs like `flatpak` then load the bundled, older
/// libraries and crash ("symbol lookup error"). Outside an AppImage nothing is changed.
/// Every host program is started through `command()`; a test fails on a bare `Command::new`.
pub struct HostEnvironment;

impl HostEnvironment
{
    /// Variables the AppImage runtime adds that mean nothing to other programs.
    const APPIMAGE_ONLY_VARIABLES: [&'static str; 4] = ["APPDIR", "APPIMAGE", "ARGV0", "OWD"];

    /// `Command::new` with the AppImage's environment already removed.
    pub fn command(program: impl AsRef<OsStr>) -> Command
    {
        let mut command = Command::new(program);
        Self::apply_to(&mut command);
        command
    }

    pub fn apply_to(command: &mut Command)
    {
        let Some(app_dir) = std::env::var_os("APPDIR").map(|value| value.to_string_lossy().to_string()) else
        {
            return;
        };

        for (variable_name, variable_value) in std::env::vars_os()
        {
            let variable_name = variable_name.to_string_lossy().to_string();
            let variable_value = variable_value.to_string_lossy().to_string();

            if Self::APPIMAGE_ONLY_VARIABLES.contains(&variable_name.as_str())
            {
                command.env_remove(&variable_name);
                continue;
            }

            match Self::without_app_dir(&variable_value, &app_dir)
            {
                CleanedValue::Unchanged => {}
                CleanedValue::Removed =>
                {
                    command.env_remove(&variable_name);
                }
                CleanedValue::Replaced(cleaned_value) =>
                {
                    command.env(&variable_name, cleaned_value);
                }
            }
        }
    }

    /// Drops every colon separated entry that lies inside the AppImage mount.
    fn without_app_dir(variable_value: &str, app_dir: &str) -> CleanedValue
    {
        if !variable_value.contains(app_dir)
        {
            return CleanedValue::Unchanged;
        }

        let remaining_entries: Vec<&str> = variable_value
            .split(':')
            .filter(|entry| !entry.is_empty() && !entry.starts_with(app_dir))
            .collect();

        if remaining_entries.is_empty()
        {
            CleanedValue::Removed
        }
        else
        {
            CleanedValue::Replaced(remaining_entries.join(":"))
        }
    }
}

#[derive(Debug, PartialEq)]
enum CleanedValue
{
    Unchanged,
    Removed,
    Replaced(String),
}

#[cfg(test)]
mod tests
{
    use super::*;

    const APP_DIR: &str = "/tmp/.mount_StreamAbc";

    #[test]
    fn keeps_host_entries_of_path_lists()
    {
        let path = "/tmp/.mount_StreamAbc/usr/bin/:/tmp/.mount_StreamAbc/bin/:/usr/local/bin:/usr/bin";

        assert_eq!(HostEnvironment::without_app_dir(path, APP_DIR), CleanedValue::Replaced("/usr/local/bin:/usr/bin".into()));
    }

    #[test]
    fn removes_variables_that_only_point_into_the_appimage()
    {
        let library_path = "/tmp/.mount_StreamAbc/usr/lib/:/tmp/.mount_StreamAbc/lib64/:";

        assert_eq!(HostEnvironment::without_app_dir(library_path, APP_DIR), CleanedValue::Removed);
    }

    /// v0.2.0: curl started without this helper loaded the AppImage's libraries and crashed.
    #[test]
    fn every_host_program_is_started_through_the_helper()
    {
        let source_folder = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let bare_call = ["Command", "::new("].concat();
        for entry in std::fs::read_dir(&source_folder).expect("source folder")
        {
            let path = entry.expect("entry").path();
            if path.file_name().is_some_and(|name| name == "host_environment.rs")
            {
                continue;
            }
            let source = std::fs::read_to_string(&path).unwrap_or_default();
            assert!(!source.contains(&bare_call), "{} starts a program without HostEnvironment::command", path.display());
        }
    }

    #[test]
    fn leaves_unrelated_variables_alone()
    {
        assert_eq!(HostEnvironment::without_app_dir("/home/deck", APP_DIR), CleanedValue::Unchanged);
    }
}
