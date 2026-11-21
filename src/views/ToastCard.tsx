import { DeviceIconKind } from "../model/Types";
import { CheckIcon, DeviceIcon } from "./Icons";

export interface ToastContent
{
  /** A device symbol for device and mode changes, else a check mark or "!". */
  kind: DeviceIconKind | "ok" | "error";
  eyebrow: string;
  name: string;
  spec: string;
  sub: string;
}

/** Centered glass card that pops in after a device or mode change; errors stay until A/B. */
export function ToastCard(props: { toast: ToastContent })
{
  const toast = props.toast;
  const isError = toast.kind === "error";
  return (
    <div className={"toast" + (isError ? " err" : "")}>
      <div className="tcard">
        <div className="ticon">
          {toast.kind !== "ok" && toast.kind !== "error" && <DeviceIcon kind={toast.kind} />}
          {toast.kind === "ok" && <CheckIcon />}
          {toast.kind === "error" && <span style={{ fontSize: 34, fontWeight: 800 }}>!</span>}
        </div>
        <div className="teyebrow">{toast.eyebrow}</div>
        <div className="tname">{toast.name}</div>
        {toast.spec && <div className="tspec">{toast.spec}</div>}
        <div className="tsub">{toast.sub}</div>
        {isError && (
          <div className="tclose">
            <span className="glyph sm">A</span>
            <span className="glyph sm">B</span>
            Schließen
          </div>
        )}
      </div>
    </div>
  );
}
