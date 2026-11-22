# Albedo PC App

Desktop app (Tauri 2 + React + TypeScript) for the gaming PC. It manages the [companion
service](../companion/) with mouse and keyboard, so you can do at the desk what the launcher
on the Deck does from the couch:

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
  key page; the companion checks a new key with a real SteamGridDB request).

The app has no logic of its own: it calls the companion's HTTP API
([`companion/API.md`](../companion/API.md)) on `127.0.0.1:47995` through its Rust side (the
companion sends no CORS headers). The picture search is the Deck launcher's own code
(`src-tauri/src/art_search.rs` and friends), compiled into this app with `#[path]`, so both
find the same pictures.

## Run

Needs the companion service running on this PC (see the [main README](../README.md#pc-setup-))
and the repository's npm packages (`npm install` in the repository root; this app uses them).

```bash
cd pc-app
PATH=../node_modules/.bin:$PATH nice -n 19 tauri dev
```

Dev port is **1440** (1420/1430 are taken). `npm run dev` alone shows the UI in a browser at
`http://localhost:1440` with the real companion data (Vite forwards `/companion` to the
companion); the picture search needs the Tauri app.

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
- `src/model/` – API types, settings (localStorage), placeholder tint
- `src-tauri/src/companion_proxy.rs` – HTTP client for the companion
- `src-tauri/src/lib.rs` – Tauri commands: `companion` (any endpoint), `upload_art` (file bytes),
  `search_art`, `apply_art`, `set_language`,
  `open_steam_grid_db_key_page`

Settings (language, SteamGridDB key) live in the webview's localStorage on this PC.
