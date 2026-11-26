import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles.css";
import PcApp from "./PcApp";
import { Companion } from "./services/Companion";

// The language comes first, so the window never shows up in the wrong one.
void Companion.loadLanguageSetting()
  .catch(() => "" as const)
  .then((language) => ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<PcApp language={language} />));
