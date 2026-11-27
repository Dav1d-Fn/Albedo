import { UiText } from "../i18n/UiText";
import LauncherApp from "../LauncherApp";
import { PadButton } from "../model/Types";
import { EditorRows } from "./EditorRows";

interface Hint
{
  glyph: string;
  label: string;
  button: PadButton;
  pill?: boolean;
}

/** Bottom bar with the controller buttons that do something on the current screen. */
export function HintBar(props: { app: LauncherApp })
{
  const app = props.app;
  const state = app.state;
  const hints: Hint[] = [];
  const t = UiText.current;

  if (state.screen === "home")
  {
    const onAddTile = state.zone === "games" && app.isAddTileSelected();
    const onResumeTile = state.zone === "games" && state.gameIndex === -1;
    const gamesLabel = onAddTile ? t.common.add : (onResumeTile ? t.home.resume : t.home.details);
    // In the games zone the status panel's button replaces the rail; while waking it has none.
    const panelLabel = app.statusPanelKind() !== null ? app.statusPanelButtonLabel() : gamesLabel;
    if (state.zone !== "games")
    {
      hints.push({ glyph: "A", label: t.home.select, button: "A" });
    }
    else if (panelLabel !== null)
    {
      hints.push({ glyph: "A", label: panelLabel, button: "A" });
    }
    hints.push({ glyph: "X", label: t.common.device, button: "X" });
    hints.push({ glyph: "L1 · R1", label: t.common.profile, button: "R1", pill: true });
    const wakeOffered = app.statusPanelKind() === "wake";
    // While waking, Y does nothing.
    if (state.hostState !== "waking")
    {
      hints.push({ glyph: "Y", label: wakeOffered ? t.common.wakePc : t.common.reload, button: "Y" });
    }
    hints.push({ glyph: "☰", label: t.common.devices, button: "MENU", pill: true });
  }
  else if (state.screen === "detail" && state.imageDialog !== null)
  {
    hints.push({ glyph: "◀ ▶", label: t.common.choose, button: "RIGHT", pill: true });
    hints.push({ glyph: "▲ ▼", label: t.common.row, button: "DOWN", pill: true });
    if (state.imageDialog.row === "search")
    {
      const typing = document.activeElement?.id === "art-search";
      hints.push({ glyph: "A", label: typing ? t.imageDialog.search : t.imageDialog.typeName, button: "A" });
    }
    if (state.imageDialog.row === "pictures" && state.imageDialog.candidates.length > 0)
    {
      hints.push({ glyph: "A", label: t.imageDialog.apply, button: "A" });
    }
    if (state.imageDialog.row !== "backdrop")
    {
      hints.push({ glyph: "X", label: t.imageDialog.automaticImage, button: "X" });
    }
    hints.push({ glyph: "B", label: t.common.close, button: "B" });
  }
  else if (state.screen === "detail" && state.switchGame !== null)
  {
    hints.push({ glyph: "◀ ▶", label: t.common.choose, button: "RIGHT", pill: true });
    hints.push({ glyph: "A", label: state.switchGame.choiceIndex === 0 ? t.switchGameDialog.quitAndStart : t.switchGameDialog.cancel, button: "A" });
    hints.push({ glyph: "B", label: t.switchGameDialog.cancel, button: "B" });
  }
  else if (state.screen === "detail")
  {
    const playLabel = app.isRunning(app.selectedGame()) ? t.home.resume : t.detail.play;
    const detailLabels = [playLabel, t.detail.switchDevice, t.detail.cycleAfterStream, t.detail.setImage];
    hints.push({ glyph: "A", label: detailLabels[state.detailIndex] ?? t.detail.play, button: "A" });
    hints.push({ glyph: "X", label: t.common.device, button: "X" });
    hints.push({ glyph: "L1 · R1", label: t.common.profile, button: "R1", pill: true });
    hints.push({ glyph: "Y", label: app.isRemembered(app.selectedGame()) ? t.common.forget : t.common.remember, button: "Y" });
    hints.push({ glyph: "B", label: t.common.back, button: "B" });
  }
  else if (state.screen === "editor")
  {
    hints.push({ glyph: "L1 · R1", label: t.common.device, button: "R1", pill: true });
    if (state.editZone === "modes")
    {
      const onDeviceEntry = state.editSection === "device";
      hints.push({ glyph: "A", label: t.editor.edit, button: "A" });
      if (!onDeviceEntry)
      {
        hints.push({ glyph: "Y", label: t.editor.makeDefault, button: "Y" });
      }
      const deleteLabel = onDeviceEntry ? t.editor.deleteDevice : t.editor.deleteProfile;
      hints.push({ glyph: "X", label: state.editConfirmDelete !== "" ? t.editor.reallyDelete : deleteLabel, button: "X" });
      hints.push({ glyph: "B", label: t.common.done, button: "B" });
    }
    else if (state.editZone === "actions")
    {
      hints.push({ glyph: "◀ ▶", label: t.common.choose, button: "RIGHT", pill: true });
      hints.push({ glyph: "A", label: state.editConfirmDelete !== "" ? t.editor.reallyDelete : t.editor.run, button: "A" });
      hints.push({ glyph: "B", label: t.common.done, button: "B" });
    }
    else
    {
      const rowType = EditorRows.rows[state.editRow]?.type;
      const rowActionLabels: Partial<Record<string, string>> = { text: t.editor.rename, screen: t.editor.takeScreen, delete: t.editor.deleteDevice };
      const rowKey = EditorRows.rows[state.editRow]?.key;
      const typesValue = rowKey === "resolution" || rowKey === "fps";
      const rowActionLabel = typesValue ? t.editor.typeValue : rowActionLabels[rowType ?? ""] ?? t.common.toggle;
      if (rowType !== "delete")
      {
        hints.push({ glyph: "◀ ▶", label: t.editor.changeValue, button: "RIGHT", pill: true });
      }
      hints.push({ glyph: "A", label: state.editConfirmDelete !== "" && rowType === "delete" ? t.editor.reallyDelete : rowActionLabel, button: "A" });
      const deleteLabel = EditorRows.rows[state.editRow]?.scope === "mode" ? t.editor.deleteProfile : t.editor.deleteDevice;
      hints.push({ glyph: "X", label: state.editConfirmDelete !== "" ? t.editor.reallyDelete : deleteLabel, button: "X" });
      if (app.canAddEditModeToPc())
      {
        hints.push({ glyph: "Y", label: t.editor.addModeToPc, button: "Y" });
      }
      hints.push({ glyph: "B", label: t.editor.toList, button: "B" });
    }
  }
  else if (state.screen === "connection")
  {
    const onPairRow = state.connectionZone === "rows" && state.connectionRow === 0;
    const onAddressesRow = state.connectionZone === "rows" && state.connectionRow === LauncherApp.addressesRowIndex;
    const onKeyRow = state.connectionZone === "rows" && state.connectionRow === LauncherApp.steamGridDbRowIndex;
    const rowLabel = onPairRow ? t.connection.pair : onAddressesRow ? t.connection.typeAddress : onKeyRow ? t.connection.typeKey : t.common.toggle;
    hints.push({ glyph: "A", label: state.connectionZone === "hosts" ? t.connection.use : rowLabel, button: "A" });
    if (onAddressesRow && app.settings.extraHostAddresses.length > 0)
    {
      hints.push({ glyph: "X", label: t.connection.removeLast, button: "X" });
    }
    if (onKeyRow && state.steamGridDbKeyHint)
    {
      hints.push({ glyph: "X", label: t.connection.deleteKey, button: "X" });
    }
    hints.push({ glyph: "Y", label: t.connection.searchAgain, button: "Y" });
    hints.push({ glyph: "B", label: t.common.done, button: "B" });
  }
  else if (state.screen === "library" && state.sunshineLogin !== null)
  {
    hints.push({ glyph: "▲ ▼", label: t.sunshineLogin.field, button: "DOWN", pill: true });
    hints.push({ glyph: "A", label: state.sunshineLogin.row === 0 ? t.sunshineLogin.next : t.sunshineLogin.save, button: "A" });
    hints.push({ glyph: "B", label: t.common.cancel, button: "B" });
  }
  else if (state.screen === "library")
  {
    const entry = app.selectedLibraryEntry();
    hints.push({ glyph: "L1 · R1", label: t.library.group, button: "R1", pill: true });
    const loginMissing = state.librarySunshineProblem !== null;
    if (entry !== undefined && !entry.inSunshine)
    {
      hints.push({ glyph: "A", label: loginMissing ? t.library.enterLogin : t.library.addEntry, button: "A" });
    }
    if (entry !== undefined && entry.inSunshine)
    {
      hints.push({ glyph: "X", label: loginMissing ? t.library.enterLogin : t.library.remove, button: "X" });
    }
    hints.push({ glyph: "Y", label: t.common.reload, button: "Y" });
    hints.push({ glyph: "☰", label: t.common.sunshineLogin, button: "MENU", pill: true });
    hints.push({ glyph: "B", label: t.common.done, button: "B" });
  }
  else if (state.screen === "afterStream")
  {
    hints.push({ glyph: "◀ ▶", label: t.common.choose, button: "RIGHT", pill: true });
    hints.push({ glyph: "A", label: state.afterStreamIndex === 0 ? t.afterStreamNames.keep : t.afterStreamNames.quit, button: "A" });
    hints.push({ glyph: "Y", label: state.afterStreamRemember ? t.common.dontRemember : t.common.remember, button: "Y" });
    hints.push({ glyph: "B", label: t.afterStreamNames.keep, button: "B" });
  }
  else if (state.screen === "streamSummary")
  {
    hints.push({ glyph: "A", label: t.streamStats.ok, button: "A" });
  }
  else if (state.screen === "stream")
  {
    hints.push({ glyph: "B", label: t.stream.endStream, button: "B" });
  }
  else if (state.screen === "connect")
  {
    hints.push({ glyph: "B", label: t.common.cancel, button: "B" });
  }

  return (
    <div className="hints">
      <span className="keys">{t.common.keyboardKeys}</span>
      <span className="hspacer" />
      {hints.map((hint) => (
        <button key={state.screen + hint.glyph + hint.label} className="hint" onClick={() => app.press(hint.button)}>
          <span className={"glyph" + (hint.pill ? " pill" : "")}>{hint.glyph}</span>
          {hint.label}
        </button>
      ))}
    </div>
  );
}
