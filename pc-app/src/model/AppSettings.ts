import { UiLanguage } from "../i18n/UiText";

export interface AppSettingsValues
{
  /** "" = system language. */
  language: UiLanguage | "";
  steamGridDbKey: string;
}

/**
 * The few settings of the PC app, kept in the webview's localStorage (only this user on this PC
 * sees them). Reads never throw: without storage the defaults apply.
 */
export class AppSettings
{
  private static readonly STORAGE_KEY = "albedoPcSettings";

  public static load(): AppSettingsValues
  {
    const defaults: AppSettingsValues = { language: "", steamGridDbKey: "" };
    try
    {
      const storedText = localStorage.getItem(AppSettings.STORAGE_KEY);
      return storedText ? { ...defaults, ...JSON.parse(storedText) } : defaults;
    }
    catch
    {
      return defaults;
    }
  }

  public static save(values: AppSettingsValues): void
  {
    try
    {
      localStorage.setItem(AppSettings.STORAGE_KEY, JSON.stringify(values));
    }
    catch
    {
      // Settings then last until the app closes.
    }
  }
}
