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
    { "id": "steam:1245620", "name": "ELDEN RING", "group": "Steam", "hasCover": true, "inSunshine": false },
    { "id": "heroic:Crow", "name": "Dead Island 2", "group": "Heroic", "hasCover": true, "inSunshine": false },
    { "id": "lutris:black-desert-online", "name": "Black Desert Online", "group": "Lutris", "hasCover": false, "inSunshine": false },
    { "id": "prism:26.3 Modpack Test", "name": "Minecraft 26.3 Modpack Test", "group": "Minecraft", "hasCover": true, "inSunshine": true },
    { "id": "desktop:org.kde.dolphin", "name": "Dolphin", "group": "Programme", "hasCover": false, "inSunshine": false }
  ],
  "sunshineProblem": null
}
```

- `id` is stable: `<source>:<source id>`. Sources: `preset`, `steam`, `heroic`, `lutris`, `prism`, `desktop`.
- `inSunshine`: a Sunshine app created from this entry exists (the companion recognises its own apps,
  e.g. by a marker in the app entry, and matches the old hand-made ones by name where it can).
- `sunshineProblem`: `null` when the companion can reach Sunshine with its login, otherwise the German
  reason (e.g. "Sunshine-Login fehlt im PC-Helfer", "Sunshine-Login falsch"). Adding/removing
  cannot work then; the launcher should say so before the user presses A, not only after.
- Not listed: tools like Proton, Steam Linux Runtime, Steamworks Redist, Wallpaper Engine, VR-only games.

### `GET /api/cover/<id>`

PNG (portrait, ideally 600x900) for an entry with `hasCover`. 404 otherwise. `<id>` is URL-encoded.

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

`preset:desktop-plain` has no prep-cmd (screen stays as it is).

### `DELETE /api/apps`

Body `{ "name": "ELDEN RING" }`. Removes that Sunshine app. `204` on success.

### Errors

Non-2xx with `{ "error": "German message for the toast" }`.
