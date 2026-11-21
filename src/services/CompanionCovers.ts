import { Backend } from "./Backend";

/**
 * Covers for the home rail from the PC companion, for games Moonlight has no cover for.
 * Moonlight only fills its box art cache when its own UI loads the app list, which the
 * launcher never does, so games added through "Hinzufügen" would stay without a cover.
 */
export class CompanionCovers
{
  public constructor(private readonly backend: Backend)
  {
  }

  /** Game name -> cover `data:` URL for the games not in `knownCovers`. Empty when the companion is not reachable. */
  public async missingCovers(host: string, gameNames: string[], knownCovers: Record<string, string>): Promise<Record<string, string>>
  {
    const missingNames = gameNames.filter((gameName) => !(gameName in knownCovers));
    const covers: Record<string, string> = {};
    if (missingNames.length === 0)
    {
      return covers;
    }

    try
    {
      const library = await this.backend.companionLibrary(host);
      // ponytail: matched by name, Sunshine apps renamed by hand keep the placeholder.
      const entries = library.entries.filter((entry) => entry.inSunshine && entry.hasCover && missingNames.includes(entry.name));
      for (const entry of entries)
      {
        const cover = await this.backend.companionCover(host, entry.id);
        if (cover !== null)
        {
          covers[entry.name] = cover;
        }
      }
    }
    catch (companionError)
    {
      // The companion is optional; without it the placeholders stay.
      console.warn("no companion covers", companionError);
    }
    return covers;
  }
}
