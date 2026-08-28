import { useIsKeepAliveRouteActive } from "@/layout/KeepAliveContext";
import { EXVS2_WORKSPACE_ROUTE_URL } from "../constants";

/**
 * True when EXVS2 Workspace is the foreground (visible) sidebar page.
 * When false, the page instance remains mounted but should pause heavy work.
 */
export function useTestEditorPageActive(): boolean {
  return useIsKeepAliveRouteActive(EXVS2_WORKSPACE_ROUTE_URL);
}
