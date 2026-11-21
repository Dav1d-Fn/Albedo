# Companion API

Small HTTP service on the gaming PC. It knows which games and programs are installed there and
turns a chosen one into a Sunshine app, so the launcher on the Deck can add and remove games
without anybody editing `apps.json` by hand.

- Runs as a systemd user service next to Sunshine, port **47995**, plain HTTP + JSON.
- Only answers requests from the home network and Tailscale (private IPv4 ranges, `100.64.0.0/10`,
  loopback). No token: the companion never runs commands sent by the client, it only adds
  entries it discovered itself.
- Talks to Sunshine through Sunshine's own web API (`https://localhost:47990/api/apps`, Basic Auth
  from the companion's config file), not by editing `apps.json`.
- All texts the launcher shows (names, groups) come as they should be displayed (German UI).

## Endpoints

### `GET /api/health`

```json
{ "name": "streaming-launcher-companion", "version": "0.1.0", "host": "fedora" }
```

### `GET /api/library`

Everything that can be added, sorted by group, then name.

```json
{
  "entries":
  [
    { "id": "preset:desktop-auto", "name": "Desktop", "group": "Voreinstellungen", "hasCover": true, "inSunshine": true },
    { "id": "preset:desktop-plain", "name": "Desktop (ohne Profilwechsel)", "group": "Voreinstellungen", "hasCover": true, "inSunshine": true },
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
- `sunshineProblem`: `null` when the companion can reach Sunshine with its login, otherwise the German
  reason (e.g. "Sunshine-Login fehlt im PC-Helfer", "Sunshine-Login falsch"). Adding/removing
  cannot work then; the launcher should say so before the user presses A, not only after.
- `hasHero`: a wide title picture exists (`GET /api/hero/<id>`). Steam: `library_hero.jpg`,
  Heroic: `art_cover`. Not in the example lines above means `false`; every entry has both fields.
- `screenshotCount`: Steam screenshots of all Steam accounts on the PC (`GET /api/screenshot/<id>/<index>`),
  `0` for everything else. A new screenshot shifts the indices, so reload the library to see it.
- Not listed: tools like Proton, Steam Linux Runtime, Steamworks Redist, Wallpaper Engine, VR-only games.

### `GET /api/apps`

The apps Sunshine offers right now (names, in Sunshine's order). The launcher's game list comes
from here: `moonlight list` on the Deck only prints Moonlight's cache, which refreshes inside the
Moonlight UI, so newly added games would be missing.

```json
{ "apps": ["Desktop", "Desktop (ohne Profilwechsel)", "ELDEN RING"] }
```

`502` with the German reason (e.g. "Sunshine-Login fehlt im PC-Helfer") when Sunshine cannot be asked;
the launcher then falls back to `moonlight list`.

### `GET /api/cover/<id>`

PNG (portrait, ideally 600x900) for an entry with `hasCover`. 404 otherwise. `<id>` is URL-encoded.

### `GET /api/hero/<id>`

JPEG for an entry with `hasHero`, at most 1920 px wide, 404 otherwise. Cached in
`~/.cache/streaming-launcher-companion/` (Heroic's is downloaded once).

### `GET /api/screenshot/<id>/<index>`

JPEG, at most 1920 px wide. Index `0` is the newest; outside `0 … screenshotCount-1` it is 404. Cached like the hero.

### `POST /api/apps`

Body `{ "id": "steam:1245620" }`. Creates the Sunshine app and answers with its name:

```json
{ "name": "ELDEN RING" }
```

Every created app gets:

- the start command for its source (Steam: detached `steam steam://rungameid/<appid>`;
  Heroic: `heroic://launch/…`; Lutris: `lutris lutris:rungameid/…`; Prism: `--launch "<instance>"`),
- prep-cmd do `sunshine-match-client` (PC screen follows the resolution the launcher asked for),
  undo `screenprofilercmd load main`,
- for games: an undo that really ends the game (Steam: `pkill -f "SteamLaunch AppId=<appid> "`),
  so "Beenden" in the launcher (`moonlight quit`) closes it,
- the cover converted to PNG under `~/.config/sunshine/covers/`.

Ending a game: apps that Sunshine starts as `cmd` (Prism, native shortcuts like EmuDeck) are
ended by Sunshine itself (SIGTERM to the process group, SIGKILL after `exit-timeout`). Detached
apps get an undo `streaming-launcher-companion quit "<pattern>"`: SIGTERM to every process whose
command line contains the pattern (like `pkill -f`, skipping its own process and its parents),
SIGKILL after 5 s. Patterns: Steam `SteamLaunch AppId=<appid> `, Heroic/Lutris the install
folder, `.desktop` entries with `Categories=…Game…` their program (flatpak: the app id); other
desktop programs keep running. Apps added before this keep their old undo until re-added.

`preset:desktop-plain` has no prep-cmd (screen stays as it is).

### `DELETE /api/apps`

Body `{ "name": "ELDEN RING" }`. Removes that Sunshine app. `204` on success.

### `PUT /api/sunshine-login`

Body `{ "user": "...", "password": "..." }`. Checks the login with `GET /api/apps` on Sunshine first.
Works: saves `sunshineUser`/`sunshinePassword` in `config.json` (mode 600), uses it right away
(no restart), `204`. Afterwards `GET /api/library` reports `"sunshineProblem": null`.
Wrong login or Sunshine not reachable: `400` with e.g. `{ "error": "Sunshine-Login falsch" }`,
nothing is saved. The password is never sent back or logged.

### Errors

Non-2xx with `{ "error": "German message for the toast" }`.
