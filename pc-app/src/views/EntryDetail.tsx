import { UiText } from "../i18n/UiText";
import { ArtKind, LibraryEntry } from "../model/CompanionTypes";
import { PlaceholderTint } from "../model/PlaceholderTint";
import PcApp, { PcAppState } from "../PcApp";
import { GroupPicker } from "./GroupPicker";
import { Icon } from "./Icon";

const artKinds: ArtKind[] = ["cover", "hero", "logo"];

/** Right column of the library: the selected entry with Sunshine state, group and pictures. */
export function EntryDetail({ app, state, entry }: { app: PcApp; state: PcAppState; entry: LibraryEntry })
{
  const texts = UiText.current.entry;
  const source = entry.id.split(":")[0];
  const subtitle = [texts.sources[source] ?? source, entry.system].filter(Boolean).join(" · ");
  const sunshineBlocked = state.library?.sunshineProblem !== null;
  const hasPicture: Record<ArtKind, boolean> = { cover: entry.hasCover, hero: entry.hasHero, logo: entry.hasLogo };

  return (
    <aside className="detail" aria-label={entry.name}>
      <div className="dhero" style={{ background: PlaceholderTint.backgroundFor(entry.name + "hero") }}>
        {entry.hasHero && <img src={app.pictureUrl("hero", entry.id)} alt="" />}
      </div>
      <div className="dtop">
        <div className="dcover" style={{ background: PlaceholderTint.backgroundFor(entry.name) }}>
          {entry.hasCover && <img src={app.pictureUrl("cover", entry.id)} alt="" />}
        </div>
        <div className="dname">{entry.name}</div>
      </div>
      <div className="dsub">{subtitle}</div>

      <div className="dbody">
        <div className="state">
          <span className={"dot" + (entry.inSunshine ? " ok" : "")} />
          <span className="txt">{entry.inSunshine ? texts.inSunshineAs(entry.name) : texts.notInSunshine}</span>
          {entry.inSunshine
            ? <button className="btn sm danger" type="button" disabled={state.busy || sunshineBlocked}
                onClick={() => void app.removeSelectedFromSunshine()}>{UiText.current.common.remove}</button>
            : <button className="btn sm sun" type="button" disabled={state.busy || sunshineBlocked}
                onClick={() => void app.addSelectedToSunshine()}><Icon name="plus" size={14} />{texts.add}</button>}
        </div>

        <div>
          <div className="lbl">{texts.group}</div>
          <GroupPicker app={app} state={state} entry={entry} />
          <div className="note"><Icon name="info" size={13} />{texts.groupAppliesOnDeck}</div>
        </div>

        <div>
          <div className="lbl">{texts.pictures}</div>
          <div className="pics">
            {artKinds.map((kind) => (
              <button key={kind} type="button" className="pic" onClick={() => app.openArtDialog(kind)}>
                <div className={"pthumb kind-" + kind}>
                  {hasPicture[kind] && <img src={app.pictureUrl(kind, entry.id)} alt="" />}
                </div>
                <div className="pkind">
                  {UiText.current.artKinds[kind]}
                  {entry.customArt.includes(kind) && <span className="own">{texts.customPicture}</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="picbtns">
            <button className="btn sm" type="button" onClick={() => app.openArtDialog("cover")}>{texts.setPicture}</button>
            {entry.customArt.map((kind) => (
              <button key={kind} className="btn sm" type="button" disabled={state.busy}
                onClick={() => void app.resetPicture(kind as ArtKind)}>{texts.reset(UiText.current.artKinds[kind])}</button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
