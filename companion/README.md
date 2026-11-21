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

```bash
cargo build --release
install -Dm 755 target/release/streaming-launcher-companion ~/.local/bin/streaming-launcher-companion
install -Dm 644 streaming-launcher-companion.service ~/.config/systemd/user/streaming-launcher-companion.service
systemctl --user daemon-reload
systemctl --user enable --now streaming-launcher-companion
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

Rebuild, copy the binary to `~/.local/bin/` as above, then
`systemctl --user restart streaming-launcher-companion`.
