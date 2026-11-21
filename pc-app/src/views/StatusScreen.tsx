import { UiText, UiLanguage } from "../i18n/UiText";
import PcApp, { PcAppState } from "../PcApp";
import { Icon } from "./Icon";

/** Companion, Sunshine and monitor at a glance, the Sunshine login, the monitor's modes and the app settings. */
export function StatusScreen({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current.status;
  const sunshineProblem = state.library?.sunshineProblem ?? null;
  const modes = [...(state.displayModes?.modes ?? [])].sort((first, second) =>
    first.width * first.height - second.width * second.height || first.refreshRate - second.refreshRate);
  const resolutions = [...new Set(modes.map((mode) => `${mode.width}×${mode.height}`))];
  const largestMode = modes.reduce<typeof modes[number] | null>((largest, mode) =>
    !largest || mode.width * mode.height * mode.refreshRate > largest.width * largest.height * largest.refreshRate ? mode : largest, null);
  const languageChoices: { value: UiLanguage | ""; label: string }[] =
    [{ value: "", label: texts.system }, { value: "de", label: "Deutsch" }, { value: "en", label: "English" }];

  return (
    <main className="main padded">
      <h1 className="h1">{texts.title}</h1>
      <div className="tiles">
        <div className={"tile" + (state.companionDown ? " bad" : "")}>
          <div className="tk"><span className={"dot " + (state.companionDown ? "bad" : "ok")} />{texts.companion}</div>
          <div className="tv">{state.companionDown ? texts.notRunning : texts.running}</div>
          <div className="ts">{state.health ? `v${state.health.version} · ${state.health.host} · Port 47995` : texts.notRunningHint}</div>
        </div>
        <div className={"tile" + (sunshineProblem ? " warn" : "")}>
          <div className="tk"><span className={"dot " + (sunshineProblem ? "warn" : "ok")} />{texts.sunshine}</div>
          <div className="tv">{sunshineProblem ? texts.problem : texts.connected}</div>
          <div className="ts">{sunshineProblem ?? ""}</div>
        </div>
        <div className="tile">
          <div className="tk"><span className={"dot " + (state.displayModes ? "ok" : "")} />{texts.monitor}</div>
          <div className="tv">{state.displayModes?.output ?? texts.unknown}</div>
          <div className="ts">
            {texts.modesCount(modes.length)}
            {largestMode && ` · ${texts.upTo(`${largestMode.width}×${largestMode.height} @ ${largestMode.refreshRate} Hz`)}`}
          </div>
        </div>
      </div>

      <div className="cols">
        <form className="card grow" aria-label={texts.loginTitle} onSubmit={(event) => { event.preventDefault(); void app.saveSunshineLogin(); }}>
          <h2 className="h2 sun"><Icon name="sun" size={20} />{texts.loginTitle}</h2>
          {sunshineProblem
            ? <div className="banner"><Icon name="warning" />{sunshineProblem}. {texts.loginLead}</div>
            : <p className="help">{texts.loginLead}</p>}
          <div className="field"><label className="flabel" htmlFor="user">{texts.user}</label>
            <input id="user" type="text" autoComplete="username" value={state.loginUser} onChange={(event) => app.setLoginUser(event.target.value)} /></div>
          <div className="field"><label className="flabel" htmlFor="password">{texts.password}</label>
            <input id="password" type="password" autoComplete="current-password" value={state.loginPassword} onChange={(event) => app.setLoginPassword(event.target.value)} /></div>
          <div className="help">{texts.loginHelp}</div>
          <button className="btn sun start" type="submit" disabled={state.busy || state.loginUser.trim() === "" || state.loginPassword === ""}>{texts.saveLogin}</button>
        </form>

        <div className="stack grow">
          {state.displayModes && (
            <section className="card" aria-label={texts.modesTitle(state.displayModes.output)}>
              <h2 className="h2 between">{texts.modesTitle(state.displayModes.output)}<span className="ts">{texts.modesLead}</span></h2>
              <div className="modes">
                {resolutions.map((resolution) => (
                  <div key={resolution} className="mrow">
                    <span className="res">{resolution}</span>
                    <div className="hz">
                      {modes.filter((mode) => `${mode.width}×${mode.height}` === resolution)
                        .map((mode) => <span key={mode.refreshRate}>{mode.refreshRate}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="card" aria-label={texts.settings}>
            <h2 className="h2">{texts.settings}</h2>
            <div className="field">
              <span className="flabel">{texts.language}</span>
              <div className="seg" role="group" aria-label={texts.language}>
                {languageChoices.map((choice) => (
                  <button key={choice.value} type="button" className={state.settings.language === choice.value ? "on" : ""}
                    onClick={() => app.changeSettings({ language: choice.value })}>{choice.label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label className="flabel" htmlFor="gridkey">{texts.gridDbKey}</label>
              <input id="gridkey" type="password" placeholder={texts.gridDbPlaceholder} value={state.settings.steamGridDbKey}
                onChange={(event) => app.changeSettings({ steamGridDbKey: event.target.value.trim() })} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
