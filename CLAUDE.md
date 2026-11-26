# Albedo

Controller-friendly launcher for Moonlight on the Steam Deck (Tauri 2 + React + TypeScript).
The app is only the menu: it lists the games (Sunshine apps) of the gaming PC and starts
`moonlight stream <host> "<app>" --resolution … --fps … --bitrate …` with the values of the
active device profile (UI: "Profil"; in code and settings.json still `StreamMode` / `modes`). Moonlight does the streaming; when it exits, the launcher is back.

Design source: Claude design canvas https://claude.ai/artifact/UpFs3Nat5Q983TyyARUvvG
(`project/Main.dc.html`). Blue = Handheld, orange = TV; the whole UI tints with the device.

## Layout

- `src-tauri/src/` – Rust side, one struct per file
  - `lib.rs` – Tauri commands (thin wrappers) and app setup
  - `settings_store.rs` – reads/writes `settings.json` in the app config dir (`~/.config/de.davidf.albedo/`)
  - `legacy_directory_mover.rs` – moves the folders from before the rename (`de.davidf.streaminglauncher`, companion `streaming-launcher-companion`) once at start; the companion uses it via `#[path]`
  - `game_list_source.rs` – app list from the companion (`GET /api/apps`, live from Sunshine), else Sunshine web API (port 47990, Basic Auth) or `moonlight list <host>` (only Moonlight's cache)
  - `moonlight_command.rs` – builds the Moonlight argument list (has the unit test)
  - `stream_session.rs` – spawns Moonlight, emits `stream-ended`
  - `gamepad_listener.rs` – reads controllers with `gilrs`, emits `pad-button`
  - `display_detector.rs` – external screen connected? (`/sys/class/drm/*/status`)
  - `host_discovery.rs` – finds Sunshine PCs via mDNS (`_nvstream._tcp`)
  - `host_address_picker.rs` – first reachable PC address (home IP before Tailscale, settings `host` + `extraHostAddresses`); every call uses the address it picked
  - `wake_on_lan.rs` – PC MAC from the Deck's ARP table (settings `hostMac`), magic packet (broadcast, home network only); see `docs/wake-on-lan.md`
  - `moonlight_pairing.rs` – `moonlight pair <host> --pin <pin>`
  - `moonlight_app_quit.rs` – `moonlight quit <host>`, ends the game still running on the PC after a disconnect
  - `running_host_app.rs` – what runs on the PC (Sunshine `serverinfo` `currentgame` on port 47989, name from Moonlight.conf's app cache) for the "Fortsetzen" tile and the "X läuft noch" question
  - `moonlight_box_art.rs` – cover images from Moonlight's box art cache (`moonlight_host_entries.rs` parses Moonlight.conf)
  - `art_search.rs` – picture search for "Bild setzen": Steam shop and libretro thumbnails (`libretro_thumbnails.rs`, retro systems, no key) + SteamGridDB through the companion's pass-through `GET /api/steamgriddb/…` (the key lives only in the companion's config.json, shared by Deck and PC app; an old settings `steamGridDbKey` is pushed there once and dropped); the picked picture goes to the companion through an upload token like a phone upload
  - `companion_client.rs` – HTTP client for the companion service on the PC (`companion/API.md`), `library_entry.rs` is its list item
  - `app_updater.rs` – self-update from signed GitHub releases (`tauri-plugin-updater`, only when running as AppImage)
  - `ui_language.rs` – language of Rust messages for the UI (`set_language` from the frontend); companion calls send it as `Accept-Language`
  - `host_environment.rs` – strips the AppImage's LD_LIBRARY_PATH etc. before starting host programs (flatpak)
- `companion/` – library crate (no binary of its own): the HTTP API for the Deck (`CompanionService`), port 47995
- `pc-app/` – "Albedo Companion", the one program for the PC (Tauri 2 + React, dev port 1440): runs the companion
  server on a thread, tray icon, single instance, `--hidden` (autostart), `--headless`, `--exit`,
  `quit "<pattern>"` (Sunshine undo step); its UI manages the companion (library, groups, pictures,
  pairing, Sunshine login) over 127.0.0.1; reuses `art_search.rs` via `#[path]`. See `pc-app/README.md`.
- `deck/install.sh` – Steam Deck installer: AppImage to `~/Applications/`, non-Steam entry with artwork in `shortcuts.vdf` (binary VDF, embedded Python), `--uninstall`
- `pc-setup/` – PC side: `install.sh` (works piped from curl; default installs Albedo Companion + autostart from the release; `--virtual-monitor` opt-in for KDE + AMD: EDID override on a free connector, boot service, helper files fetched from GitHub when piped; `--build`, `--uninstall`, `--dry-run`), `sunshine-match-client` (Sunshine prep: saves the layout and switches to the virtual monitor, `--restore` puts it back), `make-virtual-edid.py` (`--keep` reads an installed EDID; also built into the companion, `companion/src/virtual_edid_writer.rs` adds a mode via pkexec, Y "Am PC hinzufügen" in the Deck editor), `apply-virtual-display.sh`; the connector name lives in `~/.config/sunshine-match-client.conf` (also read by `companion/src/display_mode_reader.rs`)
- `artwork/steam/` – Steam pictures the installer copies (cover, wide, hero, logo, icon)
- `.github/workflows/release.yml` – tag `v*` → signed AppImage + `latest.json` on Ubuntu 22.04
- `src/` – frontend
  - `LauncherApp.tsx` – root class component, owns all state and the button logic
  - `model/` – settings types, defaults, text formatting, placeholder cover art
  - `i18n/` – `UiText` (language in use, settings `language`, "" = system) and the text tables `GermanTexts`/`EnglishTexts`
  - `services/Backend.ts` – every `invoke`/`listen` call
  - `input/InputRouter.ts` – keyboard + `pad-button` events → launcher buttons
  - Rail ends with a "Hinzufügen" tile → `LibraryScreen` (games from the PC companion, L1/R1 group, A add, X remove)
  - `views/` – one file per screen/component, pure rendering, call methods on `LauncherApp`
  - `styles.css` – CSS ported from the design

## Controls

Keyboard = controller: arrows, Enter/Space = A, Esc/Backspace = B, X, Y, Q/E = L1/R1, M = ☰.
X switches device on home/detail, L1/R1 switch the profile, Y remembers the profile for a game
(detail) or reloads the list (home), ☰ opens the device editor ("Geräte"). Editor: left list = "Geräteeinstellungen"
entry on top, then the profiles; the right column only shows the selected entry's values. X deletes the profile
or (on the device entry/rows) the device, second X confirms. Resolution/FPS step through the modes of the PC's
virtual monitor (companion `/api/display-modes`, FPS per resolution), else fixed lists; A types an own value
(marked with the PC-mode hint when the PC can't do it).

## Commands

- `npm run tauri dev` – run on the PC (dev port 1430; 1420 is used by other projects)
- `ALBEDO_DRY_RUN=1 npm run tauri dev` – log the Moonlight command instead of streaming to itself
- `npm run dev` – UI only in a browser with fake data (`src/dev/BrowserMock.ts`; a settings.json put into localStorage `mockSettings` is loaded instead of defaults)
- `cd src-tauri && cargo test` – Rust tests (`-- --ignored` also runs the LAN discovery test)
- `npx tsc --noEmit` – type check
- Heavy builds with `nice -n 19` and few jobs (`-j 4`), David often plays on the same PC.

## Code style (David)

- **Clarity over brevity.** More lines are fine if they make it clearer. No dense one-liners.
- **Allman braces:** opening and closing curly braces on their own line (TS and Rust).
  JSX and object/array literals inside expressions may stay inline where Allman is impossible.
- **Object-oriented and structured:** logic in classes with a clear job, not loose function collections;
  folders by area, one class per file. React views are function components without logic.
- **Descriptive names:** `layerIndex` not `i`, `lineWidth` not `w`; long names are fine.
- **Comments in English**, always. UI texts are German and English: every visible text goes through
  `UiText.current` (`src/i18n/`); a new text goes into **both** `GermanTexts.ts` and `EnglishTexts.ts`
  (`tsc` reports a key missing in English). Rust messages for the UI use `UiLanguage::pick(de, en)`
  (launcher) or `RequestLanguage::pick(de, en)` (companion, from `Accept-Language`).
- Language conventions enforced by the compiler stay (snake_case in Rust).
- Formatter: `cargo +nightly fmt` uses `rustfmt.toml` (`brace_style = "AlwaysNextLine"`). No Prettier (can't do Allman).
