import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { ThemeProvider } from "@/components/theme-provider";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
    storageKey="tauri-app-theme"
  >
    <App />
  </ThemeProvider>
);
