use std::ffi::OsStr;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Removes the AppImage's own environment from commands that start host programs.
///
/// The AppImage runtime points LD_LIBRARY_PATH, PATH, XDG_DATA_DIRS, GIO_MODULE_DIR and more
/// into its mount (/tmp/.mount_…). Host programs like `flatpak` then load the bundled, older
/// libraries and crash ("symbol lookup error"). LD_LIBRARY_PATH goes in any case: in Gaming Mode
/// Steam hands non-Steam games its runtime's paths (older glib), which broke `flatpak` the same way.
/// Children also leave the mount: no inherited keep-alive pipe, no working directory inside it,
/// otherwise a long running child (the updated Companion) keeps the old mount alive.
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
        // Host programs find their own libraries; whatever set this (AppImage, Steam) is not theirs.
        command.env_remove("LD_LIBRARY_PATH");

        let Some(app_dir) = std::env::var_os("APPDIR").map(|value| value.to_string_lossy().to_string()) else
        {
            return;
        };
        let current_dir = std::env::current_dir().unwrap_or_default();
        Self::leave_the_mount(command, &app_dir, &current_dir);

        for (variable_name, variable_value) in std::env::vars_os()
        {
            let variable_name = variable_name.to_string_lossy().to_string();
            let variable_value = variable_value.to_string_lossy().to_string();

            if variable_name == "LD_LIBRARY_PATH"
            {
                continue;
            }
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

    /// The AppImage runtime unmounts once every copy of its keep-alive pipe is closed, and it
    /// cannot while a process works inside the mount. Our own process starts in `$APPDIR/usr`
    /// and holds the pipe (fd 3 and up), and children would inherit both.
    fn leave_the_mount(command: &mut Command, app_dir: &str, current_dir: &Path)
    {
        if current_dir.starts_with(app_dir)
        {
            command.current_dir(std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/")));
        }
        // SAFETY: only an async-signal-safe syscall between fork and exec. Close-on-exec instead of
        // closing keeps std's own exec error pipe working; on old kernels this just does nothing.
        unsafe
        {
            command.pre_exec(||
            {
                libc::syscall(libc::SYS_close_range, 3 as libc::c_uint, libc::c_uint::MAX, libc::CLOSE_RANGE_CLOEXEC);
                Ok(())
            });
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
    fn always_drops_the_library_path()
    {
        let command = HostEnvironment::command("true");

        assert!(command.get_envs().any(|(name, value)| name == "LD_LIBRARY_PATH" && value.is_none()));
    }

    /// v0.2.1: after a self-update the old AppImage mount stayed, the new Companion held its pipe.
    #[test]
    fn children_leave_the_mount()
    {
        let file = std::fs::File::open("/dev/null").expect("dev null");
        // SAFETY: plain dup of an open descriptor; dup leaves out close-on-exec, like the runtime's pipe.
        let inherited_fd = unsafe { libc::dup(std::os::fd::AsRawFd::as_raw_fd(&file)) };
        let fd_is_open = format!("[ -e /proc/self/fd/{} ]", inherited_fd);

        let mut plain_command = Command::new("sh");
        plain_command.arg("-c").arg(&fd_is_open);
        assert!(plain_command.status().expect("sh").success(), "dup should be inherited without the helper");

        let mut command = Command::new("sh");
        command.arg("-c").arg(&fd_is_open);
        HostEnvironment::leave_the_mount(&mut command, APP_DIR, Path::new("/tmp/.mount_StreamAbc/usr"));
        assert!(!command.status().expect("sh").success());
        assert!(command.get_current_dir().is_some_and(|dir| !dir.starts_with(APP_DIR)));

        let mut outside_command = Command::new("true");
        HostEnvironment::leave_the_mount(&mut outside_command, APP_DIR, Path::new("/home/deck"));
        assert!(outside_command.get_current_dir().is_none());

        // SAFETY: closes the descriptor this test opened.
        unsafe { libc::close(inherited_fd) };
    }

    #[test]
    fn leaves_unrelated_variables_alone()
    {
        assert_eq!(HostEnvironment::without_app_dir("/home/deck", APP_DIR), CleanedValue::Unchanged);
    }
}
