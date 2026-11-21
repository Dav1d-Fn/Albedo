import { UiText } from "../i18n/UiText";
import PcApp, { PcAppState, Screen } from "../PcApp";
import { Icon } from "./Icon";
import appIcon from "../../src-tauri/icons/128x128.png";

/** Left column: name, the three screens, and the short status of companion, Sunshine and monitor. */
export function Sidebar({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current;
  const navItems: { screen: Screen; icon: string; label: string; count?: number }[] =
  [
    { screen: "library", icon: "library", label: texts.nav.library, count: state.library?.entries.length },
    { screen: "devices", icon: "gamepad", label: texts.nav.devices, count: state.clients?.length },
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
            <span className={"dot " + (state.displayModes ? "ok" : "")} />
            {state.displayModes
              ? `${state.displayModes.output} · ${state.displayModes.modes.length} ${texts.sidebar.modes}`
              : texts.sidebar.noModes}
          </div>
        )}
      </div>
    </nav>
  );
}
