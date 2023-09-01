import "./App.css";
import { ChakraProvider } from "@chakra-ui/react";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import store from "./store";
import { Provider } from "react-redux";
import AppShellLayout from "./layout/Sidebar";
import { Route, RouterProvider, Routes } from "react-router";
import { router } from "./routers/routers";
import { BrowserRouter } from "react-router-dom";
function App() {
  return (
    <Provider store={store}>
      <BrowserRouter>
        <MantineProvider withNormalizeCSS withGlobalStyles>
          <ChakraProvider>
            <Notifications />
            <AppShellLayout>
              <Routes>
                {router.map((e, i) => {
                  return <Route key={i} path={e.path} element={e.element} />;
                })}
              </Routes>
            </AppShellLayout>
          </ChakraProvider>
        </MantineProvider>
      </BrowserRouter>
    </Provider>
  );
}

export default App;
