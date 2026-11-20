import { DeviceId, StreamMode } from "./Types";

/** Formats stream modes and devices for display, e.g. "1440p · 120 FPS · 60 Mbit/s". */
export class ModeText
{
  public static readonly deviceNames: Record<DeviceId, string> = { handheld: "Handheld", tv: "TV" };

  public static readonly accentColors: Record<DeviceId, string> = { handheld: "#5AA9FF", tv: "#FF9F45" };

  /** "2560x1440" -> "1440p", "3840x2160" -> "4K". */
  public static shortResolution(resolution: string): string
  {
    const height = ModeText.size(resolution).height;
    return height >= 2160 ? "4K" : height + "p";
  }

  /** "2560x1440" -> "2560 × 1440". */
  public static prettyResolution(resolution: string): string
  {
    return resolution.replace("x", " × ");
  }

  public static size(resolution: string): { width: number; height: number }
  {
    const [width, height] = resolution.split("x").map(Number);
    return { width, height };
  }

  /** "1440p · 120" */
  public static label(mode: StreamMode): string
  {
    return ModeText.shortResolution(mode.resolution) + " · " + mode.fps;
  }

  /** "1440p · 120 FPS · 60 Mbit/s" */
  public static spec(mode: StreamMode): string
  {
    return ModeText.label(mode) + " FPS · " + mode.bitrateMbps + " Mbit/s";
  }

  /** "HEVC · HDR" */
  public static extra(mode: StreamMode): string
  {
    return mode.codec + " · " + (mode.hdr ? "HDR" : "SDR");
  }
}
