import { UiText } from "../i18n/UiText";
import PcApp from "../PcApp";

/** A shell command to run in a terminal, selectable and with a copy button. */
export function CommandBox({ app, command }: { app: PcApp; command: string })
{
  return (
    <div className="cmd">
      <code>{command}</code>
      <button type="button" className="btn sm" onClick={() => app.copyCommand(command)}>{UiText.current.display.copy}</button>
    </div>
  );
}
