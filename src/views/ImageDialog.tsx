import LauncherApp from "../LauncherApp";
import { ArtKind, BackdropKind } from "../model/Types";

const artKindLabels: Record<ArtKind, string> = { cover: "Cover", hero: "Hintergrund", logo: "Logo" };

const backdropLabels: Record<BackdropKind, string> = { hero: "Titelbild", screenshots: "Screenshots", cover: "Cover", none: "Kein Bild" };

/** "Bild setzen": QR code to a one-time upload page on the PC, plus the backdrop kind for this game. */
export function ImageDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const dialog = app.state.imageDialog;
  if (dialog === null)
  {
    return null;
  }
  const gameName = app.selectedGame() ?? "";
  const backdropOverride = app.backdropKindOverride(gameName);
  // The SVG comes from the companion; as <img> it cannot run scripts in the launcher.
  const qrImage = dialog.token === null ? "" : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(dialog.token.qrSvg);

  return (
    <div className="dialog">
      <div className="dcard imgdialog">
        <div className="teyebrow">{gameName + " · Bild setzen"}</div>
        <div className="tname">Bild vom Handy</div>
        <div className="tsub">Code mit dem Handy scannen, Bild auswählen, senden. Handy und PC im selben Netz.</div>

        <div className={"imgrow" + (dialog.row === 0 ? " f" : "")}>
          <div className="seg">
            {LauncherApp.artKinds.map((kind) => (
              <button key={kind} className={"segb" + (dialog.kind === kind ? " on" : "")} onClick={() => app.chooseArtKind(kind)}>
                {artKindLabels[kind]}
              </button>
            ))}
          </div>
        </div>

        <div className="qrbox">
          {dialog.token !== null && <img className="qr" src={qrImage} alt={"QR-Code: " + dialog.token.url} />}
          {dialog.loading && <span className="spin" />}
          {dialog.error !== "" && <div className="loginerr">{dialog.error}</div>}
        </div>
        {dialog.token !== null && <div className="qrurl">{dialog.token.url}</div>}

        <div className={"imgrow" + (dialog.row === 1 ? " f" : "")}>
          <span className="msub">Hintergrund für dieses Spiel</span>
          <div className="seg">
            {LauncherApp.backdropChoices.map((choice) => (
              <button
                key={choice ?? "default"}
                className={"segb" + (backdropOverride === choice ? " on" : "")}
                onClick={() => app.chooseBackdropForGame(choice)}
              >
                {choice === undefined ? "Standard (" + backdropLabels[app.settings.backdropKind] + ")" : backdropLabels[choice]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
