import type LauncherApp from "../LauncherApp";

/** Shown at start when GitHub has a newer release: A installs it (the launcher restarts), B later. */
export function UpdateDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const update = app.state.update;
  if (update === null)
  {
    return null;
  }

  let sub = "Version " + update.currentVersion + " ist installiert.";
  if (update.installing)
  {
    sub = "Wird geladen und installiert … Der Launcher startet danach neu.";
  }
  else if (update.error !== "")
  {
    sub = "Fehlgeschlagen: " + update.error;
  }

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">Update verfügbar</div>
        <div className="tname">{"Version " + update.version}</div>
        <div className="tsub">{sub}</div>
        {update.notes !== "" && !update.installing && <div className="tsub">{update.notes}</div>}

        {!update.installing && (
          <div className="actions dialogactions">
            <button className="btn primary f" onClick={() => app.installUpdate()}>
              <span className="glyph sm">A</span>
              {update.error === "" ? "Installieren" : "Nochmal"}
            </button>
            <button className="btn" onClick={() => app.closeUpdate()}>
              <span className="glyph sm">B</span>
              Später
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
