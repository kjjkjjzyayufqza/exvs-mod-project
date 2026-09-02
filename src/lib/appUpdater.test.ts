import { describe, expect, it } from "vitest";

import { buildUpdaterHeaders, resolveUpdaterToken } from "./appUpdater";

describe("appUpdater token helpers", () => {
  it("omits updater headers when no GitHub token is set", () => {
    expect(buildUpdaterHeaders(null)).toBeUndefined();
    expect(buildUpdaterHeaders("   ")).toBeUndefined();
  });

  it("sends a bearer token so private GitHub releases can be read", () => {
    expect(buildUpdaterHeaders(" ghp_example ")).toEqual({
      Authorization: "Bearer ghp_example",
      Accept: "application/octet-stream",
    });
  });

  it("prefers a stored token over the process environment token", () => {
    expect(resolveUpdaterToken(" stored ", " env ")).toBe("stored");
    expect(resolveUpdaterToken("  ", " env ")).toBe("env");
    expect(resolveUpdaterToken(null, null)).toBeNull();
  });
});
