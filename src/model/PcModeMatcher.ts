import { UiText } from "../i18n/UiText";
import { ModeText } from "./ModeText";
import { DisplayTarget, PcDisplayMode, PcDisplayRoute, PcDisplays, PcModeRequest, StreamMode } from "./Types";

/**
 * Picks the PC monitor mode a stream mode ends up with, the same way the companion does on the PC
 * (companion/src/display_mode_chooser.rs, keep both alike): the exact size, else one with the same aspect ratio
 * (the largest that fits, else the smallest bigger one), else the largest that fits, else the smallest; then
 * the closest refresh rate at that size, a tie goes to the higher one.
 */
export class PcModeMatcher
{
  public static closest(pcModes: PcDisplayMode[], mode: StreamMode): PcDisplayMode | null
  {
    const wanted = ModeText.size(mode.resolution);
    const size = PcModeMatcher.closestSize(pcModes, wanted.width, wanted.height);
    if (size === null)
    {
      return null;
    }
    const sameSizeModes = pcModes.filter((pcMode) => pcMode.width === size.width && pcMode.height === size.height);
    sameSizeModes.sort((first, second) =>
    {
      const rateDifference = Math.abs(first.refreshRate - mode.fps) - Math.abs(second.refreshRate - mode.fps);
      if (rateDifference !== 0)
      {
        return rateDifference;
      }
      return second.refreshRate - first.refreshRate;
    });
    return sameSizeModes[0];
  }

  private static closestSize(pcModes: PcDisplayMode[], width: number, height: number): { width: number; height: number } | null
  {
    const sizes: { width: number; height: number }[] = [];
    for (const pcMode of pcModes)
    {
      if (!sizes.some((size) => size.width === pcMode.width && size.height === pcMode.height))
      {
        sizes.push({ width: pcMode.width, height: pcMode.height });
      }
    }
    sizes.sort((first, second) => first.width * first.height - second.width * second.height);

    const exactSize = sizes.find((size) => size.width === width && size.height === height);
    if (exactSize !== undefined)
    {
      return exactSize;
    }
    const fits = (size: { width: number; height: number }) => size.width <= width && size.height <= height;
    const wantedRatio = width / height;
    // Within 1 %, so 1366x768 counts as 16:9.
    const sameAspect = sizes.filter((size) => Math.abs(size.width / size.height - wantedRatio) <= wantedRatio * 0.01);
    const fittingSameAspect = sameAspect.filter(fits);
    if (fittingSameAspect.length > 0)
    {
      return fittingSameAspect[fittingSameAspect.length - 1];
    }
    if (sameAspect.length > 0)
    {
      return sameAspect[0];
    }
    const fittingSizes = sizes.filter(fits);
    if (fittingSizes.length > 0)
    {
      return fittingSizes[fittingSizes.length - 1];
    }
    return sizes[0] ?? null;
  }

  /** Exact size or the same aspect ratio (within 1 %), as `DisplayModeChooser::keeps_picture_shape`. */
  private static keepsPictureShape(pcMode: PcDisplayMode, mode: StreamMode): boolean
  {
    const wanted = ModeText.size(mode.resolution);
    if (pcMode.width === wanted.width && pcMode.height === wanted.height)
    {
      return true;
    }
    const wantedRatio = wanted.width / wanted.height;
    return Math.abs(pcMode.width / pcMode.height - wantedRatio) <= wantedRatio * 0.01;
  }

  /** The target that really applies, like the companion: "auto" and a route the PC isn't set up for become its default. */
  public static resolvedTarget(displays: PcDisplays, target: DisplayTarget): DisplayTarget
  {
    if (target === "none" || displays.routes.some((route) => route.target === target))
    {
      return target;
    }
    return displays.defaultTarget;
  }

  /** The PC output a stream mode uses; null when nothing switches or the PC is unknown. */
  public static route(displays: PcDisplays | null, mode: StreamMode): PcDisplayRoute | null
  {
    if (displays === null)
    {
      return null;
    }
    const target = PcModeMatcher.resolvedTarget(displays, mode.displayTarget);
    return displays.routes.find((route) => route.target === target) ?? null;
  }

  /** Modes of the output the stream mode uses; null when unknown (the editor then steps through fixed lists). */
  public static modes(displays: PcDisplays | null, mode: StreamMode): PcDisplayMode[] | null
  {
    const route = PcModeMatcher.route(displays, mode);
    return route === null || route.modes.length === 0 ? null : route.modes;
  }

  /** The PC can't show the stream mode exactly on the output it uses. */
  public static isInexact(displays: PcDisplays | null, mode: StreamMode): boolean
  {
    const pcModes = PcModeMatcher.modes(displays, mode);
    if (pcModes === null)
    {
      return false;
    }
    const closestMode = PcModeMatcher.closest(pcModes, mode)!;
    const wanted = ModeText.size(mode.resolution);
    return closestMode.width !== wanted.width || closestMode.height !== wanted.height || closestMode.refreshRate !== mode.fps;
  }

  /**
   * What the PC does with the stream mode (in the UI language): which mode an output that can't do it exactly
   * takes, the main monitor's mode always, that nothing switches; null when the stream mode fits or nothing is known.
   */
  public static hint(displays: PcDisplays | null, mode: StreamMode): string | null
  {
    const texts = UiText.current.editor;
    if (displays === null)
    {
      return null;
    }
    if (PcModeMatcher.resolvedTarget(displays, mode.displayTarget) === "none")
    {
      return texts.pcNoSwitch;
    }
    const route = PcModeMatcher.route(displays, mode);
    if (route === null)
    {
      return null;
    }
    const outputText = texts.pcRouteNames[route.target](route.output);
    if (route.modes.length === 0)
    {
      return texts.pcOutputWithoutModes(outputText);
    }
    const closestMode = PcModeMatcher.closest(route.modes, mode)!;
    if (route.target === "main" && !PcModeMatcher.keepsPictureShape(closestMode, mode))
    {
      // Like the companion: the main monitor only switches to a mode with the stream's shape.
      return texts.pcMainKeepsMode(outputText);
    }
    if (!PcModeMatcher.isInexact(displays, mode))
    {
      return route.target === "main" ? texts.pcModeExact(outputText, PcModeMatcher.text(closestMode)) : null;
    }
    let hintText = texts.pcModeInexact(outputText, PcModeMatcher.text(closestMode));
    const wanted = ModeText.size(mode.resolution);
    const sameResolutionRates = route.modes
      .filter((pcMode) => pcMode.width === wanted.width && pcMode.height === wanted.height)
      .map((pcMode) => pcMode.refreshRate)
      .sort((first, second) => first - second);
    if (sameResolutionRates.length > 0)
    {
      hintText += texts.pcModeMatching(sameResolutionRates.join(" / "));
    }
    if (route.target === "dummy")
    {
      hintText += texts.pcModesFromPlug;
    }
    return hintText;
  }

  /** "2560x1600@90", the form the companion uses for a mode request. */
  public static requestText(mode: StreamMode): string
  {
    const wanted = ModeText.size(mode.resolution);
    return wanted.width + "x" + wanted.height + "@" + mode.fps;
  }

  /** Line about an "add to PC" request for this mode, null when there is none. */
  public static requestStatus(request: PcModeRequest | null, mode: StreamMode): string | null
  {
    if (request === null || request.mode !== PcModeMatcher.requestText(mode))
    {
      return null;
    }
    const texts = UiText.current.editor;
    const statusTexts: Record<PcModeRequest["state"], string | null> =
    {
      idle: null,
      waiting: texts.pcModeWaiting,
      done: texts.pcModeDone,
      reboot: texts.pcModeReboot,
      cancelled: texts.pcModeCancelled,
      failed: texts.pcModeFailed(request.message ?? ""),
      dryRun: texts.pcModeDryRun,
    };
    return statusTexts[request.state];
  }

  /** "1280 × 800 ＠ 90 Hz" */
  public static text(pcMode: PcDisplayMode): string
  {
    return pcMode.width + " × " + pcMode.height + " ＠ " + pcMode.refreshRate + " Hz";
  }
}
