# Albedo Companion

Small service on the gaming PC. It finds the installed games and programs and, when Albedo asks,
turns one into a Sunshine app. The interface is described in [API.md](API.md); setup and
requirements are in the [main README](../README.md#pc-setup-).

Sources: Steam (all library folders) and non-Steam games in Steam, Heroic (Epic / GOG), Lutris,
Prism Launcher instances, programs from `.desktop` files, and three presets (Desktop, Desktop
without profile switch, Steam Big Picture). Covers are stored as PNG in `~/.config/sunshine/covers/`.

## Requirements

`curl`, `magick` (ImageMagick), `gio`, `sqlite3` (Lutris only). For the display modes:
`kscreen-doctor` (KDE Plasma).

## Install

With [`pc-setup/install.sh`](../pc-setup/install.sh): it downloads the static binary
(`albedo-companion-x86_64-linux.tar.gz`, binary + service file) from the latest release, checks
`SHA256SUMS`, installs it to `~/.local/bin/` and enables the systemd user service.

```bash
cd pc-setup
./install.sh --companion-only           # from the latest release
./install.sh --companion-only --build   # from this checkout (cargo build --release)
```

Config: `~/.config/streaming-launcher-companion/config.json` (mode 600, created on first start).
The Sunshine login can be entered there or from Albedo. After editing the file:
`systemctl --user restart streaming-launcher-companion`.

## Check

```bash
curl -s localhost:47995/api/health
curl -s localhost:47995/api/library | jq '.entries | length'
journalctl --user -u streaming-launcher-companion -f
```

The service only answers the home network, Tailscale and localhost (403 otherwise).
The firewall has to let port 47995/tcp through.

## Update

Run `pc-setup/install.sh --companion-only` again (with `--build` for a local build). It replaces
the binary and restarts the service; the config stays.
