import "./App.css";
import { ChakraProvider } from "@chakra-ui/react";
import MainPage from "./page/Main/Page";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

function App() {
  return (
    <MantineProvider withNormalizeCSS withGlobalStyles>
      <ChakraProvider>
        <Notifications />
        <MainPage />
      </ChakraProvider>
    </MantineProvider>
  );
}

export default App;
