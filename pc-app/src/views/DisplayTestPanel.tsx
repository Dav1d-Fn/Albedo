import { UiText } from "../i18n/UiText";
import PcApp, { PcAppState, STANDARD_TEST_MODE } from "../PcApp";
import { DisplayRoute } from "../model/CompanionTypes";
import { Icon } from "./Icon";

/** Test of one route: mode choice, the warning before switching, the countdown and the result. */
export function DisplayTestPanel({ app, state, route }: { app: PcApp; state: PcAppState; route: DisplayRoute })
{
  const texts = UiText.current.display;
  const test = state.displayTest;
  const testOfThisRoute = test !== null && test.target === route.target;
  const anyTestRunning = test !== null && (test.state === "switching" || test.state === "showing" || test.state === "restoring");
  const pickedMode = state.displayTestModes[route.target] ?? STANDARD_TEST_MODE;
  const modeChoices = [...new Set(route.modes.map((mode) => `${mode.width}x${mode.height}@${mode.refreshRate}`))]
    .filter((modeText) => modeText !== STANDARD_TEST_MODE);
  const exclusive = route.target !== "main";

  return (
    <div className="testbox">
      <div className="row">
        <div className="field grow">
          <label className="flabel" htmlFor={"testmode-" + route.target}>{texts.testMode}</label>
          <select id={"testmode-" + route.target} value={pickedMode} disabled={anyTestRunning}
            onChange={(event) => app.chooseTestMode(route.target, event.target.value)}>
            <option value={STANDARD_TEST_MODE}>{texts.standardMode}</option>
            {modeChoices.map((modeText) => <option key={modeText} value={modeText}>{modeText.replace("x", "×").replace("@", " @ ")}</option>)}
          </select>
        </div>
        <button type="button" className="btn moon" disabled={anyTestRunning || !route.connected || state.displayTestConfirm !== null}
          onClick={() => app.askDisplayTest(route.target)}>{texts.test}</button>
      </div>

      {state.displayTestConfirm === route.target && (
        <div className="banner bad warnbox" role="alertdialog" aria-label={texts.testWarningTitle}>
          <Icon name="warning" />
          <div className="warntext">
            <b>{texts.testWarningTitle}</b>
            <span>{exclusive ? texts.testWarningExclusive(route.output) : texts.testWarningMain(route.output)} {texts.testWarningStream}</span>
            <div className="warnbtns">
              <button type="button" className="btn danger" onClick={() => void app.startDisplayTest()}>{texts.switchNow}</button>
              <button type="button" className="btn" onClick={() => app.cancelDisplayTest()}>{UiText.current.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {testOfThisRoute && test.state === "switching" && <div className="keycheck"><span className="dot pulse" /> {texts.testStates.switching}</div>}
      {testOfThisRoute && test.state === "showing" && <div className="keycheck"><span className="dot pulse" /> {texts.testStates.showing(test.output ?? route.output, test.secondsLeft ?? 0)}</div>}
      {testOfThisRoute && test.state === "restoring" && <div className="keycheck"><span className="dot pulse" /> {texts.testStates.restoring}</div>}
      {testOfThisRoute && (test.state === "done" || test.state === "unchanged" || test.state === "failed") && (
        <div className={"keycheck " + (test.state === "done" ? "ok" : test.state === "failed" ? "bad" : "")}>
          {test.message}{test.dryRun ? " " + texts.testDryRun : ""}
        </div>
      )}
    </div>
  );
}
