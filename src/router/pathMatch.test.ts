import { describe, expect, it } from "vitest";
import { findMatchedRouteUrl, pathMatchesRoute } from "./pathMatch";

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
});

describe("findMatchedRouteUrl", () => {
  it("resolves known sidebar paths", () => {
    expect(findMatchedRouteUrl("/SingleFhm2d")).toBe("/SingleFhm2d");
    expect(findMatchedRouteUrl("/")).toBe("/");
  });

  it("returns null for unknown paths", () => {
    expect(findMatchedRouteUrl("/does-not-exist-xyz")).toBeNull();
  });
});
