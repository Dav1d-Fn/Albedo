import type LauncherApp from "../LauncherApp";
import { UiText } from "../i18n/UiText";
import { StreamSummary } from "./StreamSummary";

/** After a normal disconnect when the game's after-stream action is not "ask": only the statistics. */
export function StreamSummaryDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const t = UiText.current;

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{t.afterStreamDialog.disconnected(app.hostDisplayName())}</div>
        <div className="tname">{app.selectedGame() ?? ""}</div>
        <StreamSummary statLines={app.state.streamSummary} />
        <div className="actions dialogactions">
          <button className="btn primary f" onClick={() => app.closeStreamSummary()}>{t.streamStats.ok}</button>
        </div>
      </div>
    </div>
  );
}
