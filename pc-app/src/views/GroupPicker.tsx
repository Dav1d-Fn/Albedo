import { UiText } from "../i18n/UiText";
import { LibraryEntry } from "../model/CompanionTypes";
import PcApp, { PcAppState } from "../PcApp";
import { Icon } from "./Icon";

/** The entry's group as a dropdown: every known group, an own new one, or back to the detected one. */
export function GroupPicker({ app, state, entry }: { app: PcApp; state: PcAppState; entry: LibraryEntry })
{
  const texts = UiText.current.entry;
  return (
    <div className="select" onClick={(event) => event.stopPropagation()}>
      <button className={"selbtn" + (state.groupMenuOpen ? " open" : "")} type="button" aria-expanded={state.groupMenuOpen}
        disabled={state.busy} onClick={() => app.toggleGroupMenu()}>
        {entry.group}
        <span className="auto">{entry.customGroup ? texts.own : texts.detected}</span>
        <Icon name="chevron" size={16} />
      </button>
      {state.groupMenuOpen && (
        <div className="menu" role="listbox">
          {app.groupChoices().map((group) => (
            <button key={group} className={"opt" + (group === entry.group ? " cur" : "")} type="button" role="option"
              aria-selected={group === entry.group}
              onClick={() => void app.moveSelectedToGroup(group === entry.detectedGroup ? null : group)}>
              <span className="optcheck">{group === entry.group && <Icon name="check" size={14} />}</span>
              {group}
              {group === entry.detectedGroup && <span className="hint">{texts.detected}</span>}
              {app.isOwnGroup(group) && <span className="hint">{texts.own}</span>}
            </button>
          ))}
          <div className="sep" />
          <form className="newgrp" onSubmit={(event) => { event.preventDefault(); void app.moveSelectedToGroup(state.newGroupName); }}>
            <input type="text" placeholder={texts.newGroup} aria-label={texts.newGroup} maxLength={40}
              value={state.newGroupName} onChange={(event) => app.setNewGroupName(event.target.value)} />
            <button className="btn sm sun" type="submit" disabled={state.newGroupName.trim() === ""}>{texts.createGroup}</button>
          </form>
        </div>
      )}
    </div>
  );
}
