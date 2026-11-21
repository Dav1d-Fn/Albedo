import { StreamStatsText } from "../model/StreamStatsText";

/** Moonlight's statistics of the stream that just ended, as a two-column list. */
export function StreamSummary(props: { statLines: string[] })
{
  return (
    <div className="statlist">
      {StreamStatsText.translated(props.statLines).map((statLine) => (
        <div key={statLine.label + statLine.value} className="statline">
          <span className="statlabel">{statLine.label}</span>
          <span className="statvalue">{statLine.value}</span>
        </div>
      ))}
    </div>
  );
}
