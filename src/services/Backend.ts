import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DefaultSettings } from "../model/DefaultSettings";
import { ModeText } from "../model/ModeText";
import { ArtKind, CompanionLibrary, UploadToken, DeviceProfile, DiscoveredHost, PadButton, Settings, StreamMode } from "../model/Types";

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

  /** Hands the Sunshine web UI login to the companion; rejects with its German message when Sunshine refuses it. */
  public companionSetSunshineLogin(host: string, user: string, password: string): Promise<void>
  {
    return invoke<void>("companion_set_sunshine_login", { host, user, password });
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
}
