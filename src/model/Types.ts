// Shared data types. The settings file on disk has exactly the shape of `Settings`.

/** Key of a device in `Settings.profiles`; "handheld" and "tv" for the two devices every install starts with. */
export type DeviceId = string;

/** Symbol of a device on the switch, in the editor and on toasts. */
export type DeviceIconKind = "handheld" | "tv" | "monitor" | "laptop" | "projector";

/** Accent colour of a device, from `DevicePalette`; the whole UI tints with the active device. */
export type DeviceColor = "blue" | "orange" | "green" | "violet" | "pink" | "teal" | "yellow" | "red";

export type PadButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "X" | "Y" | "L1" | "R1" | "MENU";

export type VideoCodec = "H.264" | "HEVC" | "AV1";

export type AudioLayout = "Stereo" | "5.1 Surround" | "7.1 Surround";

/** What happens to the game on the PC after Moonlight disconnects. */
export type AfterStreamAction = "ask" | "keep" | "quit";

/** When a device profile may be picked automatically. */
export type AutoRule = "Deck ohne Dock" | "Dock mit Bildschirm" | "Dieser Bildschirm" | "Nur manuell";

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
  backdropKind: BackdropKind;
  /** Game name -> backdrop kind for that game, missing = the default above. */
  backdropKindPerGame: Record<string, BackdropKind>;
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
}

/** Answer of the companion's `GET /api/library`. */
export interface CompanionLibrary
{
  entries: LibraryEntry[];
  /** null when the companion can reach Sunshine, otherwise the German reason (adding cannot work then). */
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

/** "Bild setzen" dialog on the detail page. */
export interface ImageDialogState
{
  /** 0 = picture kind (QR code), 1 = backdrop for this game. */
  row: number;
  kind: ArtKind;
  token: UploadToken | null;
  loading: boolean;
  error: string;
  /** Companion art version when the dialog opened; a different one means a picture arrived or was reset. */
  artVersion: number;
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

export interface DiscoveredHost
{
  name: string;
  address: string;
}

/** One mode of the PC's virtual streaming monitor (companion `GET /api/display-modes`). */
export interface PcDisplayMode
{
  width: number;
  height: number;
  /** Rounded to whole Hz. */
  refreshRate: number;
}
