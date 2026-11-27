import { ReactNode } from "react";
import { UiText } from "../i18n/UiText";
import PcApp, { PcAppState } from "../PcApp";
import { DisplayRoute, DisplayRouteTarget } from "../model/CompanionTypes";
import { DisplayTestPanel } from "./DisplayTestPanel";
import { ModeList } from "./ModeList";

/**
 * One route (virtual connector, dummy plug, main monitor): what it is, the route's own controls
 * (`children`), its modes and the test. Without `route` (not set up) only the controls show.
 */
export function DisplayRouteCard({ app, state, target, route, modesHint, children }:
  { app: PcApp; state: PcAppState; target: DisplayRouteTarget; route: DisplayRoute | null; modesHint: string; children?: ReactNode })
{
  const texts = UiText.current.display;
  return (
    <section className="card route" aria-label={texts.routeNames[target]}>
      <h2 className="h2 between">
        {texts.routeNames[target]}
        <span className={"pill" + (route ? " ok" : "")}>{route ? texts.setUp : texts.notSetUp}</span>
      </h2>
      <p className="help">{texts.routeLeads[target]}</p>
      {children}
      {route && (
        <>
          <div className="field">
            <span className="flabel">{texts.modes(route.modes.length)}</span>
            <ModeList modes={route.modes} emptyText={texts.noModes} />
            {modesHint !== "" && <p className="help">{modesHint}</p>}
          </div>
          <DisplayTestPanel app={app} state={state} route={route} />
        </>
      )}
    </section>
  );
}
