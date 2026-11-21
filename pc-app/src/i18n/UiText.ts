import { englishTexts } from "./EnglishTexts";
import { germanTexts, TextTable } from "./GermanTexts";

export type UiLanguage = "de" | "en";

/**
 * The text table of the language in use. `PcApp` sets the language from the settings before
 * every render, so views read `UiText.current` and a change applies without restart.
 */
export class UiText
{
  public static language: UiLanguage = UiText.systemLanguage();

  public static current: TextTable = UiText.tableFor(UiText.language);

  /** "" = follow the system language. */
  public static use(storedLanguage: UiLanguage | ""): void
  {
    const language = storedLanguage === "" ? UiText.systemLanguage() : storedLanguage;
    UiText.language = language;
    UiText.current = UiText.tableFor(language);
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
