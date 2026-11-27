import { UiText } from "../i18n/UiText";
import PcApp, { PcAppState, Screen } from "../PcApp";
import { Icon } from "./Icon";
import { UpdateStatus } from "../model/CompanionTypes";
import appIcon from "../../src-tauri/icons/128x128.png";

function updateText(update: UpdateStatus): string
{
  const texts = UiText.current;
  if (update.state === "downloading" && update.progress !== null && update.progress.total)
  {
    return texts.update.downloading(Math.round((update.progress.downloaded / update.progress.total) * 100));
  }
  if (update.state === "failed")
  {
    return texts.update.failed(update.message);
  }
  if (update.state === "available" || update.state === "downloading")
  {
    return texts.update.available(update.available?.version ?? "");
  }
  return texts.update.states[update.state];
}

/** Left column: name, the four screens, and the short status of companion, Sunshine and monitor. */
export function Sidebar({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current;
  const navItems: { screen: Screen; icon: string; label: string; count?: number }[] =
  [
    { screen: "library", icon: "library", label: texts.nav.library, count: state.library?.entries.length },
    { screen: "devices", icon: "gamepad", label: texts.nav.devices, count: state.clients?.length },
    { screen: "display", icon: "monitor", label: texts.nav.display },
    { screen: "status", icon: "pulse", label: texts.nav.status },
  ];
  const sunshineOk = state.library !== null && state.library.sunshineProblem === null;
  return (
    <nav className="side" aria-label={texts.nav.library}>
      <div className="brand">
        <img src={appIcon} alt="" />
        <div><div className="bname">Albedo</div><div className="bsub">{texts.appSubtitle}</div></div>
      </div>
      {navItems.map((item) => (
        <button key={item.screen} type="button" className={"nav" + (state.screen === item.screen ? " on" : "")}
          onClick={() => app.showScreen(item.screen)}>
          <Icon name={item.icon} />{item.label}
          {item.count !== undefined && <span className="count">{item.count}</span>}
        </button>
      ))}
      <div className="sfoot">
        <div className="srow">
          <span className={"dot " + (state.companionDown ? "bad" : "ok")} />
          {state.companionDown ? texts.sidebar.companionDown : `${texts.sidebar.companionRunning} · ${state.health?.host ?? "…"}`}
        </div>
        {!state.companionDown && (
          <div className="srow">
            <span className={"dot " + (sunshineOk ? "ok" : "warn")} />
            {sunshineOk ? texts.sidebar.sunshineConnected : texts.sidebar.sunshineProblem}
          </div>
        )}
        {!state.companionDown && (
          <div className="srow">
            <span className={"dot " + (state.displayModes?.output ? "ok" : "")} />
            {state.displayModes?.output
              ? `${state.displayModes.output} · ${state.displayModes.modes.length} ${texts.sidebar.modes}`
              : texts.sidebar.noModes}
          </div>
        )}
        {state.update !== null && state.update.state !== "idle" && state.update.state !== "unsupported" && (
          <div className="srow">
            <span className={"dot " + (state.update.state === "failed" ? "bad" : "pulse")} />
            <span className="supdate">{updateText(state.update)}</span>
            {state.update.available !== null && (state.update.state === "available" || state.update.state === "failed") && (
              <button type="button" className="btn moon sbtn" onClick={() => void app.installUpdate()}>{texts.update.install}</button>
            )}
          </div>
        )}
        {state.update !== null && (
          <div className="srow sversion">{texts.update.version(state.update.version)}</div>
        )}
      </div>
    </nav>
  );
}
