#!/bin/bash
# Forces a free connector into "connected" state with the custom EDID from
# /etc/virtual-display-edid.bin, so Sunshine can stream to it without a real monitor.
# Runs as root at boot from virtual-display-edid.service (installed by pc-setup/install.sh).
#   apply-virtual-display.sh <CONNECTOR>        e.g. DP-3
#   apply-virtual-display.sh <CONNECTOR> off    removes the override again (uninstall)
set -euo pipefail

connector="${1:?usage: apply-virtual-display.sh <CONNECTOR> [off]}"
edid_file="/etc/virtual-display-edid.bin"

debug_dir=$(find /sys/kernel/debug/dri -mindepth 2 -maxdepth 2 -name "$connector" 2>/dev/null | head -1)
if [ -z "$debug_dir" ]
then
    echo "Connector $connector not found under /sys/kernel/debug/dri/*/" >&2
    exit 1
fi

if [ "${2:-}" = "off" ]
then
    echo "reset" > "$debug_dir/edid_override"
    echo "unspecified" > "$debug_dir/force"
else
    cat "$edid_file" > "$debug_dir/edid_override"
    echo "on" > "$debug_dir/force"
fi

# Best-effort live hotplug nudge (harmless if it does nothing; a logout/login
# or reboot always picks up the new connector state).
udevadm trigger --subsystem-match=drm --action=change || true
