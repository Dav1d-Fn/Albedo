import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";
import { DevicePalette } from "../model/DevicePalette";
import { ModeText } from "../model/ModeText";
import { PcModeMatcher } from "../model/PcModeMatcher";
import { AutoRule, DeviceColor, DeviceIconKind, StreamMode } from "../model/Types";
import { EditorRows } from "./EditorRows";
import { ChevronLeftIcon, ChevronRightIcon, DeviceIcon, MinusIcon, PlusIcon } from "./Icons";

/**
 * Device editor: on the left the device settings entry and the device's profiles (stream modes),
 * on the right only the values of the selected entry.
 */
export function EditorScreen(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const t = UiText.current;
  // Labels of the buttons under the profile list, in `LauncherApp.editorActions` order.
  const actionLabels: Record<(typeof LauncherApp.editorActions)[number], string> =
  {
    addMode: t.editor.addProfile,
    makeDefault: t.editor.makeDefault,
    deleteMode: t.editor.deleteProfile,
    addDevice: t.editor.addDevice,
  };
  const editDevice = state.editDevice;
  const profile = app.profile(editDevice);
  const editMode = profile.modes[state.editModeIndex] ?? profile.modes[0];
  const onDeviceEntry = state.editSection === "device";
  const visibleRows = EditorRows.indices(onDeviceEntry ? "device" : "mode");
  const deviceEntryConfirming = onDeviceEntry && state.editConfirmDelete === "device" && state.editZone === "modes";
  const isDefault = state.editModeIndex === profile.defaultModeIndex;
  const pcModeHint = PcModeMatcher.hint(state.pcDisplayModes, editMode);
  const deviceOrder = app.settings.deviceOrder;
  const editDeviceIndex = Math.max(0, deviceOrder.indexOf(editDevice));
  const animationClass = (editDeviceIndex + state.editModeIndex + (onDeviceEntry ? 1 : 0)) % 2 ? "swapA" : "swapB";
  // The thumb under the device tabs; each tab is 146px wide.
  const tabWidth = 146;

  return (
    <div className="screen">
      <div className="etop">
        <div className="etitle">{t.common.devices}</div>
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
        <div className="eactive">{t.editor.activeNow(app.profile().name + " · " + ModeText.label(app.activeMode()) + " FPS")}</div>
      </div>

      <div className="ebody">
        <div className="mlist">
          <button
            className={"mitem dentry" + (onDeviceEntry ? " sel" : "") + (onDeviceEntry && state.editZone === "modes" ? " f" : "") + (deviceEntryConfirming ? " warn" : "")}
            onClick={() => app.selectEditEntry("device", state.editModeIndex)}
          >
            <span className="mtop">
              <span className="dicon" style={{ color: DevicePalette.colors[profile.color] }}><DeviceIcon kind={profile.icon} /></span>
              <span className="mname">{t.editor.deviceSettings}</span>
            </span>
            {deviceEntryConfirming
              ? <span className="msub">{t.editor.pressXAgainToDelete(profile.name)}</span>
              : <span className="msub">{t.autoRuleNames[profile.autoRule] + " · " + profile.audio}</span>}
          </button>
          <div className="clabel" style={{ paddingLeft: 4, marginTop: 6 }}>{t.editor.profilesOf(profile.name)}</div>
          {profile.modes.map((mode, modeIndex) =>
          {
            const selected = !onDeviceEntry && modeIndex === state.editModeIndex;
            const focused = selected && state.editZone === "modes";
            const confirming = selected && state.editConfirmDelete === "mode" && state.editZone !== "actions";
            return (
              <button
                key={modeIndex}
                className={"mitem" + (selected ? " sel" : "") + (focused ? " f" : "") + (confirming ? " warn" : "")}
                onClick={() => app.selectEditEntry("profile", modeIndex)}
              >
                <span className="mtop">
                  <span className="mname">{ModeText.label(mode) + " FPS"}</span>
                  {modeIndex === profile.defaultModeIndex && <span className="badge">{t.editor.defaultBadge}</span>}
                </span>
                {confirming
                  ? <span className="msub">{t.editor.pressXAgainToDeleteProfile}</span>
                  : (
                    <span className="msub">
                      {modeIndex === app.currentModeIndex(editDevice) && <span className="adot" />}
                      {ModeText.bitrate(mode.bitrateMbps) + " · " + ModeText.extra(mode)}
                    </span>
                  )}
              </button>
            );
          })}
          <div className="mbtns">
            {LauncherApp.editorActions.map((action, actionIndex) =>
            {
              const focused = state.editZone === "actions" && state.editActionIndex === actionIndex;
              const disabled =
                (action === "addMode" && profile.modes.length >= 6)
                || (action === "makeDefault" && (isDefault || onDeviceEntry))
                || (action === "deleteMode" && (profile.modes.length <= 1 || onDeviceEntry))
                || (action === "addDevice" && deviceOrder.length >= LauncherApp.maximumDevices);
              const confirming = state.editZone === "actions" && action === "deleteMode" && state.editConfirmDelete === "mode";
              let label = actionLabels[action];
              if (action === "makeDefault" && isDefault)
              {
                label = t.editor.isDefault;
              }
              if (confirming)
              {
                label = t.editor.reallyDeleteA;
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

        <div key={editDevice + state.editSection + state.editModeIndex} className={"rows " + animationClass}>
          {visibleRows.map((rowIndex) =>
          {
            const row = EditorRows.rows[rowIndex];
            const rowLabel = EditorRows.label(row);
            const value = EditorRows.value(rowIndex, profile, state.editModeIndex);
            const bumpCount = state.bumps[editDevice + state.editModeIndex + row.key] ?? 0;
            const bumpClass = bumpCount ? (bumpCount % 2 ? " b1" : " b0") : "";
            const focused = state.editZone === "rows" && rowIndex === state.editRow;
            const confirmingDevice = row.scope === "device" && state.editConfirmDelete === "device" && state.editZone === "rows";
            let heading = row.scope === "mode"
              ? t.editor.profileHeading(ModeText.label(editMode as StreamMode) + " FPS")
              : t.editor.deviceHeading(profile.name);
            if (confirmingDevice)
            {
              heading = t.editor.deleteDeviceHeading(profile.name);
            }
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
              displayValue = ModeText.bitrate(value as number);
            }
            else if (row.type === "bool")
            {
              displayValue = value ? t.common.on : t.common.off;
            }
            else if (row.key === "color")
            {
              displayValue = t.colorNames[value as DeviceColor];
            }
            else if (row.key === "icon")
            {
              displayValue = t.iconNames[value as DeviceIconKind];
            }
            else if (row.key === "autoRule")
            {
              displayValue = t.autoRuleNames[value as AutoRule];
            }
            else if (row.key === "displayName")
            {
              displayValue = value ? String(value) : t.editor.noScreen;
            }

            return (
              <div key={row.key} style={{ display: "contents" }}>
                {row.heading && <div className={"rhead clabel" + (confirmingDevice ? " warn" : "")}>{heading}</div>}
                <div className={"row" + (focused ? " f" : "") + (row.type === "delete" ? " delrow" : "")} ref={focused ? (rowElement) => rowElement?.scrollIntoView({ block: "nearest" }) : undefined}>
                  <button className="rlabel" onClick={() => app.activateEditorRow(rowIndex)}>{rowLabel}</button>
                  <div className="ctrl">
                    {row.type === "list" && (
                      <>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, -1, false)} aria-label={t.editor.previousValue(rowLabel)}><ChevronLeftIcon /></button>
                        {row.key === "color" && <span className="swatch" style={{ background: DevicePalette.colors[value as DeviceColor] }} />}
                        {row.key === "icon" && <DeviceIcon kind={value as DeviceIconKind} />}
                        {row.key === "resolution" || row.key === "fps"
                          ? (
                            <input
                              key={String(value) + bumpCount}
                              id={"mode-" + row.key}
                              className={"val valinput" + bumpClass + (pcModeHint ? " off" : "")}
                              defaultValue={displayValue}
                              spellCheck={false}
                              aria-label={rowLabel}
                              onFocus={(focusEvent) =>
                              {
                                focusEvent.target.select();
                                app.setState({ editRow: rowIndex, editZone: "rows" });
                              }}
                              onBlur={(blurEvent) => app.typeModeValue(rowIndex, blurEvent.target.value)}
                            />
                          )
                          : <span key={bumpCount} className={"val" + bumpClass}>{displayValue}</span>}
                        <button className="arr" onClick={() => app.changeValue(rowIndex, 1, false)} aria-label={t.editor.nextValue(rowLabel)}><ChevronRightIcon /></button>
                      </>
                    )}
                    {row.type === "range" && (
                      <>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, -1, false)} aria-label={t.editor.lowerBitrate}><MinusIcon /></button>
                        <span className="bar"><span style={{ width: Math.round(((value as number) - row.minimum!) / (row.maximum! - row.minimum!) * 100) + "%" }} /></span>
                        <span key={bumpCount} className={"val short" + bumpClass}>{displayValue}</span>
                        <button className="arr" onClick={() => app.changeValue(rowIndex, 1, false)} aria-label={t.editor.raiseBitrate}><PlusIcon /></button>
                      </>
                    )}
                    {row.type === "bool" && (
                      <>
                        <span key={bumpCount} className={"val short" + bumpClass}>{displayValue}</span>
                        <button className={"toggle" + (value ? " on" : "")} role="switch" aria-checked={Boolean(value)} aria-label={rowLabel} onClick={() => app.changeValue(rowIndex, 1, true)}>
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
                        <button className="madd" onClick={() => app.takeConnectedScreen()}>{t.editor.takeCurrentScreen}</button>
                      </>
                    )}
                    {row.type === "delete" && (
                      <button className={"madd danger" + (confirmingDevice ? " warn" : "") + (deviceOrder.length <= 1 ? " dis" : "")} onClick={() => app.activateEditorRow(rowIndex)}>
                        {confirmingDevice ? t.editor.reallyDeleteA : deviceOrder.length <= 1 ? t.editor.oneDeviceStays : t.editor.deleteA}
                      </button>
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
                {row.key === "codec" && pcModeHint && <div className="pchint">{pcModeHint}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
