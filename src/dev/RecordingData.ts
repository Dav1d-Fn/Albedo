/**
 * Real games for the README recordings (`npm run dev`, then http://localhost:1430/?record).
 * `docs/media/record.mjs export` writes them from the companion on this PC into
 * `docs/media/capture-data/` (not in git); this class answers the mock's commands from there.
 * The PC address is a neutral one, so no real address ends up in a picture.
 */
export class RecordingData
{
  public static readonly hostAddress = "192.168.1.20";

  public static readonly hostName = "gaming-pc";

  private static readonly folder = "/docs/media/capture-data/";

  /** Commands answered from the export; every other one goes to the normal mock. */
  private static readonly answeredCommands =
  [
    "load_settings", "discover_hosts", "fetch_games", "companion_library", "companion_cover", "companion_hero",
    "companion_logo", "companion_screenshot", "search_art", "companion_upload_token", "companion_add_app", "load_box_art",
  ];

  private readonly exported: Promise<ExportedData>;

  public constructor()
  {
    this.exported = fetch(RecordingData.folder + "data.json").then((response) => response.json());
  }

  public answers(command: string): boolean
  {
    return RecordingData.answeredCommands.includes(command);
  }

  public async answer(command: string, args: Record<string, unknown>, customArt: Record<string, string[]>): Promise<unknown>
  {
    const data = await this.exported;
    switch (command)
    {
      case "load_settings":
        // Only what differs from the defaults; DefaultSettings.merge fills in the rest.
        return JSON.stringify({ host: RecordingData.hostAddress, hostName: RecordingData.hostName, language: "en", showStreamSummary: true });
      case "discover_hosts":
        return [{ name: RecordingData.hostName, address: RecordingData.hostAddress }];
      case "fetch_games":
        return data.games;
      case "load_box_art":
        return {};
      case "companion_library":
        return {
          entries: data.library.map((entry) => ({ ...entry, inSunshine: data.games.includes(entry.name), customArt: customArt[entry.id] ?? [] })),
          sunshineProblem: null,
        };
      case "companion_cover":
        return this.pictureUrl(data, args.entryId as string, "cover");
      case "companion_hero":
        return this.pictureUrl(data, args.entryId as string, "hero");
      case "companion_logo":
        return this.pictureUrl(data, args.entryId as string, "logo");
      case "companion_screenshot":
        return null;
      case "search_art":
        // A short wait, like the real search over the internet.
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        return data.search[args.kind as string] ?? { candidates: [], problem: null };
      case "companion_upload_token":
        return data.uploadToken;
      case "companion_add_app":
        return this.addApp(data, args.entryId as string);
      default:
        return null;
    }
  }

  private pictureUrl(data: ExportedData, entryId: string, kind: string): string | null
  {
    const fileName = data.pictures[entryId]?.[kind];
    return fileName === undefined ? null : RecordingData.folder + fileName;
  }

  private async addApp(data: ExportedData, entryId: string): Promise<string>
  {
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    const entry = data.library.find((libraryEntry) => libraryEntry.id === entryId);
    const name = entry?.name ?? entryId;
    if (!data.games.includes(name))
    {
      data.games.push(name);
    }
    return name;
  }
}

interface ExportedData
{
  /** Sunshine app names, in rail order. */
  games: string[];
  library: { id: string; name: string; group: string }[];
  /** Entry id -> picture kind -> file name in the capture folder. */
  pictures: Record<string, Record<string, string>>;
  /** Picture kind -> answer of `search_art`. */
  search: Record<string, unknown>;
  uploadToken: unknown;
}
