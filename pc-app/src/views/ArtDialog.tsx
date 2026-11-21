import { UiText } from "../i18n/UiText";
import { ArtKind } from "../model/CompanionTypes";
import PcApp, { ArtDialogState, PcAppState } from "../PcApp";
import { Icon } from "./Icon";

const artKinds: ArtKind[] = ["cover", "hero", "logo"];

/** "Bild setzen": search results from Steam shop, libretro and SteamGridDB, or an own file (picker or drag & drop). */
export function ArtDialog({ app, state, dialog }: { app: PcApp; state: PcAppState; dialog: ArtDialogState })
{
  const texts = UiText.current.art;
  const entry = app.selectedEntry();
  const candidates = dialog.result?.candidates ?? [];
  const sources = [...new Set(candidates.map((candidate) => candidate.source))];
  const shownCandidates = candidates.filter((candidate) => dialog.sourceFilter === "" || candidate.source === dialog.sourceFilter);
  const kindName = UiText.current.artKinds[dialog.kind];

  return (
    <div className="scrim" onClick={() => app.closeArtDialog()}>
      <section className={"dlg" + (dialog.dragOver ? " dragging" : "")} role="dialog" aria-label={texts.title(entry?.name ?? "")}
        onClick={(event) => event.stopPropagation()}
        onDragOver={(event) => { event.preventDefault(); app.setArtDragOver(true); }}
        onDragLeave={(event) => { if (event.currentTarget === event.target) app.setArtDragOver(false); }}
        onDrop={(event) => { event.preventDefault(); void app.uploadArtFile(event.dataTransfer.files[0]); }}>
        <div className="dhead">
          <div>
            <h2 className="dtitle">{texts.title(entry?.name ?? "")}</h2>
            <div className="dsubline">{texts.subtitle}</div>
          </div>
          <button className="x" type="button" aria-label={texts.close} onClick={() => app.closeArtDialog()}><Icon name="close" /></button>
        </div>

        <form className="bar" onSubmit={(event) => { event.preventDefault(); void app.searchArt(); }}>
          <div className="seg" role="group" aria-label={texts.kind}>
            {artKinds.map((kind) => (
              <button key={kind} type="button" className={dialog.kind === kind ? "on" : ""} onClick={() => app.setArtKind(kind)}>
                {UiText.current.artKinds[kind]}
              </button>
            ))}
          </div>
          <label className="search grow">
            <Icon name="search" size={16} />
            <input type="search" aria-label={texts.query} value={dialog.query} onChange={(event) => app.setArtQuery(event.target.value)} />
          </label>
          <button className="btn" type="submit" disabled={dialog.searching}>{texts.search}</button>
        </form>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" className={"tab" + (dialog.sourceFilter === "" ? " on" : "")}
            onClick={() => app.setArtSourceFilter("")}>{texts.allSources} <b>{candidates.length}</b></button>
          {sources.map((source) => (
            <button key={source} type="button" role="tab" className={"tab" + (dialog.sourceFilter === source ? " on" : "")}
              onClick={() => app.setArtSourceFilter(source)}>
              {source} <b>{candidates.filter((candidate) => candidate.source === source).length}</b>
            </button>
          ))}
        </div>

        <div className="content">
          <div className={"results kind-" + dialog.kind}>
            {dialog.searching && <div className="empty">{texts.searching}</div>}
            {!dialog.searching && dialog.result && shownCandidates.length === 0 && <div className="empty">{texts.noResults}</div>}
            {!dialog.searching && shownCandidates.map((candidate) => (
              <button key={candidate.imageUrl} type="button" className={"res" + (dialog.selectedUrl === candidate.imageUrl ? " sel" : "")}
                aria-pressed={dialog.selectedUrl === candidate.imageUrl}
                onClick={() => app.selectArtCandidate(candidate.imageUrl)}
                onDoubleClick={() => { app.selectArtCandidate(candidate.imageUrl); void app.applySelectedArt(); }}>
                <div className="img"><img src={candidate.thumbnailUrl} alt="" loading="lazy" /></div>
                <span className="meta">{candidate.source} · {candidate.label}</span>
              </button>
            ))}
          </div>
          <label className="drop">
            <Icon name="upload" size={30} />
            <span className="t">{dialog.dragOver ? texts.dropNow : dialog.busy ? texts.uploading : texts.ownPicture}</span>
            <span className="s">{texts.dropHint}</span>
            <span className="btn sm">{texts.pickFile}</span>
            <input type="file" accept="image/*" hidden disabled={dialog.busy}
              onChange={(event) => void app.uploadArtFile(event.target.files?.[0])} />
          </label>
        </div>

        {dialog.result?.problem && <div className="keyhint warn"><Icon name="warning" size={16} />{dialog.result.problem}</div>}
        {state.settings.steamGridDbKey === "" && <div className="keyhint"><Icon name="info" size={16} />{texts.noKeyHint}</div>}

        <div className="foot">
          {entry?.customArt.includes(dialog.kind) && (
            <button className="btn" type="button" disabled={dialog.busy} onClick={() => void app.resetArtFromDialog()}>{texts.resetToAuto}</button>
          )}
          <span className="spacer" />
          <button className="btn" type="button" onClick={() => app.closeArtDialog()}>{UiText.current.common.cancel}</button>
          <button className="btn sun" type="button" disabled={!dialog.selectedUrl || dialog.busy}
            onClick={() => void app.applySelectedArt()}>{dialog.busy ? texts.uploading : texts.apply(kindName)}</button>
        </div>
      </section>
    </div>
  );
}
