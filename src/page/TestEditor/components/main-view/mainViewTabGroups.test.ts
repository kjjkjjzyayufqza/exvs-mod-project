import { describe, expect, it } from "vitest";
import {
  groupMainViewTabs,
  MAIN_VIEW_TAB_GROUP_ORDER,
  MAIN_VIEW_TAB_META,
  shouldKeepMainViewTabMounted,
} from "./mainViewTabGroups";

describe("mainViewTabGroups", () => {
  it("groups every registered tab exactly once", () => {
    const grouped = groupMainViewTabs(MAIN_VIEW_TAB_META);
    const values = grouped.flatMap((group) => group.tabs.map((tab) => tab.value));
    expect(values).toHaveLength(MAIN_VIEW_TAB_META.length);
    expect(new Set(values).size).toBe(MAIN_VIEW_TAB_META.length);
  });

  it("preserves group order", () => {
    const grouped = groupMainViewTabs(MAIN_VIEW_TAB_META);
    expect(grouped.map((group) => group.id)).toEqual(MAIN_VIEW_TAB_GROUP_ORDER);
  });

  it("keeps Param Editor mounted after the first visit even without unsaved changes", () => {
    expect(shouldKeepMainViewTabMounted("param-editor", false, false)).toBe(true);
    expect(shouldKeepMainViewTabMounted("folder-structure", false, false)).toBe(false);
    expect(shouldKeepMainViewTabMounted("folder-structure", false, true)).toBe(true);
  });
});
