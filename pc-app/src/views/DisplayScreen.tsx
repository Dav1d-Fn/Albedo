import { UiText } from "../i18n/UiText";
import PcApp, { PcAppState } from "../PcApp";
import { DisplayRouteTarget } from "../model/CompanionTypes";
import { CommandBox } from "./CommandBox";
import { DisplayRouteCard } from "./DisplayRouteCard";
import { Icon } from "./Icon";

const INSTALLER = "curl -fsSL https://raw.githubusercontent.com/Dav1d-Fn/Albedo/main/pc-setup/install.sh | bash -s --";

/** The three routes a stream can take on the PC: overview, connector choice, modes and a switch test each. */
export function DisplayScreen({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current.display;
  const displayModes = state.displayModes;
  const setup = displayModes?.setup ?? { virtual: null, dummy: null, main: null };
  const connectedOutputs = (displayModes?.outputs ?? []).filter((output) => output.connected && output.name !== setup.virtual);
  const dummyChoices = connectedOutputs.map((output) => output.name);
  if (setup.dummy && !dummyChoices.includes(setup.dummy))
  {
    dummyChoices.push(setup.dummy);
  }
  const mainChoices = connectedOutputs.map((output) => output.name).filter((name) => name !== setup.dummy);
  if (setup.main && !mainChoices.includes(setup.main))
  {
    mainChoices.push(setup.main);
  }
  const primaryOutput = displayModes?.outputs.find((output) => output.primary)?.name ?? "";
  const virtualRoute = app.displayRoute("virtual");
  const automaticRoute = displayModes && displayModes.defaultTarget !== "none" ? app.displayRoute(displayModes.defaultTarget) : null;
  const modeRequest = state.modeRequest;

  return (
    <main className="main padded">
      <div className="head flat">
        <div>
          <h1 className="h1">{texts.title}</h1>
          <p className="lead">{texts.lead}</p>
        </div>
        <button type="button" className="btn" onClick={() => void app.reloadDisplayModes()}><Icon name="reload" />{UiText.current.common.reload}</button>
      </div>

      {state.displayProblem && <div className="banner bad flush"><Icon name="warning" />{texts.unavailable} {state.displayProblem}</div>}

      {displayModes && (
        <div className="tiles">
          {(["virtual", "dummy", "main"] as DisplayRouteTarget[]).map((target) =>
          {
            const route = app.displayRoute(target);
            return (
              <div key={target} className="tile">
                <div className="tk"><span className={"dot " + (route ? (route.connected ? "ok" : "warn") : "")} />{texts.routeNames[target]}</div>
                <div className="tv">{route ? route.output : texts.notSetUp}</div>
                <div className="ts">{route ? (route.connected ? texts.connected : texts.notConnected) : "—"}</div>
              </div>
            );
          })}
          <div className="tile auto">
            <div className="tk"><Icon name="check" size={14} />{texts.automatic}</div>
            <div className="tv">
              {automaticRoute ? texts.routeNames[automaticRoute.target] : texts.automaticNothing}
            </div>
            <div className="ts">{automaticRoute ? `${texts.automaticPicks} · ${automaticRoute.output}` : "—"}</div>
          </div>
        </div>
      )}
      {displayModes && <p className="help">{texts.automaticHint}</p>}

      {displayModes && (
        <div className="cols">
          <DisplayRouteCard app={app} state={state} target="virtual" route={virtualRoute} modesHint="">
            {!virtualRoute && (
              <div className="field">
                <span className="flabel">{texts.setupTitle}</span>
                <p className="help">{texts.setupLead}</p>
                <CommandBox app={app} command={INSTALLER + " --virtual-monitor"} />
                <p className="help">{texts.afterSetup}</p>
              </div>
            )}
            {virtualRoute && (
              <form className="field" onSubmit={(event) => { event.preventDefault(); void app.addVirtualMode(); }}>
                <label className="flabel" htmlFor="newmode">{texts.addModeLabel}</label>
                <div className="keyrow">
                  <input id="newmode" type="text" autoComplete="off" placeholder={texts.addModePlaceholder} value={state.newVirtualMode}
                    onChange={(event) => app.setNewVirtualMode(event.target.value)} />
                  <button type="submit" className="btn sun" disabled={state.newVirtualMode.trim() === "" || modeRequest?.state === "waiting"}>
                    <Icon name="plus" />{texts.addMode}
                  </button>
                </div>
                <p className="help">{texts.addModeHint}</p>
                {modeRequest && modeRequest.state !== "idle" && modeRequest.mode && (
                  <span className={"keycheck " + (modeRequest.state === "done" ? "ok" : modeRequest.state === "failed" || modeRequest.state === "cancelled" ? "bad" : "")}>
                    {texts.modeStates[modeRequest.state](modeRequest.mode)} {modeRequest.message ?? ""}
                  </span>
                )}
              </form>
            )}
            {virtualRoute && (
              <div className="field">
                <button type="button" className="link" onClick={() => app.toggleVirtualRemove()}>{texts.showRemove}</button>
                {state.showVirtualRemove && (
                  <>
                    <p className="help">{texts.removeLead}</p>
                    <CommandBox app={app} command={INSTALLER + " --remove-virtual-monitor"} />
                    <p className="help">{texts.afterSetup}</p>
                  </>
                )}
              </div>
            )}
          </DisplayRouteCard>

          <DisplayRouteCard app={app} state={state} target="dummy" route={app.displayRoute("dummy")} modesHint={texts.dummyModesHint}>
            <div className="field">
              <label className="flabel" htmlFor="dummyout">{texts.connector}</label>
              <select id="dummyout" value={setup.dummy ?? ""} disabled={state.busy}
                onChange={(event) => void app.setDisplayOutput("dummy", event.target.value || null)}>
                <option value="">{texts.noDummy}</option>
                {dummyChoices.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
              {dummyChoices.length === 0 && <p className="help">{texts.noConnectedOutputs}</p>}
            </div>
          </DisplayRouteCard>

          <DisplayRouteCard app={app} state={state} target="main" route={app.displayRoute("main")} modesHint={texts.mainModesHint}>
            <div className="field">
              <label className="flabel" htmlFor="mainout">{texts.connector}</label>
              <select id="mainout" value={setup.main ?? ""} disabled={state.busy}
                onChange={(event) => void app.setDisplayOutput("main", event.target.value || null)}>
                <option value="">{texts.primaryMonitor(primaryOutput)}</option>
                {mainChoices.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          </DisplayRouteCard>
        </div>
      )}
    </main>
  );
}
