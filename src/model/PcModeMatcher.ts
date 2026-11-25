import { UiText } from "../i18n/UiText";
import { ModeText } from "./ModeText";
import { PcDisplayMode, PcModeRequest, StreamMode } from "./Types";

/**
 * Picks the PC monitor mode a stream mode ends up with, the same way `sunshine-match-client` does on the PC:
 * smallest pixel-count difference first, then the closest refresh rate, ties prefer the higher refresh rate.
 */
export class PcModeMatcher
{
  public static closest(pcModes: PcDisplayMode[], mode: StreamMode): PcDisplayMode | null
  {
    const wanted = ModeText.size(mode.resolution);
    const wantedPixels = wanted.width * wanted.height;
    const sortedModes = pcModes.slice().sort((first, second) =>
    {
      const pixelDifference = Math.abs(first.width * first.height - wantedPixels) - Math.abs(second.width * second.height - wantedPixels);
      if (pixelDifference !== 0)
      {
        return pixelDifference;
      }
      const rateDifference = Math.abs(first.refreshRate - mode.fps) - Math.abs(second.refreshRate - mode.fps);
      if (rateDifference !== 0)
      {
        return rateDifference;
      }
      return second.refreshRate - first.refreshRate;
    });
    return sortedModes[0] ?? null;
  }

  /** Hint (in the UI language) when the PC has no exact mode for the stream mode, null when it has one (or nothing is known). */
  public static hint(pcModes: PcDisplayMode[] | null, mode: StreamMode): string | null
  {
    if (pcModes === null || pcModes.length === 0)
    {
      return null;
    }
    const closestMode = PcModeMatcher.closest(pcModes, mode)!;
    const wanted = ModeText.size(mode.resolution);
    if (closestMode.width === wanted.width && closestMode.height === wanted.height && closestMode.refreshRate === mode.fps)
    {
      return null;
    }
    let hintText = UiText.current.editor.pcModeInexact(PcModeMatcher.text(closestMode));
    const sameResolutionRates = pcModes
      .filter((pcMode) => pcMode.width === wanted.width && pcMode.height === wanted.height)
      .map((pcMode) => pcMode.refreshRate)
      .sort((first, second) => first - second);
    if (sameResolutionRates.length > 0)
    {
      hintText += UiText.current.editor.pcModeMatching(sameResolutionRates.join(" / "));
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
