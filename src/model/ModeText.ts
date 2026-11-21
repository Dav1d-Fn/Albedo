import { UiText } from "../i18n/UiText";
import { StreamMode } from "./Types";

/** Formats stream modes and devices for display, e.g. "1440p · 120 FPS · 60 Mbit/s". */
export class ModeText
{

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
    return ModeText.label(mode) + " FPS · " + ModeText.bitrate(mode.bitrateMbps);
  }

  /** "60 Mbit/s" (German) or "60 Mbps" (English). */
  public static bitrate(bitrateMbps: number): string
  {
    return bitrateMbps + " " + UiText.current.units.mbps;
  }

  /** "HEVC · HDR" */
  public static extra(mode: StreamMode): string
  {
    return mode.codec + " · " + (mode.hdr ? "HDR" : "SDR");
  }
}
