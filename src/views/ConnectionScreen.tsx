import LauncherApp from "../LauncherApp";
import { AfterStreamAction } from "../model/Types";

const afterStreamOptions: { value: AfterStreamAction; label: string }[] =
[
  { value: "ask", label: "Fragen" },
  { value: "keep", label: "Pausieren" },
  { value: "quit", label: "Beenden" },
];

/** Choose the gaming PC (found via mDNS or typed in), pair with a PIN, pick Flatpak or system Moonlight. */
export function ConnectionScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const settings = app.settings;
  const hostsZone = state.connectionZone === "hosts";
  const usesFlatpak = settings.moonlightCommand[0] === "flatpak";
  const manualIndex = app.manualHostIndex();
  const rowFocus = (rowIndex: number) => (!hostsZone && state.connectionRow === rowIndex ? " f" : "");

  const pairTitle =
  {
    idle: "Mit diesem PC koppeln",
    pairing: "PIN in Sunshine eingeben",
    paired: "Gekoppelt",
    error: "Koppeln fehlgeschlagen",
  }[state.pairState];

  return (
    <div className="screen">
      <div className="etop">
        <div className="etitle">Verbindung</div>
        <div className="pauto">
          <span className={"dot" + (state.searchingHosts ? " wake" : " on")} />
          <span>{state.searchingHosts ? "Suche Sunshine-PCs im Netzwerk …" : state.discoveredHosts.length + " PC(s) im Netzwerk gefunden"}</span>
        </div>
        <div className="eactive">{settings.host ? "Aktuell: " + app.hostDisplayName() + " · " + settings.host : "Noch kein PC gewählt"}</div>
      </div>

      <div className="ebody">
        <div className="mlist">
          <div className="clabel" style={{ paddingLeft: 4 }}>Gefundene PCs</div>
          {state.discoveredHosts.map((host, hostIndex) =>
          {
            const focused = hostsZone && state.connectionHostIndex === hostIndex;
            const isCurrent = host.address === settings.host;
            return (
              <button
                key={host.name + host.address}
                className={"mitem" + (isCurrent ? " sel" : "") + (focused ? " f" : "")}
                onClick={() => app.chooseHost(host.address, host.name)}
              >
                <span className="mtop">
                  <span className="mname">{host.name}</span>
                  {isCurrent && <span className="badge">AKTIV</span>}
                </span>
                <span className="msub">{host.address}</span>
              </button>
            );
          })}
          <div className={"mitem manual" + (hostsZone && state.connectionHostIndex === manualIndex ? " f" : "")} onClick={() => app.focusManualHost()}>
            <span className="msub">IP oder Name von Hand</span>
            <input
              id="manual-host"
              className="hostinput"
              placeholder="z. B. 192.168.178.36"
              value={state.manualHostDraft}
              spellCheck={false}
              onChange={(changeEvent) => app.setState({ manualHostDraft: changeEvent.target.value })}
              onFocus={() => app.setState({ connectionZone: "hosts", connectionHostIndex: manualIndex })}
            />
          </div>
          <div className="mbtns">
            <button className={"madd" + (state.searchingHosts ? " dis" : "")} onClick={() => app.searchHosts()}>
              Neu suchen
              <span className="glyph sm">Y</span>
            </button>
          </div>
        </div>

        <div className="rows">
          <div className="rhead clabel">Koppeln</div>
          <div className={"pairbox row" + rowFocus(0)} onClick={() => app.activateConnectionRow(0)}>
            <div className="pairtext">
              <span className="pairtitle">{pairTitle}</span>
              <span className="pairsub">
                {state.pairState === "idle" && (settings.host ? "A erzeugt eine PIN. Die gibst du in Sunshine unter „PIN“ ein." : "Erst links einen PC wählen.")}
                {state.pairState === "pairing" && "Sunshine-Weboberfläche öffnen (https://" + settings.host + ":47990) → PIN → diese Zahl eingeben."}
                {state.pairState === "paired" && "Moonlight ist gekoppelt, die Spieleliste wird geladen."}
                {state.pairState === "error" && state.pairMessage}
              </span>
            </div>
            {state.pairState === "pairing" && <span className="pin">{state.pairPin}</span>}
            {state.pairState === "pairing" && <span className="spin" />}
          </div>

          <div className="rhead clabel">Moonlight</div>
          <div className={"row" + rowFocus(1)}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(1)}>Moonlight-Version</button>
            <div className="ctrl">
              <div className="seg">
                <button className={"segb" + (usesFlatpak ? " on" : "")} onClick={() => usesFlatpak || app.toggleMoonlightCommand()}>Flatpak</button>
                <button className={"segb" + (usesFlatpak ? "" : " on")} onClick={() => usesFlatpak && app.toggleMoonlightCommand()}>System</button>
              </div>
            </div>
          </div>
          <div className="dnote" style={{ paddingLeft: 20 }}>
            <code>{settings.moonlightCommand.join(" ")}</code>
          </div>

          <div className="rhead clabel">Nach dem Stream</div>
          <div className={"row" + rowFocus(2)}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(2)}>Spiel auf dem PC</button>
            <div className="ctrl">
              <div className="seg">
                {afterStreamOptions.map((option) => (
                  <button
                    key={option.value}
                    className={"segb" + (settings.afterStream === option.value ? " on" : "")}
                    onClick={() => app.setAfterStream(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
