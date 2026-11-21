import { DeviceColor, DeviceIconKind } from "./Types";

/** The fixed colours and symbols a device can get; tuned to stay readable as UI accent on the dark design. */
export class DevicePalette
{
  public static readonly colors: Record<DeviceColor, string> =
  {
    blue: "#5AA9FF",
    orange: "#FF9F45",
    green: "#4ADE80",
    violet: "#A78BFA",
    pink: "#F472B6",
    teal: "#2DD4BF",
    yellow: "#FACC15",
    red: "#F87171",
  };

  public static readonly colorNames: Record<DeviceColor, string> =
  {
    blue: "Blau",
    orange: "Orange",
    green: "Grün",
    violet: "Violett",
    pink: "Pink",
    teal: "Türkis",
    yellow: "Gelb",
    red: "Rot",
  };

  public static readonly colorOrder: DeviceColor[] = ["blue", "orange", "green", "violet", "pink", "teal", "yellow", "red"];

  public static readonly iconNames: Record<DeviceIconKind, string> =
  {
    handheld: "Handheld",
    tv: "Fernseher",
    monitor: "Monitor",
    laptop: "Laptop",
    projector: "Beamer",
  };

  public static readonly iconOrder: DeviceIconKind[] = ["handheld", "tv", "monitor", "laptop", "projector"];

  /** First colour no device uses yet, so a new device stands out; blue again when all are taken. */
  public static nextFreeColor(usedColors: DeviceColor[]): DeviceColor
  {
    return DevicePalette.colorOrder.find((color) => !usedColors.includes(color)) ?? "blue";
  }
}
