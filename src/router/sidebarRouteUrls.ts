/**
 * Sidebar route pathnames only (no page imports).
 * Keep in sync with `RouterItems` in `router.tsx` when adding a route.
 */
/** Default route when the sidebar game switcher selects OB / MBON / GVS. */
export const SIDEBAR_GAME_HOME_ROUTES = {
  ob: "/",
  mbon: "/MbonWorkspace",
  gvs: "/GvsWorkspace",
} as const;

export const SIDEBAR_ROUTE_URLS: readonly string[] = [
  "/",
  "/SingleFhm2d",
  "/SceneEdit",
  "/UnitModelEdit",
  "/ResourceRegistry",
  "/MiscTools",
  "/MbonWorkspace",
  "/MbonSingleFhm",
  "/MbonModding",
  "/GvsWorkspace",
  "/GvsSingleFhm2d",
  "/GvsModding",
  "/Config",
  "/About",
  "/MissionNodeEditor",
];
