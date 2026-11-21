import { UiText } from "../i18n/UiText";
import type LauncherApp from "../LauncherApp";
import { CheckIcon, PlayIcon } from "./Icons";
import { StreamSummary } from "./StreamSummary";

/** Asked after Moonlight disconnected normally: leave the game running on the PC or end it. */
export function AfterStreamDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const t = UiText.current;
  const gameName = app.selectedGame() ?? "";

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{t.afterStreamDialog.disconnected(app.hostDisplayName())}</div>
        <div className="tname">{gameName}</div>
        {state.streamSummary.length > 0 && <StreamSummary statLines={state.streamSummary} />}
        <div className="tsub">{t.afterStreamDialog.question}</div>

        <div className="actions dialogactions">
          <button className={"btn primary" + (state.afterStreamIndex === 0 ? " f" : "")} onClick={() => app.chooseAfterStream(0)}>
            <PlayIcon />
            {t.afterStreamNames.keep}
          </button>
          <button className={"btn" + (state.afterStreamIndex === 1 ? " f" : "")} onClick={() => app.chooseAfterStream(1)}>
            <span className="stopmark" />
            {t.afterStreamNames.quit}
          </button>
        </div>

        <button
          className={"memo" + (state.afterStreamRemember ? " on" : "")}
          onClick={() => app.toggleAfterStreamRemember()}
          role="checkbox"
          aria-checked={state.afterStreamRemember}
        >
          <span className="rbox"><CheckIcon /></span>
          {t.common.rememberForGame}
          <span className="glyph sm">Y</span>
        </button>
      </div>
    </div>
  );
}
