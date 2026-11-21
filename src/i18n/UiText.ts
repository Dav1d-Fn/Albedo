import { UiLanguage } from "../model/Types";
import { englishTexts } from "./EnglishTexts";
import { germanTexts, TextTable } from "./GermanTexts";

/**
 * The text table of the language in use. `LauncherApp` sets the language from the settings before
 * every render, so views and toasts read `UiText.current` and a change applies without restart.
 */
export class UiText
{
  /** Shown in the language row, each in its own language. */
  public static readonly languageNames: Record<UiLanguage, string> = { de: "Deutsch", en: "English" };

  public static readonly languages: UiLanguage[] = ["de", "en"];

  public static language: UiLanguage = UiText.systemLanguage();

  public static current: TextTable = UiText.tableFor(UiText.language);

  /** "" in the settings = follow the system language. */
  public static use(storedLanguage: UiLanguage | ""): void
  {
    const language = storedLanguage === "" ? UiText.systemLanguage() : storedLanguage;
    if (language !== UiText.language)
    {
      UiText.language = language;
      UiText.current = UiText.tableFor(language);
    }
    document.documentElement.lang = language;
  }

  /** German when the system speaks German, otherwise English. */
  public static systemLanguage(): UiLanguage
  {
    return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
  }

  private static tableFor(language: UiLanguage): TextTable
  {
    return language === "de" ? germanTexts : englishTexts;
  }
}
