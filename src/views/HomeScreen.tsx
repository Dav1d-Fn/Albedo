import { UiText } from "../i18n/UiText";
import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";
import { DeviceIcon, PlusIcon, SlidersIcon } from "./Icons";
import { GameBackdrop } from "./GameBackdrop";
import { ModeStrip } from "./ModeStrip";

/** Library: host chip, device switch with mode strip, hero text and the cover rail. */
export function HomeScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const t = UiText.current;
  const gamesZone = state.zone === "games";
  const topFocus = (topIndex: number) => (!gamesZone && state.topIndex === topIndex ? " f" : "");

  const hostSubtitle =
  {
    loading: t.home.loadingGames,
    online: t.home.online(state.games.length),
    error: app.settings.host ? t.home.unreachable : t.home.notSetUp,
  }[state.hostState];
  const dotClass = { loading: "wake", online: "on", error: "err" }[state.hostState];
  const deviceOrder = app.settings.deviceOrder;
  const activeIndex = Math.max(0, deviceOrder.indexOf(state.device));
  // The switch is 520px wide with 4px padding; each device gets an equal share.
  const segmentWidth = (520 - 8) / deviceOrder.length;
  const coverWidthWithGap = 176;
  const visibleCovers = 6;
  const railOffset = Math.max(0, state.gameIndex - (visibleCovers - 1)) * coverWidthWithGap;

  return (
    <div className="screen">
      {state.games.map((gameName, gameIndex) => (
        <div key={gameName} className={"bd" + (gameIndex === state.gameIndex ? " on" : "") + app.backdropArtFor(gameName).backdropClass} style={{ background: app.backdropArtFor(gameName).backdrop }} />
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

      <div className="hero">
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
            <div className="htitle">{state.hostState === "loading" ? t.home.loading : t.home.noGames}</div>
            <div className="hmeta"><span>{state.hostError || t.home.noApps}</span></div>
          </div>
        )}
      </div>

      <div className="rail">
        <div className="track" style={{ transform: `translateX(-${railOffset}px)` }}>
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
