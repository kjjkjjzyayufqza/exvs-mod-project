import { beforeEach, describe, expect, it } from "vitest";

import {
  getMscAutoRepackFhm2d,
  setMscAutoRepackFhm2d,
} from "./mscEditorSettings";

describe("MSC auto-repack setting", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to disabled", () => {
    expect(getMscAutoRepackFhm2d()).toBe(false);
  });

  it("persists the selected value", () => {
    setMscAutoRepackFhm2d(true);
    expect(getMscAutoRepackFhm2d()).toBe(true);

    setMscAutoRepackFhm2d(false);
    expect(getMscAutoRepackFhm2d()).toBe(false);
  });
});
