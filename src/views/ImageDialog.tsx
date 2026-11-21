import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";
import { ArtKind, ImageDialogState } from "../model/Types";

/** How many found pictures fit next to each other; the strip scrolls with the focused one. */
const visiblePictureCounts: Record<ArtKind, number> = { cover: 5, hero: 3, logo: 4 };

/** "Set image": QR code to a one-time upload page on the PC, found pictures, plus the backdrop kind for this game. */
export function ImageDialog(props: { app: LauncherApp })
{
  const app = props.app;
  const dialog = app.state.imageDialog;
  if (dialog === null)
  {
    return null;
  }
  const gameName = app.selectedGame() ?? "";
  const rows = app.imageDialogRows();
  const t = UiText.current;
  const backdropOverride = app.backdropKindOverride(gameName);
  // The SVG comes from the companion; as <img> it cannot run scripts in the launcher.
  const qrImage = dialog.token === null ? "" : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(dialog.token.qrSvg);

  return (
    <div className="dialog">
      <div className="dcard imgdialog">
        <div className="teyebrow">{t.imageDialog.title(gameName)}</div>

        <div className={"imgrow" + (dialog.row === "kind" ? " f" : "")}>
          <div className="seg">
            {LauncherApp.artKinds.map((kind) => (
              <button key={kind} className={"segb" + (dialog.kind === kind ? " on" : "")} onClick={() => app.chooseArtKind(kind)}>
                {t.artKindNames[kind]}
              </button>
            ))}
          </div>
        </div>

        <div className="imgsources">
          <div className="imgphone">
            <span className="clabel">{t.imageDialog.fromPhone}</span>
            <div className="qrbox">
              {dialog.token !== null && <img className="qr" src={qrImage} alt={t.imageDialog.qrCode(dialog.token.url)} />}
              {dialog.loading && <span className="spin" />}
              {dialog.error !== "" && <div className="loginerr">{dialog.error}</div>}
            </div>
            {dialog.token !== null && <div className="qrurl">{dialog.token.url}</div>}
          </div>

          <div className={"imgrow imgweb" + (dialog.row === "pictures" ? " f" : "")}>
            <span className="clabel">{app.settings.steamGridDbKey === "" ? t.imageDialog.fromSteamShop : t.imageDialog.fromSteamShopAndGrid}</span>
            <PictureStrip app={app} dialog={dialog} />
          </div>
        </div>

        {rows.includes("backdrop") ? (
          <div className={"imgrow" + (dialog.row === "backdrop" ? " f" : "")}>
            <span className="msub">{t.imageDialog.automaticBackdrop}</span>
            <div className="seg">
              {LauncherApp.backdropChoices.map((choice) => (
                <button
                  key={choice ?? "default"}
                  className={"segb" + (backdropOverride === choice ? " on" : "")}
                  onClick={() => app.chooseBackdropForGame(choice)}
                >
                  {choice === undefined ? t.imageDialog.defaultChoice(t.backdropNames[app.settings.backdropKind]) : t.backdropNames[choice]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="msub imgnote">{t.imageDialog.customBackdropSet}</div>
        )}
      </div>
    </div>
  );
}

/** Found pictures of the shown kind; the focused one is framed, A takes it. */
function PictureStrip(props: { app: LauncherApp; dialog: ImageDialogState })
{
  const { app, dialog } = props;
  if (dialog.searching)
  {
    return <div className={"picstrip " + dialog.kind}><span className="spin" /></div>;
  }
  if (dialog.candidates.length === 0)
  {
    return (
      <div className={"picstrip " + dialog.kind}>
        <span className="msub">{dialog.searchProblem !== "" ? dialog.searchProblem : UiText.current.imageDialog.nothingFound}</span>
      </div>
    );
  }
  // Keep the focused picture inside the visible window.
  const visiblePictureCount = visiblePictureCounts[dialog.kind];
  const firstVisible = Math.max(0, Math.min(dialog.candidateIndex - Math.floor(visiblePictureCount / 2), dialog.candidates.length - visiblePictureCount));
  const visibleCandidates = dialog.candidates.slice(firstVisible, firstVisible + visiblePictureCount);
  const focused = dialog.candidates[dialog.candidateIndex];

  return (
    <>
      <div className={"picstrip " + dialog.kind}>
        {visibleCandidates.map((candidate, visibleIndex) =>
        {
          const candidateIndex = firstVisible + visibleIndex;
          const isFocused = candidateIndex === dialog.candidateIndex;
          return (
            <button
              key={candidate.imageUrl}
              className={"pic" + (isFocused ? " on" : "")}
              onClick={() => app.applyArtCandidate(candidateIndex)}
            >
              <img src={candidate.thumbnailUrl} alt={candidate.label} loading="lazy" />
              {isFocused && dialog.applying && <span className="spin" />}
            </button>
          );
        })}
      </div>
      <div className="msub picinfo">
        {(dialog.candidateIndex + 1) + " / " + dialog.candidates.length + " · " + focused.source + (focused.label !== "" ? " · " + focused.label : "")}
      </div>
      {dialog.searchProblem !== "" && <div className="loginerr">{dialog.searchProblem}</div>}
    </>
  );
}
