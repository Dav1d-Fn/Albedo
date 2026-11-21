import LauncherApp from "../LauncherApp";
import { DevicePalette } from "../model/DevicePalette";
import { ModeText } from "../model/ModeText";
import { DeviceColor, DeviceIconKind, StreamMode } from "../model/Types";
import { EditorRows } from "./EditorRows";
import { ChevronLeftIcon, ChevronRightIcon, DeviceIcon, MinusIcon, PlusIcon } from "./Icons";

/** Labels of the buttons under the mode list, in `LauncherApp.editorActions` order. */
const actionLabels: Record<(typeof LauncherApp.editorActions)[number], string> =
{
  addMode: "+ Modus",
  makeDefault: "Als Standard",
  deleteMode: "Modus löschen",
  addDevice: "+ Gerät",
  deleteDevice: "Gerät löschen",
};

/** Profile editor: modes of a device on the left, values of the selected mode on the right. */
export function EditorScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const editDevice = state.editDevice;
  const profile = app.profile(editDevice);
  const editMode = profile.modes[state.editModeIndex] ?? profile.modes[0];
  const isDefault = state.editModeIndex === profile.defaultModeIndex;
  const deviceOrder = app.settings.deviceOrder;
  const editDeviceIndex = Math.max(0, deviceOrder.indexOf(editDevice));
  const animationClass = (editDeviceIndex + state.editModeIndex) % 2 ? "swapA" : "swapB";
  // The thumb under the device tabs; each tab is 146px wide.
  const tabWidth = 146;

  return (
    <div className="screen">
      <div className="etop">
        <div className="etitle">Geräteprofile</div>
        <div className="tabs">
          <span className="glyph pill">L1</span>
          <div className="tabbar" style={{ gridTemplateColumns: `repeat(${deviceOrder.length}, ${tabWidth}px)` }}>
            <span className="tthumb" style={{ transform: `translateX(${editDeviceIndex * tabWidth}px)` }} />
            {deviceOrder.map((deviceId) => (
              <button key={deviceId} className={"tab" + (deviceId === editDevice ? " on" : "")} onClick={() => app.switchEditDevice(deviceId)}>
                <DeviceIcon kind={app.profile(deviceId).icon} />
                {app.profile(deviceId).name}
              </button>
            ))}
          </div>
          <span className="glyph pill">R1</span>
        </div>
        <div className="eactive">{"Aktiv: " + app.profile().name + " · " + ModeText.label(app.activeMode()) + " FPS"}</div>
      </div>

      <div className="ebody">
        <div className="mlist">
          <div className="clabel" style={{ paddingLeft: 4 }}>{"Modi für " + profile.name}</div>
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
                  {modeIndex === app.currentModeIndex(editDevice) && <span className="adot" />}
                  {mode.bitrateMbps + " Mbit/s · " + ModeText.extra(mode)}
                </span>
              </button>
            );
          })}
          <div className="mbtns">
            {LauncherApp.editorActions.map((action, actionIndex) =>
            {
              const focused = state.editZone === "actions" && state.editActionIndex === actionIndex;
              const disabled =
                (action === "addMode" && profile.modes.length >= 6)
                || (action === "makeDefault" && isDefault)
                || (action === "deleteMode" && profile.modes.length <= 1)
                || (action === "addDevice" && deviceOrder.length >= LauncherApp.maximumDevices)
                || (action === "deleteDevice" && deviceOrder.length <= 1);
              const confirming = (action === "deleteMode" && state.editConfirmDelete === "mode")
                || (action === "deleteDevice" && state.editConfirmDelete === "device");
              let label = actionLabels[action];
              if (action === "makeDefault" && isDefault)
              {
                label = "Ist Standard";
              }
              if (confirming)
              {
                label = "Wirklich löschen? A";
              }
              return (
                <button
                  key={action}
                  className={"madd" + (disabled ? " dis" : "") + (focused ? " f" : "") + (confirming ? " warn" : "")}
                  onClick={() => app.runEditorAction(actionIndex)}
                >
                  {label}
                </button>
              );
            })}
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
              : "Gerät " + profile.name;
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
            else if (row.key === "color")
            {
              displayValue = DevicePalette.colorNames[value as DeviceColor];
            }
            else if (row.key === "icon")
            {
              displayValue = DevicePalette.iconNames[value as DeviceIconKind];
            }
            else if (row.key === "displayName")
            {
              displayValue = value ? String(value) : "keiner";
            }

            return (
              <div key={row.key} style={{ display: "contents" }}>
                {row.heading && <div className="rhead clabel">{heading}</div>}
                <div className={"row" + (focused ? " f" : "")}>
                  <button className="rlabel" onClick={() => app.activateEditorRow(rowIndex)}>{row.label}</button>
                  <div className="ctrl">
                    {row.type === "list" && (
                      <>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, -1, false)} aria-label={row.label + ": vorheriger Wert"}><ChevronLeftIcon /></button>
                        {row.key === "color" && <span className="swatch" style={{ background: DevicePalette.colors[value as DeviceColor] }} />}
                        {row.key === "icon" && <DeviceIcon kind={value as DeviceIconKind} />}
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
                    {row.type === "text" && (
                      <input
                        id="device-name"
                        className="hostinput nameinput"
                        value={profile.name}
                        maxLength={24}
                        spellCheck={false}
                        onChange={(changeEvent) => app.renameEditDevice(changeEvent.target.value)}
                        onFocus={() => app.setState({ editRow: rowIndex, editZone: "rows" })}
                        onBlur={() => app.finishRename()}
                      />
                    )}
                    {row.type === "screen" && (
                      <>
                        <span className="val">{displayValue}</span>
                        <button className="madd" onClick={() => app.takeConnectedScreen()}>Aktuellen übernehmen · A</button>
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
