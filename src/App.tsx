import "./App.css";
import SidebarLayout from "./layout/Sidebar";
import { Route, Routes } from "react-router";
import { HashRouter } from "react-router-dom";
import { RouterItems } from "./router/router";
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
        {/* Layout Route - all routes with sidebar */}
        <Route element={<SidebarLayout />}>
          {RouterItems.map((e, i) => {
            return <Route key={i} path={e.url} element={e.element} />;
          })}
        </Route>
        
        {/* Future: Routes without sidebar can be added here */}
        {/* <Route path="/login" element={<LoginPage />} /> */}
        {/* <Route path="*" element={<NotFoundPage />} /> */}
      </Routes>
    </HashRouter>
  );
}

export default App;
