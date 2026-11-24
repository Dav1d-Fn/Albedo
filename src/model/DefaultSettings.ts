import { UiText } from "../i18n/UiText";
import { DeviceProfile, Settings } from "./Types";

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
      hostMac: "",
      extraHostAddresses: [],
      moonlightCommand: DefaultSettings.flatpakMoonlight,
      sunshineApiUrl: "",
      sunshineUser: "",
      sunshinePassword: "",
      afterStream: "ask",
      afterStreamPerGame: {},
      showStreamSummary: false,
      backdropKind: "hero",
      backdropKindPerGame: {},
      steamGridDbKey: "",
      language: "",
      profiles:
      {
        handheld:
        {
          name: "Handheld",
          color: "blue",
          icon: "handheld",
          audio: "Stereo",
          autoRule: "Deck ohne Dock",
          displayName: "",
          performanceOverlay: false,
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
          name: "TV",
          color: "orange",
          icon: "tv",
          audio: "5.1 Surround",
          autoRule: "Dock mit Bildschirm",
          displayName: "",
          performanceOverlay: false,
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
      deviceOrder: ["handheld", "tv"],
      rememberedModes: {},
    };
  }

  /**
   * Merges a parsed settings file over the defaults. Profiles are taken from the file when it has any
   * (a deleted device must not come back), older profiles get the device fields they did not have yet.
   * The ids "handheld" and "tv" stay, so the "<game>|<device>" keys of `rememberedModes` keep working.
   */
  public static merge(stored: Partial<Settings>): Settings
  {
    const defaults = DefaultSettings.create();
    const storedProfiles = stored.profiles !== undefined && Object.keys(stored.profiles).length > 0 ? stored.profiles : defaults.profiles;

    const profiles: Record<string, DeviceProfile> = {};
    for (const [deviceId, storedProfile] of Object.entries(storedProfiles))
    {
      profiles[deviceId] = DefaultSettings.completeProfile(deviceId, storedProfile as Partial<DeviceProfile>, defaults.profiles);
    }

    // Keep the stored order for devices that still exist, then add any the order does not list.
    const deviceOrder = (stored.deviceOrder ?? []).filter((deviceId) => deviceId in profiles);
    for (const deviceId of Object.keys(profiles))
    {
      if (!deviceOrder.includes(deviceId))
      {
        deviceOrder.push(deviceId);
      }
    }

    return {
      ...defaults,
      ...stored,
      profiles,
      deviceOrder,
      extraHostAddresses: stored.extraHostAddresses ?? [],
      rememberedModes: stored.rememberedModes ?? {},
      afterStreamPerGame: stored.afterStreamPerGame ?? {},
      backdropKindPerGame: stored.backdropKindPerGame ?? {},
    };
  }

  /** Fills fields an older settings file did not have, from the default device of the same id or generic values. */
  private static completeProfile(deviceId: string, stored: Partial<DeviceProfile>, defaultProfiles: Record<string, DeviceProfile>): DeviceProfile
  {
    const fallback = defaultProfiles[deviceId] ?? defaultProfiles.tv;
    return {
      ...fallback,
      ...stored,
      name: stored.name ?? (defaultProfiles[deviceId]?.name ?? UiText.current.common.defaultDeviceName),
      color: stored.color ?? fallback.color,
      icon: stored.icon ?? fallback.icon,
      displayName: stored.displayName ?? "",
      modes: stored.modes !== undefined && stored.modes.length > 0 ? stored.modes : fallback.modes,
    };
  }
}
