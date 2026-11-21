import type LauncherApp from "../LauncherApp";
import { CheckIcon, PlayIcon } from "./Icons";

/** Asked after Moonlight disconnected normally: leave the game running on the PC or end it. */
export function AfterStreamDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const gameName = app.selectedGame() ?? "";

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{app.hostDisplayName() + " · Stream getrennt"}</div>
        <div className="tname">{gameName}</div>
        <div className="tsub">Läuft noch auf dem PC. Weiterlaufen lassen oder beenden?</div>

        <div className="actions dialogactions">
          <button className={"btn primary" + (state.afterStreamIndex === 0 ? " f" : "")} onClick={() => app.chooseAfterStream(0)}>
            <PlayIcon />
            Pausieren
          </button>
          <button className={"btn" + (state.afterStreamIndex === 1 ? " f" : "")} onClick={() => app.chooseAfterStream(1)}>
            <span className="stopmark" />
            Beenden
          </button>
        </div>

        <button
          className={"memo" + (state.afterStreamRemember ? " on" : "")}
          onClick={() => app.toggleAfterStreamRemember()}
          role="checkbox"
          aria-checked={state.afterStreamRemember}
        >
          <span className="rbox"><CheckIcon /></span>
          Für dieses Spiel merken
          <span className="glyph sm">Y</span>
        </button>
      </div>
    </div>
  );
}
