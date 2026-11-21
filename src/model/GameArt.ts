/**
 * Cover art of a game: the Sunshine cover from Moonlight's cache when there is one,
 * otherwise a placeholder with a stable colour per game name, drawn with the design's gradients.
 */
export class GameArt
{
  private readonly hue: number;

  /** `data:` URL of the real cover, or undefined for the placeholder. */
  private readonly imageUrl: string | undefined;

  public constructor(gameName: string, imageUrl?: string)
  {
    this.imageUrl = imageUrl;
    let hash = 0;
    for (const character of gameName)
    {
      hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    }
    this.hue = hash % 360;
  }

  /** Real covers carry their own title, so the views hide the text label. */
  public get hasImage(): boolean
  {
    return this.imageUrl !== undefined;
  }

  /** Extra class for the backdrop element: real covers are blurred, they are too small to show sharp. */
  public get backdropClass(): string
  {
    return this.hasImage ? " img" : "";
  }

  public get ink(): string
  {
    return `hsl(${this.hue} 90% 90%)`;
  }

  /** Small cover in the rail and on the detail page. */
  public get cover(): string
  {
    if (this.imageUrl !== undefined)
    {
      return `url("${this.imageUrl}") center / cover no-repeat, ${this.background}`;
    }
    return `radial-gradient(circle at 78% 24%, ${this.accent(1)} 0 20%, transparent 20.6%), `
      + `radial-gradient(130% 90% at 0% 100%, ${this.accent(0.4)}, transparent 62%), ${this.background}`;
  }

  /** Large backdrop behind the hero text. */
  public get backdrop(): string
  {
    if (this.imageUrl !== undefined)
    {
      return `url("${this.imageUrl}") center 30% / cover no-repeat, ${this.background}`;
    }
    return `radial-gradient(circle at 76% 40%, ${this.accent(1)} 0 11%, transparent 11.3%), `
      + `radial-gradient(circle at 76% 40%, ${this.accent(0.22)} 0 21%, transparent 21.3%), `
      + `radial-gradient(circle at 76% 40%, ${this.accent(0.09)} 0 33%, transparent 33.3%), `
      + `radial-gradient(110% 90% at 100% 0%, ${this.accent(0.31)}, transparent 65%), ${this.background}`;
  }

  private get background(): string
  {
    return `hsl(${this.hue} 45% 7%)`;
  }

  private accent(alpha: number): string
  {
    return `hsl(${this.hue} 80% 62% / ${alpha})`;
  }
}
