<div align="center">
  <img src="artwork/steam/logo.png" alt="Albedo" width="420">
</div>

# Albedo – A Controller Launcher for Moonlight on the Steam Deck 🎮

> [!CAUTION]
> **Not every feature works on every PC yet.** The PC side is built for and tested on
> **KDE Plasma (Wayland)**, mostly with an AMD GPU. Albedo on the Deck and plain Sunshine streaming
> work with any PC that runs Sunshine, but switching the PC's screen to the Deck's resolution
> relies on KDE tools. The plug-free virtual monitor needs a kernel feature only known to work with
> AMD's driver; NVIDIA users take a cheap HDMI/DP dummy plug or the main monitor instead.
> See [Requirements](#requirements-) for what needs what.

<p align="center">
  <img src="docs/media/hero.gif" alt="Albedo's home screen: browsing games, then X switches from Handheld (blue) to TV (orange) and back" width="720">
</p>

**Not just a client.** On the Linux gaming PC, Albedo gives every stream its **own virtual
monitor** in the Deck's resolution and refresh rate (1280×800 @ 90, or whatever the profile asks
for): a free connector of the graphics card becomes a monitor through an EDID override, **no dummy
plug needed** (AMD). Your real monitors go dark while you play and come back exactly as they were
when the stream ends. On Windows, Apollo is known for this; Sunshine on Linux has nothing like it
built in. Details in [A Virtual Screen on the PC](#️-a-virtual-screen-on-the-pc).

---

## Installation 💻

### Steam Deck 🕹️

Switch to **Desktop Mode**, open **Konsole** (the terminal) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/deck/install.sh | bash
```

The script

- downloads the newest AppImage to `~/Applications/`,
- offers to install Moonlight (Flatpak) if it is missing,
- asks before closing Steam, then adds Albedo as a **non-Steam game** with cover, hero, logo and
  icon, and starts Steam again.

Running it again updates the entry instead of adding a second one (a hand-made entry for the
AppImage is picked up, too). `shortcuts.vdf` is backed up first (`shortcuts.vdf.bak-…`).

Back in **Game Mode**, start Albedo and **pair** it once: pick your PC, press *Pair* and type the
PIN it shows into Sunshine's web UI under *PIN*.

To remove it again:

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/deck/install.sh | bash -s -- --uninstall
```

**Updates** come from the app itself: when a new release is out, Albedo asks on start, **A**
installs it and restarts.

### Gaming PC 🖥️

Albedo only needs [Sunshine](https://github.com/LizardByte/Sunshine) on the PC to list and start
games. For adding games from the couch, cover art and picture upload, install **Albedo Companion**
on the PC (Linux) – open a terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash
```

It starts with your desktop and waits in the tray and updates itself (see
[Self-Update](#-self-update)); running the command again also updates it,
`| bash -s -- --uninstall` removes it. Sunshine login, the optional virtual monitor and
troubleshooting are in [PC setup](#pc-setup-) below.

---

## Overview 📋

**Albedo** is the menu you see on the Steam Deck before and after streaming a game from your gaming
PC. It lists the games (Sunshine apps) of the PC with their artwork and starts
[Moonlight](https://moonlight-stream.org/) with the resolution, frame rate, bitrate, codec and HDR
setting of the **device** you are playing on right now. Moonlight does the streaming; when it
exits, you are back in Albedo.

Built with [Tauri 2](https://v2.tauri.app/), [React](https://react.dev/) and Rust, controlled
entirely with the gamepad.

### Why?

- **Moonlight-qt** works great, but its menu is a desktop app: small, not pretty on a TV, and it
  has *one* set of stream settings. Playing handheld at 1280×800 and docked on a 4K TV means
  digging through the settings every time.
- **[MoonDeck](https://github.com/FrogTheFrog/moondeck)** solved a lot of this, but it is no longer
  developed.
- **A screen for the stream** on a Linux PC meant a dummy plug or switching monitors by hand.
  Albedo does it for every stream, with a virtual monitor and no plug.

Albedo keeps Moonlight for what it is great at and replaces only the menu: one tap on **X**
switches between Handheld and TV, and the whole UI tints with the device (blue / orange) so you
always see which settings are active.

---

## Features ✨

### 📺 Devices & Profiles

Every **device** (Handheld, TV, … add as many as you like) has its own **device settings** (name,
colour, symbol, audio Stereo / 5.1 / 7.1, when it becomes active) and a list of **profiles**:
resolution, FPS, bitrate, codec (H.264 / HEVC / AV1) and HDR.

- **X** switches the device, **L1 / R1** the profile.
- **Y** on a game's detail page remembers the profile for *that game on that device*, e.g. 40 FPS
  for a heavy game in handheld mode.
- **☰** opens the editor *Devices*: on the left *Device settings* and the device's profiles, on
  the right the values of the selected entry. Add, rename, recolor and delete devices and profiles.

<p align="center">
  <img src="docs/media/profiles.gif" alt="R1 and L1 switch the profile on the home screen; on a game's page Y remembers the profile for that game" width="720">
</p>

<p align="center">
  <img src="docs/media/devices.gif" alt="The device editor: device settings, a profile's values, then the TV device" width="720">
</p>

### 🖥️ A Virtual Screen on the PC

When a stream starts, the PC switches to a screen made for the Deck, and back when it ends:

- **Virtual connector (AMD, no plug).** A free connector of the graphics card is forced on with
  its own EDID and shows up as a monitor in exactly the Deck's modes. Your real monitors turn off
  for the stream, nothing on the desk has to change. A mode is missing? **Y** (*Add on PC*) in the
  Deck's profile editor or *Display* in Albedo Companion puts it into the EDID; the PC asks for
  your password first, so nothing changes without you.
- **Dummy plug.** The same with a few-euro HDMI/DP plug: the way to go on NVIDIA or Intel, or
  when no connector is free.
- **Main monitor.** No second screen: it only changes its resolution for the stream.

Which one a stream uses, you pick per profile (*Screen on the PC*); *Automatic* takes the virtual
connector, else the dummy plug, else nothing switches. The resolution and refresh rate follow the
profile, and if the PC's screen can't do it exactly, Albedo tells you what you will actually get.
Albedo Companion's *Display* area shows all three and tests each one with a 10-second switch.
Setup: [Resolution switching](#3-resolution-switching-kde).

### 🔌 Automatic Device Detection

Albedo watches the Deck's display outputs. Undocked it picks the device with the rule *Deck
undocked*, docked with a screen the one with *Docked with screen*. A device can also be tied to **one
specific screen** by its name (read from the screen's EDID, e.g. `LG TV SSCR2`), so the living
room TV and the desk monitor each get their own settings.

### 🧩 Companion: Add Games from the Couch

With Albedo Companion running on the PC, the last tile on the home screen, **Add games**, lists
everything installed on the PC, grouped by source:

- **Steam** (all library folders) and **non-Steam games** in Steam (with their custom artwork)
- **Emulation** (EmuDeck, RetroArch, Cemu, Eden, melonDS …)
- **Heroic** (Epic / GOG), **Lutris**, **Prism Launcher** (Minecraft instances)
- **Programs** from `.desktop` files, plus presets: *Desktop* and *Steam Big Picture*

**A** turns an entry into a Sunshine app (start command, cover, and a stop command that really
ends the game), **X** removes it again. No editing `apps.json` by hand.

<p align="center">
  <img src="docs/media/library.gif" alt="Opening Add games, switching to the Steam group with R1 and adding Manor Lords, which then shows up on the home screen" width="720">
</p>

### 🖼️ Artwork & Pictures via QR Code

Covers, hero images, logos and Steam screenshots come straight from the PC. Don't like a picture?
*Set image* shows a **QR code**: scan it with your phone, pick any image, and it replaces the
cover, hero or logo of that game – on the Deck and in Sunshine. The picture search also finds
pictures in the Steam store, libretro's retro thumbnails and, with a free
[SteamGridDB](https://www.steamgriddb.com/profile/preferences/api) API key, SteamGridDB. The key is
entered once, on the Deck (*Connection*) or in Albedo Companion, and kept by the companion on the PC
for both.

<p align="center">
  <img src="docs/media/qr-upload.png" alt="The picture dialog with a QR code and pictures from the Steam store, next to the upload page on the phone" width="900">
</p>

### 🖱️ Albedo Companion: Manage It at the Desk

Open [Albedo Companion](pc-app/) from the tray to do the same with mouse and keyboard on the PC: add and remove games,
move a game into another group (or an own one, like *Couch co-op*) when the emulation detection
gets it wrong, set pictures from the picture search or by dragging a file in, pair a device with
its PIN, and enter the Sunshine login. Group changes show up on the Deck too. Under *Display* it
shows the PC's stream screens, lets you pick the dummy plug and main monitor and test each one.

<p align="center">
  <img src="docs/media/pc-app-library.png" alt="Albedo Companion: the library by group with covers, a selected game and its group menu" width="900">
</p>

### ⏰ Wake-on-LAN

When the PC is asleep or off, the home screen says so in the middle of the screen and offers
**Wake PC** (A, or Y anywhere on the home screen): Albedo sends a magic packet and shows the
seconds until Sunshine answers, then the games load by themselves. A PC that starts on its own is
noticed too, Albedo checks every few seconds. It works on the home network once Albedo has
connected to the PC there once (until then the screen says why it can't wake the PC yet);
the PC needs Wake-on-LAN enabled in its BIOS and network driver, see
[docs/wake-on-lan.md](docs/wake-on-lan.md).

### ⏹️ After the Stream

When Moonlight disconnects, Albedo asks whether the game should keep running on the PC
(*Pause*) or be closed (*Quit*). **Y** remembers the answer, per game if you like.
Optionally it also shows Moonlight's statistics of the stream: frame rates, latency and lost frames.

<p align="center">
  <img src="docs/media/stats.png" alt="After the stream: Moonlight's statistics and the choice to keep the game running or quit it" width="720">
</p>

### 🌐 Home & Away

Albedo finds Sunshine PCs on the network via mDNS. It tries the home address first and extra
addresses (e.g. [Tailscale](https://tailscale.com/)) after that, so the same setup works on the
road.

### 🔄 Self-Update

Releases are signed, and both apps only install releases signed with the project's key.

- **Albedo on the Deck** checks GitHub on start (`latest.json`) and updates itself after you
  confirm with **A**.
- **Albedo Companion on the PC** checks at start and every 6 hours (its own
  `latest-companion.json`). An update shows in the tray menu (*Update verfügbar*) and in the
  window's sidebar; on the Deck a hint appears on the home screen, and **Connection → PC
  companion** shows its version with **Aktualisieren / Update**. Installing replaces the AppImage
  at its path (`~/Applications/Albedo-Companion-x86_64.AppImage`, which the Sunshine undo steps
  call) and restarts it in the tray. While Sunshine runs a game, the install waits until it is
  closed. Nothing installs on its own: you click it in one of those places.
- Deck and companion compare an API version; when they don't fit, the Deck says which one to
  update.

---

## Requirements 📋

> [!NOTE]
> The interface speaks **German and English**. It follows the system language until you pick one under Connection → Language.

### Steam Deck

- SteamOS 3 (Game Mode)
- [Moonlight](https://flathub.org/apps/com.moonlight_stream.Moonlight) as Flatpak – the installer
  offers to install it

### Gaming PC

| What you want | What the PC needs | Works on |
|---|---|---|
| List and start games | [Sunshine](https://github.com/LizardByte/Sunshine) | Any OS Sunshine runs on |
| Albedo Companion: add games, artwork, QR upload | Linux, `curl`, `magick` (ImageMagick), `gio`, `sqlite3` (Lutris only); a tray (StatusNotifier) to open the window | Any Linux desktop; the program list reads `.desktop` files. Without a desktop: `--headless` |
| Screen follows the Deck's resolution | `kscreen-doctor`, `sunshine-match-client` (from [`pc-setup/`](pc-setup/)) | **KDE Plasma only** |
| … on the main monitor | nothing more | Any GPU |
| … on a dummy plug | an HDMI/DP dummy plug (headless display emulator) in a free port | Any GPU, **recommended for NVIDIA** |
| … on a virtual connector without a plug | DRM debugfs `edid_override` / `force` on a free connector | **Tested on AMD only** |

What exactly depends on what:

- **KDE Plasma.** The companion reads the outputs and modes with `kscreen-doctor -j`, and the
  games it adds run `sunshine-match-client` before the stream (Albedo Companion saves your screen
  layout, then switches with `kscreen-doctor`) and `sunshine-match-client --restore` after it (puts
  the saved layout back). On GNOME, Sway, Hyprland or X11 nothing switches; the stream still starts,
  but at whatever resolution the PC screen has. The switching lives in one place
  ([`companion/src/display_backend.rs`](companion/src/display_backend.rs)), so other desktops can be added.
- **Main monitor.** Needs no extra hardware: the primary monitor (or `MAIN_OUTPUT=` in
  `~/.config/sunshine-match-client.conf`) switches to the exact mode, else one with the same
  aspect ratio, and back afterwards. If it has neither (an ultrawide for the Deck's 16:10), it
  keeps its own mode and Sunshine scales the picture. Your other monitors stay on. The profile
  editor shows what will happen.
- **Dummy plug.** A few-euro HDMI or DisplayPort plug that pretends to be a monitor. Works with every
  GPU and driver, so it is the way to go on **NVIDIA**. Your real monitors turn off for the stream.
  Its modes come from the plug's own EDID; buy one that has the Deck's 1280×800 (often listed as
  "4K/1440p/1080p … with 16:10"), because Albedo can't add modes to it.
- **Virtual connector (AMD).** A real but unused connector (`DP-3` on the test machine) is forced
  to *connected* with a custom EDID through `/sys/kernel/debug/dri/*/<connector>/edid_override`
  and `force`. This is a kernel DRM feature; it is tested with `amdgpu` only. Intel may work, the
  proprietary NVIDIA driver most likely doesn't offer it. Missing modes can be added from the Deck
  or under *Display* in Albedo Companion.
- **Connector names.** They are stored in `~/.config/sunshine-match-client.conf`
  (`VIRTUAL_OUTPUT=`, `DUMMY_OUTPUT=`, optional `MAIN_OUTPUT=`), which Albedo Companion reads. The
  virtual connector is picked during its setup; the dummy plug and the main monitor are picked
  under *Display* in Albedo Companion (or with the installer's `--dummy-plug`).

The *Desktop (no display switch)* preset, profiles set to *Don't switch* and games you add to Sunshine yourself skip all of this
and work on any setup.

Tested on: Steam Deck with SteamOS 3, Fedora with KDE Plasma 6 (Wayland) and an AMD GPU.
If you get it running on something else, please [tell us](https://github.com/Dav1d-Fn/Albedo/issues).

---

## PC Setup 🛠️

### 1. Sunshine

Install [Sunshine](https://github.com/LizardByte/Sunshine), set a web UI login and make sure
Moonlight can connect. That is all Albedo needs to list and start games.

### 2. Albedo Companion

Albedo Companion is the one program on the PC: the Deck talks to it, and its window is where you
manage games, pictures, devices and the stream screen. The command from
[Gaming PC](#gaming-pc-) installs it, no Rust or Node needed:

- downloads `Albedo-Companion-x86_64.AppImage` from the latest
  [release](https://github.com/Dav1d-Fn/Albedo/releases) and checks it against `SHA256SUMS`,
- puts it into `~/Applications/` with a menu entry and an autostart entry,
- starts it in the tray.

An older setup (the separate `albedo-companion` or `streaming-launcher-companion` service, or the
*Albedo PC* app) is replaced; its config stays.

**Using it.** At login it starts in the tray. Click the tray icon and pick *Open* for the window.
Closing the window puts it back into the tray (and frees its memory). *Quit* in the tray menu ends
it completely, and the Deck can't add games until you start it again. Starting it a second time
only brings up the window.

**Without a desktop**, run `Albedo-Companion-x86_64.AppImage --headless` (for example from your
own systemd user service): only the service for the Deck, no window, no tray. **Developers** build
from a checkout with `pc-setup/install.sh --build` (needs Rust and Node).

**Sunshine login.** The companion needs Sunshine's web UI login to add and remove games. You don't
have to edit anything: the first time you press **A** in *Add games*, the Deck asks for it, or you
enter it under *Status & login* in Albedo Companion. Without it the game list still shows. The
login is stored in `~/.config/albedo-companion/config.json` (created on first start, readable only
by you):

```json
{
  "port": 47995,
  "sunshineUrl": "https://localhost:47990",
  "sunshineUser": "",
  "sunshinePassword": ""
}
```

After editing that file by hand, quit and start Albedo Companion again.

**Firewall.** Open port **47995/tcp**. The companion only answers the home network (private IPv4
ranges), Tailscale (`100.64.0.0/10`) and the PC itself, and it never runs commands a client sends:
it only creates Sunshine apps from games it found itself.

Check that it runs:

```bash
curl -s localhost:47995/api/health
```

More details: the window in [`pc-app/`](pc-app/README.md), the API in
[`companion/API.md`](companion/API.md).

### 3. Resolution switching (KDE)

Step 2 already installed `sunshine-match-client`, so profiles set to *Main monitor* work right
away. For a separate streaming monitor (your real monitors turn off for the stream and come back
exactly as they were), set up one of these.

The **Display** area in Albedo Companion shows all three routes (set up or not, connector,
connected, what *Automatic* picks right now) with their modes. There you pick the dummy plug's
connector and, if it isn't the primary one, the main monitor, add modes to the virtual connector
and **test** each route: it switches once like a stream would (1280×800@60 or a mode you pick),
comes back after 10 seconds by itself and shows the result. Don't test during a stream.

**Dummy plug (any GPU, recommended for NVIDIA).** Plug it in and pick it under *Display* in
Albedo Companion, or find its connector with `kscreen-doctor -o` (the new output, e.g.
`HDMI-A-1`) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash -s -- --dummy-plug HDMI-A-1
```

It writes `DUMMY_OUTPUT=HDMI-A-1` to `~/.config/sunshine-match-client.conf` and lists the plug's
modes. No sudo.

**Virtual connector (AMD, no plug).** The PC gets a virtual monitor on a free connector:

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash -s -- --virtual-monitor --dry-run   # shows what it would do
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash -s -- --virtual-monitor
```

This is the same installer as in step 2 (in a checkout: `pc-setup/install.sh --virtual-monitor`).
It installs or updates Albedo Companion first, fetches its helper files from GitHub, then

1. checks for KDE Plasma on Wayland, the `amdgpu` driver, `kscreen-doctor`, `jq` and `python3`,
2. lists the free connectors (no monitor plugged in) and lets you pick one; don't plug a real
   monitor into it later,
3. builds an EDID with the stream modes and installs a boot service that forces it onto that
   connector (`virtual-display-edid.service`; asks for your sudo password),
4. installs `sunshine-match-client` to `~/.local/bin` and writes the connector name to
   `~/.config/sunshine-match-client.conf`,
5. optionally stops `xwaylandvideobridge` for the length of a stream (Sunshine `global_prep_cmd`).
   On the first connect after booting, KWin and Xwayland can deadlock while the monitors switch;
   this avoids it. You only lose screen sharing from X11 apps during the stream,
6. shows with `kscreen-doctor` whether the new monitor has the modes. If it doesn't show up yet,
   log out and back in once.

The EDID has 1280×720 (40/60), 1280×800 (60/90), 1920×1080, 2560×1440 (60/100/120) and
3840×2160 (60/100). Add your own with `--mode`, e.g. `… | bash -s -- --mode 3440x1440@100`; the
profile editor in Albedo marks values the PC doesn't have. Modes can also be added later under
*Display* in Albedo Companion or from the Deck's profile editor (KDE asks for your password on the
PC). Run the installer again to change the connector.

Setting the virtual connector up and removing it stay in the terminal: they need root, pick a
connector and change files in `/etc`, and the connector appears or disappears for KWin while it
runs, so it is better watched than started by a click. Albedo Companion shows the command to copy.
Removing only the virtual connector (the dummy plug and Albedo Companion stay):

```bash
curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash -s -- --remove-virtual-monitor
```

Test the switch without a stream (prints the command only):

```bash
SUNSHINE_CLIENT_WIDTH=1280 SUNSHINE_CLIENT_HEIGHT=800 SUNSHINE_CLIENT_FPS=90 sunshine-match-client --dry-run
```

`sunshine-match-client` logs to `~/.local/state/sunshine-match-client.log`. If the PC ever stays
on the virtual monitor (crash during a stream), `sunshine-match-client --restore` brings your
screens back.

Both can be set up at once (`--dummy-plug HDMI-A-1 --virtual-monitor`); each profile on the Deck
picks one under *Screen on the PC*.

To remove everything: `… | bash -s -- --uninstall` (Albedo Companion with its autostart, old companion
services and the virtual monitor; the config in `~/.config/albedo-companion/` with the Sunshine
login stays).

> [!NOTE]
> Coming from a setup with [screenprofiler](https://github.com/Kakiharu/screenprofiler)? Albedo
> no longer needs it. The companion switches apps with the undo `screenprofilercmd load main`
> to `sunshine-match-client --restore` the next time you add a game.

---

## Security 🔒

Albedo is made for your **home network**. Nothing of it belongs on the open internet.

> [!WARNING]
> **Never forward Sunshine's ports (47984–48010, web UI 47990) or the companion's port 47995 in
> your router.** To play away from home, use a VPN such as [Tailscale](https://tailscale.com/) and
> add the PC's Tailscale address in *Connection*.

| Part | How it is protected |
|---|---|
| **Moonlight ↔ Sunshine** | Paired once with a PIN; after that both sides know each other's certificate and the stream is encrypted. Unpaired devices get nothing. |
| **Sunshine web UI** (47990) | Sunshine's own username and password. |
| **Albedo Companion** (47995) | Runs while the app runs (also in the tray). No login. It only answers the home network (private IPv4 ranges), Tailscale (`100.64.0.0/10`) and localhost, and drops everything else, even if the port were forwarded. It never runs commands sent by a client: it only creates Sunshine apps for games it found on the PC itself, and screen settings only accept connectors the desktop reports. Anything that needs root (a new mode for the virtual connector) asks for your password on the PC. |
| **Picture upload links** | Random, valid for a few minutes and usable once. |
| **Sunshine login in the companion** | Stored in the companion's config on the PC (readable only by your user), never sent back to any client. |
| **SteamGridDB key** | Stored in the same config, never sent back to any client (they only see its last four characters). The picture search asks SteamGridDB through the companion, which adds the key. |
| **Updates** | Signed; both apps only install releases signed with the project's key. The Deck can ask the companion to update (`POST /api/update`), but only to the signed release from GitHub, never to anything the request names. |

**What someone on your Wi-Fi could do:** because the companion has no login, any device in your
home network could add or remove Sunshine apps, delete pictures you set, quit a running game,
replace the Sunshine login or SteamGridDB key stored in the companion, change which connector is
the dummy plug or main monitor, or start a 10-second screen test on the PC. It cannot read your files,
run programs or see the Sunshine password or the SteamGridDB key. If guests use your network, put them on a guest Wi-Fi.

---

## Controls 🎮

| Button | Keyboard | Home | Game detail |
|---|---|---|---|
| D-pad / stick | Arrows | Move | Move |
| **A** | Enter / Space | Open game / *Add games* | Start stream / selected action |
| **B** | Esc / Backspace | – | Back |
| **X** | X | Switch device | Switch device |
| **Y** | Y | Reload list | Remember profile for this game |
| **L1 / R1** | Q / E | Previous / next profile | Previous / next profile |
| **☰** | M | Device editor | Device editor |

In the editor: **L1 / R1** pick the device, **Y** makes a profile the default, **X** deletes the
selected profile or, on *Device settings*, the device (press **X** again to confirm).
The buttons under the profiles add a profile or a device. **B** or **☰** closes it.
In *Add games*: **L1 / R1** switch the group, **A** adds, **X** removes.

Albedo reads the gamepad itself; Steam Input's *Gamepad* template is all it needs.

---

## Configuration ⚙️

Everything can be set in the app (*Connection* and the **☰** editor). The settings live in
`~/.config/de.davidf.albedo/settings.json`; a few keys exist only there:

| Key | Meaning |
|---|---|
| `extraHostAddresses` | More addresses of the PC (e.g. Tailscale), tried after `host` |
| `moonlightCommand` | How Moonlight is started, default `["flatpak", "run", "com.moonlight_stream.Moonlight"]` |
| `sunshineApiUrl`, `sunshineUser`, `sunshinePassword` | Game list straight from Sunshine's web API when no companion is running |

Without companion and without a Sunshine login, the game list comes from `moonlight list`, which
only knows what Moonlight has cached.

---

## Development 🧑‍💻

```bash
npm install
npm run tauri dev
```

- `ALBEDO_DRY_RUN=1 npm run tauri dev` – logs the Moonlight command instead of
  streaming to the PC you are sitting at.
- `ALBEDO_COMPANION_PORT=<port>` – talk to a test companion on another port than 47995.
- `npm run dev` – only the UI in a browser at <http://localhost:1430>, with fake data
  (`src/dev/BrowserMock.ts`).
- Keyboard = controller, see [Controls](#controls-).
- Tests and checks: `cd src-tauri && cargo test`, `cd companion && cargo test`,
  `cd pc-app/src-tauri && cargo test`, `npx tsc --noEmit`.
- Build an AppImage locally: `npm run tauri build -- --bundles appimage`.

Code style and project layout are described in [`CLAUDE.md`](CLAUDE.md). Formatting:
`cargo +nightly fmt` (Allman braces).

### Releases

Bump the version in `src-tauri/tauri.conf.json` (and in `pc-app/src-tauri/tauri.conf.json` +
`pc-app/src-tauri/Cargo.toml` when the companion changed: its updater only offers a higher
version), then push a tag:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

GitHub Actions builds the AppImage on Ubuntu 22.04 (its glibc matches SteamOS), signs it and
publishes the release with `latest.json` for the Deck's updater, and the companion AppImage
with its `.sig` and `latest-companion.json` for the companion's updater. The signing key is only in the repository
secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` – without it, installed
copies no longer accept updates.

### Known quirks

- Don't add `WEBKIT_DISABLE_DMABUF_RENDERER=1` to the launch options. It forces WebKitGTK into
  software rendering and the home screen drops to a few FPS. Older installers set it; running the
  current installer again removes it.
- The AppImage strips its own `LD_LIBRARY_PATH` before starting Flatpak programs.

---

## Dependencies 📦

Albedo is built on the shoulders of great open-source projects:

- [Moonlight](https://github.com/moonlight-stream/moonlight-qt) – the actual game streaming client.
- [Sunshine](https://github.com/LizardByte/Sunshine) – the streaming host on the PC.
- [Tauri](https://github.com/tauri-apps/tauri) – app shell and self-updater.
- [React](https://github.com/facebook/react) – UI.
- [gilrs](https://gitlab.com/gilrs-project/gilrs) – gamepad input.
- [Inter](https://rsms.me/inter/) – font, via [Fontsource](https://fontsource.org/).

Albedo is not affiliated with Valve, Moonlight or LizardByte. Game artwork shown in the app comes
from your own PC and belongs to its respective owners.

---

## Donations 💖

If you enjoy using Albedo and want to support its development, you can buy me a coffee:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/davidfn)

---

## Feedback & Contributions

Found a bug or have a feature idea?
Feel free to [open an issue](https://github.com/Dav1d-Fn/Albedo/issues) or reach out!

---

## License 📄

[GPL-3.0](LICENSE) — if you build something with this code, your project has to stay open source too.

---

Thank you for using Albedo 🙌
