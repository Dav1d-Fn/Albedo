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

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{app.hostDisplayName() + " · PC-Helfer"}</div>
        <div className="tname">Sunshine-Login</div>
        <div className="tsub">Benutzer und Passwort der Sunshine-Weboberfläche (https://{app.connectedHost()}:47990).</div>

        <div className="loginform">
          <label className={"loginfield" + (draft.row === 0 ? " f" : "")}>
            <span className="msub">Benutzername</span>
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
            <span className="msub">Passwort</span>
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
            {draft.busy ? "Prüfe mit Sunshine …" : "Speichern"}
          </button>
          <button className="btn" onClick={() => app.closeSunshineLogin()}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
