import { ArtKind, BackdropKind, LibraryEntry } from "../model/Types";
import { Backend } from "./Backend";

/**
 * Pictures of the home games from the PC companion: covers, logos and the backdrop behind
 * the menu (title image or screenshots), including the ones set by hand from the phone.
 * Moonlight only fills its box art cache when its own UI loads the app list, which the
 * launcher never does, so games added through "Hinzufügen" would stay without a cover.
 * Games are matched to companion entries by name.
 */
export class CompanionArt
{
  /** Backdrop images kept in memory; a title image is a few hundred kB as `data:` URL. */
  private static readonly maximumCachedImages = 24;

  /** Sunshine app name -> companion entry, from the last library load. */
  private entriesByName = new Map<string, LibraryEntry>();

  /** "<kind>|<entry id>|<index>" -> `data:` URL or null (the PC has none). */
  private readonly imageCache = new Map<string, string | null>();

  public constructor(private readonly backend: Backend)
  {
  }

  /**
   * Game name -> cover and logo `data:` URLs from the companion, for every game it has one for.
   * The companion's cover wins over Moonlight's cache, so a cover set by hand shows. Null when it is not reachable.
   */
  public async coversAndLogos(host: string, gameNames: string[]): Promise<{ covers: Record<string, string>; logos: Record<string, string> } | null>
  {
    const covers: Record<string, string> = {};
    const logos: Record<string, string> = {};
    try
    {
      await this.loadLibrary(host);
      for (const gameName of gameNames)
      {
        const entry = this.entriesByName.get(gameName);
        if (entry === undefined)
        {
          continue;
        }
        if (entry.hasCover)
        {
          const cover = await this.backend.companionCover(host, entry.id);
          if (cover !== null)
          {
            covers[gameName] = cover;
          }
        }
        if (entry.hasLogo)
        {
          const logo = await this.backend.companionLogo(host, entry.id);
          if (logo !== null)
          {
            logos[gameName] = logo;
          }
        }
      }
    }
    catch (companionError)
    {
      // The companion is optional; without it the placeholders (or the cached pictures) stay.
      console.warn("no companion covers", companionError);
      return null;
    }
    return { covers, logos };
  }

  /** What the home cache keeps: entries and the backdrop pictures loaded so far. */
  public snapshot(): { entries: LibraryEntry[]; images: Record<string, string | null> }
  {
    return { entries: [...this.entriesByName.values()], images: Object.fromEntries(this.imageCache) };
  }

  /** Start without the PC: entries and pictures from the home cache, replaced by the next library load. */
  public restore(entries: LibraryEntry[], images: Record<string, string | null>): void
  {
    this.entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
    this.imageCache.clear();
    for (const [cacheKey, image] of Object.entries(images))
    {
      this.remember(cacheKey, image);
    }
  }

  /** Companion entry id of a home game, undefined when the companion does not know it. */
  public entryId(gameName: string): string | undefined
  {
    return this.entriesByName.get(gameName)?.id;
  }

  /** Emulated system of the game ("Nintendo 64"), undefined for other games and older companions. */
  public system(gameName: string): string | undefined
  {
    return this.entriesByName.get(gameName)?.system ?? undefined;
  }

  /** The game has a picture of this kind set by hand (older companions do not say: false). */
  public hasCustomArt(gameName: string, kind: ArtKind): boolean
  {
    return this.entriesByName.get(gameName)?.customArt?.includes(kind) ?? false;
  }

  /** How many backdrop pictures the game has for this kind; more than one means they rotate. */
  public backdropCount(gameName: string, kind: BackdropKind): number
  {
    const entry = this.entriesByName.get(gameName);
    if (entry === undefined)
    {
      return 0;
    }
    if (kind === "screenshots" && entry.screenshotCount > 0)
    {
      return entry.screenshotCount;
    }
    // Screenshots fall back to the title image when the game has none.
    if ((kind === "hero" || kind === "screenshots") && entry.hasHero)
    {
      return 1;
    }
    return 0;
  }

  /** Backdrop picture number `step` (wraps around) as `data:` URL, or null: then the blurred cover stays. */
  public async backdropImage(host: string, gameName: string, kind: BackdropKind, step: number): Promise<string | null>
  {
    const entry = this.entriesByName.get(gameName);
    const count = this.backdropCount(gameName, kind);
    if (entry === undefined || count === 0)
    {
      return null;
    }

    const useScreenshots = kind === "screenshots" && entry.screenshotCount > 0;
    const index = step % count;
    const cacheKey = (useScreenshots ? "screenshot" : "hero") + "|" + entry.id + "|" + index;
    const cached = this.imageCache.get(cacheKey);
    if (cached !== undefined)
    {
      return cached;
    }

    let image: string | null = null;
    try
    {
      image = useScreenshots
        ? await this.backend.companionScreenshot(host, entry.id, index)
        : await this.backend.companionHero(host, entry.id);
    }
    catch (imageError)
    {
      console.warn("no backdrop image", gameName, imageError);
      return null;
    }
    this.remember(cacheKey, image);
    return image;
  }

  private async loadLibrary(host: string): Promise<void>
  {
    const library = await this.backend.companionLibrary(host);
    const entriesByName = new Map<string, LibraryEntry>();
    for (const entry of library.entries)
    {
      if (entry.inSunshine)
      {
        entriesByName.set(entry.name, entry);
      }
    }
    this.entriesByName = entriesByName;
    // Screenshot indices shift when a new one is taken, so pictures are fetched again.
    this.imageCache.clear();
  }

  private remember(cacheKey: string, image: string | null): void
  {
    this.imageCache.set(cacheKey, image);
    if (this.imageCache.size > CompanionArt.maximumCachedImages)
    {
      // Map keeps insertion order: the first key is the oldest.
      const oldestKey = this.imageCache.keys().next().value;
      if (oldestKey !== undefined)
      {
        this.imageCache.delete(oldestKey);
      }
    }
  }
}
