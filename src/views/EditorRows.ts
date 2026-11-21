import { DevicePalette } from "../model/DevicePalette";
import { DeviceProfile, StreamMode } from "../model/Types";

/** "text" = typed (device name), "screen" = A takes the connected screen's name, "delete" = A deletes the device. */
export type RowType = "list" | "range" | "bool" | "seg" | "text" | "screen" | "delete";

type DeviceRowKey = "name" | "color" | "icon" | "audio" | "autoRule" | "displayName" | "deleteDevice";

export interface EditorRow
{
  key: keyof StreamMode | DeviceRowKey;
  label: string;
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
  public static readonly resolutions = ["1280x720", "1280x800", "1920x1080", "2560x1440", "3840x2160"] as const;

  public static readonly rows: readonly EditorRow[] =
  [
    { key: "resolution", label: "Auflösung", type: "list", scope: "mode", options: EditorRows.resolutions, heading: true },
    { key: "fps", label: "Bildrate", type: "list", scope: "mode", options: [30, 40, 60, 90, 120] },
    { key: "bitrateMbps", label: "Bitrate", type: "range", scope: "mode", minimum: 5, maximum: 150, stepSize: 5 },
    { key: "hdr", label: "HDR", type: "bool", scope: "mode" },
    { key: "codec", label: "Codec", type: "seg", scope: "mode", options: ["H.264", "HEVC", "AV1"] },
    { key: "name", label: "Name", type: "text", scope: "device", heading: true },
    { key: "color", label: "Farbe", type: "list", scope: "device", options: DevicePalette.colorOrder },
    { key: "icon", label: "Symbol", type: "list", scope: "device", options: DevicePalette.iconOrder },
    { key: "audio", label: "Ton", type: "list", scope: "device", options: ["Stereo", "5.1 Surround", "7.1 Surround"] },
    { key: "autoRule", label: "Automatisch aktiv bei", type: "list", scope: "device", options: ["Deck ohne Dock", "Dock mit Bildschirm", "Dieser Bildschirm", "Nur manuell"] },
    { key: "displayName", label: "Bildschirm", type: "screen", scope: "device" },
    { key: "deleteDevice", label: "Gerät löschen", type: "delete", scope: "device" },
  ];

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

  /** Next value after pressing left/right (direction -1/+1); `wrap` cycles lists (used by A). */
  public static step(rowIndex: number, profile: DeviceProfile, modeIndex: number, direction: number, wrap: boolean): unknown
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

    const options = row.options!;
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
