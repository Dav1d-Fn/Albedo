import { UiText } from "../i18n/UiText";
import { LibraryEntry } from "../model/CompanionTypes";
import { PlaceholderTint } from "../model/PlaceholderTint";
import PcApp from "../PcApp";
import { Icon } from "./Icon";

/** One tile of the library grid: cover (or tinted placeholder), Sunshine badge, name. */
export function CoverCard({ app, entry, selected }: { app: PcApp; entry: LibraryEntry; selected: boolean })
{
  return (
    <button type="button" className={"card" + (selected ? " sel" : "")} aria-pressed={selected}
      onClick={() => app.selectEntry(entry.id)}>
      <div className="cover" style={{ background: PlaceholderTint.backgroundFor(entry.name) }}>
        {!entry.hasCover && <span className="ctitle">{entry.name}</span>}
        {entry.hasCover && <img src={app.pictureUrl("cover", entry.id)} alt="" loading="lazy" />}
        {entry.inSunshine && <span className="badge"><Icon name="check" size={11} />Sunshine</span>}
        {entry.customArt.length > 0 && (
          <span className="over" title={UiText.current.entry.customPicture}><Icon name="image" size={14} /></span>
        )}
      </div>
      <span className="cname">{entry.name}</span>
    </button>
  );
}
