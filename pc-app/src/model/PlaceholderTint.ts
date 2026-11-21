/** Dark background tint for an entry without cover, the same for the same name every time. */
export class PlaceholderTint
{
  public static backgroundFor(name: string): string
  {
    let hash = 0;
    for (const character of name)
    {
      hash = (hash * 31 + character.charCodeAt(0)) % 360;
    }
    return `oklch(0.32 0.05 ${hash})`;
  }
}
