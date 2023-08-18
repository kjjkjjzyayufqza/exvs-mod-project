import { createBrowserRouter } from "react-router-dom";
import DDSConversion from "../page/ImageCov/page";
import FileEdit from "../page/FIleEdit/FileEdit";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <div>Hello World</div>,
  },
  {
    path: "/DDSConversion",
    element: <DDSConversion />,
  },
  {
    path: "/FileEdit",
    element: <FileEdit />,
  },
]);
