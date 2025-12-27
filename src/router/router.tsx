import MainPage from "../page/Main/page"
import ExtractFilePage from "../page/Extract/page"
import { Calendar, Home, Inbox, List, Search, Settings, FileCode, Package, Edit, Map, Wrench } from "lucide-react"
import UnitEdit from "../page/UnitEdit/page"
import FilesEdit from "../page/FilesEdit/page"
import UnitList from "../page/UnitList/page"
import ConfigPage from "../page/Config/page"
import MSCEdit from "../page/MSCEdit/page"
import RepackPage from "../page/Repack/page"
import SceneEdit from "../page/SceneEdit/page"
import MiscToolsPage from "../page/MiscTools/page"
import TestEditorPage from "../page/TestEditor/page"
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
    },
    {
        title: "Scene Edit",
        url: "/SceneEdit",
        icon: Map,
        element: <SceneEdit />
    },
    {
        title: "Misc Tools",
        url: "/MiscTools",
        icon: Wrench,
        element: <MiscToolsPage />
    },
    {
        title: "Test editor",
        url: "/TestEditor",
        icon: FileCode,
        element: <TestEditorPage />
    }
]
