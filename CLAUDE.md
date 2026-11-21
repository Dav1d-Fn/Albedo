# Albedo

Controller-friendly launcher for Moonlight on the Steam Deck (Tauri 2 + React + TypeScript).
The app is only the menu: it lists the games (Sunshine apps) of the gaming PC and starts
`moonlight stream <host> "<app>" --resolution … --fps … --bitrate …` with the values of the
active device mode. Moonlight does the streaming; when it exits, the launcher is back.

Design source: Claude design canvas https://claude.ai/artifact/UpFs3Nat5Q983TyyARUvvG
(`project/Main.dc.html`). Blue = Handheld, orange = TV; the whole UI tints with the device.

## Layout

- `src-tauri/src/` – Rust side, one struct per file
  - `lib.rs` – Tauri commands (thin wrappers) and app setup
  - `settings_store.rs` – reads/writes `settings.json` in the app config dir (`~/.config/de.davidf.streaminglauncher/`)
  - `game_list_source.rs` – app list from the companion (`GET /api/apps`, live from Sunshine), else Sunshine web API (port 47990, Basic Auth) or `moonlight list <host>` (only Moonlight's cache)
  - `moonlight_command.rs` – builds the Moonlight argument list (has the unit test)
  - `stream_session.rs` – spawns Moonlight, emits `stream-ended`
  - `gamepad_listener.rs` – reads controllers with `gilrs`, emits `pad-button`
  - `display_detector.rs` – external screen connected? (`/sys/class/drm/*/status`)
  - `host_discovery.rs` – finds Sunshine PCs via mDNS (`_nvstream._tcp`)
  - `host_address_picker.rs` – first reachable PC address (home IP before Tailscale, settings `host` + `extraHostAddresses`); every call uses the address it picked
  - `moonlight_pairing.rs` – `moonlight pair <host> --pin <pin>`
  - `moonlight_app_quit.rs` – `moonlight quit <host>`, ends the game still running on the PC after a disconnect
  - `moonlight_box_art.rs` – cover images from Moonlight's box art cache (`moonlight_host_entries.rs` parses Moonlight.conf)
  - `companion_client.rs` – HTTP client for the companion service on the PC (`companion/API.md`), `library_entry.rs` is its list item
  - `app_updater.rs` – self-update from signed GitHub releases (`tauri-plugin-updater`, only when running as AppImage)
  - `host_environment.rs` – strips the AppImage's LD_LIBRARY_PATH etc. before starting host programs (flatpak)
- `deck/install.sh` – Steam Deck installer: AppImage to `~/Applications/`, non-Steam entry with artwork in `shortcuts.vdf` (binary VDF, embedded Python), `--uninstall`
- `artwork/steam/` – Steam pictures the installer copies (cover, wide, hero, logo, icon)
- `.github/workflows/release.yml` – tag `v*` → signed AppImage + `latest.json` on Ubuntu 22.04
- `src/` – frontend
  - `LauncherApp.tsx` – root class component, owns all state and the button logic
  - `model/` – settings types, defaults, text formatting, placeholder cover art
  - `services/Backend.ts` – every `invoke`/`listen` call
  - `input/InputRouter.ts` – keyboard + `pad-button` events → launcher buttons
  - Rail ends with a "Hinzufügen" tile → `LibraryScreen` (games from the PC companion, L1/R1 group, A add, X remove)
  - `views/` – one file per screen/component, pure rendering, call methods on `LauncherApp`
  - `styles.css` – CSS ported from the design

## Controls

Keyboard = controller: arrows, Enter/Space = A, Esc/Backspace = B, X, Y, Q/E = L1/R1, M = ☰.
X switches device everywhere (home/detail), L1/R1 switch the mode, Y remembers the mode for a game
(detail) or reloads the list (home), ☰ opens the profile editor.

## Commands

- `npm run tauri dev` – run on the PC (dev port 1430; 1420 is used by other projects)
- `STREAMING_LAUNCHER_DRY_RUN=1 npm run tauri dev` – log the Moonlight command instead of streaming to itself
- `npm run dev` – UI only in a browser with fake data (`src/dev/BrowserMock.ts`)
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
- **Comments in English**, always. UI texts are German.
- Language conventions enforced by the compiler stay (snake_case in Rust).
- Formatter: `cargo +nightly fmt` uses `rustfmt.toml` (`brace_style = "AlwaysNextLine"`). No Prettier (can't do Allman).
