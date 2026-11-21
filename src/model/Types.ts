// Shared data types. The settings file on disk has exactly the shape of `Settings`.

export type DeviceId = "handheld" | "tv";

export type PadButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "X" | "Y" | "L1" | "R1" | "MENU";

export type VideoCodec = "H.264" | "HEVC" | "AV1";

export type AudioLayout = "Stereo" | "5.1 Surround" | "7.1 Surround";

/** What happens to the game on the PC after Moonlight disconnects. */
export type AfterStreamAction = "ask" | "keep" | "quit";

/** When a device profile may be picked automatically. */
export type AutoRule = "Deck ohne Dock" | "Dock mit Bildschirm" | "Nur manuell";

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
  audio: AudioLayout;
  autoRule: AutoRule;
  defaultModeIndex: number;
  modes: StreamMode[];
}

export interface Settings
{
  /** IP or host name of the Sunshine PC, as Moonlight knows it. Empty = not set up yet. */
  host: string;
  /** Display name of the host (mDNS name), falls back to `host`. */
  hostName: string;
  /** Program plus fixed arguments, e.g. ["flatpak", "run", "com.moonlight_stream.Moonlight"]. */
  moonlightCommand: string[];
  /** Optional, settings file only: "https://<pc>:47990" + web UI login. Empty = `moonlight list` (needs pairing). */
  sunshineApiUrl: string;
  sunshineUser: string;
  sunshinePassword: string;
  profiles: Record<DeviceId, DeviceProfile>;
  /** "ask" shows the pause/quit dialog, "keep" leaves the game running, "quit" ends it. */
  afterStream: AfterStreamAction;
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
}

/** Answer of the companion's `GET /api/library`. */
export interface CompanionLibrary
{
  entries: LibraryEntry[];
  /** null when the companion can reach Sunshine, otherwise the German reason (adding cannot work then). */
  sunshineProblem: string | null;
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
