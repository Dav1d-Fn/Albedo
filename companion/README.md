# Companion core (library)

The part of [Albedo Companion](../pc-app/) the Deck talks to. It finds the installed games and programs
and, when Albedo asks, turns one into a Sunshine app. The interface is described in
[API.md](API.md); setup and requirements are in the [main README](../README.md#pc-setup-).

This crate is a library without a program of its own: Albedo Companion runs its HTTP server
(`CompanionService`) on a thread for as long as it runs, in the window or in the tray. Its
`ProcessQuitter` is the `quit` subcommand of Albedo Companion that Sunshine apps call as their undo step.

Sources: Steam (all library folders) and non-Steam games in Steam, Heroic (Epic / GOG), Lutris,
Prism Launcher instances, programs from `.desktop` files, and three presets (Desktop, Desktop
without profile switch, Steam Big Picture). Covers are stored as PNG in `~/.config/sunshine/covers/`.

## Requirements

`curl`, `magick` (ImageMagick), `gio`, `sqlite3` (Lutris only). For the display modes:
`kscreen-doctor` (KDE Plasma).

## Install

Install Albedo Companion with [`pc-setup/install.sh`](../pc-setup/install.sh):

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/albedo/main/pc-setup/install.sh | bash   # latest release
pc-setup/install.sh --build   # from this checkout (needs Rust and Node)
```

Without a desktop: `~/Applications/Albedo-Companion-x86_64.AppImage --headless` runs only the companion.

Config: `~/.config/albedo-companion/config.json` (mode 600, created on first start).
The Sunshine login can be entered there, in Albedo Companion or from Albedo on the Deck. After editing
the file, quit Albedo Companion in the tray and start it again.

## Check

```bash
curl -s localhost:47995/api/health
curl -s localhost:47995/api/library | jq '.entries | length'
```

The log goes to stderr: start Albedo Companion from a terminal to read it
(`~/Applications/Albedo-Companion-x86_64.AppImage`; quit the running one in the tray first).

The companion only answers the home network, Tailscale and localhost (403 otherwise).
The firewall has to let port 47995/tcp through.

## Tests

```bash
cd companion && cargo test
```
