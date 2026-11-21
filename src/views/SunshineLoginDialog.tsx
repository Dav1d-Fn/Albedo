import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";

/** Login of Sunshine's web UI for the companion on the PC; without it the companion cannot add or remove apps. */
export function SunshineLoginDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const draft = app.state.sunshineLogin;
  if (draft === null)
  {
    return null;
  }
  const [userFieldId, passwordFieldId] = LauncherApp.sunshineLoginFieldIds;
  const t = UiText.current;

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{t.sunshineLogin.eyebrow(app.hostDisplayName())}</div>
        <div className="tname">{t.common.sunshineLogin}</div>
        <div className="tsub">{t.sunshineLogin.explanation(app.connectedHost())}</div>

        <div className="loginform">
          <label className={"loginfield" + (draft.row === 0 ? " f" : "")}>
            <span className="msub">{t.sunshineLogin.user}</span>
            <input
              id={userFieldId}
              className="hostinput"
              value={draft.user}
              spellCheck={false}
              autoComplete="off"
              disabled={draft.busy}
              onChange={(changeEvent) => app.changeSunshineLogin({ user: changeEvent.target.value, error: "" })}
              onFocus={() => app.changeSunshineLogin({ row: 0 })}
            />
          </label>
          <label className={"loginfield" + (draft.row === 1 ? " f" : "")}>
            <span className="msub">{t.sunshineLogin.password}</span>
            <input
              id={passwordFieldId}
              className="hostinput"
              type="password"
              value={draft.password}
              autoComplete="off"
              disabled={draft.busy}
              onChange={(changeEvent) => app.changeSunshineLogin({ password: changeEvent.target.value, error: "" })}
              onFocus={() => app.changeSunshineLogin({ row: 1 })}
            />
          </label>
        </div>

        {draft.error !== "" && <div className="loginerr">{draft.error}</div>}

        <div className="actions dialogactions">
          <button className={"btn primary" + (draft.row === 2 ? " f" : "") + (draft.busy ? " dis" : "")} onClick={() => app.submitSunshineLogin()}>
            {draft.busy ? <span className="spin" /> : null}
            {draft.busy ? t.sunshineLogin.checking : t.sunshineLogin.save}
          </button>
          <button className="btn" onClick={() => app.closeSunshineLogin()}>{t.common.cancel}</button>
        </div>
      </div>
    </div>
  );
}
