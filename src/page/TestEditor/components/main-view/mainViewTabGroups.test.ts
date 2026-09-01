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

  it("places Navi List under Character after Series List", () => {
    const tab = MAIN_VIEW_TAB_META.find((entry) => entry.value === "navi-list");
    expect(tab).toMatchObject({ group: "character", name: "Navi List" });
    const characterTabs = MAIN_VIEW_TAB_META.filter((entry) => entry.group === "character").map((entry) => entry.value);
    expect(characterTabs).toEqual([
      "character-id-table",
      "character-cost",
      "striker-table",
      "character-list",
      "series-list",
      "navi-list",
    ]);
  });

  it("places Striker Table under Character after Character Cost", () => {
    const tab = MAIN_VIEW_TAB_META.find((entry) => entry.value === "striker-table");
    expect(tab).toMatchObject({ group: "character", name: "Striker Table" });
  });

  it("places Raw Path ID under Sound", () => {
    const tab = MAIN_VIEW_TAB_META.find((entry) => entry.value === "raw-path-id");
    expect(tab).toMatchObject({ group: "sound", name: "Voice file path" });
    expect(MAIN_VIEW_TAB_GROUP_ORDER).toContain("sound");
  });

  it("places Pilot Voice Table under Sound", () => {
    const tab = MAIN_VIEW_TAB_META.find((entry) => entry.value === "pilot-voice-resource");
    expect(tab).toMatchObject({ group: "sound", name: "Voice slot" });
  });

  it("places BGM Table under Sound after Voice slot", () => {
    const tab = MAIN_VIEW_TAB_META.find((entry) => entry.value === "bgm-table");
    expect(tab).toMatchObject({ group: "sound", name: "BGM table" });
    const listTab = MAIN_VIEW_TAB_META.find((entry) => entry.value === "bgm-list");
    expect(listTab).toMatchObject({ group: "sound", name: "BGM list" });
    const soundTabs = MAIN_VIEW_TAB_META.filter((entry) => entry.group === "sound").map((entry) => entry.value);
    expect(soundTabs).toEqual(["raw-path-id", "pilot-voice-resource", "bgm-table", "bgm-list"]);
  });

  it("keeps Param Editor mounted after the first visit even without unsaved changes", () => {
    expect(shouldKeepMainViewTabMounted("param-editor", false, false)).toBe(true);
    expect(shouldKeepMainViewTabMounted("interaction-editor", false, false)).toBe(true);
    expect(shouldKeepMainViewTabMounted("folder-structure", false, false)).toBe(false);
    expect(shouldKeepMainViewTabMounted("folder-structure", false, true)).toBe(true);
  });
});
