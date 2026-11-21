import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";
import { AfterStreamAction, BackdropKind } from "../model/Types";

const backdropOptions: BackdropKind[] = ["hero", "screenshots", "cover", "none"];

const afterStreamOptions: AfterStreamAction[] = ["ask", "keep", "quit"];

/** Choose the gaming PC (found via mDNS or typed in), pair with a PIN, pick Flatpak or system Moonlight, plus the global settings. */
export function ConnectionScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const settings = app.settings;
  const t = UiText.current;
  const hostsZone = state.connectionZone === "hosts";
  const usesFlatpak = settings.moonlightCommand[0] === "flatpak";
  const manualIndex = app.manualHostIndex();
  const addresses = app.hostAddresses();
  const addressesRow = LauncherApp.addressesRowIndex;
  const rowFocus = (rowIndex: number) => (!hostsZone && state.connectionRow === rowIndex ? " f" : "");
  // The rows are taller than the screen: the focused one scrolls into view, like in the editor.
  const rowScroll = (rowIndex: number) => (!hostsZone && state.connectionRow === rowIndex ? (rowElement: HTMLDivElement | null) => rowElement?.scrollIntoView({ block: "nearest" }) : undefined);

  const pairTitle =
  {
    idle: t.connection.pairIdle,
    pairing: t.connection.pairPairing,
    paired: t.connection.pairPaired,
    error: t.connection.pairError,
  }[state.pairState];

  return (
    <div className="screen">
      <div className="etop">
        <div className="etitle">{t.connection.title}</div>
        <div className="pauto">
          <span className={"dot" + (state.searchingHosts ? " wake" : " on")} />
          <span>{state.searchingHosts ? t.connection.searching : t.connection.found(state.discoveredHosts.length)}</span>
        </div>
        <div className="eactive">{settings.host ? t.connection.current(app.hostDisplayName(), app.connectedHost()) : t.connection.noPcChosen}</div>
      </div>

      <div className="ebody">
        <div className="mlist">
          <div className="clabel" style={{ paddingLeft: 4 }}>{t.connection.foundPcs}</div>
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
                  {isCurrent && <span className="badge">{t.connection.active}</span>}
                </span>
                <span className="msub">{host.address}</span>
              </button>
            );
          })}
          <div className={"mitem manual" + (hostsZone && state.connectionHostIndex === manualIndex ? " f" : "")} onClick={() => app.focusManualHost()}>
            <span className="msub">{t.connection.manualHost}</span>
            <input
              id="manual-host"
              className="hostinput"
              placeholder={t.connection.manualHostPlaceholder}
              value={state.manualHostDraft}
              spellCheck={false}
              onChange={(changeEvent) => app.setState({ manualHostDraft: changeEvent.target.value })}
              onFocus={() => app.setState({ connectionZone: "hosts", connectionHostIndex: manualIndex })}
            />
          </div>
          <div className="mbtns">
            <button className={"madd" + (state.searchingHosts ? " dis" : "")} onClick={() => app.searchHosts()}>
              {t.connection.searchAgain}
              <span className="glyph sm">Y</span>
            </button>
          </div>
        </div>

        <div className="rows">
          <div className="rhead clabel">{t.connection.pair}</div>
          <div className={"pairbox row" + rowFocus(0)} ref={rowScroll(0)} onClick={() => app.activateConnectionRow(0)}>
            <div className="pairtext">
              <span className="pairtitle">{pairTitle}</span>
              <span className="pairsub">
                {state.pairState === "idle" && (settings.host ? t.connection.pairIdleHint : t.connection.pairChooseFirst)}
                {state.pairState === "pairing" && t.connection.pairPairingHint(app.connectedHost())}
                {state.pairState === "paired" && t.connection.pairPairedHint}
                {state.pairState === "error" && state.pairMessage}
              </span>
            </div>
            {state.pairState === "pairing" && <span className="pin">{state.pairPin}</span>}
            {state.pairState === "pairing" && <span className="spin" />}
          </div>

          <div className="rhead clabel">{t.connection.moreAddresses}</div>
          <div className={"row addrrow" + rowFocus(addressesRow)} ref={rowScroll(addressesRow)}>
            <button className="rlabel" onClick={() => app.focusExtraAddress()}>{t.connection.awayFromHome}</button>
            <input
              id="extra-address"
              className="hostinput"
              placeholder={t.connection.extraAddressPlaceholder}
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
                {address === app.connectedHost() && state.activeHost !== "" && <span className="badge">{t.connection.reachable}</span>}
              </span>
            ))}
            <span className="dnote">{t.connection.firstReachable}</span>
          </div>

          <div className="rhead clabel">Moonlight</div>
          <div className={"row" + rowFocus(LauncherApp.connectionRows.indexOf("moonlight"))} ref={rowScroll(LauncherApp.connectionRows.indexOf("moonlight"))}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.connectionRows.indexOf("moonlight"))}>{t.connection.moonlightVersion}</button>
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

          <div className="rhead clabel">{t.connection.afterTheStream}</div>
          <div className={"row" + rowFocus(LauncherApp.connectionRows.indexOf("afterStream"))} ref={rowScroll(LauncherApp.connectionRows.indexOf("afterStream"))}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.connectionRows.indexOf("afterStream"))}>{t.connection.gameOnPc}</button>
            <div className="ctrl">
              <div className="seg">
                {afterStreamOptions.map((option) => (
                  <button
                    key={option}
                    className={"segb" + (settings.afterStream === option ? " on" : "")}
                    onClick={() => app.setAfterStream(option)}
                  >
                    {t.afterStreamNames[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rhead clabel">{t.connection.background}</div>
          <div className={"row" + rowFocus(LauncherApp.backdropRowIndex)} ref={rowScroll(LauncherApp.backdropRowIndex)}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.backdropRowIndex)}>{t.connection.pictureBehindMenu}</button>
            <div className="ctrl">
              <div className="seg">
                {backdropOptions.map((option) => (
                  <button
                    key={option}
                    className={"segb" + (settings.backdropKind === option ? " on" : "")}
                    onClick={() => app.setBackdropKind(option)}
                  >
                    {t.backdropNames[option]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rhead clabel">{t.connection.picturesFromWeb}</div>
          <div className={"row addrrow" + rowFocus(LauncherApp.steamGridDbRowIndex)} ref={rowScroll(LauncherApp.steamGridDbRowIndex)}>
            <button className="rlabel" onClick={() => app.focusSteamGridDbKey()}>{t.connection.steamGridDbKey}</button>
            <input
              id="steamgriddb-key"
              className="hostinput"
              placeholder={settings.steamGridDbKey === "" ? t.connection.keyOptional : t.connection.keyNew}
              value={state.steamGridDbKeyDraft}
              spellCheck={false}
              autoComplete="off"
              onChange={(changeEvent) => app.setState({ steamGridDbKeyDraft: changeEvent.target.value })}
              onFocus={() => app.setState({ connectionZone: "rows", connectionRow: LauncherApp.steamGridDbRowIndex })}
            />
          </div>
          <div className="dnote" style={{ paddingLeft: 20 }}>
            {settings.steamGridDbKey === ""
              ? t.connection.keyMissingHint
              : t.connection.keySavedHint(settings.steamGridDbKey.slice(-4))}
          </div>

          <div className="rhead clabel">{t.connection.language}</div>
          <div className={"row" + rowFocus(LauncherApp.languageRowIndex)} ref={rowScroll(LauncherApp.languageRowIndex)}>
            <button className="rlabel" onClick={() => app.activateConnectionRow(LauncherApp.languageRowIndex)}>{t.connection.languageRow}</button>
            <div className="ctrl">
              <div className="seg">
                {UiText.languages.map((language) => (
                  <button
                    key={language}
                    className={"segb" + (UiText.language === language ? " on" : "")}
                    onClick={() => app.setLanguage(language)}
                  >
                    {UiText.languageNames[language]}
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
