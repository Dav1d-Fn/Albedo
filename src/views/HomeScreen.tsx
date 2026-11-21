import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";
import { HandheldIcon, PlusIcon, SlidersIcon, TvIcon } from "./Icons";
import { GameBackdrop } from "./GameBackdrop";
import { ModeStrip } from "./ModeStrip";

/** Library: host chip, device switch with mode strip, hero text and the cover rail. */
export function HomeScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const gamesZone = state.zone === "games";
  const topFocus = (topIndex: number) => (!gamesZone && state.topIndex === topIndex ? " f" : "");

  const hostSubtitle =
  {
    loading: "Lade Spieleliste …",
    online: "Online · " + state.games.length + " Spiele · Sunshine bereit",
    error: app.settings.host ? "Nicht erreichbar · Y lädt neu" : "Nicht eingerichtet · A drücken",
  }[state.hostState];
  const dotClass = { loading: "wake", online: "on", error: "err" }[state.hostState];
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
        <button className={"chip" + topFocus(0)} onClick={() => app.activateTop(0)} aria-label={"Host-PC: " + hostSubtitle}>
          <span className={"dot " + dotClass} />
          <span className="chip-txt">
            <span className="chip-name">{app.hostDisplayName()}</span>
            <span className="chip-sub">{hostSubtitle}</span>
          </span>
          {state.hostState === "error" && <span className="glyph sm">Y</span>}
        </button>

        <div className="pwrap">
          <button className={"pswitch" + topFocus(1)} onClick={() => app.activateTop(1)} aria-label={"Geräteprofil wechseln, aktiv: " + ModeText.deviceNames[state.device]}>
            <span className="pthumb" style={{ transform: `translateX(${state.device === "tv" ? 256 : 0}px)` }} />
            <span className={"pseg" + (state.device === "handheld" ? " on" : "")}>
              <HandheldIcon />
              <span className="ptext">
                <span className="pname">Handheld</span>
                <span className="pspec">{ModeText.spec(app.activeMode("handheld"))}</span>
              </span>
            </span>
            <span className={"pseg" + (state.device === "tv" ? " on" : "")}>
              <TvIcon />
              <span className="ptext">
                <span className="pname">TV</span>
                <span className="pspec">{ModeText.spec(app.activeMode("tv"))}</span>
              </span>
            </span>
          </button>
          <ModeStrip app={app} />
          <div className="pauto">
            <span className="badge">{state.automatic ? "AUTO" : "MANUELL"}</span>
            <span>
              {state.automatic
                ? (state.externalDisplay ? "Externer Bildschirm erkannt" : "Kein externer Bildschirm")
                : "Automatisch wäre " + app.detectedDeviceName()}
            </span>
            <span className="glyph sm">X</span>
          </div>
        </div>

        <button className={"tbtn" + topFocus(2)} onClick={() => app.activateTop(2)}>
          <SlidersIcon />
          Geräteprofile
          <span className="glyph pill sm">☰</span>
        </button>
      </div>

      <div className="hero">
        {state.games.map((gameName, gameIndex) => (
          <div key={gameName} className={"ht" + (gameIndex === state.gameIndex ? " on" : "")}>
            <div className="eyebrow">{app.isRemembered(gameName) ? "Modus gemerkt" : "Sunshine-App"}</div>
            <div className="htitle">{gameName}</div>
            <div className="hmeta">
              <span className="hprof">
                <span className="adot" />
                {"Startet als " + ModeText.deviceNames[state.device] + " · " + ModeText.spec(app.activeMode())}
              </span>
            </div>
          </div>
        ))}
        <div className={"ht" + (app.isAddTileSelected() && state.games.length > 0 ? " on" : "")}>
          <div className="eyebrow">Bibliothek</div>
          <div className="htitle">Hinzufügen</div>
          <div className="hmeta"><span>Spiele und Programme vom PC in die Liste holen</span></div>
        </div>
        {state.games.length === 0 && (
          <div className="ht on">
            <div className="eyebrow">Bibliothek</div>
            <div className="htitle">{state.hostState === "loading" ? "Lade …" : "Keine Spiele"}</div>
            <div className="hmeta"><span>{state.hostError || "Sunshine hat keine Apps geliefert."}</span></div>
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
            aria-label="Spiele hinzufügen"
          >
            <PlusIcon />
            <span className="addlabel">Hinzufügen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
