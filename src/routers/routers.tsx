import DDSConversion from "../page/ImageCov/page";
import FileEdit from "../page/FIleEdit/page";
import MainPage from "../page/Main/page";
import { IconGauge } from "@tabler/icons-react";
import ExtractFilePage from "../page/Extract/page";

export const router = [
  {
    path: "/",
    label: "Main",
    element: <MainPage />,
    icon: IconGauge,
  },
  {
    path: "/Extract",
    label: "Extract",
    element: <ExtractFilePage />,
    icon: IconGauge,
  },
  {
    path: "/Repack",
    label: "Repack",
    element: <MainPage />,
    icon: IconGauge,
  },
  {
    path: "/DDSConversion",
    label: "DDSConversion",
    element: <DDSConversion />,
    icon: IconGauge,
  },
  {
    path: "/FileEdit",
    label: "FileEdit",
    element: <FileEdit />,
    icon: IconGauge,
  },
];
