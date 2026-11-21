import { UiText } from "../i18n/UiText";
import type LauncherApp from "../LauncherApp";
import { PlayIcon } from "./Icons";

/** Another game runs on the PC: quit it and start the selected one, or cancel. Replaces Moonlight's own question. */
export function SwitchGameDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const switchGame = app.state.switchGame;
  const t = UiText.current;
  if (switchGame === null)
  {
    return null;
  }

  return (
    <div className="dialog">
      <div className="dcard">
        <div className="teyebrow">{app.hostDisplayName()}</div>
        <div className="tname">{t.switchGameDialog.stillRunning(app.state.runningApp?.appName ?? null)}</div>
        <div className="tsub">{t.switchGameDialog.question(switchGame.nextGame)}</div>

        <div className="actions dialogactions">
          <button className={"btn primary" + (switchGame.choiceIndex === 0 ? " f" : "")} onClick={() => app.chooseSwitchGame(0)}>
            <PlayIcon />
            {t.switchGameDialog.quitAndStart}
          </button>
          <button className={"btn" + (switchGame.choiceIndex === 1 ? " f" : "")} onClick={() => app.chooseSwitchGame(1)}>
            {t.switchGameDialog.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
