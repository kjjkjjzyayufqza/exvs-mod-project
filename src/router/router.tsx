import MainPage from "../page/Main/page"
import ExtractFilePage from "../page/Extract/page"
import { Calendar, Home, Inbox, List, Search, Settings, FileCode, Package, Edit, Map, Wrench, Box } from "lucide-react"
import UnitEdit from "../page/UnitEdit/page"
import FilesEdit from "../page/FilesEdit/page"
import UnitList from "../page/UnitList/page"
import ConfigPage from "../page/Config/page"

import RepackPage from "../page/Repack/page"
import SceneEdit from "../page/SceneEdit/page"
import MiscToolsPage from "../page/MiscTools/page"
import TestEditorPage from "../page/TestEditor/page"
import UnitModelEdit from "../page/UnitModelEdit/page"
import { SIDEBAR_ROUTE_URLS } from "./sidebarRouteUrls"

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
        title: "Scene Edit",
        url: "/SceneEdit",
        icon: Map,
        element: <SceneEdit />
    },
    {
        title: "Unit Model Editor",
        url: "/UnitModelEdit",
        icon: Box,
        element: <UnitModelEdit />
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

if (RouterItems.length !== SIDEBAR_ROUTE_URLS.length) {
  throw new Error(
    `RouterItems length (${RouterItems.length}) must match SIDEBAR_ROUTE_URLS (${SIDEBAR_ROUTE_URLS.length}).`,
  )
}
RouterItems.forEach((item, i) => {
  if (item.url !== SIDEBAR_ROUTE_URLS[i]) {
    throw new Error(
      `Route URL mismatch at index ${i}: RouterItems has "${item.url}", SIDEBAR_ROUTE_URLS has "${SIDEBAR_ROUTE_URLS[i]}".`,
    )
  }
})
