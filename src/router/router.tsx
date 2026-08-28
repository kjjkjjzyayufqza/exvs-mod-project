import { lazy } from "react"
import { Box, Database, FileArchive, FolderTree, Map, Settings, Wrench } from "lucide-react"
import { SIDEBAR_ROUTE_URLS } from "./sidebarRouteUrls"

// Pages are code-split via React.lazy so the initial app shell loads without
// pulling every page (and heavy deps like three.js) into the first bundle.
// KeepAliveOutlet renders each element inside a Suspense boundary.
const Exvs2WorkspacePage = lazy(() => import("../page/TestEditor/page"))
const SingleFhm2dPage = lazy(() => import("../page/Extract/page"))
const ConfigPage = lazy(() => import("../page/Config/page"))
const SceneEdit = lazy(() => import("../page/SceneEdit/page"))
const UnitModelEdit = lazy(() => import("../page/UnitModelEdit/page"))
const MiscToolsPage = lazy(() => import("../page/MiscTools/page"))
const ResourceRegistryPage = lazy(() => import("../page/ResourceRegistry/page"))

// Menu items.
export const RouterItems = [
    {
        title: "EXVS2 Workspace",
        url: "/",
        icon: FolderTree,
        element: <Exvs2WorkspacePage />
    },
    {
        title: "Single FHM2D",
        url: "/SingleFhm2d",
        icon: FileArchive,
        element: <SingleFhm2dPage />
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
        title: "Resource Registry",
        url: "/ResourceRegistry",
        icon: Database,
        element: <ResourceRegistryPage />
    },
    {
        title: "Misc Tools",
        url: "/MiscTools",
        icon: Wrench,
        element: <MiscToolsPage />
    },
    {
        title: "Config",
        url: "/Config",
        icon: Settings,
        element: <ConfigPage />
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
