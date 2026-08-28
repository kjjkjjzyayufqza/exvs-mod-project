import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
// Side-effect import: install BVH-accelerated raycasting before any 3D view mounts.
import "@/utils/threeMeshBvh";
import { ThemeProvider } from "@/components/theme-provider";
import { Fhm2dStructureMigrationProvider } from "@/components/fhm2d-metadata";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
    storageKey="exvs-mod-project-theme"
  >
    <Fhm2dStructureMigrationProvider>
      <App />
    </Fhm2dStructureMigrationProvider>
  </ThemeProvider>
);
