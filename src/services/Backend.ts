import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { DefaultSettings } from "../model/DefaultSettings";
import { ModeText } from "../model/ModeText";
import { DeviceProfile, PadButton, Settings, StreamMode } from "../model/Types";

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
