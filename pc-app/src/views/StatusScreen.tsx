import { UiText, UiLanguage } from "../i18n/UiText";
import PcApp, { PcAppState } from "../PcApp";
import { Icon } from "./Icon";

/** Companion, Sunshine and the stream monitor at a glance (details in the display screen), the Sunshine login and the app settings. */
export function StatusScreen({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current.status;
  const sunshineProblem = state.library?.sunshineProblem ?? null;
  const modes = state.displayModes?.modes ?? [];
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
          <div className="ts">{state.health ? `v${state.update?.version ?? state.health.version} · ${state.health.host} · Port 47995` : texts.notRunningHint}</div>
        </div>
        <div className={"tile" + (sunshineProblem ? " warn" : "")}>
          <div className="tk"><span className={"dot " + (sunshineProblem ? "warn" : "ok")} />{texts.sunshine}</div>
          <div className="tv">{sunshineProblem ? texts.problem : texts.connected}</div>
          <div className="ts">{sunshineProblem ?? ""}</div>
        </div>
        <button type="button" className="tile" onClick={() => app.showScreen("display")}>
          <div className="tk"><span className={"dot " + (state.displayModes?.output ? "ok" : "")} />{texts.monitor}</div>
          <div className="tv">{state.displayModes?.output || texts.unknown}</div>
          <div className="ts">
            {texts.modesCount(modes.length)}
            {largestMode && ` · ${texts.upTo(`${largestMode.width}×${largestMode.height} @ ${largestMode.refreshRate} Hz`)}`}
          </div>
        </button>
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
          <section className="card" aria-label={texts.settings}>
            <h2 className="h2">{texts.settings}</h2>
            <div className="field">
              <span className="flabel">{texts.language}</span>
              <div className="seg" role="group" aria-label={texts.language}>
                {languageChoices.map((choice) => (
                  <button key={choice.value} type="button" className={state.language === choice.value ? "on" : ""}
                    onClick={() => app.changeLanguage(choice.value)}>{choice.label}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <div className="flabelrow">
                <label className="flabel" htmlFor="gridkey">{texts.gridDbKey}</label>
                <button type="button" className="link" onClick={() => app.openSteamGridDbKeyPage()}>{texts.gridDbGetKey} ↗</button>
              </div>
              <div className="keyrow">
                <input id="gridkey" type="password" autoComplete="off" disabled={state.steamGridDbKeyHint === null}
                  placeholder={state.steamGridDbKeyHint ? texts.gridDbNewKey : texts.gridDbPlaceholder} value={state.steamGridDbKeyDraft}
                  onChange={(event) => app.changeSteamGridDbKeyDraft(event.target.value.trim())} />
                {state.steamGridDbKeyHint && <button type="button" className="btn" onClick={() => void app.removeSteamGridDbKey()}>{texts.gridDbRemove}</button>}
              </div>
              {state.steamGridDbKeyHint === null && <span className="keycheck bad">{texts.gridDbNeedsCompanion}</span>}
              {state.steamGridDbKeyHint && <span className="keycheck">{texts.gridDbSaved(state.steamGridDbKeyHint)}</span>}
              {state.steamGridDbKeyCheck === "checking" && <span className="keycheck">{texts.gridDbChecking}</span>}
              {state.steamGridDbKeyCheck === "ok" && <span className="keycheck ok">{texts.gridDbWorks}</span>}
              {state.steamGridDbKeyCheck !== "" && state.steamGridDbKeyCheck !== "checking" && state.steamGridDbKeyCheck !== "ok" && (
                <span className="keycheck bad">{state.steamGridDbKeyCheck}</span>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
