import { lazy } from "react"
import { Home, List, Settings, FileCode, Package, Map, Wrench, Box, Database } from "lucide-react"
import { SIDEBAR_ROUTE_URLS } from "./sidebarRouteUrls"

// Pages are code-split via React.lazy so the initial app shell loads without
// pulling every page (and heavy deps like three.js) into the first bundle.
// KeepAliveOutlet renders each element inside a Suspense boundary.
const MainPage = lazy(() => import("../page/Main/Page"))
const ExtractFilePage = lazy(() => import("../page/Extract/page"))
const RepackPage = lazy(() => import("../page/Repack/page"))
const UnitEdit = lazy(() => import("../page/UnitEdit/page"))
const FilesEdit = lazy(() => import("../page/FilesEdit/page"))
const UnitList = lazy(() => import("../page/UnitList/page"))
const ConfigPage = lazy(() => import("../page/Config/page"))
const SceneEdit = lazy(() => import("../page/SceneEdit/page"))
const UnitModelEdit = lazy(() => import("../page/UnitModelEdit/page"))
const MiscToolsPage = lazy(() => import("../page/MiscTools/page"))
const TestEditorPage = lazy(() => import("../page/TestEditor/page"))
const ResourceRegistryPage = lazy(() => import("../page/ResourceRegistry/page"))

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
    },
    {
        title: "Resource Registry",
        url: "/ResourceRegistry",
        icon: Database,
        element: <ResourceRegistryPage />
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
