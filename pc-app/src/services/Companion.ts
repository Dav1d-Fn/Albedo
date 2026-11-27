import { invoke } from "@tauri-apps/api/core";
import { UiLanguage, UiText } from "../i18n/UiText";
import {
  ArtKind,
  ArtSearchResult,
  DisplayModes,
  DisplayRouteTarget,
  DisplayTestStatus,
  Health,
  ModeRequestStatus,
  UpdateStatus,
  Library,
  PairedClient,
  PendingPairing,
} from "../model/CompanionTypes";

/**
 * Every call to the companion service (companion/API.md) and the Rust side. The companion runs
 * on this PC; its answers and errors come in the UI language (`setLanguage`).
 */
export class Companion
{
  /** Pictures load straight from the companion (img tags need no CORS). */
  private static readonly BASE_URL = "http://127.0.0.1:47995";

  public static async setLanguage(language: string): Promise<void>
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      await invoke("set_language", { language });
    }
  }

  /** The stored language setting ("" = system); in a plain browser (npm run dev) always "". */
  public static async loadLanguageSetting(): Promise<UiLanguage | "">
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      return invoke<UiLanguage | "">("load_language_setting");
    }
    return "";
  }

  public static async saveLanguageSetting(language: UiLanguage | ""): Promise<void>
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      await invoke("save_language_setting", { language });
    }
  }

  public static health(): Promise<Health>
  {
    return Companion.request("GET", "api/health");
  }

  public static updateStatus(): Promise<UpdateStatus>
  {
    return Companion.request("GET", "api/update");
  }

  /** Installs the signed release the updater found; the app restarts in the tray afterwards. */
  public static installUpdate(): Promise<UpdateStatus>
  {
    return Companion.request("POST", "api/update");
  }

  public static library(): Promise<Library>
  {
    return Companion.request("GET", "api/library");
  }

  public static displayModes(): Promise<DisplayModes>
  {
    return Companion.request("GET", "api/display-modes");
  }

  /** Saves the dummy plug's connector or the main monitor (null = none / the primary one). */
  public static setDisplayOutput(field: "dummy" | "main", outputName: string | null): Promise<DisplayModes>
  {
    return Companion.request("PUT", "api/display-setup", { [field]: outputName });
  }

  /** Puts the mode into the virtual monitor's EDID; the KDE password prompt opens on this PC. */
  public static addVirtualMode(width: number, height: number, refreshRate: number): Promise<ModeRequestStatus>
  {
    return Companion.request("POST", "api/display-modes", { width, height, refreshRate });
  }

  public static modeRequestStatus(): Promise<ModeRequestStatus>
  {
    return Companion.request("GET", "api/display-modes/request");
  }

  /** Switches the route once, back after 10 s. */
  public static startDisplayTest(target: DisplayRouteTarget, width: number, height: number, refreshRate: number): Promise<DisplayTestStatus>
  {
    return Companion.request("POST", "api/display-test", { target, width, height, refreshRate });
  }

  public static displayTestStatus(): Promise<DisplayTestStatus>
  {
    return Companion.request("GET", "api/display-test");
  }

  public static async addApp(entryId: string): Promise<string>
  {
    const answer: { name: string } = await Companion.request("POST", "api/apps", { id: entryId });
    return answer.name;
  }

  public static removeApp(appName: string): Promise<void>
  {
    return Companion.request("DELETE", "api/apps", { name: appName });
  }

  /** `group` null = back to the detected group. */
  public static setGroup(entryId: string, group: string | null): Promise<void>
  {
    return Companion.request("PUT", "api/group", { id: entryId, group });
  }

  public static resetArt(entryId: string, kind: ArtKind): Promise<void>
  {
    return Companion.request("DELETE", `api/art/${encodeURIComponent(entryId)}/${kind}`);
  }

  /** A file the user picked or dropped, as raw bytes (the companion converts it). */
  public static async uploadArt(entryId: string, kind: ArtKind, imageBytes: ArrayBuffer): Promise<void>
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      await invoke("upload_art", new Uint8Array(imageBytes), {
        headers: { "entry-id": encodeURIComponent(entryId), "art-kind": kind },
      });
      return;
    }
    // Plain browser: the same upload link the phone gets, through Vite's proxy.
    const uploadToken: { url: string } = await Companion.request("POST", "api/upload-token", { id: entryId, kind });
    const response = await fetch(`/companion${new URL(uploadToken.url).pathname}`, { method: "POST", body: imageBytes });
    if (!response.ok)
    {
      throw (await response.json()).error;
    }
  }

  public static searchArt(
    gameName: string,
    entryId: string,
    system: string | null,
    kind: ArtKind,
  ): Promise<ArtSearchResult>
  {
    return invoke("search_art", { gameName, entryId, system, kind });
  }

  public static applyArt(entryId: string, kind: ArtKind, imageUrl: string): Promise<void>
  {
    return invoke("apply_art", { entryId, kind, imageUrl });
  }

  public static setSunshineLogin(user: string, password: string): Promise<void>
  {
    return Companion.request("PUT", "api/sunshine-login", { user, password });
  }

  /** Last four characters of the SteamGridDB key the companion holds (shared with the Deck), "" = none. */
  public static async steamGridDbKeyHint(): Promise<string>
  {
    const keyState: { hint: string | null } = await Companion.request("GET", "api/steamgriddb-key");
    return keyState.hint ?? "";
  }

  /** Stores the key in the companion; "" removes it. */
  public static setSteamGridDbKey(key: string): Promise<void>
  {
    return key === "" ? Companion.request("DELETE", "api/steamgriddb-key") : Companion.request("PUT", "api/steamgriddb-key", { key });
  }

  /** Resolves when SteamGridDB accepts the stored key; the error says "invalid" or "unreachable". */
  public static testSteamGridDbKey(): Promise<void>
  {
    return Companion.request("POST", "api/steamgriddb-key/test", {});
  }

  /** Where users get a SteamGridDB key, in the system browser. */
  public static async openSteamGridDbKeyPage(): Promise<void>
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      await invoke("open_steam_grid_db_key_page");
      return;
    }
    window.open("https://www.steamgriddb.com/profile/preferences/api", "_blank");
  }

  public static async pairedClients(): Promise<PairedClient[]>
  {
    const answer: { clients: PairedClient[] } = await Companion.request("GET", "api/clients");
    return answer.clients;
  }

  public static unpair(clientUuid: string): Promise<void>
  {
    return Companion.request("DELETE", `api/clients/${encodeURIComponent(clientUuid)}`);
  }

  /** Null when Sunshine has no list of waiting devices (versions before 2026). */
  public static async pendingPairings(): Promise<PendingPairing[] | null>
  {
    try
    {
      const answer: { pairings: PendingPairing[] } = await Companion.request("GET", "api/pairings");
      return answer.pairings;
    }
    catch
    {
      return null;
    }
  }

  public static pair(pin: string, deviceName: string, pairingId: string | null): Promise<void>
  {
    return Companion.request("POST", "api/pair", { pin, name: deviceName, pairingId: pairingId ?? undefined });
  }

  /** `version` changes the URL after a picture change, so the webview loads it again. */
  public static pictureUrl(kind: ArtKind, entryId: string, version: number): string
  {
    return `${Companion.BASE_URL}/api/${kind}/${encodeURIComponent(entryId)}?v=${version}`;
  }

  private static async request<T>(method: string, path: string, body?: unknown): Promise<T>
  {
    if ("__TAURI_INTERNALS__" in window)
    {
      return invoke("companion", { method, path, body: body ?? null });
    }
    // Plain browser (`npm run dev`): through Vite's proxy, for looking at the UI. Search and upload need Tauri.
    const response = await fetch(`/companion/${path}`, {
      method,
      headers: { "Accept-Language": UiText.language },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const answerText = await response.text();
    const answer = answerText ? JSON.parse(answerText) : null;
    if (!response.ok)
    {
      throw answer?.error ?? `HTTP ${response.status}`;
    }
    return answer;
  }
}
