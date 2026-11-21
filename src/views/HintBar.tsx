import LauncherApp from "../LauncherApp";
import { PadButton } from "../model/Types";

interface Hint
{
  glyph: string;
  label: string;
  button: PadButton;
  pill?: boolean;
}

/** Bottom bar with the controller buttons that do something on the current screen. */
export function HintBar(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const hints: Hint[] = [];

  if (state.screen === "home")
  {
    const onAddTile = state.zone === "games" && app.isAddTileSelected();
    hints.push({ glyph: "A", label: state.zone === "games" ? (onAddTile ? "Hinzufügen" : "Details") : "Auswählen", button: "A" });
    hints.push({ glyph: "X", label: "Gerät", button: "X" });
    hints.push({ glyph: "L1 · R1", label: "Modus", button: "R1", pill: true });
    hints.push({ glyph: "Y", label: "Neu laden", button: "Y" });
    hints.push({ glyph: "☰", label: "Profile", button: "MENU", pill: true });
  }
  else if (state.screen === "detail")
  {
    hints.push({ glyph: "A", label: state.detailIndex === 0 ? "Spielen" : "Gerät wechseln", button: "A" });
    hints.push({ glyph: "X", label: "Gerät", button: "X" });
    hints.push({ glyph: "L1 · R1", label: "Modus", button: "R1", pill: true });
    hints.push({ glyph: "Y", label: app.isRemembered(app.selectedGame()) ? "Vergessen" : "Merken", button: "Y" });
    hints.push({ glyph: "B", label: "Zurück", button: "B" });
  }
  else if (state.screen === "editor")
  {
    hints.push({ glyph: "L1 · R1", label: "Gerät", button: state.editDevice === "tv" ? "L1" : "R1", pill: true });
    if (state.editZone === "modes")
    {
      hints.push({ glyph: "A", label: "Bearbeiten", button: "A" });
      hints.push({ glyph: "Y", label: "Als Standard", button: "Y" });
      hints.push({ glyph: "X", label: "Neuer Modus", button: "X" });
      hints.push({ glyph: "B", label: "Fertig", button: "B" });
    }
    else
    {
      hints.push({ glyph: "◀ ▶", label: "Wert ändern", button: "RIGHT", pill: true });
      hints.push({ glyph: "A", label: "Umschalten", button: "A" });
      hints.push({ glyph: "B", label: "Zu den Modi", button: "B" });
    }
  }
  else if (state.screen === "connection")
  {
    const onPairRow = state.connectionZone === "rows" && state.connectionRow === 0;
    const onAddressesRow = state.connectionZone === "rows" && state.connectionRow === LauncherApp.addressesRowIndex;
    const rowLabel = onPairRow ? "Koppeln" : onAddressesRow ? "Adresse eintippen" : "Umschalten";
    hints.push({ glyph: "A", label: state.connectionZone === "hosts" ? "Verwenden" : rowLabel, button: "A" });
    if (onAddressesRow && app.settings.extraHostAddresses.length > 0)
    {
      hints.push({ glyph: "X", label: "Letzte entfernen", button: "X" });
    }
    hints.push({ glyph: "Y", label: "Neu suchen", button: "Y" });
    hints.push({ glyph: "B", label: "Fertig", button: "B" });
  }
  else if (state.screen === "library" && state.sunshineLogin !== null)
  {
    hints.push({ glyph: "▲ ▼", label: "Feld", button: "DOWN", pill: true });
    hints.push({ glyph: "A", label: state.sunshineLogin.row === 0 ? "Weiter" : "Speichern", button: "A" });
    hints.push({ glyph: "B", label: "Abbrechen", button: "B" });
  }
  else if (state.screen === "library")
  {
    const entry = app.selectedLibraryEntry();
    hints.push({ glyph: "L1 · R1", label: "Gruppe", button: "R1", pill: true });
    const loginMissing = state.librarySunshineProblem !== null;
    if (entry !== undefined && !entry.inSunshine)
    {
      hints.push({ glyph: "A", label: loginMissing ? "Login eintragen" : "Hinzufügen", button: "A" });
    }
    if (entry !== undefined && entry.inSunshine)
    {
      hints.push({ glyph: "X", label: loginMissing ? "Login eintragen" : "Entfernen", button: "X" });
    }
    hints.push({ glyph: "Y", label: "Neu laden", button: "Y" });
    hints.push({ glyph: "☰", label: "Sunshine-Login", button: "MENU", pill: true });
    hints.push({ glyph: "B", label: "Fertig", button: "B" });
  }
  else if (state.screen === "afterStream")
  {
    hints.push({ glyph: "◀ ▶", label: "Wählen", button: "RIGHT", pill: true });
    hints.push({ glyph: "A", label: state.afterStreamIndex === 0 ? "Pausieren" : "Beenden", button: "A" });
    hints.push({ glyph: "Y", label: state.afterStreamRemember ? "Nicht merken" : "Merken", button: "Y" });
    hints.push({ glyph: "B", label: "Pausieren", button: "B" });
  }
  else if (state.screen === "stream")
  {
    hints.push({ glyph: "B", label: "Stream beenden", button: "B" });
  }
  else if (state.screen === "connect")
  {
    hints.push({ glyph: "B", label: "Abbrechen", button: "B" });
  }

  return (
    <div className="hints">
      <span className="keys">Pfeile · Enter A · Esc B · X · Y · Q/E L1/R1 · M ☰</span>
      <span className="hspacer" />
      {hints.map((hint) => (
        <button key={state.screen + hint.glyph + hint.label} className="hint" onClick={() => app.press(hint.button)}>
          <span className={"glyph" + (hint.pill ? " pill" : "")}>{hint.glyph}</span>
          {hint.label}
        </button>
      ))}
    </div>
  );
}
