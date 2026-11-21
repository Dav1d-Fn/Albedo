import { UiText } from "../i18n/UiText";
import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";

/** "L1 [800p · 90] [800p · 60] … R1" – quick mode switch for the active device. */
export function ModeStrip(props: { app: LauncherApp })
{
  const app = props.app;
  const profile = app.profile();
  const currentIndex = app.currentModeIndex();

  return (
    <div className="mstrip">
      <button className="glyph pill sm" onClick={() => app.cycleMode(-1)} aria-label={UiText.current.common.previousProfile}>L1</button>
      <div className="mchips">
        {profile.modes.map((mode, modeIndex) => (
          <button key={modeIndex} className={"mchip" + (modeIndex === currentIndex ? " on" : "")} onClick={() => app.setMode(modeIndex)}>
            {ModeText.label(mode)}
          </button>
        ))}
      </div>
      <button className="glyph pill sm" onClick={() => app.cycleMode(1)} aria-label={UiText.current.common.nextProfile}>R1</button>
    </div>
  );
}
