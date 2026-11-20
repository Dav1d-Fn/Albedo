import type LauncherApp from "../LauncherApp";
import { ModeText } from "../model/ModeText";
import { StreamMode } from "../model/Types";
import { EditorRows } from "./EditorRows";
import { ChevronLeftIcon, ChevronRightIcon, HandheldIcon, MinusIcon, PlusIcon, TvIcon } from "./Icons";

/** Profile editor: modes of a device on the left, values of the selected mode on the right. */
export function EditorScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const editDevice = state.editDevice;
  const profile = app.profile(editDevice);
  const editMode = profile.modes[state.editModeIndex] ?? profile.modes[0];
  const isDefault = state.editModeIndex === profile.defaultModeIndex;
  const animationClass = ((editDevice === "tv" ? 1 : 0) + state.editModeIndex) % 2 ? "swapA" : "swapB";

  return (
    <div className="screen">
      <div className="etop">
        <div className="etitle">Geräteprofile</div>
        <div className="tabs">
          <button className="glyph pill" onClick={() => app.switchEditDevice("handheld")}>L1</button>
          <div className="tabbar">
            <span className="tthumb" style={{ transform: `translateX(${editDevice === "tv" ? 146 : 0}px)` }} />
            <button className={"tab" + (editDevice === "handheld" ? " on" : "")} onClick={() => app.switchEditDevice("handheld")}>
              <HandheldIcon />
              Handheld
            </button>
            <button className={"tab" + (editDevice === "tv" ? " on" : "")} onClick={() => app.switchEditDevice("tv")}>
              <TvIcon />
              TV
            </button>
          </div>
          <button className="glyph pill" onClick={() => app.switchEditDevice("tv")}>R1</button>
        </div>
        <div className="eactive">{"Aktiv: " + ModeText.deviceNames[state.device] + " · " + ModeText.label(app.activeMode()) + " FPS"}</div>
      </div>

      <div className="ebody">
        <div className="mlist">
          <div className="clabel" style={{ paddingLeft: 4 }}>{"Modi für " + ModeText.deviceNames[editDevice]}</div>
          {profile.modes.map((mode, modeIndex) =>
          {
            const selected = modeIndex === state.editModeIndex;
            const focused = selected && state.editZone === "modes";
            return (
              <button
                key={modeIndex}
                className={"mitem" + (selected ? " sel" : "") + (focused ? " f" : "")}
                onClick={() => app.setState({ editModeIndex: modeIndex, editZone: "modes" })}
              >
                <span className="mtop">
                  <span className="mname">{ModeText.label(mode) + " FPS"}</span>
                  {modeIndex === profile.defaultModeIndex && <span className="badge">STANDARD</span>}
                </span>
                <span className="msub">
                  {modeIndex === state.currentModes[editDevice] && <span className="adot" />}
                  {mode.bitrateMbps + " Mbit/s · " + ModeText.extra(mode)}
                </span>
              </button>
            );
          })}
          <div className="mbtns">
            <button className={"madd" + (profile.modes.length >= 6 ? " dis" : "")} onClick={() => app.addMode()}>
              <PlusIcon />
              Modus
            </button>
            <button className={"madd" + (isDefault ? " dis" : "")} onClick={() => app.makeDefault()}>
              {isDefault ? "Ist Standard" : "Als Standard"}
            </button>
          </div>
        </div>

        <div key={editDevice + state.editModeIndex} className={"rows " + animationClass}>
          {EditorRows.rows.map((row, rowIndex) =>
          {
            const value = EditorRows.value(rowIndex, profile, state.editModeIndex);
            const bumpCount = state.bumps[editDevice + state.editModeIndex + row.key] ?? 0;
            const bumpClass = bumpCount ? (bumpCount % 2 ? " b1" : " b0") : "";
            const focused = state.editZone === "rows" && rowIndex === state.editRow;
            const heading = row.scope === "mode"
              ? "Modus " + ModeText.label(editMode as StreamMode) + " FPS"
              : "Für alle Modi von " + ModeText.deviceNames[editDevice];
            let displayValue = String(value);
            if (row.key === "resolution")
            {
              displayValue = ModeText.prettyResolution(String(value));
            }
            else if (row.key === "fps")
            {
              displayValue = value + " FPS";
            }
            else if (row.type === "range")
            {
              displayValue = value + " Mbit/s";
            }
            else if (row.type === "bool")
            {
              displayValue = value ? "An" : "Aus";
            }

            return (
              <div key={row.key} style={{ display: "contents" }}>
                {row.heading && <div className="rhead clabel">{heading}</div>}
                <div className={"row" + (focused ? " f" : "")}>
                  <button className="rlabel" onClick={() => app.setState({ editRow: rowIndex, editZone: "rows" })}>{row.label}</button>
                  <div className="ctrl">
                    {row.type === "list" && (
                      <>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, -1, false)} aria-label={row.label + ": vorheriger Wert"}><ChevronLeftIcon /></button>
                        <span key={bumpCount} className={"val" + bumpClass}>{displayValue}</span>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, 1, false)} aria-label={row.label + ": nächster Wert"}><ChevronRightIcon /></button>
                      </>
                    )}
                    {row.type === "range" && (
                      <>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, -1, false)} aria-label="Bitrate senken"><MinusIcon /></button>
                        <span className="bar"><span style={{ width: Math.round(((value as number) - row.minimum!) / (row.maximum! - row.minimum!) * 100) + "%" }} /></span>
                        <span key={bumpCount} className={"val short" + bumpClass}>{displayValue}</span>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, 1, false)} aria-label="Bitrate erhöhen"><PlusIcon /></button>
                      </>
                    )}
                    {row.type === "bool" && (
                      <>
                        <span key={bumpCount} className={"val short" + bumpClass}>{displayValue}</span>
                        <button className={"toggle" + (value ? " on" : "")} role="switch" aria-checked={Boolean(value)} aria-label={row.label} onClick={() => app.changeValue(rowIndex, 1, true)}>
                          <span className="knob" />
                        </button>
                      </>
                    )}
                    {row.type === "seg" && (
                      <div className="seg">
                        {row.options!.map((option) => (
                          <button key={option} className={"segb" + (option === value ? " on" : "")} onClick={() => app.setValue(rowIndex, option)}>{option}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
