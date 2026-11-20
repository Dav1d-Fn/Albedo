import { UnlistenFn } from "@tauri-apps/api/event";
import { PadButton } from "../model/Types";
import { Backend } from "../services/Backend";

/**
 * Turns keyboard keys and native gamepad events into launcher buttons.
 * Keyboard = controller: arrows, Enter/Space = A, Esc/Backspace = B, X, Y, Q/E = L1/R1, M = menu.
 */
export class InputRouter
{
  private static readonly keyMap: Record<string, PadButton> =
  {
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    Enter: "A",
    " ": "A",
    a: "A",
    Escape: "B",
    Backspace: "B",
    b: "B",
    x: "X",
    y: "Y",
    q: "L1",
    e: "R1",
    m: "MENU",
  };

  private unlistenPad: UnlistenFn | null = null;

  private disposed = false;

  public constructor(private readonly backend: Backend, private readonly onButton: (button: PadButton) => void)
  {
  }

  public attach(): void
  {
    this.disposed = false;
    window.addEventListener("keydown", this.handleKey);
    this.backend.onPadButton((button) =>
    {
      // gilrs also sees the pad while another window (e.g. Moonlight) has focus.
      if (document.hasFocus())
      {
        this.onButton(button);
      }
    }).then((unlisten) =>
    {
      if (this.disposed)
      {
        unlisten();
      }
      else
      {
        this.unlistenPad = unlisten;
      }
    });
  }

  public detach(): void
  {
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKey);
    this.unlistenPad?.();
  }

  private readonly handleKey = (keyEvent: KeyboardEvent): void =>
  {
    if (keyEvent.ctrlKey || keyEvent.metaKey || keyEvent.altKey)
    {
      return;
    }
    // While typing into a text field only Enter (A) and Escape (B) are launcher buttons.
    const typing = document.activeElement instanceof HTMLInputElement;
    if (typing && keyEvent.key !== "Enter" && keyEvent.key !== "Escape")
    {
      return;
    }
    const button = InputRouter.keyMap[keyEvent.key] ?? InputRouter.keyMap[keyEvent.key.toLowerCase()];
    if (button === undefined)
    {
      return;
    }
    keyEvent.preventDefault();
    this.onButton(button);
  };
}
