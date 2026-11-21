import type LauncherApp from "../LauncherApp";

/** Title image or screenshot of the selected game behind the menu, above the blurred cover; each new picture fades in. */
export function GameBackdrop(props: { app: LauncherApp; gameName: string })
{
  const layers = props.app.state.backdropLayers.filter((layer) => layer.gameName === props.gameName);
  return (
    <>
      {layers.map((layer) => (
        <div key={layer.id} className="bd on bdimage" style={{ backgroundImage: `url("${layer.image}")` }} />
      ))}
    </>
  );
}
