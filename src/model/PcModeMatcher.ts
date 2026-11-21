import { ModeText } from "./ModeText";
import { PcDisplayMode, StreamMode } from "./Types";

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

  /** German hint when the PC has no exact mode for the stream mode, null when it has one (or nothing is known). */
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
    let hintText = "Der PC hat dafür keinen passenden Modus und nimmt " + PcModeMatcher.text(closestMode) + ".";
    const sameResolutionRates = pcModes
      .filter((pcMode) => pcMode.width === wanted.width && pcMode.height === wanted.height)
      .map((pcMode) => pcMode.refreshRate)
      .sort((first, second) => first - second);
    if (sameResolutionRates.length > 0)
    {
      hintText += " Passend wären " + sameResolutionRates.join(" / ") + " FPS.";
    }
    return hintText;
  }

  /** "1280 × 800 ＠ 90 Hz" */
  public static text(pcMode: PcDisplayMode): string
  {
    return pcMode.width + " × " + pcMode.height + " ＠ " + pcMode.refreshRate + " Hz";
  }
}
