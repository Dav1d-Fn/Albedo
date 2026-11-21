import { UiText } from "../i18n/UiText";
import PcApp, { FILTER_ALL, FILTER_IN_SUNSHINE, PcAppState } from "../PcApp";
import { CoverCard } from "./CoverCard";
import { EntryDetail } from "./EntryDetail";
import { Icon } from "./Icon";

/** Every entry of the companion by group, filter chips, search, and the selected entry on the right. */
export function LibraryScreen({ app, state }: { app: PcApp; state: PcAppState })
{
  const texts = UiText.current.library;
  const entries = state.library?.entries ?? [];
  const chips =
  [
    { filter: FILTER_ALL, label: texts.all, count: entries.length, custom: false },
    { filter: FILTER_IN_SUNSHINE, label: texts.inSunshine, count: entries.filter((entry) => entry.inSunshine).length, custom: false },
    ...app.groups().map((group) => ({ filter: group, label: group, count: app.entriesInGroup(group).length, custom: app.isOwnGroup(group) })),
  ];
  const sections = app.visibleSections();
  const selectedEntry = app.selectedEntry();

  return (
    <main className="main">
      <div className="head">
        <h1 className="h1">{texts.title}</h1>
        <label className="search">
          <Icon name="search" size={16} />
          <input type="search" placeholder={texts.searchPlaceholder} aria-label={texts.searchPlaceholder}
            value={state.searchText} onChange={(event) => app.setSearchText(event.target.value)} />
        </label>
        <button className="btn" type="button" onClick={() => void app.reloadAll()}>
          <Icon name="reload" size={16} />{UiText.current.common.reload}
        </button>
      </div>

      {state.companionDown && (
        <div className="banner bad"><Icon name="warning" />{texts.companionDown}
          <button className="btn sm" type="button" onClick={() => void app.reloadAll()}>{UiText.current.common.retry}</button>
        </div>
      )}
      {state.library?.sunshineProblem && (
        <div className="banner"><Icon name="warning" />{texts.sunshineHint} {state.library.sunshineProblem}
          <button className="btn sm" type="button" onClick={() => app.showScreen("status")}>{texts.toLogin}</button>
        </div>
      )}

      <div className="chips" role="group">
        {chips.map((chip) => (
          <button key={chip.filter} type="button"
            className={"chip" + (state.groupFilter === chip.filter ? " on" : "") + (chip.custom ? " custom" : "")}
            onClick={() => app.setGroupFilter(chip.filter)}>
            {chip.label} <b>{chip.count}</b>
          </button>
        ))}
      </div>

      <div className="body">
        <section className="lib">
          {!state.library && !state.companionDown && <div className="empty">{texts.loading}</div>}
          {state.library && sections.length === 0 && <div className="empty">{texts.nothingFound}</div>}
          {sections.map((section) => (
            <div key={section.group} className="section">
              <div className="sec">
                {section.group}
                <span>{section.custom ? `${texts.ownGroup} · ` : ""}{texts.inSunshineOf(section.inSunshineCount, section.totalInGroup)}</span>
              </div>
              <div className="grid">
                {section.entries.map((entry) => (
                  <CoverCard key={entry.id} app={app} entry={entry} selected={entry.id === state.selectedId} />
                ))}
              </div>
            </div>
          ))}
        </section>
        {selectedEntry
          ? <EntryDetail app={app} state={state} entry={selectedEntry} />
          : <aside className="detail"><div className="empty">{texts.pickHint}</div></aside>}
      </div>
    </main>
  );
}
