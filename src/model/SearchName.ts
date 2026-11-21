/**
 * Turns a Sunshine app name into what the picture search looks for: without "(16:9)",
 * "[0100152000022000]", "(Nintendo Switch)", release tags like ".NSW-nogrp" or "_patched",
 * and ".exe". The user can still type any other name in the dialog.
 */
export class SearchName
{
  /** Words of file releases that are not part of the game's name. */
  private static readonly releaseWords = new Set(["nsw", "nsp", "xci", "nsw2u", "rom", "iso", "patched", "repack"]);

  public static fromAppName(appName: string): string
  {
    let name = appName.replace(/\.exe$/i, "");
    // "Pokemon.Scarlet.NSW-nogrp": dots stand for spaces, the last "-group" is the release group.
    if (!name.includes(" ") && name.includes("."))
    {
      name = name.replace(/-[A-Za-z0-9]+$/, "").replace(/\./g, " ");
    }
    // "PokemonEmerald" -> "Pokemon Emerald"
    if (!name.includes(" "))
    {
      name = name.replace(/([a-z])([A-Z])/g, "$1 $2");
    }
    name = name.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/_/g, " ");

    const words = name.split(/\s+/).filter((word) => word !== "" && !SearchName.releaseWords.has(word.toLowerCase()));
    const cleanedName = words.join(" ").replace(/^[\s+:\-–]+|[\s+:\-–]+$/g, "");
    return cleanedName === "" ? appName : cleanedName;
  }
}
