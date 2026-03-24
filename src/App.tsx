import "./App.css";
import SidebarLayout from "./layout/Sidebar";
import { KeepAliveOutlet } from "./layout/KeepAliveOutlet";
import { Route, Routes } from "react-router";
import { HashRouter } from "react-router-dom";
import { useConfigStore } from "./store/configStore";
import { useEffect } from "react";

function App() {
  const { initStore } = useConfigStore();
  useEffect(() => {
    initStore()
  }, [])
  
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
