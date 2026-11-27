import { DisplayMode } from "../model/CompanionTypes";

/** The modes of one output, one row per resolution with its refresh rates. */
export function ModeList({ modes, emptyText }: { modes: DisplayMode[]; emptyText: string })
{
  const sortedModes = [...modes].sort((first, second) =>
    first.width * first.height - second.width * second.height || first.refreshRate - second.refreshRate);
  const resolutions = [...new Set(sortedModes.map((mode) => `${mode.width}×${mode.height}`))];
  if (resolutions.length === 0)
  {
    return <div className="empty">{emptyText}</div>;
  }
  return (
    <div className="modes">
      {resolutions.map((resolution) => (
        <div key={resolution} className="mrow">
          <span className="res">{resolution}</span>
          <div className="hz">
            {sortedModes.filter((mode) => `${mode.width}×${mode.height}` === resolution)
              .map((mode) => <span key={mode.refreshRate}>{mode.refreshRate}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}
