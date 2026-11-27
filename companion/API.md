# Companion API

Small HTTP service on the gaming PC. It knows which games and programs are installed there and
turns a chosen one into a Sunshine app, so the launcher on the Deck can add and remove games
without anybody editing `apps.json` by hand.

- Runs inside Albedo Companion (window or tray, `--headless` without a desktop) next to Sunshine,
  port **47995**, plain HTTP + JSON.
- Only answers requests from the home network and Tailscale (private IPv4 ranges, `100.64.0.0/10`,
  loopback). No token: the companion never runs commands sent by the client, it only adds
  entries it discovered itself.
- Talks to Sunshine through Sunshine's own web API (`https://localhost:47990/api/apps`, Basic Auth
  from the companion's config file), not by editing `apps.json`.
- All texts the launcher shows (names, groups, errors) come as they should be displayed, in the language of the
  request's `Accept-Language` header: German if `de` comes before `en`, otherwise English. The launcher sends
  its UI language; the phone upload page follows the phone browser.

## Endpoints

### `GET /api/health`

```json
{ "name": "albedo-companion", "version": "0.1.0", "host": "fedora" }
```

### `GET /api/library`

Everything that can be added, sorted by group, then name.

```json
{
  "entries":
  [
    { "id": "preset:desktop-auto", "name": "Desktop", "group": "Voreinstellungen", "hasCover": true, "inSunshine": true },
    { "id": "preset:desktop-plain", "name": "Desktop (no display switch)", "group": "Voreinstellungen", "hasCover": true, "inSunshine": true },
    { "id": "preset:big-picture", "name": "Steam Big Picture", "group": "Voreinstellungen", "hasCover": true, "inSunshine": false },
    { "id": "steam:1245620", "name": "ELDEN RING", "group": "Steam", "hasCover": true, "hasHero": true, "screenshotCount": 3, "inSunshine": false },
    { "id": "shortcut:2777831780", "name": "The Legend of Zelda: Tears of the Kingdom", "group": "Emulation", "hasCover": true, "hasHero": true, "screenshotCount": 0, "inSunshine": false },
    { "id": "heroic:Crow", "name": "Dead Island 2", "group": "Heroic", "hasCover": true, "inSunshine": false },
    { "id": "lutris:black-desert-online", "name": "Black Desert Online", "group": "Lutris", "hasCover": false, "inSunshine": false },
    { "id": "prism:26.3 Modpack Test", "name": "Minecraft 26.3 Modpack Test", "group": "Minecraft", "hasCover": true, "inSunshine": true },
    { "id": "desktop:org.kde.dolphin", "name": "Dolphin", "group": "Programme", "hasCover": false, "inSunshine": false }
  ],
  "sunshineProblem": null
}
```

- `id` is stable: `<source>:<source id>`. Sources: `preset`, `steam`, `shortcut`, `heroic`, `lutris`, `prism`, `desktop`.
- Groups in this order: Voreinstellungen, Steam, Nicht-Steam, Emulation, Heroic, Lutris, Minecraft, Programme.
- `shortcut`: non-Steam games added to Steam (`userdata/*/config/shortcuts.vdf`, id = Steam's 32-bit shortcut appid).
  Group "Emulation" when the launch line points into `~/Emulation/` or the program is a known emulator
  (EmuDeck, RetroArch, Eden, Cemu, melonDS …), otherwise "Nicht-Steam". Cover/hero from Steam's custom
  artwork in `config/grid/` (`<appid>p.png`, `<appid>_hero.png`). The same name twice gets the system
  from the Steam tag appended ("… (Nintendo Switch)"). Shortcuts that start Prism are skipped (the
  `prism` source has them). Sunshine start: native programs run directly as `cmd`
  (`env -C <StartDir> VAR=value <exe> <options>`, so Sunshine waits on the game and ends it with the
  stream, no Steam needed); Windows `.exe` start detached via `steam steam://rungameid/<64-bit id>`
  because they need Steam's Proton setup.
- `inSunshine`: a Sunshine app created from this entry exists (the companion recognises its own apps,
  e.g. by a marker in the app entry, and matches the old hand-made ones by name where it can).
- `sunshineProblem`: `null` when the companion can reach Sunshine with its login, otherwise the
  reason in the request language (e.g. "The PC companion has no Sunshine login", "Sunshine login wrong"). Adding/removing
  cannot work then; the launcher should say so before the user presses A, not only after.
- `hasHero`: a wide title picture exists (`GET /api/hero/<id>`). Steam: `library_hero.jpg`,
  Heroic: `art_cover`. Not in the example lines above means `false`; every entry has both fields.
- `hasLogo`: a transparent logo exists (`GET /api/logo/<id>`). Steam: `logo.png`, non-Steam:
  `grid/<appid>_logo.png`, Heroic: `art_logo`.
- `hasCover`/`hasHero`/`hasLogo` include the user's overrides (see "Pictures per entry").
- `customArt`: the kinds with an override, e.g. `["hero"]`; empty when every picture is automatic.
  A hero override is what the launcher shows behind the menu, whatever backdrop kind is chosen.
- `system`: for "Emulation" entries the emulated system from the EmuDeck/Steam ROM Manager tag
  (e.g. `"Nintendo 64"`), otherwise `null`. The launcher picks the libretro thumbnails by it.
- `detectedGroup`: the group the detection picked. `group` differs from it when the user changed the
  group (`customGroup: true`, see `PUT /api/group`); own groups sort after the built-in ones, alphabetically.
- `screenshotCount`: Steam screenshots of all Steam accounts on the PC (`GET /api/screenshot/<id>/<index>`),
  `0` for everything else. A new screenshot shifts the indices, so reload the library to see it.
- Not listed: tools like Proton, Steam Linux Runtime, Steamworks Redist, Wallpaper Engine, VR-only games.

### `GET /api/apps`

The apps Sunshine offers right now (names, in Sunshine's order). The launcher's game list comes
from here: `moonlight list` on the Deck only prints Moonlight's cache, which refreshes inside the
Moonlight UI, so newly added games would be missing.

```json
{ "apps": ["Desktop", "Desktop (no display switch)", "ELDEN RING"] }
```

`502` with the reason in the request language (e.g. "The PC companion has no Sunshine login") when Sunshine cannot be asked;
the launcher then falls back to `moonlight list`.

### `GET /api/display-modes`

The routes this PC can show a stream on, with the modes of their outputs (from the display backend,
KDE: `kscreen-doctor -j`, 20 s time limit because KWin sometimes hangs). When a client connects,
`sunshine-match-client` switches the profile's route to the closest mode
(`companion/src/display_mode_chooser.rs`: exact size, else same aspect ratio, else the largest
that fits; then the closest refresh rate), so the launcher shows what the PC will really use.

```json
{
  "backend": "kde",
  "defaultTarget": "virtual",
  "routes": [
    { "target": "virtual", "output": "DP-3", "connected": true, "canAddModes": true,
      "modes": [{ "width": 1280, "height": 800, "refreshRate": 90 }] },
    { "target": "dummy", "output": "HDMI-A-1", "connected": true, "canAddModes": false, "modes": [] },
    { "target": "main", "output": "DP-2", "connected": true, "canAddModes": false, "modes": [] }
  ],
  "output": "DP-3",
  "modes": [{ "width": 1280, "height": 800, "refreshRate": 90 }]
}
```

`virtual` and `dummy` are there when `~/.config/sunshine-match-client.conf` has `VIRTUAL_OUTPUT=…`
/ `DUMMY_OUTPUT=…` (written by `pc-setup/install.sh`), `main` is the primary monitor (or
`MAIN_OUTPUT=…`). `defaultTarget` is what `auto` means: virtual, else dummy, else `none`. `output`
and `modes` repeat the default route for launchers from before the routes (empty without one).
Refresh rates are rounded. `502` when there is no display backend for this desktop or it fails.

### `POST /api/stream-display`

Body `{ "target": "auto" | "virtual" | "dummy" | "main" | "none" }`: the route of the stream that
starts next (the Deck profile's *Screen on the PC*), sent right before Moonlight starts. Saved in
`~/.local/state/albedo-stream-display.json`; Sunshine's prep command (`sunshine-match-client` →
`albedo-companion display`) takes it within 2 minutes, once. Without one, or for a route the PC
isn't set up for, `defaultTarget` applies, so Sunshine apps and other clients work as before.
`400` for an unknown target.

### `POST /api/display-modes`

Body `{ "width": 2560, "height": 1600, "refreshRate": 90 }`: adds the mode to the virtual
monitor's EDID (only that route has `canAddModes`; a dummy plug's EDID is the plug's own). The companion builds a new EDID with `pc-setup/make-virtual-edid.py` (built in),
keeping every mode of `/etc/virtual-display-edid.bin`, and installs it with `pkexec` (the KDE
password prompt opens **on the PC**; the password never reaches the companion), then restarts
`virtual-display-edid.service`. Answers `202` with the status right away (see below).
`400` when the mode can't go into an EDID (size 640–8192, 24–360 Hz, at most 5 modes above
655 MHz pixel clock or 4095 pixels), `409` when the virtual monitor isn't set up or a prompt is
already open. A mode that is already in the EDID needs no prompt. `ALBEDO_DRY_RUN=1` only logs
the pkexec command.

### `GET /api/display-modes/request`

Outcome of the last `POST /api/display-modes`:

```json
{ "state": "waiting", "mode": "2560x1600@90" }
```

`state`: `idle` (nothing asked yet), `waiting` (prompt open on the PC), `done` (KWin shows the
mode), `reboot` (installed, KWin shows it after a restart or new login), `cancelled` (prompt
closed), `failed` (`message` says why), `dryRun`.

### `GET /api/cover/<id>`

PNG (portrait, ideally 600x900) for an entry with `hasCover`. 404 otherwise. `<id>` is URL-encoded.

### `GET /api/hero/<id>`

JPEG for an entry with `hasHero`, at most 1920 px wide, 404 otherwise. Cached in
`~/.cache/albedo-companion/` (Heroic's is downloaded once).

### `GET /api/screenshot/<id>/<index>`

JPEG, at most 1920 px wide. Index `0` is the newest; outside `0 … screenshotCount-1` it is 404. Cached like the hero.

### `GET /api/logo/<id>`

PNG (transparency kept), at most 1200 px wide, for an entry with `hasLogo`, 404 otherwise. Cached like the hero.

### Pictures per entry (overrides, phone upload)

An override replaces the automatic cover, hero or logo of one entry everywhere (`/api/cover`,
`/api/hero`, `/api/logo`, the `has…` flags, and the cover file of an app already in Sunshine;
Moonlight may still show its cached old box art). Stored in
`~/.config/albedo-companion/art/<id>-<kind>.png|jpg`. `kind` is `cover`, `hero` or `logo`.

- `POST /api/upload-token`, body `{ "id": "steam:1245620", "kind": "hero" }` →
  `{ "url": "http://<host>/upload/<token>", "qrSvg": "<svg …>", "expiresInSeconds": 600 }`.
  `<host>` is the request's Host header, i.e. the address the launcher reached the companion
  through (home network or Tailscale); without a usable Host header the PC's hostname and port.
  `qrSvg` is the URL as QR code (black on white, with quiet zone, only a viewBox, no fixed size).
- `GET /upload/<token>`: phone page (German or English, from the browser's `Accept-Language`) that names the game and the kind of picture.
  Picking a file sends it as the raw body of `POST /upload/<token>` (no multipart).
- `POST /upload/<token>`: raw image body, at most 15 MB (else 413). Anything ImageMagick reads;
  turned upright (`-auto-orient`) and converted (cover 600x900 PNG, hero JPEG ≤1920 px, logo PNG
  ≤1200 px). Not an image: 400, the link stays valid. Success: `204`, the link is used up.
  Unknown, expired (10 min) or used token: 410.
- `DELETE /api/art/<id>/<kind>`: back to the automatic picture, `204` (also when there was none).
- `GET /api/art-version` → `{ "version": 3 }`: changes with every upload and delete. In memory
  only, so it restarts at 0 with the service; treat any change as "reload pictures". Poll it
  while the QR dialog is open.

### `POST /api/apps`

Body `{ "id": "steam:1245620" }`. Creates the Sunshine app and answers with its name:

```json
{ "name": "ELDEN RING" }
```

Every created app gets:

- the start command for its source (Steam: detached `steam steam://rungameid/<appid>`;
  Heroic: `heroic://launch/…`; Lutris: `lutris lutris:rungameid/…`; Prism: `--launch "<instance>"`),
- prep-cmd do `sunshine-match-client` (PC screen follows the resolution the launcher asked for,
  saves the layout before), undo `sunshine-match-client --restore` (puts that layout back),
- for games: an undo that really ends the game (Steam: `pkill -f "SteamLaunch AppId=<appid> "`),
  so "Beenden" in the launcher (`moonlight quit`) closes it,
- the cover converted to PNG under `~/.config/sunshine/covers/`.

Ending a game: apps that Sunshine starts as `cmd` (Prism, native shortcuts like EmuDeck) are
ended by Sunshine itself (SIGTERM to the process group, SIGKILL after `exit-timeout`). Detached
apps get an undo `<Albedo Companion> quit "<pattern>"` (the AppImage path, `$APPIMAGE`): SIGTERM to every process whose
command line contains the pattern (like `pkill -f`, skipping its own process and its parents),
SIGKILL after 5 s. Patterns: Steam `SteamLaunch AppId=<appid> `, Heroic/Lutris the install
folder, `.desktop` entries with `Categories=…Game…` their program (flatpak: the app id); other
desktop programs keep running. Apps added before this keep their old undo until re-added.
Undo steps of the earlier separate companion (`…/albedo-companion quit` and, from before the
rename, `…/streaming-launcher-companion quit`) are pointed to Albedo Companion at start and before every
add; until then the installer keeps those paths as links to the AppImage.

Before adding, apps from older versions with the undo `screenprofilercmd load main` after
`sunshine-match-client` get `sunshine-match-client --restore` instead (updated in place by list
position); other prep commands stay as they are.

`preset:desktop-plain` has no prep-cmd (screen stays as it is).

### `DELETE /api/apps`

Body `{ "name": "ELDEN RING" }`. Removes that Sunshine app. `204` on success.

### `PUT /api/sunshine-login`

Body `{ "user": "...", "password": "..." }`. Checks the login with `GET /api/apps` on Sunshine first.
Works: saves `sunshineUser`/`sunshinePassword` in `config.json` (mode 600), uses it right away
(no restart), `204`. Afterwards `GET /api/library` reports `"sunshineProblem": null`.
Wrong login or Sunshine not reachable: `400` with e.g. `{ "error": "Sunshine-Login falsch" }`,
nothing is saved. The password is never sent back or logged.

### `PUT /api/group`

Body `{ "id": "shortcut:2777831780", "group": "Couch-Koop" }`. Puts the entry into another group, a
built-in one (label in either language, e.g. "Nicht-Steam" or "Non-Steam") or an own one (at most 40
characters). `null`, `""` or the detected group goes back to the detection. `204`. Stored in
`~/.config/albedo-companion/groups.json`; the launcher on the Deck gets the group from
`/api/library` like any other.

### `GET /api/clients`

Devices paired with Sunshine: `{ "clients": [{ "uuid": "B669…", "name": "SteamDeck" }] }`. `502` when
Sunshine cannot be asked.

### `DELETE /api/clients/<uuid>`

Unpairs that device (Sunshine `POST /api/clients/unpair`), `204`. It has to pair again to stream.

### `GET /api/pairings`

Moonlight clients waiting for their PIN right now (Sunshine 2026 `GET /api/pin`):
`{ "pairings": [{ "id": "<32 hex>", "name": "SteamDeck", "address": "192.168.178.40" }] }`.
`502` on older Sunshine versions that have no such list.

### `POST /api/pair`

Body `{ "pin": "1234", "name": "Steam Deck", "pairingId": "<id from /api/pairings>" }`. Answers the
PIN the device shows. Without `pairingId` the single waiting device is meant (`409` when none or
several wait); older Sunshine versions get the PIN alone. `204` when the device took the PIN, `400`
with the reason otherwise (wrong PIN, not four digits).

### SteamGridDB key

One API key for the picture search, shared by the Deck and Albedo Companion. Stored as
`steamGridDbKey` in `config.json` (mode 600, like the Sunshine login); never logged and never sent
back to any client. Users get a key at <https://www.steamgriddb.com/profile/preferences/api>
(SteamGridDB account needed).

#### `GET /api/steamgriddb-key`

`{ "set": true, "hint": "1a2b" }`: whether a key is stored and its last four characters (`hint` is
`null` without a key).

#### `PUT /api/steamgriddb-key`

Body `{ "key": "<SteamGridDB API key>" }`. Stores the key without asking SteamGridDB (so it also
works offline), `204`. `400` `{ "error": "SteamGridDB key invalid" }` when it can't be a key (empty,
more than 128 characters, other characters than letters and digits).

#### `DELETE /api/steamgriddb-key`

Removes the key, `204`.

#### `POST /api/steamgriddb-key/test`

Body `{ "key": "…" }` checks that key, `{}` the stored one, with one real SteamGridDB request
(`/api/v2/search/autocomplete/…`). Stores nothing.

- `204`: SteamGridDB accepts the key.
- `400` `{ "error": "SteamGridDB key invalid" }`: rejected (401/403) or not a key at all.
- `502` `{ "error": "SteamGridDB unreachable" }` (no answer within 15 s), or
  `"SteamGridDB answered with <status>"` for anything else.

#### `GET /api/steamgriddb/<path>`

SteamGridDB's API `https://www.steamgriddb.com/api/v2/<path>` (with query) asked with the stored key;
SteamGridDB's status code and JSON body are passed through. That is how the picture search on the
Deck and in the PC app reaches SteamGridDB without ever holding the key. Only paths starting with
`search`, `grids`, `heroes` or `logos` are passed on (`400` otherwise), only `GET`.

- `409` `{ "error": "No SteamGridDB key stored" }`: the search leaves SteamGridDB out.
- `502` `{ "error": "SteamGridDB unreachable" }` when SteamGridDB doesn't answer.

Requests are handled one after another, so a SteamGridDB lookup (well under a second normally,
15 s at most) holds back other requests meanwhile.

### Errors

Non-2xx with `{ "error": "message for the toast, in the request language" }`.
