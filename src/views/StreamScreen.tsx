import { UiText } from "../i18n/UiText";
import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";
import { PlayIcon } from "./Icons";

/** Shown behind Moonlight while the stream runs. */
export function StreamScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const gameName = app.selectedGame() ?? "";
  const mode = app.activeMode();
  const art = app.artFor(gameName);
  const pills = [ModeText.prettyResolution(mode.resolution), mode.fps + " FPS", ModeText.bitrate(mode.bitrateMbps), mode.codec, mode.hdr ? "HDR" : "SDR"];

  return (
    <div className="screen" style={{ background: "#000" }}>
      <div className={"bd on" + art.backdropClass} style={{ background: art.backdrop, filter: art.hasImage ? undefined : "brightness(.35)" }} />
      <div className="streamwrap">
        <div className="smsg">
          <div className="splay"><PlayIcon /></div>
          <div className="stitle">{UiText.current.stream.running}</div>
          <div className="ssub">{UiText.current.stream.moonlightTookOver(gameName)}</div>
          <div className="pills">
            {pills.map((pill) => <span key={pill} className="pill">{pill}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
