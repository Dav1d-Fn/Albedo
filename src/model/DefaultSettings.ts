import { Settings } from "./Types";

/** Settings used on first start, and to fill in keys missing from an older settings file. */
export class DefaultSettings
{
  public static readonly flatpakMoonlight = ["flatpak", "run", "com.moonlight_stream.Moonlight"];

  public static readonly systemMoonlight = ["moonlight"];

  public static create(): Settings
  {
    return {
      host: "",
      hostName: "",
      moonlightCommand: DefaultSettings.flatpakMoonlight,
      sunshineApiUrl: "",
      sunshineUser: "",
      sunshinePassword: "",
      afterStream: "ask",
      profiles:
      {
        handheld:
        {
          audio: "Stereo",
          autoRule: "Deck ohne Dock",
          defaultModeIndex: 0,
          modes:
          [
            { resolution: "1280x800", fps: 90, bitrateMbps: 25, hdr: false, codec: "HEVC" },
            { resolution: "1280x800", fps: 60, bitrateMbps: 15, hdr: false, codec: "HEVC" },
            { resolution: "1280x720", fps: 40, bitrateMbps: 10, hdr: false, codec: "HEVC" },
          ],
        },
        tv:
        {
          audio: "5.1 Surround",
          autoRule: "Dock mit Bildschirm",
          defaultModeIndex: 1,
          modes:
          [
            { resolution: "3840x2160", fps: 60, bitrateMbps: 80, hdr: true, codec: "HEVC" },
            { resolution: "2560x1440", fps: 120, bitrateMbps: 60, hdr: true, codec: "HEVC" },
            { resolution: "1920x1080", fps: 120, bitrateMbps: 40, hdr: false, codec: "HEVC" },
            { resolution: "1920x1080", fps: 60, bitrateMbps: 25, hdr: false, codec: "HEVC" },
          ],
        },
      },
      rememberedModes: {},
    };
  }

  /** Merges a parsed settings file over the defaults (shallow, profiles taken whole). */
  public static merge(stored: Partial<Settings>): Settings
  {
    const defaults = DefaultSettings.create();
    return {
      ...defaults,
      ...stored,
      profiles: { ...defaults.profiles, ...(stored.profiles ?? {}) },
      rememberedModes: stored.rememberedModes ?? {},
    };
  }
}
