import "./App.css";
import SidebarLayout from "./layout/Sidebar";
import { Route, RouterProvider, Routes } from "react-router";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { RouterItems } from "./router/router";
function App() {
  return (
    <HashRouter>
      <SidebarLayout>
        <Routes>
          {RouterItems.map((e, i) => {
            return <Route key={i} path={e.url} element={e.element} />;
          })}
        </Routes>
      </SidebarLayout>
    </HashRouter>
  );
}

export default App;
