import { UiText } from "../i18n/UiText";
import { DevicePalette } from "../model/DevicePalette";
import { ModeText } from "../model/ModeText";
import { DeviceProfile, PcDisplayMode, StreamMode } from "../model/Types";

/** "text" = typed (device name), "screen" = A takes the connected screen's name, "delete" = A deletes the device. */
export type RowType = "list" | "range" | "bool" | "seg" | "text" | "screen" | "delete";

type DeviceRowKey = "name" | "color" | "icon" | "audio" | "performanceOverlay" | "autoRule" | "displayName" | "deleteDevice";

/** Key of a row label in the "editor" part of the text tables. */
type RowLabelKey = "rowResolution" | "rowFrameRate" | "rowBitrate" | "rowHdr" | "rowCodec" | "rowName" | "rowColor" | "rowIcon" | "rowAudio" | "rowPerformanceOverlay" | "rowAutoRule" | "rowScreen" | "deleteDevice";

export interface EditorRow
{
  key: keyof StreamMode | DeviceRowKey;
  labelKey: RowLabelKey;
  type: RowType;
  /** "mode" = value of the selected profile (a `StreamMode`), "device" = device settings shared by all its profiles. */
  scope: "mode" | "device";
  options?: readonly (string | number)[];
  minimum?: number;
  maximum?: number;
  stepSize?: number;
  /** Starts a new section with a heading. */
  heading?: boolean;
}

/** The rows of the profile editor and how their values step. */
export class EditorRows
{
  /** Used when the PC's monitor modes are unknown (no companion) or the resolution has none there. */
  public static readonly resolutions = ["1280x720", "1280x800", "1920x1080", "2560x1440", "3840x2160"] as const;
  public static readonly frameRates = [30, 40, 60, 90, 120] as const;

  public static readonly rows: readonly EditorRow[] =
  [
    { key: "resolution", labelKey: "rowResolution", type: "list", scope: "mode", options: EditorRows.resolutions, heading: true },
    { key: "fps", labelKey: "rowFrameRate", type: "list", scope: "mode", options: EditorRows.frameRates },
    { key: "bitrateMbps", labelKey: "rowBitrate", type: "range", scope: "mode", minimum: 5, maximum: 150, stepSize: 5 },
    { key: "hdr", labelKey: "rowHdr", type: "bool", scope: "mode" },
    { key: "codec", labelKey: "rowCodec", type: "seg", scope: "mode", options: ["H.264", "HEVC", "AV1"] },
    { key: "name", labelKey: "rowName", type: "text", scope: "device", heading: true },
    { key: "color", labelKey: "rowColor", type: "list", scope: "device", options: DevicePalette.colorOrder },
    { key: "icon", labelKey: "rowIcon", type: "list", scope: "device", options: DevicePalette.iconOrder },
    { key: "audio", labelKey: "rowAudio", type: "list", scope: "device", options: ["Stereo", "5.1 Surround", "7.1 Surround"] },
    { key: "performanceOverlay", labelKey: "rowPerformanceOverlay", type: "bool", scope: "device" },
    { key: "autoRule", labelKey: "rowAutoRule", type: "list", scope: "device", options: ["Deck ohne Dock", "Dock mit Bildschirm", "Dieser Bildschirm", "Nur manuell"] },
    { key: "displayName", labelKey: "rowScreen", type: "screen", scope: "device" },
    { key: "deleteDevice", labelKey: "deleteDevice", type: "delete", scope: "device" },
  ];

  /** The row's label in the UI language. */
  public static label(row: EditorRow): string
  {
    return UiText.current.editor[row.labelKey];
  }

  /** Indices into `rows` of one scope, in display order. */
  public static indices(scope: EditorRow["scope"]): number[]
  {
    const rowIndices: number[] = [];
    EditorRows.rows.forEach((row, rowIndex) =>
    {
      if (row.scope === scope)
      {
        rowIndices.push(rowIndex);
      }
    });
    return rowIndices;
  }

  public static value(rowIndex: number, profile: DeviceProfile, modeIndex: number): unknown
  {
    const row = EditorRows.rows[rowIndex];
    if (row.scope === "mode")
    {
      return profile.modes[modeIndex][row.key as keyof StreamMode];
    }
    if (row.type === "delete")
    {
      return null;
    }
    return profile[row.key as Exclude<DeviceRowKey, "deleteDevice">];
  }

  /**
   * The values a list row steps through. Resolution and FPS come from the PC's virtual monitor when its modes
   * are known (FPS of the profile's resolution), else from the fixed lists; a typed value outside the list is
   * kept in it, so stepping goes on from there.
   */
  public static options(rowIndex: number, mode: StreamMode, pcModes: PcDisplayMode[] | null): readonly (string | number)[]
  {
    const row = EditorRows.rows[rowIndex];
    const knownModes = pcModes ?? [];
    if (row.key === "resolution")
    {
      const pcResolutions = knownModes.map((pcMode) => pcMode.width + "x" + pcMode.height);
      const resolutions = new Set<string>(pcResolutions.length > 0 ? pcResolutions : EditorRows.resolutions);
      resolutions.add(mode.resolution);
      return Array.from(resolutions).sort((first, second) => EditorRows.pixelCount(first) - EditorRows.pixelCount(second));
    }
    if (row.key === "fps")
    {
      const wanted = ModeText.size(mode.resolution);
      const pcRates = EditorRows.pcRates(knownModes, wanted.width, wanted.height);
      const frameRates = new Set<number>(pcRates.length > 0 ? pcRates : EditorRows.frameRates);
      frameRates.add(mode.fps);
      return Array.from(frameRates).sort((first, second) => first - second);
    }
    return row.options!;
  }

  /** Refresh rates the PC's monitor has at one resolution, ascending; empty when it has none. */
  public static pcRates(pcModes: PcDisplayMode[], width: number, height: number): number[]
  {
    return pcModes
      .filter((pcMode) => pcMode.width === width && pcMode.height === height)
      .map((pcMode) => pcMode.refreshRate)
      .sort((first, second) => first - second);
  }

  /** After a resolution change: an FPS the PC has at the new resolution, the closest one (higher on a tie). */
  public static fittingFps(mode: StreamMode, pcModes: PcDisplayMode[] | null): number
  {
    const wanted = ModeText.size(mode.resolution);
    const pcRates = EditorRows.pcRates(pcModes ?? [], wanted.width, wanted.height);
    if (pcRates.length === 0 || pcRates.includes(mode.fps))
    {
      return mode.fps;
    }
    let closestRate = pcRates[0];
    for (const rate of pcRates)
    {
      if (Math.abs(rate - mode.fps) <= Math.abs(closestRate - mode.fps))
      {
        closestRate = rate;
      }
    }
    return closestRate;
  }

  /**
   * A typed resolution ("2560x1440", "2560 × 1440") or FPS ("100", "100 FPS"); null when it is not one.
   * Limits: 320x200 to 7680x4320, 10 to 360 FPS.
   */
  public static parseTyped(rowKey: "resolution" | "fps", text: string): string | number | null
  {
    const numbers = (text.match(/\d+/g) ?? []).map(Number);
    if (rowKey === "fps")
    {
      if (numbers.length !== 1 || numbers[0] < 10 || numbers[0] > 360)
      {
        return null;
      }
      return numbers[0];
    }
    if (numbers.length !== 2)
    {
      return null;
    }
    const [width, height] = numbers;
    if (width < 320 || width > 7680 || height < 200 || height > 4320)
    {
      return null;
    }
    return width + "x" + height;
  }

  private static pixelCount(resolution: string): number
  {
    const size = ModeText.size(resolution);
    return size.width * size.height;
  }

  /** Next value after pressing left/right (direction -1/+1); `wrap` cycles lists (used by A). */
  public static step(rowIndex: number, profile: DeviceProfile, modeIndex: number, direction: number, wrap: boolean, pcModes: PcDisplayMode[] | null): unknown
  {
    const row = EditorRows.rows[rowIndex];
    const current = EditorRows.value(rowIndex, profile, modeIndex);

    if (row.type === "bool")
    {
      return !current;
    }
    if (row.type === "text" || row.type === "screen" || row.type === "delete")
    {
      // Typed or taken from the screen, not stepped.
      return current;
    }
    if (row.type === "range")
    {
      const next = (current as number) + direction * row.stepSize!;
      return Math.max(row.minimum!, Math.min(row.maximum!, next));
    }

    const options = EditorRows.options(rowIndex, profile.modes[modeIndex], pcModes);
    const currentIndex = Math.max(0, options.indexOf(current as string | number));
    const nextIndex = wrap
      ? (currentIndex + direction + options.length) % options.length
      : Math.max(0, Math.min(options.length - 1, currentIndex + direction));
    return options[nextIndex];
  }

  /** Returns a copy of the profile with the row's value replaced. */
  public static apply(rowIndex: number, profile: DeviceProfile, modeIndex: number, value: unknown): DeviceProfile
  {
    const row = EditorRows.rows[rowIndex];
    if (row.scope === "device")
    {
      return { ...profile, [row.key]: value };
    }
    const modes = profile.modes.slice();
    modes[modeIndex] = { ...modes[modeIndex], [row.key]: value };
    return { ...profile, modes };
  }
}
