#!/bin/bash
# Sets up the PC side of Albedo:
#   - the companion service (~/.local/bin, systemd user service), from the latest GitHub release
#   - optional: the PC app (~/Applications/Albedo-PC-x86_64.AppImage + menu entry)
# and the virtual streaming monitor and the automatic resolution switching for Sunshine
# on KDE Plasma (Wayland) with an AMD GPU:
#   - an EDID with the stream modes, forced onto a free connector at every boot (systemd, needs sudo)
#   - ~/.local/bin/sunshine-match-client (Sunshine prep command: switch / --restore)
#   - ~/.config/sunshine-match-client.conf (which connector is the virtual monitor)
#   - optional: Sunshine global_prep_cmd that stops xwaylandvideobridge during a stream
#
#   ./install.sh                         interactive, everything
#   ./install.sh --companion-only        only companion (and PC app), e.g. to update or without KDE
#   ./install.sh --pc-app                also install the PC app (updated on every run once installed)
#   ./install.sh --build                 build companion / PC app from this checkout (needs Rust, Node)
#   ./install.sh --connector DP-3        skip the connector question
#   ./install.sh --mode 3440x1440@100    add a mode to the EDID (repeatable)
#   ./install.sh --dry-run               only print what would be done
#   ./install.sh --uninstall             remove everything again (keeps the companion's config)
#   ALBEDO_RELEASE_URL=file:///some/dir ./install.sh   download from another place (testing)
set -euo pipefail

script_dir="$(dirname "$(realpath "$0")")"
config_file="$HOME/.config/sunshine-match-client.conf"
match_client_target="$HOME/.local/bin/sunshine-match-client"
saved_layout_file="$HOME/.local/state/sunshine-match-client-layout.json"
edid_target="/etc/virtual-display-edid.bin"
apply_script_target="/usr/local/bin/apply-virtual-display.sh"
service_name="virtual-display-edid.service"
service_target="/etc/systemd/system/$service_name"
xwayland_unit="app-org.kde.xwaylandvideobridge@autostart.service"
repo_dir="$(dirname "$script_dir")"
release_url="${ALBEDO_RELEASE_URL:-https://github.com/Dav1d-Fn/albedo/releases/latest/download}"
companion_archive="albedo-companion-x86_64-linux.tar.gz"
companion_name="albedo-companion"
companion_target="$HOME/.local/bin/$companion_name"
companion_unit_target="$HOME/.config/systemd/user/$companion_name.service"
# Name of the companion before the rename to Albedo: its service is replaced, its binary path
# stays as a link because Sunshine apps added back then call it in their undo step (the
# companion rewrites those steps on its next start, the link covers the time until then).
legacy_companion_name="streaming-launcher-companion"
legacy_companion_target="$HOME/.local/bin/$legacy_companion_name"
legacy_companion_unit_target="$HOME/.config/systemd/user/$legacy_companion_name.service"
pc_app_file="Albedo-PC-x86_64.AppImage"
pc_app_target="$HOME/Applications/$pc_app_file"
pc_app_desktop_entry="$HOME/.local/share/applications/albedo-pc.desktop"
pc_app_icon="$HOME/.local/share/icons/hicolor/128x128/apps/albedo-pc.png"
xwayland_prep_command="{\"do\":\"systemctl --user stop $xwayland_unit\",\"undo\":\"systemctl --user start --no-block $xwayland_unit\"}"

connector=""
extra_modes=()
dry_run=false
uninstall=false
companion_only=false
want_pc_app=false
build_locally=false
while [ $# -gt 0 ]
do
    case "$1" in
        --connector) connector="${2:?--connector needs a name, e.g. DP-3}"; shift ;;
        --mode) extra_modes+=("${2:?--mode needs WIDTHxHEIGHT@FPS}"); shift ;;
        --dry-run) dry_run=true ;;
        --uninstall) uninstall=true ;;
        --companion-only) companion_only=true ;;
        --pc-app) want_pc_app=true ;;
        --build) build_locally=true ;;
        -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
    esac
    shift
done

info()
{
    echo "==> $*"
}

warn()
{
    echo "!!  $*" >&2
}

# Runs a command, or only prints it with --dry-run
run()
{
    if $dry_run
    then
        echo "    [dry-run] $*"
    else
        "$@"
    fi
}

run_as_root()
{
    run sudo "$@"
}

ask_yes_no()
{
    local question="$1"
    local answer
    read -r -p "$question [y/N] " answer
    [[ "$answer" =~ ^[YyJj] ]]
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
if $uninstall
then
    if [ -f "$saved_layout_file" ] && [ -x "$match_client_target" ]
    then
        info "Restoring the screen layout saved before the last stream"
        run "$match_client_target" --restore || warn "Restore failed, set your screens up in the system settings"
    fi

    if [ -f "$service_target" ]
    then
        installed_connector=$(sed -n 's|^ExecStart=[^ ]* \([^ ]*\)$|\1|p' "$service_target")
        if [ -z "$installed_connector" ] && [ -f "$config_file" ]
        then
            installed_connector=$(sed -n 's/^VIRTUAL_OUTPUT=//p' "$config_file")
        fi
        info "Removing the virtual monitor ($installed_connector, needs sudo)"
        run_as_root systemctl disable --now "$service_name"
        if [ -n "$installed_connector" ] && [ -x "$apply_script_target" ]
        then
            run_as_root "$apply_script_target" "$installed_connector" off || true
        fi
        run_as_root rm -f "$service_target" "$apply_script_target" "$edid_target"
        run_as_root systemctl daemon-reload
    fi

    for unit_target in "$companion_unit_target" "$legacy_companion_unit_target"
    do
        if [ -f "$unit_target" ]
        then
            info "Removing the companion service $(basename "$unit_target") (its config in ~/.config/$companion_name/ stays)"
            run systemctl --user disable --now "$(basename "$unit_target")" || true
            run rm -f "$unit_target"
            run systemctl --user daemon-reload
        fi
    done
    run rm -f "$companion_target" "$legacy_companion_target" "$pc_app_target" "$pc_app_desktop_entry" "$pc_app_icon"

    info "Removing sunshine-match-client and its config"
    run rm -f "$match_client_target" "$config_file" "$saved_layout_file"

    echo
    info "Done. Left alone on purpose:"
    echo "    - Sunshine apps that run sunshine-match-client: their prep command now fails, so"
    echo "      remove them in Albedo (X in Add games) or edit them in Sunshine's web UI."
    echo "    - A global_prep_cmd for xwaylandvideobridge in sunshine.conf, if you added one."
    echo "    The connector may still show up until the next reboot."
    exit 0
fi

# ---------------------------------------------------------------------------
# Companion and PC app (no sudo). Running the script again updates them.
# ---------------------------------------------------------------------------
work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT

# Downloads a release file into the work dir and checks it against SHA256SUMS
download_release_file()
{
    local file_name="$1"
    if [ ! -f "$work_dir/SHA256SUMS" ]
    then
        if ! curl -fsSL -o "$work_dir/SHA256SUMS" "$release_url/SHA256SUMS"
        then
            warn "No release found at $release_url."
            warn "The repository may still be private, or there is no release with the PC files yet."
            warn "Developers can build from this checkout instead: ./install.sh --build (needs Rust and Node)."
            exit 1
        fi
    fi
    info "Downloading $file_name"
    curl -fL --progress-bar -o "$work_dir/$file_name" "$release_url/$file_name"
    if ! grep -q "  $file_name\$" "$work_dir/SHA256SUMS"
    then
        warn "$file_name is not listed in SHA256SUMS, not installing it."
        exit 1
    fi
    if ! (cd "$work_dir" && grep "  $file_name\$" SHA256SUMS | sha256sum --check --quiet -)
    then
        warn "Checksum of $file_name doesn't match, not installing it."
        exit 1
    fi
}

require_command()
{
    if ! command -v "$1" > /dev/null
    then
        warn "$1 is missing. $2"
        exit 1
    fi
}

info "Companion service"
if $dry_run
then
    echo "    [dry-run] get $companion_name ($($build_locally && echo "build from $repo_dir/companion" || echo "download from $release_url"))"
elif $build_locally
then
    require_command cargo "Install Rust (rustup.rs) or run without --build."
    (cd "$repo_dir/companion" && nice -n 19 cargo build --release --locked -j 4)
    mkdir -p "$work_dir/albedo-companion"
    cp "$repo_dir/companion/target/release/$companion_name" "$repo_dir/companion/$companion_name.service" "$work_dir/albedo-companion/"
else
    require_command curl "Please install it first."
    download_release_file "$companion_archive"
    tar -C "$work_dir" -xzf "$work_dir/$companion_archive"
fi
# install replaces the file instead of writing into it, so the running binary is not disturbed
run install -Dm 755 "$work_dir/albedo-companion/$companion_name" "$companion_target"
run install -Dm 644 "$work_dir/albedo-companion/$companion_name.service" "$companion_unit_target"
if [ -f "$legacy_companion_unit_target" ]
then
    # Stopped before the new one starts: both want port 47995. The new companion takes over
    # ~/.config/$legacy_companion_name/ (login, pictures, groups) on its first start.
    info "Replacing the old service $legacy_companion_name"
    run systemctl --user disable --now "$legacy_companion_name.service" || true
    run rm -f "$legacy_companion_unit_target"
fi
if [ -e "$legacy_companion_target" ] || [ -L "$legacy_companion_target" ]
then
    run ln -sfn "$companion_name" "$legacy_companion_target"
fi
run systemctl --user daemon-reload
run systemctl --user enable "$companion_name.service"
# restart, not start: an update must run the new binary now
run systemctl --user restart "$companion_name.service"
if ! $dry_run
then
    companion_health=""
    for attempt in 1 2 3 4 5
    do
        sleep 1
        companion_health=$(curl -fsS --max-time 2 http://127.0.0.1:47995/api/health 2>/dev/null) && break
    done
    if [ -n "$companion_health" ]
    then
        info "Companion is running: $companion_health"
    else
        warn "Companion doesn't answer on port 47995. See: journalctl --user -u $companion_name"
    fi
fi

# The PC app is updated on every run once it is installed
if [ -f "$pc_app_target" ]
then
    want_pc_app=true
fi
if $want_pc_app
then
    info "PC app"
    if $dry_run
    then
        echo "    [dry-run] get $pc_app_file and install it to $pc_app_target"
    else
        if $build_locally
        then
            require_command npm "Install Node.js or run without --build."
            if [ ! -d "$repo_dir/node_modules" ]
            then
                (cd "$repo_dir" && npm ci)
            fi
            (cd "$repo_dir/pc-app" && PATH="$repo_dir/node_modules/.bin:$PATH" CARGO_BUILD_JOBS=4 nice -n 19 tauri build --bundles appimage)
            cp "$repo_dir"/pc-app/src-tauri/target/release/bundle/appimage/*.AppImage "$work_dir/$pc_app_file"
        else
            download_release_file "$pc_app_file"
        fi
        install -Dm 755 "$work_dir/$pc_app_file" "$pc_app_target"
        # Menu entry with the icon from inside the AppImage (extracting needs no FUSE)
        icon_inside="usr/share/icons/hicolor/128x128/apps/albedo-pc.png"
        (cd "$work_dir" && "$pc_app_target" --appimage-extract "$icon_inside" > /dev/null 2>&1) || true
        if [ -f "$work_dir/squashfs-root/$icon_inside" ]
        then
            install -Dm 644 "$work_dir/squashfs-root/$icon_inside" "$pc_app_icon"
        fi
        mkdir -p "$(dirname "$pc_app_desktop_entry")"
        cat > "$pc_app_desktop_entry" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Albedo PC
Comment=Manage the games Albedo streams to the Steam Deck
Exec=$pc_app_target
Icon=albedo-pc
StartupWMClass=albedo-pc
Categories=Game;
DESKTOP
        info "Installed to $pc_app_target (menu: Albedo PC)"
    fi
fi

if $companion_only
then
    exit 0
fi

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------
info "Checking the system"
problems=0

if [[ "${XDG_CURRENT_DESKTOP:-}" != *KDE* ]]
then
    warn "Desktop is '${XDG_CURRENT_DESKTOP:-unknown}', not KDE Plasma. Switching uses kscreen-doctor, which only works on KDE."
    problems=$((problems + 1))
fi
if [ "${XDG_SESSION_TYPE:-}" != "wayland" ]
then
    warn "Session is '${XDG_SESSION_TYPE:-unknown}', not Wayland. Only Plasma on Wayland is tested."
    problems=$((problems + 1))
fi
if [ ! -d /sys/module/amdgpu ]
then
    warn "The amdgpu driver is not loaded. The EDID override is tested on AMD only; Intel may work, NVIDIA most likely doesn't."
    problems=$((problems + 1))
fi
for required_command in kscreen-doctor jq python3 sudo
do
    if ! command -v "$required_command" > /dev/null
    then
        warn "$required_command is missing, please install it first."
        exit 1
    fi
done
if [ "$problems" -gt 0 ] && ! ask_yes_no "Continue anyway?"
then
    exit 1
fi

# ---------------------------------------------------------------------------
# Connector
# ---------------------------------------------------------------------------
configured_connector=""
if [ -f "$config_file" ]
then
    configured_connector=$(sed -n 's/^VIRTUAL_OUTPUT=//p' "$config_file")
fi

if [ -z "$connector" ]
then
    # A free connector is one with no monitor plugged in. The one already set up shows up as
    # "connected" (it is forced on), so it is offered too.
    free_connectors=()
    for status_file in /sys/class/drm/card*-*/status
    do
        connector_name="$(basename "$(dirname "$status_file")")"
        connector_name="${connector_name#card*-}"
        if [[ "$connector_name" == Writeback* ]]
        then
            continue
        fi
        if [ "$(cat "$status_file")" = "disconnected" ] || [ "$connector_name" = "$configured_connector" ]
        then
            free_connectors+=("$connector_name")
        fi
    done

    if [ "${#free_connectors[@]}" -eq 0 ]
    then
        warn "No free connector found: every output has a monitor plugged in."
        exit 1
    fi

    echo
    echo "Free connectors (no monitor plugged in). Pick one you don't use; the virtual monitor"
    echo "lives there, so don't plug a real monitor into it later."
    if [ -n "$configured_connector" ]
    then
        echo "(Already set up: $configured_connector)"
    fi
    select picked_connector in "${free_connectors[@]}"
    do
        if [ -n "$picked_connector" ]
        then
            connector="$picked_connector"
            break
        fi
    done
fi

if ! compgen -G "/sys/class/drm/card*-$connector" > /dev/null
then
    warn "Connector $connector doesn't exist (see /sys/class/drm/)."
    exit 1
fi
info "Virtual monitor: $connector"

# ---------------------------------------------------------------------------
# EDID
# ---------------------------------------------------------------------------
extra_mode_arguments=()
for extra_mode in "${extra_modes[@]}"
do
    extra_mode_arguments+=(--mode "$extra_mode")
done
info "Building the EDID (modes: $(python3 "$script_dir/make-virtual-edid.py" --list) ${extra_modes[*]})"
python3 "$script_dir/make-virtual-edid.py" "${extra_mode_arguments[@]}" "$work_dir/virtual-display-edid.bin"

cat > "$work_dir/$service_name" <<UNIT
[Unit]
Description=Force custom EDID on $connector for the virtual Sunshine display
After=local-fs.target
Before=display-manager.service

[Service]
Type=oneshot
ExecStart=$apply_script_target $connector
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT

# ---------------------------------------------------------------------------
# System part (sudo)
# ---------------------------------------------------------------------------
info "Installing the EDID and the boot service (needs sudo)"
run_as_root install -m 644 "$work_dir/virtual-display-edid.bin" "$edid_target"
run_as_root install -m 755 "$script_dir/apply-virtual-display.sh" "$apply_script_target"
run_as_root install -m 644 "$work_dir/$service_name" "$service_target"
run_as_root systemctl daemon-reload
run_as_root systemctl enable "$service_name"
# restart, not start: a service that already ran must apply the new EDID now
run_as_root systemctl restart "$service_name"

# ---------------------------------------------------------------------------
# User part
# ---------------------------------------------------------------------------
info "Installing sunshine-match-client to $match_client_target"
run install -Dm 755 "$script_dir/sunshine-match-client" "$match_client_target"
if $dry_run
then
    echo "    [dry-run] write $config_file: VIRTUAL_OUTPUT=$connector"
else
    mkdir -p "$(dirname "$config_file")"
    printf '# Written by pc-setup/install.sh. Read by sunshine-match-client and the companion.\nVIRTUAL_OUTPUT=%s\n' "$connector" > "$config_file"
fi

# ---------------------------------------------------------------------------
# Optional: xwaylandvideobridge workaround
# ---------------------------------------------------------------------------
sunshine_config=""
for candidate in "$HOME/.config/sunshine/sunshine.conf" "$HOME/.var/app/dev.lizardbyte.app.Sunshine/config/sunshine/sunshine.conf"
do
    if [ -f "$candidate" ]
    then
        sunshine_config="$candidate"
        break
    fi
done

if command -v xwaylandvideobridge > /dev/null
then
    echo
    echo "Optional: xwaylandvideobridge workaround."
    echo "On the first connect after booting, KWin and Xwayland can deadlock while the monitors"
    echo "switch, because xwaylandvideobridge holds a screen cast open. The screen then freezes"
    echo "and the stream doesn't start. Stopping xwaylandvideobridge for the length of a stream"
    echo "avoids that (it only matters for screen sharing from X11 apps like Discord)."
    if [ -z "$sunshine_config" ]
    then
        echo "sunshine.conf not found. Add this to global_prep_cmd in Sunshine's web UI yourself:"
        echo "    $xwayland_prep_command"
    elif grep -q "xwaylandvideobridge" "$sunshine_config"
    then
        info "Already in $sunshine_config"
    elif grep -q "^global_prep_cmd" "$sunshine_config"
    then
        echo "$sunshine_config already has a global_prep_cmd. Add this entry to it yourself"
        echo "(Sunshine web UI → Configuration → General → Command Preparations):"
        echo "    $xwayland_prep_command"
    elif ask_yes_no "Add it to $sunshine_config?"
    then
        if $dry_run
        then
            echo "    [dry-run] append to $sunshine_config: global_prep_cmd = [$xwayland_prep_command]"
        else
            cp "$sunshine_config" "$sunshine_config.bak-$(date +%F)"
            echo "global_prep_cmd = [$xwayland_prep_command]" >> "$sunshine_config"
            info "Added. Restart Sunshine for it to take effect."
        fi
    fi
fi

# ---------------------------------------------------------------------------
# Check
# ---------------------------------------------------------------------------
echo
info "Monitors as KDE sees them now (kscreen-doctor -o):"
kscreen-doctor -o 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^Output:|Modes:" | sed 's/^/    /' || true
virtual_modes=$(kscreen-doctor -j 2>/dev/null | jq -r --arg out "$connector" \
    '.outputs[] | select(.name == $out) | [.modes[].name] | unique | join(" ")' || true)
echo
if [ -n "$virtual_modes" ]
then
    info "$connector has the modes: $virtual_modes"
    echo "    Albedo's companion and sunshine-match-client use these. Games you add in Albedo switch"
    echo "    to $connector when the stream starts and restore your screens when it ends."
else
    warn "$connector doesn't show up in KDE yet. Log out and back in (or reboot) and run"
    warn "kscreen-doctor -o again; it should list $connector with the modes above."
fi
