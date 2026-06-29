import { describe, expect, it } from "vitest";
import { findMainViewTabLabel } from "./mainViewTabNavSettings";
import { MAIN_VIEW_TAB_META } from "./mainViewTabGroups";

describe("findMainViewTabLabel", () => {
  it("returns short name for known tabs", () => {
    expect(findMainViewTabLabel("effect-folder", MAIN_VIEW_TAB_META)).toBe("Effect");
    expect(findMainViewTabLabel("bullet-editor", MAIN_VIEW_TAB_META)).toBe("Bullet");
  });

  it("returns null for unknown tabs", () => {
    expect(findMainViewTabLabel("missing-tab", MAIN_VIEW_TAB_META)).toBeNull();
  });
});
