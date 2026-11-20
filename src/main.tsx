import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles.css";
import LauncherApp from "./LauncherApp";
import { BrowserMock } from "./dev/BrowserMock";

BrowserMock.installIfNeeded();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // No StrictMode: its double mount would register the Tauri event listeners twice.
  <LauncherApp />,
);
