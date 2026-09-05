import "./App.css";
import SidebarLayout from "./layout/Sidebar";
import { KeepAliveOutlet } from "./layout/KeepAliveOutlet";
import { Route, Routes } from "react-router";
import { HashRouter } from "react-router-dom";
import { useConfigStore } from "./store/configStore";
import { useEffect } from "react";
import { AppUpdatePromptHost } from "./components/AppUpdatePromptHost";

function App() {
  const { initStore } = useConfigStore();
  useEffect(() => {
    initStore()
  }, [])

  return (
    <HashRouter>
      <AppUpdatePromptHost enabled={import.meta.env.PROD} />
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="*" element={<KeepAliveOutlet />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
