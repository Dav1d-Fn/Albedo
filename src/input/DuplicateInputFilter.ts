import { PadButton } from "../model/Types";

export type InputSource = "keyboard" | "pad";

/**
 * Drops a button that arrives from both sources for one physical press.
 *
 * On the Steam Deck desktop the D-pad also arrives as arrow keys (Steam / the compositor
 * map it), while gilrs reads the same press directly, so every step counted twice.
 * Only a press from the *other* source within the window is dropped; fast repeated
 * presses on one source always pass.
 */
export class DuplicateInputFilter
{
  private static readonly duplicateWindowMilliseconds = 100;

  private lastButton: PadButton | null = null;

  private lastSource: InputSource | null = null;

  private lastTimestamp = 0;

  public accepts(button: PadButton, source: InputSource): boolean
  {
    const now = performance.now();
    const isMirroredPress =
      button === this.lastButton &&
      source !== this.lastSource &&
      now - this.lastTimestamp < DuplicateInputFilter.duplicateWindowMilliseconds;

    if (isMirroredPress)
    {
      // Consume the pair so a third press counts again.
      this.lastButton = null;
      return false;
    }

    this.lastButton = button;
    this.lastSource = source;
    this.lastTimestamp = now;
    return true;
  }
}
