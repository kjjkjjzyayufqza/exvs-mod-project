import { useIsKeepAliveRouteActive } from "@/layout/KeepAliveContext";
import { TEST_EDITOR_ROUTE_URL } from "../constants";

/**
 * True when Test Editor is the foreground (visible) sidebar page.
 * When false, the page instance remains mounted but should pause heavy work.
 */
export function useTestEditorPageActive(): boolean {
  return useIsKeepAliveRouteActive(TEST_EDITOR_ROUTE_URL);
}
