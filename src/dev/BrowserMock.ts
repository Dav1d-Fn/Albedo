import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

/**
 * Fake backend for `npm run dev` in a plain browser (no Tauri), so the UI can be
 * checked and clicked through without the Rust side. Never active inside the app.
 */
export class BrowserMock
{
  private static readonly sampleGames = ["Cyberpunk 2077", "Elden Ring", "Hades II", "Forza Horizon 5", "Baldur's Gate 3", "Stardew Valley", "Portal 2"];

  private static readonly sampleLibrary =
  [
    { id: "preset:desktop-auto", name: "Desktop", group: "Voreinstellungen", hasCover: false, inSunshine: true },
    { id: "preset:big-picture", name: "Steam Big Picture", group: "Voreinstellungen", hasCover: false, inSunshine: false },
    { id: "steam:1245620", name: "ELDEN RING", group: "Steam", hasCover: false, inSunshine: true },
    { id: "steam:1086940", name: "Baldur's Gate 3", group: "Steam", hasCover: false, inSunshine: false },
    { id: "steam:1551360", name: "Forza Horizon 5", group: "Steam", hasCover: false, inSunshine: false },
    { id: "heroic:Crow", name: "Dead Island 2", group: "Heroic", hasCover: false, inSunshine: false },
    { id: "prism:26.3 Modpack Test", name: "Minecraft 26.3 Modpack Test", group: "Minecraft", hasCover: false, inSunshine: false },
  ];

  public static installIfNeeded(): void
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      return;
    }
    let storedSettings: string | null = null;
    // Like a fresh companion: no Sunshine login until the launcher hands one over.
    let sunshineProblem: string | null = "Sunshine-Login fehlt im PC-Helfer";

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
        case "has_external_display":
          return false;
        case "fetch_games":
          return BrowserMock.sampleGames;
        case "discover_hosts":
          return [{ name: "fedora", address: "192.168.178.36" }];
        case "pair_host":
          return new Promise((resolve) => window.setTimeout(resolve, 4000));
        case "start_stream":
          window.setTimeout(() => emit("stream-ended", { exitCode: 0, errorTail: "" }), 3000);
          return "moonlight stream (browser mock)";
        case "quit_host_app":
          return new Promise((resolve) => window.setTimeout(resolve, 500));
        case "load_box_art":
          return {};
        case "companion_library":
          return { entries: BrowserMock.sampleLibrary, sunshineProblem };
        case "companion_set_sunshine_login":
          if (args.password !== "sunshine")
          {
            return Promise.reject("Sunshine-Login falsch (im Browser-Mock ist das Passwort „sunshine“)");
          }
          sunshineProblem = null;
          return null;
        case "companion_cover":
          return null;
        case "companion_add_app":
          return new Promise((resolve) => window.setTimeout(() => resolve("Neues Spiel"), 800));
        case "companion_remove_app":
          return null;
        default:
          return null;
      }
    }, { shouldMockEvents: true });
  }
}
