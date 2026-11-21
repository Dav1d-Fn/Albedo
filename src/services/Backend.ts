import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DefaultSettings } from "../model/DefaultSettings";
import { ModeText } from "../model/ModeText";
import { DeviceProfile, DiscoveredHost, LibraryEntry, PadButton, Settings, StreamMode } from "../model/Types";

export interface StreamEnded
{
  exitCode: number | null;
  errorTail: string;
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

  public hasExternalDisplay(): Promise<boolean>
  {
    return invoke<boolean>("has_external_display");
  }

  public fetchGames(settings: Settings): Promise<string[]>
  {
    return invoke<string[]>("fetch_games", {
      source:
      {
        host: settings.host,
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

  /** Runs `moonlight pair`; resolves once the PIN was accepted in Sunshine. */
  public pairHost(settings: Settings, pin: string): Promise<void>
  {
    return invoke<void>("pair_host", { moonlightCommand: settings.moonlightCommand, host: settings.host, pin });
  }

  /** Game name -> cover image (`data:` URL) from Moonlight's box art cache. */
  public loadBoxArt(settings: Settings): Promise<Record<string, string>>
  {
    return invoke<Record<string, string>>("load_box_art", { moonlightCommand: settings.moonlightCommand, host: settings.host });
  }

  /** Games and programs installed on the PC, from the companion service. */
  public companionLibrary(settings: Settings): Promise<LibraryEntry[]>
  {
    return invoke<LibraryEntry[]>("companion_library", { host: settings.host });
  }

  /** Cover of a library entry as `data:` URL, null when the PC has none. */
  public companionCover(settings: Settings, entryId: string): Promise<string | null>
  {
    return invoke<string | null>("companion_cover", { host: settings.host, entryId });
  }

  /** Creates the Sunshine app for an entry; resolves with the app name. */
  public companionAddApp(settings: Settings, entryId: string): Promise<string>
  {
    return invoke<string>("companion_add_app", { host: settings.host, entryId });
  }

  public companionRemoveApp(settings: Settings, appName: string): Promise<void>
  {
    return invoke<void>("companion_remove_app", { host: settings.host, appName });
  }

  /** Ends the app still running on the PC (`moonlight quit <host>`). */
  public quitHostApp(settings: Settings): Promise<void>
  {
    return invoke<void>("quit_host_app", { moonlightCommand: settings.moonlightCommand, host: settings.host });
  }

  /** Starts Moonlight; resolves with the command line that was run. */
  public startStream(settings: Settings, gameName: string, profile: DeviceProfile, mode: StreamMode): Promise<string>
  {
    const size = ModeText.size(mode.resolution);
    return invoke<string>("start_stream", {
      command:
      {
        baseCommand: settings.moonlightCommand,
        host: settings.host,
        appName: gameName,
        width: size.width,
        height: size.height,
        fps: mode.fps,
        bitrateMbps: mode.bitrateMbps,
        codec: mode.codec,
        hdr: mode.hdr,
        audio: profile.audio,
      },
    });
  }

  public onStreamEnded(handler: (event: StreamEnded) => void): Promise<UnlistenFn>
  {
    return listen<StreamEnded>("stream-ended", (event) => handler(event.payload));
  }

  public onPadButton(handler: (button: PadButton) => void): Promise<UnlistenFn>
  {
    return listen<PadButton>("pad-button", (event) => handler(event.payload));
  }
}
