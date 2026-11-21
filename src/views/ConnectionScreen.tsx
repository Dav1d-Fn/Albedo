import LauncherApp from "../LauncherApp";
import { AfterStreamAction, BackdropKind } from "../model/Types";

const backdropOptions: { value: BackdropKind; label: string }[] =
[
  { value: "hero", label: "Titelbild" },
  { value: "screenshots", label: "Screenshots" },
  { value: "cover", label: "Cover" },
  { value: "none", label: "Kein Bild" },
];

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
  const addresses = app.hostAddresses();
  const addressesRow = LauncherApp.addressesRowIndex;
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
        <div className="eactive">{settings.host ? "Aktuell: " + app.hostDisplayName() + " · " + app.connectedHost() : "Noch kein PC gewählt"}</div>
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
                {state.pairState === "pairing" && "Sunshine-Weboberfläche öffnen (https://" + app.connectedHost() + ":47990) → PIN → diese Zahl eingeben."}
                {state.pairState === "paired" && "Moonlight ist gekoppelt, die Spieleliste wird geladen."}
                {state.pairState === "error" && state.pairMessage}
              </span>
            </div>
            {state.pairState === "pairing" && <span className="pin">{state.pairPin}</span>}
            {state.pairState === "pairing" && <span className="spin" />}
          </div>

          <div className="rhead clabel">Weitere Adressen</div>
          <div className={"row addrrow" + rowFocus(addressesRow)}>
            <button className="rlabel" onClick={() => app.focusExtraAddress()}>Unterwegs (Tailscale)</button>
            <input
              id="extra-address"
              className="hostinput"
              placeholder="z. B. 100.124.221.14"
              value={state.extraAddressDraft}
              spellCheck={false}
              onChange={(changeEvent) => app.setState({ extraAddressDraft: changeEvent.target.value })}
              onFocus={() => app.setState({ connectionZone: "rows", connectionRow: addressesRow })}
            />
          </div>
          <div className="addrlist">
            {addresses.map((address, addressIndex) => (
              <span key={address} className={"addr" + (address === app.connectedHost() ? " on" : "")}>
                <span className="addrnum">{addressIndex + 1}</span>
                {address}
                {address === app.connectedHost() && state.activeHost !== "" && <span className="badge">ERREICHBAR</span>}
              </span>
            ))}
            <span className="dnote">Die erste erreichbare Adresse wird genommen, für Moonlight, Sunshine und den PC-Helfer.</span>
          </div>

          <div className="rhead clabel">Moonlight</div>
          <div className={"row" + rowFocus(LauncherApp.connectionRows.indexOf("moonlight"))}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.connectionRows.indexOf("moonlight"))}>Moonlight-Version</button>
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
          <div className={"row" + rowFocus(LauncherApp.connectionRows.indexOf("afterStream"))}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.connectionRows.indexOf("afterStream"))}>Spiel auf dem PC</button>
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

          <div className="rhead clabel">Hintergrund</div>
          <div className={"row" + rowFocus(LauncherApp.backdropRowIndex)}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.backdropRowIndex)}>Bild hinter dem Menü</button>
            <div className="ctrl">
              <div className="seg">
                {backdropOptions.map((option) => (
                  <button
                    key={option.value}
                    className={"segb" + (settings.backdropKind === option.value ? " on" : "")}
                    onClick={() => app.setBackdropKind(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rhead clabel">Bilder aus dem Netz</div>
          <div className={"row addrrow" + rowFocus(LauncherApp.steamGridDbRowIndex)}>
            <button className="rlabel" onClick={() => app.focusSteamGridDbKey()}>SteamGridDB-Schlüssel</button>
            <input
              id="steamgriddb-key"
              className="hostinput"
              placeholder={settings.steamGridDbKey === "" ? "optional, für mehr Bilder" : "neuen Schlüssel eingeben"}
              value={state.steamGridDbKeyDraft}
              spellCheck={false}
              autoComplete="off"
              onChange={(changeEvent) => app.setState({ steamGridDbKeyDraft: changeEvent.target.value })}
              onFocus={() => app.setState({ connectionZone: "rows", connectionRow: LauncherApp.steamGridDbRowIndex })}
            />
          </div>
          <div className="dnote" style={{ paddingLeft: 20 }}>
            {settings.steamGridDbKey === ""
              ? "Ohne Schlüssel sucht „Bild setzen“ nur im Steam-Shop. Schlüssel: steamgriddb.com → Profil → Einstellungen → API."
              : "Gespeichert (…" + settings.steamGridDbKey.slice(-4) + "). X löscht ihn."}
          </div>
        </div>
      </div>
    </div>
  );
}
