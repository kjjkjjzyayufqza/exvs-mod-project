import { describe, expect, it } from "vitest";
import { SIDEBAR_ROUTE_URLS } from "./sidebarRouteUrls";
import { findMatchedRouteUrl, normalizeSidebarPathname, pathMatchesRoute } from "./pathMatch";

describe("pathMatchesRoute", () => {
  it("matches the workspace root only for exact / or empty", () => {
    expect(pathMatchesRoute("/", "/")).toBe(true);
    expect(pathMatchesRoute("", "/")).toBe(true);
    expect(pathMatchesRoute("/SingleFhm2d", "/")).toBe(false);
  });

  it("matches other routes by exact path only", () => {
    expect(pathMatchesRoute("/SingleFhm2d", "/SingleFhm2d")).toBe(true);
    expect(pathMatchesRoute("/SingleFhm2d/extra", "/SingleFhm2d")).toBe(false);
  });

  it("ignores trailing slashes on non-root routes", () => {
    expect(pathMatchesRoute("/GvsWorkspace/", "/GvsWorkspace")).toBe(true);
    expect(pathMatchesRoute("/MbonWorkspace/", "/MbonWorkspace")).toBe(true);
    expect(normalizeSidebarPathname("/GvsWorkspace/")).toBe("/GvsWorkspace");
  });
});

describe("findMatchedRouteUrl", () => {
  it("resolves known sidebar paths", () => {
    expect(findMatchedRouteUrl("/SingleFhm2d")).toBe("/SingleFhm2d");
    expect(findMatchedRouteUrl("/About")).toBe("/About");
    expect(findMatchedRouteUrl("/")).toBe("/");
  });

  it("returns null for unknown paths", () => {
    expect(findMatchedRouteUrl("/does-not-exist-xyz")).toBeNull();
  });

  it("resolves every registered sidebar URL including workspace homes", () => {
    for (const url of SIDEBAR_ROUTE_URLS) {
      expect(findMatchedRouteUrl(url)).toBe(url);
      if (url !== "/") {
        expect(findMatchedRouteUrl(`${url}/`)).toBe(url);
      }
    }
  });
});
