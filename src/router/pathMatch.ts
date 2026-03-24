import { SIDEBAR_ROUTE_URLS } from "./sidebarRouteUrls";

/**
 * True when the current location should show the given sidebar route.
 * Home is only exact "/" (or empty, normalized to "/").
 */
export function pathMatchesRoute(pathname: string, routeUrl: string): boolean {
  const p = pathname === "" ? "/" : pathname;
  if (routeUrl === "/") {
    return p === "/";
  }
  return p === routeUrl;
}

export function findMatchedRouteUrl(pathname: string): string | null {
  const hit = SIDEBAR_ROUTE_URLS.find((url) => pathMatchesRoute(pathname, url));
  return hit ?? null;
}
