#!/bin/bash
# Sets up the PC side of Albedo.
#
# Default: Albedo Companion (~/Applications/Albedo-Companion-x86_64.AppImage, menu entry,
# autostart at login in the tray) from the latest GitHub release, checked against SHA256SUMS.
# It serves the API the Deck talks to, and ~/.local/bin/sunshine-match-client, the Sunshine prep
# command that switches the stream's monitor (KDE Plasma). Running the script again updates it. No sudo.
#
# The monitor a stream uses is picked per profile on the Deck. Three routes on the PC:
#   main monitor     needs nothing more: it only changes its resolution for the stream
#   --dummy-plug     a connector with an HDMI/DP dummy plug (any GPU, recommended for NVIDIA)
#   --virtual-monitor  a free connector with a forced EDID, no plug needed (AMD, Intel may work)
#
#   curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash
#   … | bash -s -- --uninstall           remove everything again (keeps ~/.config/albedo-companion/)
#
# Opt-in, KDE Plasma (Wayland) with an AMD GPU: --virtual-monitor also sets up the virtual
# streaming monitor and the automatic resolution switching for Sunshine (needs sudo):
#   - an EDID with the stream modes, forced onto a free connector at every boot (systemd)
#   - ~/.local/bin/sunshine-match-client (Sunshine prep command: switch / --restore)
#   - ~/.config/sunshine-match-client.conf (which connector is the virtual monitor)
#   - optional: Sunshine global_prep_cmd that stops xwaylandvideobridge during a stream
#
#   --dummy-plug HDMI-A-1         use the connector with a dummy plug for streaming (no sudo)
#   --virtual-monitor             also the virtual monitor (helper files come from GitHub when piped)
#   --connector DP-3              skip the connector question (implies --virtual-monitor)
#   --mode 3440x1440@100          add a mode to the EDID, repeatable (implies --virtual-monitor)
#   --build                       build Albedo Companion from this checkout (needs Rust, Node)
#   --dry-run                     only print what would be done
#   --uninstall                   remove everything again (keeps ~/.config/albedo-companion/)
#   --remove-virtual-monitor      remove only the virtual monitor (EDID, boot service, VIRTUAL_OUTPUT)
#   ALBEDO_RELEASE_URL=file:///some/dir   download the release from another place (testing)
#   ALBEDO_RAW_URL=file:///repo/pc-setup  fetch the helper files from another place (testing)
set -euo pipefail

# Empty when the script comes through a pipe (curl … | bash): then there is no checkout around it.
script_dir=""
if [ -f "${BASH_SOURCE[0]:-}" ]
then
    script_dir="$(dirname "$(realpath "${BASH_SOURCE[0]}")")"
fi
config_file="$HOME/.config/sunshine-match-client.conf"
match_client_target="$HOME/.local/bin/sunshine-match-client"
saved_layout_file="$HOME/.local/state/sunshine-match-client-layout.json"
edid_target="/etc/virtual-display-edid.bin"
apply_script_target="/usr/local/bin/apply-virtual-display.sh"
service_name="virtual-display-edid.service"
service_target="/etc/systemd/system/$service_name"
xwayland_unit="app-org.kde.xwaylandvideobridge@autostart.service"
repo_dir="$(dirname "${script_dir:-/nonexistent/pc-setup}")"
release_url="${ALBEDO_RELEASE_URL:-https://github.com/Dav1d-Fn/Albedo/releases/latest/download}"
raw_url="${ALBEDO_RAW_URL:-https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup}"
helper_files=("make-virtual-edid.py" "apply-virtual-display.sh" "sunshine-match-client")
app_file="Albedo-Companion-x86_64.AppImage"
app_target="$HOME/Applications/$app_file"
app_desktop_entry="$HOME/.local/share/applications/albedo-companion.desktop"
app_autostart_entry="$HOME/.config/autostart/albedo-companion.desktop"
app_icon="$HOME/.local/share/icons/hicolor/128x128/apps/albedo-companion.png"
# The companion used to be a separate systemd user service, first as streaming-launcher-companion,
# then as albedo-companion; the app replaces both. Their binary paths stay as links to the
# AppImage because Sunshine apps added back then call them in their undo step (the app rewrites
# those steps on its next start, the links cover the time until then). The config stays in
# ~/.config/albedo-companion/.
old_companion_names=("albedo-companion" "streaming-launcher-companion")
# Files of the separate "Albedo PC" app from before it was renamed and merged into the companion.
old_app_files=(
    "$HOME/Applications/Albedo-PC-x86_64.AppImage"
    "$HOME/.local/share/applications/albedo-pc.desktop"
    "$HOME/.config/autostart/albedo-pc.desktop"
    "$HOME/.local/share/icons/hicolor/128x128/apps/albedo-pc.png"
)
xwayland_prep_command="{\"do\":\"systemctl --user stop $xwayland_unit\",\"undo\":\"systemctl --user start --no-block $xwayland_unit\"}"

connector=""
dummy_connector=""
extra_modes=()
dry_run=false
uninstall=false
remove_virtual=false
virtual_monitor=false
build_locally=false
while [ $# -gt 0 ]
do
    case "$1" in
        --virtual-monitor) virtual_monitor=true ;;
        --connector) connector="${2:?--connector needs a name, e.g. DP-3}"; virtual_monitor=true; shift ;;
        --dummy-plug) dummy_connector="${2:?--dummy-plug needs a connector name, e.g. HDMI-A-1}"; shift ;;
        --mode) extra_modes+=("${2:?--mode needs WIDTHxHEIGHT@FPS}"); virtual_monitor=true; shift ;;
        --dry-run) dry_run=true ;;
        --uninstall) uninstall=true ;;
        --remove-virtual-monitor) remove_virtual=true ;;
        --companion-only|--pc-app) ;; # the default now, kept so old command lines still work
        --build) build_locally=true ;;
        -h|--help)
            if [ -n "$script_dir" ]
            then
                sed -n '2,33p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            else
                echo "See https://github.com/Dav1d-Fn/Albedo/blob/main/pc-setup/install.sh"
            fi
            exit 0 ;;
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

# Sets KEY=value in sunshine-match-client.conf, keeping the other lines (virtual monitor and
# dummy plug can both be set up).
set_config_value()
{
    local key="$1"
    local value="$2"
    if $dry_run
    then
        echo "    [dry-run] write $config_file: $key=$value"
        return
    fi
    mkdir -p "$(dirname "$config_file")"
    if [ ! -f "$config_file" ]
    then
        printf '# Written by pc-setup/install.sh. Read by sunshine-match-client and the companion.\n' > "$config_file"
    fi
    local other_lines
    other_lines=$(grep -v "^$key=" "$config_file" || true)
    printf '%s\n%s=%s\n' "$other_lines" "$key" "$value" > "$config_file"
}

# Removes the virtual monitor's system part (needs sudo): boot service, apply script, EDID.
remove_virtual_monitor()
{
    local installed_connector
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
}

# Removes KEY= from sunshine-match-client.conf, keeping the other lines.
remove_config_value()
{
    local key="$1"
    if [ ! -f "$config_file" ]
    then
        return
    fi
    if $dry_run
    then
        echo "    [dry-run] remove $key from $config_file"
        return
    fi
    local other_lines
    other_lines=$(grep -v "^$key=" "$config_file" || true)
    printf '%s\n' "$other_lines" > "$config_file"
}

# Fetches a helper file of pc-setup/ into $script_dir: next to the script in a checkout, else from GitHub
fetch_helper_file()
{
    local helper_file="$1"
    if [ -n "$script_dir" ] && [ -f "$script_dir/$helper_file" ]
    then
        return
    fi
    if [ -z "$script_dir" ] || [ "$script_dir" != "$work_dir/pc-setup" ]
    then
        script_dir="$work_dir/pc-setup"
        mkdir -p "$script_dir"
    fi
    info "Downloading $helper_file"
    curl -fsSL -o "$script_dir/$helper_file" "$raw_url/$helper_file"
}

ask_yes_no()
{
    local question="$1"
    local answer
    # From the terminal: with curl … | bash, stdin is the script itself.
    read -r -p "$question [y/N] " answer < /dev/tty
    [[ "$answer" =~ ^[YyJj] ]]
}

# Stops and removes the separate companion services from before the app (they hold port 47995)
# and the files of the old "Albedo PC" app.
remove_old_companion_services()
{
    local old_name unit_target
    for old_name in "${old_companion_names[@]}"
    do
        unit_target="$HOME/.config/systemd/user/$old_name.service"
        if [ -f "$unit_target" ]
        then
            info "Removing the old companion service $old_name (Albedo Companion replaces it)"
            run systemctl --user disable --now "$old_name.service" || true
            run rm -f "$unit_target"
            run systemctl --user daemon-reload
        fi
    done
    local old_file
    for old_file in "${old_app_files[@]}"
    do
        if [ -e "$old_file" ]
        then
            info "Removing $old_file (old Albedo PC)"
            run rm -f "$old_file"
        fi
    done
}

# ---------------------------------------------------------------------------
# Remove only the virtual monitor (Albedo Companion shows this command)
# ---------------------------------------------------------------------------
if $remove_virtual
then
    if [ ! -f "$service_target" ]
    then
        info "No virtual monitor installed ($service_target missing)"
    fi
    remove_virtual_monitor
    remove_config_value VIRTUAL_OUTPUT
    info "Done. Streams use the dummy plug or the main monitor now, as picked in the Deck profile."
    exit 0
fi

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

    remove_virtual_monitor

    remove_old_companion_services
    if [ -x "$app_target" ]
    then
        info "Ending and removing Albedo Companion (its config in ~/.config/albedo-companion/ stays)"
        run "$app_target" --exit > /dev/null 2>&1 || true
    fi
    run rm -f "$app_target" "$app_desktop_entry" "$app_autostart_entry" "$app_icon"
    for old_name in "${old_companion_names[@]}"
    do
        run rm -f "$HOME/.local/bin/$old_name"
    done

    if [ -e "$match_client_target" ] || [ -e "$config_file" ]
    then
        info "Removing sunshine-match-client and its config"
        run rm -f "$match_client_target" "$config_file" "$saved_layout_file"
    fi

    echo
    info "Done. Left alone on purpose:"
    echo "    - Sunshine apps that run sunshine-match-client: their prep command now fails, so"
    echo "      remove them in Albedo (X in Add games) or edit them in Sunshine's web UI."
    echo "    - A global_prep_cmd for xwaylandvideobridge in sunshine.conf, if you added one."
    echo "    The connector may still show up until the next reboot."
    exit 0
fi

# ---------------------------------------------------------------------------
# Albedo Companion (no sudo). Running the script again updates it.
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

info "Albedo Companion"
if $build_locally && [ ! -f "$repo_dir/pc-app/package.json" ]
then
    warn "--build needs a checkout: git clone https://github.com/Dav1d-Fn/Albedo.git and run pc-setup/install.sh there."
    exit 1
fi
if $dry_run
then
    echo "    [dry-run] get $app_file ($($build_locally && echo "build from $repo_dir/pc-app" || echo "download from $release_url"))"
elif $build_locally
then
    require_command cargo "Install Rust (rustup.rs) or run without --build."
    require_command npm "Install Node.js or run without --build."
    if [ ! -d "$repo_dir/node_modules" ]
    then
        (cd "$repo_dir" && npm ci)
    fi
    (cd "$repo_dir/pc-app" && PATH="$repo_dir/node_modules/.bin:$PATH" CARGO_BUILD_JOBS=4 nice -n 19 tauri build --bundles appimage)
    cp "$repo_dir"/pc-app/src-tauri/target/release/bundle/appimage/*.AppImage "$work_dir/$app_file"
else
    require_command curl "Please install it first."
    download_release_file "$app_file"
fi

remove_old_companion_services
# install replaces the file instead of writing into it, so a running instance is not disturbed
run install -Dm 755 "$work_dir/$app_file" "$app_target"
# An update must run the new version: the running one ends (--exit reaches it as a second start
# of the single instance; with none running it does nothing) and frees the port before the start below.
run "$app_target" --exit > /dev/null 2>&1 || true
if ! $dry_run
then
    for attempt in 1 2 3 4 5 6 7 8 9 10
    do
        curl -fsS --max-time 1 http://127.0.0.1:47995/api/health > /dev/null 2>&1 || break
        sleep 1
    done
fi

for old_name in "${old_companion_names[@]}"
do
    old_target="$HOME/.local/bin/$old_name"
    if [ -e "$old_target" ] || [ -L "$old_target" ]
    then
        run ln -sfn "$app_target" "$old_target"
    fi
done

if $dry_run
then
    echo "    [dry-run] write $app_desktop_entry and $app_autostart_entry (--hidden)"
else
    # Menu entry with the icon from inside the AppImage (extracting needs no FUSE)
    icon_inside="usr/share/icons/hicolor/128x128/apps/albedo-companion.png"
    (cd "$work_dir" && "$app_target" --appimage-extract "$icon_inside" > /dev/null 2>&1) || true
    if [ -f "$work_dir/squashfs-root/$icon_inside" ]
    then
        install -Dm 644 "$work_dir/squashfs-root/$icon_inside" "$app_icon"
    fi
    mkdir -p "$(dirname "$app_desktop_entry")" "$(dirname "$app_autostart_entry")"
    cat > "$app_desktop_entry" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Albedo Companion
Comment=Manage the games Albedo streams to the Steam Deck
Exec=$app_target
Icon=albedo-companion
StartupWMClass=albedo-companion
Categories=Game;
DESKTOP
    # At login straight into the tray: the Deck needs the companion API, not the window.
    cat > "$app_autostart_entry" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Albedo Companion
Comment=Companion for Albedo on the Steam Deck (tray)
Exec=$app_target --hidden
Icon=albedo-companion
X-GNOME-Autostart-enabled=true
DESKTOP
    info "Installed to $app_target (menu: Albedo Companion, starts at login in the tray)"
fi

if [ -z "${WAYLAND_DISPLAY:-}${DISPLAY:-}" ]
then
    warn "No graphical session here: Albedo Companion starts at your next desktop login."
    warn "Without a desktop, run it as: $app_target --headless"
elif $dry_run
then
    echo "    [dry-run] start $app_target --hidden"
else
    setsid "$app_target" --hidden > /dev/null 2>&1 < /dev/null &
    companion_health=""
    for attempt in 1 2 3 4 5 6 7 8 9 10
    do
        sleep 1
        companion_health=$(curl -fsS --max-time 2 http://127.0.0.1:47995/api/health 2>/dev/null) && break
    done
    if [ -n "$companion_health" ]
    then
        info "Albedo Companion is running in the tray: $companion_health"
    else
        warn "Albedo Companion doesn't answer on port 47995. Start it from the menu to see what's wrong."
    fi
fi

# ---------------------------------------------------------------------------
# Monitor switching for the stream (every route, the Deck profile picks one)
# ---------------------------------------------------------------------------
# A checkout without the helpers (e.g. only install.sh copied somewhere) also fetches from GitHub.
if [ -n "$script_dir" ] && [ ! -f "$script_dir/sunshine-match-client" ]
then
    script_dir=""
fi
for helper_file in "${helper_files[@]}"
do
    if [ "$helper_file" = "sunshine-match-client" ] || $virtual_monitor
    then
        fetch_helper_file "$helper_file"
    fi
done
info "Installing sunshine-match-client to $match_client_target"
run install -Dm 755 "$script_dir/sunshine-match-client" "$match_client_target"
if [[ "${XDG_CURRENT_DESKTOP:-}" != *KDE* ]]
then
    warn "Desktop is '${XDG_CURRENT_DESKTOP:-unknown}', not KDE Plasma: switching monitors for the stream only works on KDE so far."
fi

if [ -n "$dummy_connector" ]
then
    if ! compgen -G "/sys/class/drm/card*-$dummy_connector" > /dev/null
    then
        warn "Connector $dummy_connector doesn't exist (see /sys/class/drm/)."
        exit 1
    fi
    dummy_status=$(cat /sys/class/drm/card*-"$dummy_connector"/status | head -1)
    if [ "$dummy_status" != "connected" ]
    then
        warn "$dummy_connector is '$dummy_status': plug the dummy plug in there (it must show up as a monitor)."
    fi
    info "Dummy plug: $dummy_connector"
    set_config_value DUMMY_OUTPUT "$dummy_connector"
    dummy_modes=$(kscreen-doctor -j 2>/dev/null | jq -r --arg out "$dummy_connector" \
        '.outputs[] | select(.name == $out) | [.modes[].name] | unique | join(" ")' || true)
    if [ -n "$dummy_modes" ]
    then
        info "$dummy_connector has the modes: $dummy_modes"
        echo "    They come from the plug's own EDID, so Albedo can't add modes there."
    fi
fi

if ! $virtual_monitor
then
    info "Done. Open port 47995/tcp in the firewall so the Deck reaches it."
    info "Streams use your main monitor (or the dummy plug) as picked in the Deck profile."
    info "Virtual monitor without a plug (KDE + AMD): run again with --virtual-monitor."
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
        if { [ "$(cat "$status_file")" = "disconnected" ] || [ "$connector_name" = "$configured_connector" ]; } && [ "$connector_name" != "$dummy_connector" ]
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
    done < /dev/tty
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
set_config_value VIRTUAL_OUTPUT "$connector"

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
    echo "    Albedo Companion and sunshine-match-client use these. Games you add in Albedo switch"
    echo "    to $connector when the stream starts and restore your screens when it ends."
else
    warn "$connector doesn't show up in KDE yet. Log out and back in (or reboot) and run"
    warn "kscreen-doctor -o again; it should list $connector with the modes above."
fi
