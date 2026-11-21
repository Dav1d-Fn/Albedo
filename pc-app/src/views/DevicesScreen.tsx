import { UiText } from "../i18n/UiText";
import PcApp, { PcAppState } from "../PcApp";
import { Icon } from "./Icon";

/** Pair a device by PIN (Sunshine /api/pin through the companion) and the list of paired devices. */
export function DevicesScreen({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current.devices;
  const pairDisabled = state.busy || state.pin.length !== 4 || (state.pairings !== null && state.selectedPairingId === null);
  return (
    <main className="main padded">
      <div>
        <h1 className="h1">{texts.title}</h1>
        <p className="lead">{texts.lead}</p>
      </div>
      <div className="cols">
        <form className="card pair" aria-label={texts.pairTitle} onSubmit={(event) => { event.preventDefault(); void app.pair(); }}>
          <div className="glow" />
          <h2 className="h2 moon"><Icon name="link" size={20} />{texts.pairTitle}</h2>
          <ol className="steps">
            <li><span className="num">1</span>{texts.step1}</li>
            <li><span className="num">2</span>{texts.step2}</li>
          </ol>

          {state.pairings !== null && (
            <div className="field">
              <span className="flabel">{texts.waiting}</span>
              {state.pairings.length === 0 && <div className="waiting none">{texts.noneWaiting}</div>}
              {state.pairings.map((pairing) => (
                <button key={pairing.id} type="button" className={"waiting" + (pairing.id === state.selectedPairingId ? " on" : "")}
                  onClick={() => app.selectPairing(pairing.id)}>
                  <span className="dot pulse" />{pairing.name || "Moonlight"}<span className="addr">{pairing.address}</span>
                </button>
              ))}
            </div>
          )}

          <div className="field">
            <label className="flabel" htmlFor="pin">{texts.pin}</label>
            <div className="pin">
              {[0, 1, 2, 3].map((digitIndex) => (
                <span key={digitIndex} className={"pinbox" + (digitIndex === Math.min(state.pin.length, 3) ? " next" : "")}>
                  {state.pin[digitIndex] ?? ""}
                </span>
              ))}
              <input id="pin" type="text" inputMode="numeric" autoComplete="off" maxLength={4}
                value={state.pin} onChange={(event) => app.setPin(event.target.value)} />
            </div>
          </div>
          <div className="row">
            <div className="field grow">
              <label className="flabel" htmlFor="devname">{texts.deviceName}</label>
              <input id="devname" type="text" value={state.deviceName} onChange={(event) => app.setDeviceName(event.target.value)} />
            </div>
            <button className="btn moon" type="submit" disabled={pairDisabled}>{texts.pair}</button>
          </div>
        </form>

        <section className="card list" aria-label={texts.pairedTitle}>
          <div className="lhead"><h2 className="h2">{texts.pairedTitle}</h2></div>
          {state.clients?.length === 0 && <div className="empty">{texts.none}</div>}
          {state.clients?.map((client) => (
            <div key={client.uuid} className={"dev" + (state.confirmUnpairUuid === client.uuid ? " confirming" : "")}>
              <span className="dicon"><Icon name="gamepad" size={20} /></span>
              <div className="dtxt"><div className="dn">{client.name}</div><div className="ds">{client.uuid.slice(0, 8)}</div></div>
              {state.confirmUnpairUuid === client.uuid && <span className="confirm">{texts.reallyRemove}</span>}
              {state.confirmUnpairUuid === client.uuid && (
                <button className="btn sm" type="button" onClick={() => app.cancelUnpair()}>{UiText.current.common.no}</button>
              )}
              <button className={"btn sm" + (state.confirmUnpairUuid === client.uuid ? " danger" : "")} type="button"
                disabled={state.busy} onClick={() => void app.unpair(client)}>{UiText.current.common.remove}</button>
            </div>
          ))}
          <div className="empty">{texts.unpairHint}</div>
        </section>
      </div>
    </main>
  );
}
