import "./App.css";
import { ChakraProvider } from "@chakra-ui/react";
import HomePage from "./page/Home/page";

function App() {
  return (
    <ChakraProvider>
      <HomePage></HomePage>
    </ChakraProvider>
  );
}

export default App;
