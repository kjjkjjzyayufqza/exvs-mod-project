import MainPage from "../page/Main/page"
import ExtractFilePage from "../page/Extract/page"
import DDSConversion from "../page/ImageCov/page"
import { Calendar, Home, Inbox, List, Search, Settings, FileCode, Package } from "lucide-react"
import UnitEdit from "../page/UnitEdit/page"
import FilesEdit from "../page/FilesEdit/page"
import UnitList from "../page/UnitList/page"
import ConfigPage from "../page/Config/page"
import MSCEdit from "../page/MSCEdit/page"
import RepackPage from "../page/Repack/page"
// Menu items.
export const RouterItems = [
    {
        title: "Home",
        url: "/",
        icon: Home,
        element: <MainPage />
    },
    {
        title: "Extract",
        url: "/Extract",
        icon: Home,
        element: <ExtractFilePage />
    },
    {
        title: "Repack",
        url: "/Repack",
        icon: Package,
        element: <RepackPage />
    },
    {
        url: "/DDSConversion",
        title: "DDSConversion",
        icon: Home,
        element: <DDSConversion />
    },
    {
        title: "Unit Edit",
        url: "/UnitEdit",
        icon: Home,
        element: <UnitEdit />
    },
    {
        title: "Files Edit",
        url: "/FilesEdit",
        icon: Home,
        element: <FilesEdit />
    },
    {
        title: "Unit List",
        url: "/UnitList",
        icon: List,
        element: <UnitList />
    },
    {
        title: "Config",
        url: "/Config",
        icon: Settings,
        element: <ConfigPage />
    },
    {
        title: "MSC Edit",
        url: "/MSCEdit",
        icon: FileCode,
        element: <MSCEdit />
    }
]
