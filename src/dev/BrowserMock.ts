import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

/**
 * Fake backend for `npm run dev` in a plain browser (no Tauri), so the UI can be
 * checked and clicked through without the Rust side. Never active inside the app.
 */
/** Whether the fake Moonlight is "running", so stop_stream answers like the real one. */
let streamRunning = false;

/** Goes up when the fake phone "uploads" a picture. */
let artVersion = 0;

export class BrowserMock
{
  private static readonly sampleGames = ["Cyberpunk 2077", "Elden Ring", "Hades II", "Forza Horizon 5", "Baldur's Gate 3", "Stardew Valley", "Portal 2"];

  private static readonly sampleLibrary =
  [
    { id: "preset:desktop-auto", name: "Desktop", group: "Voreinstellungen", hasCover: false, inSunshine: true, hasHero: false, hasLogo: false, screenshotCount: 0 },
    { id: "preset:big-picture", name: "Steam Big Picture", group: "Voreinstellungen", hasCover: false, inSunshine: false, hasHero: false, hasLogo: false, screenshotCount: 0 },
    { id: "steam:1245620", name: "ELDEN RING", group: "Steam", hasCover: false, inSunshine: true, hasHero: false, hasLogo: false, screenshotCount: 0 },
    { id: "steam:1086940", name: "Baldur's Gate 3", group: "Steam", hasCover: false, inSunshine: false, hasHero: false, hasLogo: false, screenshotCount: 0 },
    { id: "steam:1551360", name: "Forza Horizon 5", group: "Steam", hasCover: false, inSunshine: false, hasHero: false, hasLogo: false, screenshotCount: 0 },
    { id: "heroic:Crow", name: "Dead Island 2", group: "Heroic", hasCover: false, inSunshine: false, hasHero: false, hasLogo: false, screenshotCount: 0 },
    { id: "steam:1145350", name: "Hades II", group: "Steam", hasCover: true, inSunshine: true, hasHero: true, hasLogo: true, screenshotCount: 3 },
    { id: "prism:26.3 Modpack Test", name: "Minecraft 26.3 Modpack Test", group: "Minecraft", hasCover: false, inSunshine: false, hasHero: false, hasLogo: false, screenshotCount: 0 },
  ];

  /** A wide SVG standing in for a title image or screenshot. */
  private static widePicture(colour: string, label: string): string
  {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1920' height='1080'><rect width='1920' height='1080' fill='${colour}'/>`
      + `<circle cx='1400' cy='420' r='260' fill='white' opacity='.35'/><text x='1400' y='440' font-size='72' fill='white' text-anchor='middle' font-family='sans-serif'>${label}</text></svg>`;
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }

  /** Coloured stand-ins for found pictures: 2 from the Steam shop, 8 more from SteamGridDB with a key. */
  private static fakeArtSearch(kind: string, steamGridDbKey: string): { candidates: object[]; problem: string | null }
  {
    const size = { cover: [600, 900], hero: [1920, 620], logo: [800, 300] }[kind] ?? [600, 900];
    const colours = ["#1e3a8a", "#7c2d12", "#065f46", "#581c87", "#9f1239", "#0e7490", "#3f6212", "#78350f", "#334155", "#be185d"];
    const hasKey = steamGridDbKey.trim() !== "";
    const count = hasKey ? colours.length : 2;
    const candidates = colours.slice(0, count).map((colour, pictureIndex) =>
    {
      const source = pictureIndex < 2 ? "Steam-Shop" : "SteamGridDB";
      const background = kind === "logo" ? "" : `<rect width='${size[0]}' height='${size[1]}' fill='${colour}'/>`;
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size[0]}' height='${size[1]}'>${background}`
        + `<text x='50%' y='55%' font-size='${size[1] / 5}' fill='${kind === "logo" ? colour : "white"}' font-weight='900' text-anchor='middle' font-family='sans-serif'>${source === "Steam-Shop" ? "Shop" : "SGDB"} ${pictureIndex + 1}</text></svg>`;
      const url = "data:image/svg+xml," + encodeURIComponent(svg);
      return { imageUrl: url, thumbnailUrl: url, source, label: source === "Steam-Shop" ? "Hades II" : "Künstler " + pictureIndex };
    });
    return { candidates, problem: hasKey && steamGridDbKey.trim() === "falsch" ? "SteamGridDB-Schlüssel ungültig" : null };
  }

  /** A QR-looking pattern; the real one comes from the companion. */
  private static fakeQrSvg(): string
  {
    let cells = "";
    for (let row = 0; row < 25; row++)
    {
      for (let column = 0; column < 25; column++)
      {
        if ((row * 7 + column * 13 + row * column) % 3 === 0)
        {
          cells += `<rect x='${column + 2}' y='${row + 2}' width='1' height='1'/>`;
        }
      }
    }
    return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 29 29'><rect width='29' height='29' fill='white'/>${cells}</svg>`;
  }

  private static endStream(exitCode: number | null): void
  {
    streamRunning = false;
    emit("stream-ended", { exitCode, errorTail: "" });
  }

  public static installIfNeeded(): void
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      return;
    }
    let storedSettings: string | null = null;
    const urlParameters = new URLSearchParams(window.location.search);
    const hang = urlParameters.has("hang");
    const offline = urlParameters.has("offline");
    // Like a fresh companion: no Sunshine login until the launcher hands one over.
    let sunshineProblem: string | null = "Sunshine-Login fehlt im PC-Helfer";
    // Entry id -> picture kinds set by hand; "?customHero" starts with a title image set for Hades II.
    const customArt: Record<string, string[]> = urlParameters.has("customHero") ? { "steam:1145350": ["hero"] } : {};
    const setCustomArt = (entryId: string, kind: string, isSet: boolean) =>
    {
      const kinds = (customArt[entryId] ?? []).filter((knownKind) => knownKind !== kind);
      customArt[entryId] = isSet ? [...kinds, kind] : kinds;
      artVersion += 1;
    };

    mockIPC((command, payload) =>
    {
      const args = payload as Record<string, unknown>;
      switch (command)
      {
        case "load_settings":
          return storedSettings;
        case "save_settings":
          storedSettings = args.settingsJson as string;
          return "(browser mock)";
        case "external_display_names":
          // "?tv=Name": a TV with that EDID name is plugged in.
          return urlParameters.has("tv") ? [urlParameters.get("tv") || "LG TV SSCR2"] : [];
        case "has_external_display":
          return false;
        case "fetch_games":
          return BrowserMock.sampleGames;
        case "discover_hosts":
          return [{ name: "fedora", address: "192.168.178.36" }];
        case "pick_host_address":
          // "?offline": the PC does not answer.
          return offline ? null : (args.addresses as string[])[0] ?? null;
        case "pair_host":
          return new Promise((resolve) => window.setTimeout(resolve, 4000));
        case "start_stream":
          // "?hang": Moonlight never ends by itself, like one waiting for a PC that does not answer.
          streamRunning = true;
          if (!hang)
          {
            window.setTimeout(() => BrowserMock.endStream(0), 3000);
          }
          return "moonlight stream (browser mock)";
        case "companion_logo":
          return "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='200'><text x='0' y='150' font-size='150' font-weight='900' fill='#fbbf24' font-family='serif'>HADES II</text></svg>");
        case "companion_upload_token":
          // Pretend the phone sends a picture 5 s after the code was shown.
          // "?noUpload" keeps the phone quiet, for looking at the dialog.
          if (!urlParameters.has("noUpload"))
          {
            window.setTimeout(() => setCustomArt(args.entryId as string, args.kind as string, true), 5000);
          }
          return { url: "http://192.168.178.36:47995/upload/mock-" + (args.kind as string), qrSvg: BrowserMock.fakeQrSvg(), expiresInSeconds: 600 };
        case "companion_art_version":
          return artVersion;
        case "companion_reset_art":
          setCustomArt(args.entryId as string, args.kind as string, false);
          return null;
        case "search_art":
          return new Promise((resolve) => window.setTimeout(() => resolve(BrowserMock.fakeArtSearch(args.kind as string, args.steamGridDbKey as string)), 600));
        case "apply_art":
          return new Promise((resolve) => window.setTimeout(() =>
          {
            setCustomArt(args.entryId as string, args.kind as string, true);
            resolve(null);
          }, 800));
        case "stop_stream":
          if (!streamRunning)
          {
            return false;
          }
          window.setTimeout(() => BrowserMock.endStream(null), 300);
          return true;
        case "quit_host_app":
          return new Promise((resolve) => window.setTimeout(resolve, 500));
        case "load_box_art":
          return {};
        case "companion_display_modes":
          // DP-3 before the EDID got 1280x800@60 and the 120 Hz modes.
          return [[1920, 1080, 100], [2560, 1440, 100], [3840, 2160, 60], [1280, 800, 90], [1920, 1080, 60], [2560, 1440, 60], [1280, 720, 60]]
            .map(([width, height, refreshRate]) => ({ width, height, refreshRate }));
        case "companion_library":
          // `?companionOffline` in the dev URL: as if the companion were not running on the PC.
          if (new URLSearchParams(window.location.search).has("companionOffline"))
          {
            return Promise.reject("PC-Helfer nicht erreichbar (Port 47995). Läuft der Companion auf dem PC?");
          }
          return { entries: BrowserMock.sampleLibrary.map((entry) => ({ ...entry, customArt: customArt[entry.id] ?? [] })), sunshineProblem };
        case "companion_set_sunshine_login":
          if (args.password !== "sunshine")
          {
            return Promise.reject("Sunshine-Login falsch (im Browser-Mock ist das Passwort „sunshine“)");
          }
          sunshineProblem = null;
          return null;
        case "companion_cover":
          // A plain coloured cover, like one the companion converted to PNG.
          return "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='600' height='900'><rect width='600' height='900' fill='#7c2d12'/><text x='300' y='470' font-size='64' fill='white' text-anchor='middle' font-family='sans-serif'>PC-Helfer</text></svg>");
        case "companion_hero":
          return BrowserMock.widePicture("#1e3a8a", "Titelbild");
        case "companion_screenshot":
          return BrowserMock.widePicture(["#065f46", "#7c2d12", "#581c87"][(args.index as number) % 3], "Screenshot " + (args.index as number));
        case "companion_add_app":
          return new Promise((resolve) => window.setTimeout(() => resolve("Neues Spiel"), 800));
        case "companion_remove_app":
          return null;
        case "check_for_update":
          // Open http://localhost:1430/?update to see the update dialog.
          return new URLSearchParams(window.location.search).has("update") ? { version: "0.2.0", currentVersion: "0.1.0", notes: "Neue Bilder, Fehler behoben." } : null;
        case "install_update":
          return new Promise((_resolve, reject) => window.setTimeout(() => reject("Testfehler im Browser"), 1500));
        default:
          return null;
      }
    }, { shouldMockEvents: true });
  }
}
