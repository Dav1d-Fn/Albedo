// Shared data types. The settings file on disk has exactly the shape of `Settings`.

export type DeviceId = "handheld" | "tv";

export type PadButton = "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "X" | "Y" | "L1" | "R1" | "MENU";

export type VideoCodec = "H.264" | "HEVC" | "AV1";

export type AudioLayout = "Stereo" | "5.1 Surround" | "7.1 Surround";

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
  /** Host name or IP of the Sunshine PC, as Moonlight knows it. */
  host: string;
  /** Program plus fixed arguments, e.g. ["flatpak", "run", "com.moonlight_stream.Moonlight"]. */
  moonlightCommand: string[];
  /** e.g. "https://192.168.1.10:47990". Empty = get the game list via `moonlight list`. */
  sunshineApiUrl: string;
  sunshineUser: string;
  sunshinePassword: string;
  profiles: Record<DeviceId, DeviceProfile>;
  /** "<game name>|<device>" -> mode index remembered for that game. */
  rememberedModes: Record<string, number>;
}
