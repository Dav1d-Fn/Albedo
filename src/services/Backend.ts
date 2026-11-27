import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DefaultSettings } from "../model/DefaultSettings";
import { ModeText } from "../model/ModeText";
import { UiLanguage, ArtKind, ArtSearchResult, CompanionLibrary, UploadToken, DeviceProfile, DiscoveredHost, PadButton, DisplayTarget, PcDisplays, PcModeRequest, CompanionUpdateStatus, HomeCache, RunningHostApp, Settings, StreamMode, SteamGridDbKeyCheck } from "../model/Types";

export interface StreamEnded
{
  exitCode: number | null;
  errorTail: string;
  /** Moonlight's "Global video stats" lines (English), empty when it logged none. */
  videoStats: string[];
}

/** A newer signed release on GitHub (src-tauri/src/app_updater.rs). */
export interface AvailableUpdate
{
  version: string;
  currentVersion: string;
  notes: string;
}

/** All calls into the Rust side (src-tauri/src/lib.rs). */
export class Backend
{
  public async loadSettings(): Promise<Settings>
  {
    const stored = await invoke<string | null>("load_settings");
    if (stored === null)
    {
      return DefaultSettings.create();
    }
    try
    {
      return DefaultSettings.merge(JSON.parse(stored));
    }
    catch (parseError)
    {
      console.error("settings.json is broken, using defaults", parseError);
      return DefaultSettings.create();
    }
  }

  /** Returns the path the settings were written to. */
  public saveSettings(settings: Settings): Promise<string>
  {
    return invoke<string>("save_settings", { settingsJson: JSON.stringify(settings, null, 2) });
  }

  /** The home screen of the last visit, null when there is none or it cannot be read. */
  public async loadHomeCache(): Promise<HomeCache | null>
  {
    const stored = await invoke<string | null>("load_home_cache");
    return stored === null ? null : JSON.parse(stored) as HomeCache;
  }

  public saveHomeCache(cache: HomeCache): Promise<void>
  {
    return invoke<void>("save_home_cache", { cacheJson: JSON.stringify(cache) });
  }

  /** Language of the Rust side's messages and of the companion's answers (sent as Accept-Language). */
  public setLanguage(language: UiLanguage): Promise<void>
  {
    return invoke<void>("set_language", { language });
  }

  /** Names of the connected external screens (from their EDID); empty = no dock/TV. */
  public externalDisplayNames(): Promise<string[]>
  {
    return invoke<string[]>("external_display_names");
  }

  public hasExternalDisplay(): Promise<boolean>
  {
    return invoke<boolean>("has_external_display");
  }

  /** `host` is the PC address that answered (see `pickHostAddress`). */
  public fetchGames(settings: Settings, host: string): Promise<string[]>
  {
    return invoke<string[]>("fetch_games", {
      source:
      {
        host,
        moonlightCommand: settings.moonlightCommand,
        sunshineApiUrl: settings.sunshineApiUrl,
        sunshineUser: settings.sunshineUser,
        sunshinePassword: settings.sunshinePassword,
      },
    });
  }

  /** Looks for Sunshine hosts on the LAN via mDNS (takes about 3 seconds). */
  public discoverHosts(): Promise<DiscoveredHost[]>
  {
    return invoke<DiscoveredHost[]>("discover_hosts");
  }

  /** First address in the list that the PC answers on (home network before Tailscale), null when none does. */
  public pickHostAddress(addresses: string[]): Promise<string | null>
  {
    return invoke<string | null>("pick_host_address", { addresses });
  }

  /** MAC of the PC from the ARP table, null unless it just answered on the home network. */
  public hostMacAddress(addresses: string[]): Promise<string | null>
  {
    return invoke<string | null>("host_mac_address", { addresses });
  }

  /** Sends the Wake-on-LAN magic packet (broadcast, home network only). */
  public wakeHost(macAddress: string, addresses: string[]): Promise<void>
  {
    return invoke<void>("wake_host", { macAddress, addresses });
  }

  /** Runs `moonlight pair`; resolves once the PIN was accepted in Sunshine. */
  public pairHost(settings: Settings, host: string, pin: string): Promise<void>
  {
    return invoke<void>("pair_host", { moonlightCommand: settings.moonlightCommand, host, pin });
  }

  /** Game name -> cover image (`data:` URL) from Moonlight's box art cache; Moonlight may know the PC under any of its addresses. */
  public loadBoxArt(settings: Settings, addresses: string[]): Promise<Record<string, string>>
  {
    return invoke<Record<string, string>>("load_box_art", { moonlightCommand: settings.moonlightCommand, addresses });
  }

  /** Games and programs installed on the PC, from the companion service. */
  public companionLibrary(host: string): Promise<CompanionLibrary>
  {
    return invoke<CompanionLibrary>("companion_library", { host });
  }

  /** Streaming outputs of the PC and their modes; rejects when the companion is not reachable. */
  public companionDisplayModes(host: string): Promise<PcDisplays>
  {
    return invoke<PcDisplays>("companion_display_modes", { host });
  }

  /** The monitor the next stream uses on the PC (companion `POST /api/stream-display`). */
  public companionSetStreamDisplay(host: string, target: DisplayTarget): Promise<void>
  {
    return invoke<void>("companion_set_stream_display", { host, target });
  }

  /** Asks the PC to add a mode to its virtual monitor; the PC user confirms with the root password there. */
  public companionAddDisplayMode(host: string, width: number, height: number, refreshRate: number): Promise<PcModeRequest>
  {
    return invoke<PcModeRequest>("companion_add_display_mode", { host, width, height, refreshRate });
  }

  public companionDisplayModeRequest(host: string): Promise<PcModeRequest>
  {
    return invoke<PcModeRequest>("companion_display_mode_request", { host });
  }

  /** Hands the Sunshine web UI login to the companion; rejects with its German message when Sunshine refuses it. */
  public companionSetSunshineLogin(host: string, user: string, password: string): Promise<void>
  {
    return invoke<void>("companion_set_sunshine_login", { host, user, password });
  }

  /** Lets the PC helper try its stored SteamGridDB key. "unchecked" when the helper is too old to check. */
  public companionTestSteamGridDbKey(host: string): Promise<SteamGridDbKeyCheck>
  {
    return invoke<SteamGridDbKeyCheck>("companion_test_steam_grid_db_key", { host });
  }

  /** Last four characters of the SteamGridDB key the PC helper holds, "" = none. The key itself stays on the PC. */
  public companionSteamGridDbKey(host: string): Promise<string>
  {
    return invoke<string>("companion_steam_grid_db_key", { host });
  }

  /** Stores the SteamGridDB key in the PC helper (shared with its PC app); "" removes it. */
  public companionSetSteamGridDbKey(host: string, key: string): Promise<void>
  {
    return invoke<void>("companion_set_steam_grid_db_key", { host, key });
  }

  /** Wide title image of a library entry as `data:` URL, null when the PC has none. */
  public companionHero(host: string, entryId: string): Promise<string | null>
  {
    return invoke<string | null>("companion_hero", { host, entryId });
  }

  /** One of the user's screenshots of a library entry (0 = newest) as `data:` URL, null when there is none. */
  public companionScreenshot(host: string, entryId: string, index: number): Promise<string | null>
  {
    return invoke<string | null>("companion_screenshot", { host, entryId, index });
  }

  /** Logo (name lettering) of a library entry as `data:` URL, null when the PC has none. */
  public companionLogo(host: string, entryId: string): Promise<string | null>
  {
    return invoke<string | null>("companion_logo", { host, entryId });
  }

  /** One-time upload page plus its QR code, for setting a picture from the phone. */
  public companionUploadToken(host: string, entryId: string, kind: ArtKind): Promise<UploadToken>
  {
    return invoke<UploadToken>("companion_upload_token", { host, entryId, kind });
  }

  /** Pictures of this kind from the Steam shop, libretro and, when the PC helper holds a key, SteamGridDB. */
  public searchArt(host: string, gameName: string, entryId: string, system: string | undefined, kind: ArtKind): Promise<ArtSearchResult>
  {
    return invoke<ArtSearchResult>("search_art", { host, gameName, entryId, system: system ?? null, kind });
  }

  /** Downloads a found picture and sets it on the PC like a phone upload. */
  public applyArt(host: string, entryId: string, kind: ArtKind, imageUrl: string): Promise<void>
  {
    return invoke<void>("apply_art", { host, entryId, kind, imageUrl });
  }

  /** Version and self-update state of the companion; rejects when it doesn't answer. */
  public companionUpdateStatus(host: string): Promise<CompanionUpdateStatus>
  {
    return invoke<CompanionUpdateStatus>("companion_update_status", { host });
  }

  /** The companion installs its signed release and restarts; poll `companionUpdateStatus`. */
  public companionInstallUpdate(host: string): Promise<CompanionUpdateStatus>
  {
    return invoke<CompanionUpdateStatus>("companion_install_update", { host });
  }

  /** Goes up whenever a picture was set or reset on the PC. */
  public companionArtVersion(host: string): Promise<number>
  {
    return invoke<number>("companion_art_version", { host });
  }

  /** Back to the automatic picture of this kind. */
  public companionResetArt(host: string, entryId: string, kind: ArtKind): Promise<void>
  {
    return invoke<void>("companion_reset_art", { host, entryId, kind });
  }

  /** Cover of a library entry as `data:` URL, null when the PC has none. */
  public companionCover(host: string, entryId: string): Promise<string | null>
  {
    return invoke<string | null>("companion_cover", { host, entryId });
  }

  /** Creates the Sunshine app for an entry; resolves with the app name. */
  public companionAddApp(host: string, entryId: string): Promise<string>
  {
    return invoke<string>("companion_add_app", { host, entryId });
  }

  public companionRemoveApp(host: string, appName: string): Promise<void>
  {
    return invoke<void>("companion_remove_app", { host, appName });
  }

  /** Ends the app still running on the PC (`moonlight quit <host>`). */
  public quitHostApp(settings: Settings, host: string): Promise<void>
  {
    return invoke<void>("quit_host_app", { moonlightCommand: settings.moonlightCommand, host });
  }

  /** What runs on the PC right now (Sunshine's `serverinfo`), null when nothing does. */
  public runningHostApp(settings: Settings, host: string, addresses: string[]): Promise<RunningHostApp | null>
  {
    return invoke<RunningHostApp | null>("running_host_app", { moonlightCommand: settings.moonlightCommand, host, addresses });
  }

  /** Starts Moonlight; resolves with the command line that was run. */
  public startStream(settings: Settings, host: string, gameName: string, profile: DeviceProfile, mode: StreamMode): Promise<string>
  {
    const size = ModeText.size(mode.resolution);
    return invoke<string>("start_stream", {
      command:
      {
        baseCommand: settings.moonlightCommand,
        host,
        appName: gameName,
        width: size.width,
        height: size.height,
        fps: mode.fps,
        bitrateMbps: mode.bitrateMbps,
        codec: mode.codec,
        hdr: mode.hdr,
        audio: profile.audio,
        performanceOverlay: profile.performanceOverlay,
      },
    });
  }

  /** Ends a Moonlight that hangs; resolves false when none was running. "stream-ended" follows. */
  public stopStream(): Promise<boolean>
  {
    return invoke<boolean>("stop_stream");
  }

  public onStreamEnded(handler: (event: StreamEnded) => void): Promise<UnlistenFn>
  {
    return listen<StreamEnded>("stream-ended", (event) => handler(event.payload));
  }

  public onPadButton(handler: (button: PadButton) => void): Promise<UnlistenFn>
  {
    return listen<PadButton>("pad-button", (event) => handler(event.payload));
  }

  /** Null when the launcher is up to date, offline, or not running as AppImage. */
  public checkForUpdate(): Promise<AvailableUpdate | null>
  {
    return invoke<AvailableUpdate | null>("check_for_update");
  }

  /** Replaces the AppImage and restarts the launcher; only returns on failure. */
  public installUpdate(): Promise<void>
  {
    return invoke<void>("install_update");
  }
}
