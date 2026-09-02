import "./App.css";
import SidebarLayout from "./layout/Sidebar";
import { KeepAliveOutlet } from "./layout/KeepAliveOutlet";
import { Route, Routes } from "react-router";
import { HashRouter } from "react-router-dom";
import { toast } from "sonner";
import { useConfigStore } from "./store/configStore";
import { useEffect } from "react";
import { checkForAppUpdate, installAppUpdate } from "./lib/appUpdater";

function App() {
  const { initStore } = useConfigStore();
  useEffect(() => {
    initStore()
  }, [])

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const update = await checkForAppUpdate();
        if (!update || cancelled) {
          return;
        }
        toast.message(`Version ${update.version} is available`, {
          action: {
            label: "Install",
            onClick: () => {
              void installAppUpdate(update);
            },
          },
        });
      } catch {
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  
  return (
    <HashRouter>
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="*" element={<KeepAliveOutlet />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
