import { UiText } from "../i18n/UiText";
import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";
import { DeviceIcon, PlusIcon, SlidersIcon } from "./Icons";
import { GameBackdrop } from "./GameBackdrop";
import { ModeStrip } from "./ModeStrip";
import { StatusPanel } from "./StatusPanel";

/** Library: host chip, device switch with mode strip, hero text and the cover rail. */
export function HomeScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const t = UiText.current;
  const gamesZone = state.zone === "games";
  const topFocus = (topIndex: number) => (!gamesZone && state.topIndex === topIndex ? " f" : "");

  const hasHost = app.settings.host !== "";
  const hostSubtitle = !hasHost ? t.home.notSetUp :
  {
    loading: t.home.loadingGames,
    online: t.home.online(state.games.length),
    waking: t.home.waking(state.wakeSeconds),
    error: state.hostReachable ? t.home.listFailed : (app.canWakeHost() ? t.home.unreachableWake : t.home.unreachable),
  }[state.hostState];
  const panelKind = app.statusPanelKind();
  const compatibility = app.companionCompatibility();
  const availableCompanion = state.companionUpdate?.available ?? null;
  let companionHint = "";
  if (compatibility !== "ok")
  {
    companionHint = compatibility === "companionOld" ? t.companionUpdate.companionOld : t.companionUpdate.deckOld;
  }
  else if (availableCompanion !== null)
  {
    companionHint = t.companionUpdate.homeAvailable(availableCompanion.version);
  }
  const dotClass = !hasHost ? "err" : { loading: "wake", waking: "wake", online: "on", error: "err" }[state.hostState];
  const deviceOrder = app.settings.deviceOrder;
  const activeIndex = Math.max(0, deviceOrder.indexOf(state.device));
  // The switch is 520px wide with 4px padding; each device gets an equal share.
  const segmentWidth = (520 - 8) / deviceOrder.length;
  const coverWidthWithGap = 176;
  const visibleCovers = 6;
  // The "Fortsetzen" tile sits in front of the games (gameIndex -1), so the rail position counts it.
  const resumeGame = app.resumeGame();
  const resumeSelected = state.gameIndex === -1 && resumeGame !== undefined;
  const railPosition = state.gameIndex + (resumeGame !== undefined ? 1 : 0);
  const railOffset = Math.max(0, railPosition - (visibleCovers - 1)) * coverWidthWithGap;

  return (
    <div className="screen">
      {state.games.map((gameName) => (
        <div key={gameName} className={"bd" + (gameName === app.selectedGame() ? " on" : "") + app.backdropArtFor(gameName).backdropClass} style={{ background: app.backdropArtFor(gameName).backdrop }} />
      ))}
      <GameBackdrop app={app} gameName={app.selectedGame() ?? ""} />
      <div className="scrim" />

      <div className="top">
        <button className={"chip" + topFocus(0)} onClick={() => app.activateTop(0)} aria-label={t.home.hostChipLabel(hostSubtitle)}>
          <span className={"dot " + dotClass} />
          <span className="chip-txt">
            <span className="chip-name">{app.hostDisplayName()}</span>
            <span className="chip-sub">{hostSubtitle}</span>
          </span>
          {state.hostState === "error" && <span className="glyph sm">Y</span>}
        </button>

        <div className="pwrap">
          <button
            className={"pswitch" + topFocus(1)}
            style={{ gridTemplateColumns: `repeat(${deviceOrder.length}, 1fr)` }}
            onClick={() => app.activateTop(1)}
            aria-label={t.home.switchDeviceLabel(app.profile().name)}
          >
            <span className="pthumb" style={{ width: segmentWidth, transform: `translateX(${activeIndex * segmentWidth}px)` }} />
            {deviceOrder.map((deviceId) =>
            {
              const profile = app.profile(deviceId);
              return (
                <span key={deviceId} className={"pseg" + (deviceId === state.device ? " on" : "")}>
                  <DeviceIcon kind={profile.icon} />
                  <span className="ptext">
                    <span className="pname">{profile.name}</span>
                    {/* With more than two devices there is no room for the values. */}
                    {deviceOrder.length <= 2 && <span className="pspec">{ModeText.spec(app.activeMode(deviceId))}</span>}
                  </span>
                </span>
              );
            })}
          </button>
          <ModeStrip app={app} />
          <div className="pauto">
            <span className="badge">{state.automatic ? t.common.auto : t.common.manual}</span>
            <span>
              {state.automatic
                ? (state.displayNames.length > 0 ? t.home.screenDetected(state.displayNames.join(", ")) : t.home.noExternalScreen)
                : t.home.automaticWouldBe(app.detectedDeviceName())}
            </span>
            <span className="glyph sm">X</span>
          </div>
        </div>

        <button className={"tbtn" + topFocus(2)} onClick={() => app.activateTop(2)}>
          <SlidersIcon />
          {t.common.devices}
          <span className="glyph pill sm">☰</span>
        </button>
      </div>

      {panelKind !== null && <StatusPanel app={app} />}
      {panelKind === null && state.hostState === "online" && state.companionOnline === false && (
        <div className="companionbanner"><span className="dot err" />{t.statusPanel.companionOffline}</div>
      )}
      {panelKind === null && state.companionOnline === true && companionHint !== "" && (
        <div className="companionbanner info"><span className="dot wake" />{companionHint}</div>
      )}

      {/* The status panel replaces hero and rail; they stay mounted (hidden) so their transitions keep working. */}
      <div className={"hero" + (panelKind !== null ? " hidden" : "")}>
        {resumeGame !== undefined && (
          <div className={"ht" + (resumeSelected ? " on" : "")}>
            <div className="eyebrow running"><span className="livedot" />{t.home.runningResume}</div>
            {state.logos[resumeGame] !== undefined
              ? <div className="htitle"><img className="glogo" src={state.logos[resumeGame]} alt={resumeGame} /></div>
              : <div className="htitle">{resumeGame}</div>}
            <div className="hmeta">
              <span className="hprof">
                <span className="adot" />
                {t.common.startsAs(app.profile().name, ModeText.spec(app.activeMode()))}
              </span>
              <span>{t.home.resumeText}</span>
            </div>
          </div>
        )}
        {state.games.map((gameName, gameIndex) => (
          <div key={gameName} className={"ht" + (gameIndex === state.gameIndex ? " on" : "")}>
            <div className="eyebrow">{app.isRemembered(gameName) ? t.home.profileRemembered : t.common.sunshineApp}</div>
            {state.logos[gameName] !== undefined
              ? <div className="htitle"><img className="glogo" src={state.logos[gameName]} alt={gameName} /></div>
              : <div className="htitle">{gameName}</div>}
            <div className="hmeta">
              <span className="hprof">
                <span className="adot" />
                {t.common.startsAs(app.profile().name, ModeText.spec(app.activeMode()))}
              </span>
            </div>
          </div>
        ))}
        <div className={"ht" + (app.isAddTileSelected() && state.games.length > 0 ? " on" : "")}>
          <div className="eyebrow">{t.common.library}</div>
          <div className="htitle">{t.common.add}</div>
          <div className="hmeta"><span>{t.home.addTileText}</span></div>
        </div>
        {state.games.length === 0 && (
          <div className="ht on">
            <div className="eyebrow">{t.common.library}</div>
            <div className="htitle">{state.hostState === "loading" ? t.home.loading : state.hostState === "waking" ? hostSubtitle : t.home.noGames}</div>
            <div className="hmeta"><span>{state.hostError || t.home.noApps}</span></div>
          </div>
        )}
      </div>

      <div className={"rail" + (panelKind !== null ? " hidden" : "")}>
        <div className="track" style={{ transform: `translateX(-${railOffset}px)` }}>
          {resumeGame !== undefined && (
            <button
              className={"cover resume" + (gamesZone ? (resumeSelected ? " f" : " dim") : "")}
              onClick={() => app.resumeRunningGame()}
              aria-label={t.home.runningResume + ": " + resumeGame}
              style={{ background: app.artFor(resumeGame).cover }}
            >
              {!app.artFor(resumeGame).hasImage && <span className="ctitle" style={{ color: app.artFor(resumeGame).ink }}>{resumeGame}</span>}
              <span className="runbadge"><span className="livedot" />{t.home.runningResume}</span>
              <span className="shine" />
            </button>
          )}
          {state.games.map((gameName, gameIndex) =>
          {
            const art = app.artFor(gameName);
            const focusClass = gamesZone ? (gameIndex === state.gameIndex ? " f" : " dim") : "";
            return (
              <button key={gameName} className={"cover" + focusClass} onClick={() => app.openGame(gameIndex)} aria-label={gameName} style={{ background: art.cover }}>
                {!art.hasImage && <span className="ctitle" style={{ color: art.ink }}>{gameName}</span>}
                <span className="shine" />
              </button>
            );
          })}
          <button
            className={"cover addtile" + (gamesZone ? (app.isAddTileSelected() ? " f" : " dim") : "")}
            onClick={() => app.openLibrary()}
            aria-label={t.home.addGames}
          >
            <PlusIcon />
            <span className="addlabel">{t.common.add}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
