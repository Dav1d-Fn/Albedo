import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";
import { DeviceId } from "../model/Types";
import { CheckIcon, PlayIcon, SwapIcon } from "./Icons";
import { GameBackdrop } from "./GameBackdrop";
import { ModeStrip } from "./ModeStrip";

/** Game detail: stream values of the active mode, mode strip, "remember", play. */
export function DetailScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const gameName = app.selectedGame() ?? "";
  const art = app.artFor(gameName);
  const backdropArt = app.backdropArtFor(gameName);
  const remembered = app.isRemembered(gameName);
  const devices: DeviceId[] = ["handheld", "tv"];
  const afterStreamOverride = app.afterStreamOverride(gameName);
  const afterStreamLabel = afterStreamOverride === undefined
    ? "Danach: Standard (" + ModeText.afterStreamNames[app.settings.afterStream] + ")"
    : "Danach: " + ModeText.afterStreamNames[afterStreamOverride];

  return (
    <div className="screen">
      <div className={"bd on" + backdropArt.backdropClass} style={{ background: backdropArt.backdrop }} />
      <GameBackdrop app={app} gameName={gameName} />
      <div className="scrim" />
      <div className="detail">
        <div className="dcover" style={{ background: art.cover }}>
          {!art.hasImage && <span className="ctitle" style={{ color: art.ink }}>{gameName}</span>}
        </div>
        <div className="dcol">
          <div className="eyebrow up d1">{remembered ? "Modus für dieses Spiel gemerkt" : "Sunshine-App"}</div>
          <h1 className="dtitle up d2">{gameName}</h1>

          <div className="scard up d3">
            <div className="shead">
              Startet als <b>{ModeText.deviceNames[state.device] + " · " + ModeText.label(app.activeMode()) + " FPS"}</b>
              <span className="badge">{state.automatic ? "AUTO" : "MANUELL"}</span>
              <span>{remembered ? "· für dieses Spiel gemerkt" : ""}</span>
            </div>
            <div className="slayers">
              {devices.map((device) => app.profile(device).modes.map((mode, modeIndex) =>
              {
                const isActive = device === state.device && modeIndex === state.currentModes[device];
                const cells =
                [
                  { label: "Auflösung", value: ModeText.prettyResolution(mode.resolution) },
                  { label: "Bildrate", value: mode.fps + " FPS" },
                  { label: "Bitrate", value: mode.bitrateMbps + " Mbit/s" },
                  { label: "Codec", value: mode.codec },
                  { label: "HDR", value: mode.hdr ? "An" : "Aus" },
                ];
                return (
                  <div key={device + modeIndex} className={"slayer" + (isActive ? " on" : "")}>
                    {cells.map((cell) => (
                      <div key={cell.label} className="cell"><span className="clabel">{cell.label}</span><span className="cval">{cell.value}</span></div>
                    ))}
                  </div>
                );
              }))}
            </div>
            <div className="srow">
              <ModeStrip app={app} />
              <button className={"memo" + (remembered ? " on" : "")} onClick={() => app.toggleRemember()} role="checkbox" aria-checked={remembered}>
                <span className="rbox"><CheckIcon /></span>
                Für dieses Spiel merken
                <span className="glyph sm">Y</span>
              </button>
            </div>
          </div>

          <div className="actions up d4">
            <button className={"btn primary" + (state.detailIndex === 0 ? " f" : "")} onClick={() => app.detailAction(0)}>
              <PlayIcon />
              Spielen
            </button>
            <button className={"btn" + (state.detailIndex === 1 ? " f" : "")} onClick={() => app.detailAction(1)}>
              <SwapIcon />
              {"Gerät: " + ModeText.deviceNames[state.device]}
              <span className="glyph sm">X</span>
            </button>
            <button className={"btn" + (state.detailIndex === 2 ? " f" : "")} onClick={() => app.detailAction(2)}>
              <span className="stopmark" />
              {afterStreamLabel}
            </button>
          </div>

          {state.lastLaunchError
            ? <div className="dnote err up d5"><span className="dot err" /><code>{state.lastLaunchError}</code></div>
            : <div className="dnote up d5"><span className="dot on" />{app.hostDisplayName() + " · Sunshine bereit"}</div>}
        </div>
      </div>
    </div>
  );
}
