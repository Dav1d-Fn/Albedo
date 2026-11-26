# Albedo Companion

The one program for the gaming PC (Tauri 2 + React + TypeScript). It runs the
[companion](../companion/) the Deck talks to (port 47995) and is the window to manage it with
mouse and keyboard, so you can do at the desk what the launcher on the Deck does from the couch:

<p align="center">
  <img src="../docs/media/pc-app-library.png" alt="The library by group with covers, a selected game and its group menu" width="900">
</p>


- **Library:** everything the companion found, by group (Steam, Non-Steam, Emulation, Heroic,
  Lutris, Minecraft, Apps, Presets), with covers and the *In Sunshine* state. Add and remove.
- **Group per game:** move a game into another group or into an own one ("Couch co-op"), or back
  to the detected group. The companion stores it, so the Deck shows the same groups.
- **Pictures:** set cover, title art or logo from the picture search (Steam shop, libretro,
  SteamGridDB with a key) or from a file (file picker or drag & drop), and reset them. The
  dialog stays open after setting one, so cover, title art and logo are done in one go.
- **Devices:** pair a Moonlight device with the PIN it shows; list and unpair paired devices.
- **Status & login:** companion running, Sunshine reachable, modes of the virtual monitor;
  Sunshine login; language (system, German, English) and SteamGridDB key (with a link to the
  key page; the companion stores it for this app and the Deck and checks it with a real
  SteamGridDB request).

## Tray, autostart and command line

| Command | What it does |
|---|---|
| `Albedo-Companion-x86_64.AppImage` | Companion + tray icon + window |
| `… --hidden` | The same, starting in the tray (the autostart entry `~/.config/autostart/albedo-companion.desktop` uses it) |
| `… --headless` | Only the companion: no window, no tray (PCs without a desktop) |
| `… --exit` | Ends the running instance (the installer uses it before an update) |
| `… quit "<pattern>"` | Undo step of a Sunshine app: ends the game's processes ([API.md](../companion/API.md)) |

Single instance: a second start only shows the window of the running one. Closing the window
drops it with its webview, the app stays in the tray with the companion running; *Open* in the
tray menu builds the window again, *Quit* ends everything.

The window has no logic of its own: it calls the companion's HTTP API
([`companion/API.md`](../companion/API.md)) on `127.0.0.1` (port from the companion's config)
through its Rust side (the companion sends no CORS headers). The picture search is the Deck launcher's own code
(`src-tauri/src/art_search.rs` and friends), compiled into this app with `#[path]`, so both
find the same pictures.

## Run

Needs the repository's npm packages (`npm install` in the repository root; this app uses them).
The dev build serves the companion too, so quit an installed Albedo Companion first (both want port
47995), or set another `port` in a test `HOME`'s `~/.config/albedo-companion/config.json`.

```bash
cd pc-app
PATH=../node_modules/.bin:$PATH nice -n 19 tauri dev
```

Dev port is **1440** (1420/1430 are taken). `npm run dev` alone shows the UI in a browser at
`http://localhost:1440` with the data of the companion running on 47995 (Vite forwards
`/companion` to it); the picture search needs the Tauri app.

Build an AppImage / RPM:

```bash
cd pc-app
PATH=../node_modules/.bin:$PATH CARGO_BUILD_JOBS=4 nice -n 19 tauri build
```

## Layout

- `src/PcApp.tsx` – root class component, owns all state and every action
- `src/views/` – one file per screen or part, pure rendering
- `src/services/Companion.ts` – every call to the companion and the Rust side
- `src/i18n/` – `UiText`, `GermanTexts`, `EnglishTexts` (every visible text in both)
- `src/model/` – API types, placeholder tint
- `src-tauri/src/companion_proxy.rs` – HTTP client for the companion
- `src-tauri/src/main_window.rs` – the window, built on *Open*, dropped on close
- `src-tauri/src/tray_icon.rs` – tray icon and its menu
- `src-tauri/src/language_setting_file.rs` – the stored UI language
- `src-tauri/src/lib.rs` – command line, starts the companion thread, Tauri commands: `companion` (any endpoint), `upload_art` (file bytes),
  `search_art`, `apply_art`, `set_language`, `load_language_setting`, `save_language_setting`,
  `open_steam_grid_db_key_page`

The UI language lives in `~/.config/albedo-companion/ui-language` (the webview's localStorage is
not kept by release builds). The SteamGridDB key is the companion's (`config.json`, mode 600),
shared with the Deck; the picture search reaches SteamGridDB through the companion, which adds the key.
