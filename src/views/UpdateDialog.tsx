import { UiText } from "../i18n/UiText";
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

  const t = UiText.current;
  let sub = t.update.installed(update.currentVersion);
  if (update.installing)
  {
    sub = t.update.installing;
  }
  else if (update.error !== "")
  {
    sub = t.update.failed(update.error);
  }

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{t.update.available}</div>
        <div className="tname">{t.update.version(update.version)}</div>
        <div className="tsub">{sub}</div>
        {update.notes !== "" && !update.installing && <div className="tsub">{update.notes}</div>}

        {!update.installing && (
          <div className="actions dialogactions">
            <button className="btn primary f" onClick={() => app.installUpdate()}>
              <span className="glyph sm">A</span>
              {update.error === "" ? t.update.install : t.update.retry}
            </button>
            <button className="btn" onClick={() => app.closeUpdate()}>
              <span className="glyph sm">B</span>
              {t.update.later}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
