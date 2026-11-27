import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";
import { PowerIcon } from "./Icons";

/**
 * Centered panel on the home screen when there are no games to show: PC off, unreachable,
 * being woken, its list failing or not set up yet. Says what is wrong and offers the next step on A.
 */
export function StatusPanel(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const t = UiText.current.statusPanel;
  const kind = app.statusPanelKind();
  const buttonLabel = app.statusPanelButtonLabel();
  const focused = state.zone === "games";
  const networkHint = app.hostAddresses().length > 1 ? t.networkHintTailscale : t.networkHint;

  let eyebrow = "";
  let lines: string[] = [];
  let detail = "";
  let checksByItself = false;
  switch (kind)
  {
    case "setup":
      eyebrow = t.setupEyebrow;
      lines = [t.setupText];
      break;
    case "wake":
      eyebrow = state.wakeTimedOut ? t.wakeFailedEyebrow : t.wakeEyebrow;
      lines = state.wakeTimedOut ? [state.hostError] : [t.wakeText, t.homeNetworkOnly];
      detail = state.wakeTimedOut ? "" : state.hostError;
      checksByItself = true;
      break;
    case "waking":
      eyebrow = t.wakingEyebrow;
      lines = [t.wakingText(state.wakeSeconds, LauncherApp.wakeTimeoutSeconds), t.wakingHint];
      break;
    case "noMac":
      eyebrow = t.noMacEyebrow;
      lines = [t.noMacText, networkHint];
      detail = state.hostError;
      checksByItself = true;
      break;
    case "noList":
      eyebrow = t.noListEyebrow;
      lines = [t.noListText];
      detail = state.hostError;
      break;
  }

  return (
    <div className="statuspanel">
      <div className="dcard statuscard">
        {kind === "waking" ? <span className="spin big" /> : <span className={"statusicon" + (kind === "setup" ? "" : " off")}><PowerIcon /></span>}
        <div className="teyebrow">{eyebrow}</div>
        <div className="tname">{app.settings.host === "" ? "Albedo" : app.hostDisplayName()}</div>
        {lines.map((line) => <div key={line} className="statusline">{line}</div>)}
        {detail !== "" && <div className="statusdetail">{detail}</div>}
        {buttonLabel !== null && (
          <div className="actions dialogactions">
            <button className={"btn primary" + (focused ? " f" : "")} onClick={() => app.activateStatusPanel()}>
              {kind === "wake" && <PowerIcon />}
              {buttonLabel}
            </button>
          </div>
        )}
        {checksByItself && <div className="tsub">{t.autoCheck}</div>}
      </div>
    </div>
  );
}
