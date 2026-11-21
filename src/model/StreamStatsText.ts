import { UiText } from "../i18n/UiText";
import { TextTable } from "../i18n/GermanTexts";

/** One line of Moonlight's stream statistics, label in the UI language. */
export interface StreamStatLine
{
  label: string;
  value: string;
}

/**
 * Turns Moonlight's "Global video stats" lines into label/value pairs in the UI language.
 * Moonlight always logs them in English, so the lines are matched by their English label
 * whatever language the launcher shows.
 */
export class StreamStatsText
{
  /** Moonlight's label -> key in the `streamStats` text table; unknown labels (newer Moonlight) stay as logged. */
  private static readonly labelKeys: Record<string, keyof TextTable["streamStats"]> =
  {
    "Video stream": "videoStream",
    "Incoming frame rate from network": "networkFrameRate",
    "Decoding frame rate": "decodingFrameRate",
    "Rendering frame rate": "renderingFrameRate",
    "Host processing latency min/max/average": "hostLatency",
    "Frames dropped by your network connection": "networkDrops",
    "Frames dropped due to network jitter": "jitterDrops",
    "Average network latency": "networkLatency",
    "Average decoding time": "decodingTime",
    "Average frame queue delay": "queueDelay",
    "Average rendering time (including monitor V-sync latency)": "renderingTime",
  };

  public static translated(statLines: string[]): StreamStatLine[]
  {
    const texts = UiText.current.streamStats;
    return statLines.map((statLine) =>
    {
      const separatorIndex = statLine.indexOf(": ");
      if (separatorIndex < 0)
      {
        return { label: "", value: statLine };
      }
      const moonlightLabel = statLine.slice(0, separatorIndex);
      const labelKey = StreamStatsText.labelKeys[moonlightLabel];
      return {
        label: labelKey !== undefined ? texts[labelKey] : moonlightLabel,
        // "4 ms (variance: 1 ms)" from the network latency line.
        value: statLine.slice(separatorIndex + 2).replace("variance", texts.variance),
      };
    });
  }
}
