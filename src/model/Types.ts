// Shared data types. The settings file on disk has exactly the shape of `Settings`.

/** Key of a device in `Settings.profiles`; "handheld" and "tv" for the two devices every install starts with. */
export type DeviceId = string;

/** Symbol of a device on the switch, in the editor and on toasts. */
export type DeviceIconKind = "handheld" | "tv" | "monitor" | "laptop" | "projector";

/** Accent colour of a device, from `DevicePalette`; the whole UI tints with the active device. */
export type DeviceColor = "blue" | "orange" | "green" | "violet" | "pink" | "teal" | "yellow" | "red";

export type PadButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "X" | "Y" | "L1" | "R1" | "MENU";

/**
 * Result of checking the SteamGridDB key on the PC helper. "unchecked" until the helper has an endpoint
 * for it (or the check was not run yet), "unreachable" when the helper or SteamGridDB did not answer.
 */
export type SteamGridDbKeyCheck = "unchecked" | "checking" | "valid" | "invalid" | "unreachable";

export type VideoCodec = "H.264" | "HEVC" | "AV1";

export type AudioLayout = "Stereo" | "5.1 Surround" | "7.1 Surround";

/** Language of the UI; the settings store "" until one is picked (= system language). */
export type UiLanguage = "de" | "en";

/** What happens to the game on the PC after Moonlight disconnects. */
export type AfterStreamAction = "ask" | "keep" | "quit";

/** When a device profile may be picked automatically. The German values are stored in settings.json; the UI translates them. */
export type AutoRule = "Deck ohne Dock" | "Dock mit Bildschirm" | "Dieser Bildschirm" | "Nur manuell";

/**
 * Stream settings of a device, called "Profil" in the UI. The code and settings.json keep the old
 * name ("modes", "defaultModeIndex", "rememberedModes"), so existing settings files load unchanged.
 */
export interface StreamMode
{
  /** "WIDTHxHEIGHT", e.g. "2560x1440". */
  resolution: string;
  fps: number;
  bitrateMbps: number;
  hdr: boolean;
  codec: VideoCodec;
}

export interface DeviceProfile
{
  /** Shown on the switch, e.g. "Handheld", "TV Wohnzimmer". */
  name: string;
  color: DeviceColor;
  icon: DeviceIconKind;
  audio: AudioLayout;
  autoRule: AutoRule;
  /** Monitor name from the screen's EDID for the rule "Dieser Bildschirm", e.g. "LG TV SSCR2". */
  displayName: string;
  /** Moonlight's stats overlay during the stream (FPS, latency, dropped frames); Select+L1+R1+X toggles it live. */
  performanceOverlay: boolean;
  defaultModeIndex: number;
  modes: StreamMode[];
}

/** Picture behind the menu for the selected game: Steam title image, rotating screenshots, blurred cover or none. */
export type BackdropKind = "hero" | "screenshots" | "cover" | "none";

export interface Settings
{
  /** IP or host name of the Sunshine PC in the home network, as Moonlight knows it. Empty = not set up yet. */
  host: string;
  /** More addresses of the same PC (e.g. its Tailscale IP), tried after `host`; the first reachable one is used. */
  extraHostAddresses: string[];
  /** Display name of the host (mDNS name), falls back to `host`. */
  hostName: string;
  /** Program plus fixed arguments, e.g. ["flatpak", "run", "com.moonlight_stream.Moonlight"]. */
  moonlightCommand: string[];
  /**
   * Optional, settings file only: "https://<pc>:47990" + web UI login. Empty = `moonlight list` (needs pairing).
   * The host part is replaced by the PC address that is reachable right now.
   */
  sunshineApiUrl: string;
  sunshineUser: string;
  sunshinePassword: string;
  profiles: Record<DeviceId, DeviceProfile>;
  /** Devices in switch order; at least one. */
  deviceOrder: DeviceId[];
  /** "ask" shows the pause/quit dialog, "keep" leaves the game running, "quit" ends it. */
  /** Default after a normal disconnect; a game can override it in `afterStreamPerGame`. */
  afterStream: AfterStreamAction;
  /** Game name -> after-stream action for that game, missing = the default above. */
  afterStreamPerGame: Record<string, AfterStreamAction>;
  /** After a normal disconnect, show Moonlight's stream statistics (average FPS, latency, dropped frames). */
  showStreamSummary: boolean;
  backdropKind: BackdropKind;
  /** Game name -> backdrop kind for that game, missing = the default above. */
  backdropKindPerGame: Record<string, BackdropKind>;
  /** Optional API key for SteamGridDB (picture search in "Bild setzen"); empty = only the Steam shop. */
  steamGridDbKey: string;
  /** UI language; "" = follow the system language (German if it is German, else English). */
  language: UiLanguage | "";
  /** "<game name>|<device>" -> mode index remembered for that game. */
  rememberedModes: Record<string, number>;
}

/** A game, program or preset the companion on the PC can add to Sunshine (companion/API.md). */
export interface LibraryEntry
{
  /** Stable "<source>:<source id>", e.g. "steam:1245620". */
  id: string;
  name: string;
  /** Display group, e.g. "Steam", "Voreinstellungen". */
  group: string;
  hasCover: boolean;
  inSunshine: boolean;
  /** A wide title image for the backdrop exists (Steam hero, Epic key art). */
  hasHero: boolean;
  /** A logo with the game's name exists (Steam logo or one set by hand). */
  hasLogo: boolean;
  /** The user's screenshots of this game, 0 = newest; only Steam games have them. */
  screenshotCount: number;
  /** Picture kinds set by hand (phone or picture search); a hand-set "hero" is always the backdrop. */
  customArt: ArtKind[];
  /** Emulated system of an EmuDeck game ("Nintendo 64"), picks the libretro pictures; older companions send none. */
  system?: string | null;
}

/** Answer of the companion's `GET /api/library`. */
export interface CompanionLibrary
{
  entries: LibraryEntry[];
  /** null when the companion can reach Sunshine, otherwise the reason in the UI language (adding cannot work then). */
  sunshineProblem: string | null;
}

/** Picture kinds that can be set by hand from the phone. */
export type ArtKind = "cover" | "hero" | "logo";

/** One-time upload page of the companion, shown as QR code. */
export interface UploadToken
{
  url: string;
  /** QR code of `url` as SVG markup from the companion. */
  qrSvg: string;
  expiresInSeconds: number;
}

/** A picture from the internet the dialog offers instead of a phone upload. */
export interface ArtCandidate
{
  imageUrl: string;
  thumbnailUrl: string;
  /** Where it comes from: "Steam-Shop", "SteamGridDB" or "libretro". */
  source: string;
  label: string;
}

/** Answer of the launcher's picture search. */
export interface ArtSearchResult
{
  candidates: ArtCandidate[];
  /** Reason (in the UI language) a source failed (e.g. a wrong SteamGridDB key), null when all answered. */
  problem: string | null;
}

/** Rows of the "Bild setzen" dialog; "backdrop" is only there while the game has no title image set by hand. */
export type ImageDialogRow = "kind" | "search" | "pictures" | "backdrop";

/** "Bild setzen" dialog on the detail page. */
export interface ImageDialogState
{
  row: ImageDialogRow;
  kind: ArtKind;
  token: UploadToken | null;
  loading: boolean;
  error: string;
  /** Name the pictures are searched for; starts as the app name without tags, the user can type another. */
  query: string;
  /** Pictures from the Steam shop, libretro and SteamGridDB for `kind` and `query`. */
  candidates: ArtCandidate[];
  candidateIndex: number;
  searching: boolean;
  searchProblem: string;
  /** A picked picture is being downloaded and sent to the PC. */
  applying: boolean;
  /** Companion art version when the dialog opened; a different one means a picture arrived or was reset. */
  artVersion: number;
  /** The game's current title image for the "now" preview; covers and logos come from the home state. */
  heroPreview: string | null;
}

/** Dialog on the "Hinzufügen" screen that hands the Sunshine web UI login to the companion. */
export interface SunshineLoginDraft
{
  user: string;
  password: string;
  /** 0 = user field, 1 = password field, 2 = "Speichern". */
  row: number;
  busy: boolean;
  error: string;
}

/** The Sunshine app running on the PC right now, streamed or paused (src-tauri/src/running_host_app.rs). */
export interface RunningHostApp
{
  appId: string;
  /** From Moonlight's app cache; null when Moonlight does not know the id. */
  appName: string | null;
}

export interface DiscoveredHost
{
  name: string;
  address: string;
}

/** One mode of the PC's virtual streaming monitor (companion `GET /api/display-modes`). */
/** Outcome of "add this mode to the PC" (companion `GET /api/display-modes/request`). */
export interface PcModeRequest
{
  state: "idle" | "waiting" | "done" | "reboot" | "cancelled" | "failed" | "dryRun";
  /** "2560x1600@90" */
  mode?: string;
  message?: string;
}

export interface PcDisplayMode
{
  width: number;
  height: number;
  /** Rounded to whole Hz. */
  refreshRate: number;
}
