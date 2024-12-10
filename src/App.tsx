import "./App.css";
import { MantineProvider } from "@mantine/core";
import store from "./store";
import { Provider } from "react-redux";
import SidebarLayout from "./layout/Sidebar";
import { Route, RouterProvider, Routes } from "react-router";
import { BrowserRouter, HashRouter } from "react-router-dom";
import "@mantine/core/styles.css";
import { RouterItems } from "./components/app-sidebar";
function App() {
  return (
    <Provider store={store}>
      <HashRouter>
        <SidebarLayout>
          <MantineProvider>
            <Routes>
              {RouterItems.map((e, i) => {
                return <Route key={i} path={e.url} element={e.element} />;
              })}
            </Routes>
          </MantineProvider>
        </SidebarLayout>
      </HashRouter>
    </Provider>
  );
}

export default App;
