import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";
import { GameArt } from "../model/GameArt";
import { CheckIcon } from "./Icons";

/** "Add games": games and programs installed on the PC, grouped by source, from the companion service. */
export function LibraryScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const groups = app.libraryGroups();
  const entries = app.libraryEntriesOfGroup();
  const selectedEntry = app.selectedLibraryEntry();
  const t = UiText.current;

  const columns = LauncherApp.libraryColumns;
  const rowHeightWithGap = 246;
  const selectedRow = Math.floor(state.libraryItemIndex / columns);
  const gridOffset = Math.max(0, selectedRow - 1) * rowHeightWithGap;

  const statusText =
  {
    loading: t.library.asking,
    ready: t.library.entriesOn(state.library.length, app.hostDisplayName()),
    error: t.library.noContact,
  }[state.libraryState];

  return (
    <div className="screen">
      <div className="etop">
        <div className="etitle">{t.common.add}</div>
        <div className="pauto">
          <span className={"dot" + (state.libraryState === "loading" ? " wake" : state.libraryState === "error" ? " err" : " on")} />
          <span>{statusText}</span>
        </div>
        <div className="eactive">{selectedEntry ? selectedEntry.name : ""}</div>
      </div>

      <div className="ltabs">
        <span className="glyph pill sm">L1</span>
        {groups.map((group, groupIndex) => (
          <button
            key={group}
            className={"ltab" + (groupIndex === state.libraryGroupIndex ? " on" : "")}
            onClick={() => app.switchLibraryGroup(groupIndex - state.libraryGroupIndex)}
          >
            {group}
          </button>
        ))}
        <span className="glyph pill sm">R1</span>
      </div>

      {state.libraryState === "ready" && state.librarySunshineProblem !== null && (
        <div className="lwarn">
          <span className="dot err" />
          <span>
            <b>{state.librarySunshineProblem}</b>
            {t.library.loginNeeded}
          </span>
        </div>
      )}

      <div className="lgrid-wrap">
        <div className="lgrid" style={{ transform: `translateY(-${gridOffset}px)` }}>
          {entries.map((entry, itemIndex) =>
          {
            const cover = state.libraryCovers[entry.id] ?? undefined;
            const art = new GameArt(entry.name, cover);
            const focused = itemIndex === state.libraryItemIndex;
            const busy = state.libraryBusyId === entry.id;
            return (
              <button
                key={entry.id}
                className={"ltile" + (focused ? " on" : "") + (entry.inSunshine ? " in" : "")}
                onClick={() => app.addLibraryEntry(itemIndex)}
              >
                {/* The name is shown below the cover, so placeholders stay without text. */}
                <span className={"lcover" + (focused ? " f" : "")} style={{ background: art.cover }}>
                  {entry.inSunshine && <span className="lbadge"><CheckIcon /></span>}
                  {busy && <span className="lbusy"><span className="spin" /></span>}
                </span>
                <span className="lname">{entry.name}</span>
              </button>
            );
          })}
        </div>
        {state.libraryState === "error" && (
          <div className="lempty">
            <div className="htitle">{t.library.helperUnreachable}</div>
            <div className="dnote err"><span className="dot err" /><code>{state.libraryError}</code></div>
            <div className="lnote">{t.library.worksWithoutHelper}</div>
            <div className="dnote">{t.library.startHelper}</div>
          </div>
        )}
      </div>
    </div>
  );
}
