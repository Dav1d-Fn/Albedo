import type LauncherApp from "../LauncherApp";
import { GameArt } from "../model/GameArt";
import { ModeText } from "../model/ModeText";
import { CheckIcon } from "./Icons";

/** Pulsing rings and step list shown while Moonlight is being started. */
export function ConnectScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const gameName = app.selectedGame() ?? "";
  const art = new GameArt(gameName);
  const progress = state.connectSteps.length ? Math.round(state.connectStep / state.connectSteps.length * 100) : 0;

  return (
    <div className="screen">
      <div className="bd on blur" style={{ background: art.backdrop }} />
      <div className="connect">
        <div className="rings">
          <span className="ring" />
          <span className="ring r2" />
          <span className="ring r3" />
          <div className="ccover" style={{ background: art.cover }}>
            <span className="ctitle" style={{ color: art.ink }}>{gameName}</span>
          </div>
        </div>
        <div className="ctext">
          <div className="eyebrow">{"Startet als " + ModeText.deviceNames[state.device] + " · " + ModeText.spec(app.activeMode())}</div>
          <h2 className="ctitle2">{gameName}</h2>
        </div>
        <ol className="steps">
          {state.connectSteps.map((stepText, stepIndex) =>
          {
            const done = stepIndex < state.connectStep;
            const active = stepIndex === state.connectStep;
            return (
              <li key={stepText} className={"step" + (done ? " done" : active ? " active" : "")}>
                <span className="sicon">
                  {done && <CheckIcon />}
                  {active && <span className="spin" />}
                  {!done && !active && <span className="pdot" />}
                </span>
                {stepText}
              </li>
            );
          })}
        </ol>
        <div className="pbar"><span style={{ width: progress + "%" }} /></div>
      </div>
    </div>
  );
}
