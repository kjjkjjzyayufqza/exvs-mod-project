import { describe, expect, it } from "vitest";
import { findMatchedRouteUrl, pathMatchesRoute } from "./pathMatch";

describe("pathMatchesRoute", () => {
  it("matches home only for exact / or empty", () => {
    expect(pathMatchesRoute("/", "/")).toBe(true);
    expect(pathMatchesRoute("", "/")).toBe(true);
    expect(pathMatchesRoute("/TestEditor", "/")).toBe(false);
  });

  it("matches other routes by exact path only", () => {
    expect(pathMatchesRoute("/TestEditor", "/TestEditor")).toBe(true);
    expect(pathMatchesRoute("/TestEditor/extra", "/TestEditor")).toBe(false);
  });
});

describe("findMatchedRouteUrl", () => {
  it("resolves known sidebar paths", () => {
    expect(findMatchedRouteUrl("/TestEditor")).toBe("/TestEditor");
    expect(findMatchedRouteUrl("/")).toBe("/");
  });

  it("returns null for unknown paths", () => {
    expect(findMatchedRouteUrl("/does-not-exist-xyz")).toBeNull();
  });
});
