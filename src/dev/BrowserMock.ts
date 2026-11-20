import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

/**
 * Fake backend for `npm run dev` in a plain browser (no Tauri), so the UI can be
 * checked and clicked through without the Rust side. Never active inside the app.
 */
export class BrowserMock
{
  private static readonly sampleGames = ["Cyberpunk 2077", "Elden Ring", "Hades II", "Forza Horizon 5", "Baldur's Gate 3", "Stardew Valley", "Portal 2"];

  public static installIfNeeded(): void
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      return;
    }
    let storedSettings: string | null = null;

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
        case "start_stream":
          window.setTimeout(() => emit("stream-ended", { exitCode: 0, errorTail: "" }), 3000);
          return "moonlight stream (browser mock)";
        default:
          return null;
      }
    }, { shouldMockEvents: true });
  }
}
