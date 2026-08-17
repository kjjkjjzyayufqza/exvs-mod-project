import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECT_FOLDER_PACK_SELECTION,
  parseEffectFolderWorkspaceState,
  sanitizeEffectFolderPackSelection,
  type EffectFolderPackSelectionState,
} from "./effectFolderEditorSettings";

describe("sanitizeEffectFolderPackSelection", () => {
  it("drops keys that no longer exist in inventory", () => {
    const validKeys = new Set(["efxbn:1", "models:42"]);
    const selection: EffectFolderPackSelectionState = {
      ...DEFAULT_EFFECT_FOLDER_PACK_SELECTION,
      focusedKey: "efxbn:99",
      selectedKeys: ["efxbn:1", "efxbn:99", "models:42"],
    };

    expect(sanitizeEffectFolderPackSelection(selection, validKeys)).toEqual({
      category: "all",
      searchQuery: "",
      focusedKey: null,
      selectedKeys: ["efxbn:1", "models:42"],
    });
  });

  it("keeps focused key when still valid", () => {
    const validKeys = new Set(["efxbn:1"]);
    const selection: EffectFolderPackSelectionState = {
      ...DEFAULT_EFFECT_FOLDER_PACK_SELECTION,
      focusedKey: "efxbn:1",
      selectedKeys: ["efxbn:1"],
    };

    expect(sanitizeEffectFolderPackSelection(selection, validKeys)).toEqual(selection);
  });
});

describe("parseEffectFolderWorkspaceState", () => {
  it("reads back the host model path the preview plays effects against", () => {
    expect(
      parseEffectFolderWorkspaceState({
        folderPath: "E:/XB/mod/006effect",
        hostModelPath: "  E:/XB/mod/unit/wing_zero/body.numdlb  ",
      }),
    ).toEqual({
      folderPath: "E:/XB/mod/006effect",
      packSelections: undefined,
      hostModelPath: "E:/XB/mod/unit/wing_zero/body.numdlb",
    });
  });

  it("omits a blank host path so the preview does not try to load an empty file", () => {
    const parsed = parseEffectFolderWorkspaceState({
      folderPath: "E:/XB/mod/006effect",
      hostModelPath: "   ",
    });
    expect(parsed?.hostModelPath).toBeUndefined();
  });

  it("tolerates documents written before the host model existed", () => {
    const parsed = parseEffectFolderWorkspaceState({ folderPath: "E:/XB/mod/006effect" });
    expect(parsed).toEqual({
      folderPath: "E:/XB/mod/006effect",
      packSelections: undefined,
      hostModelPath: undefined,
    });
  });

  it("rejects a record with no folder path", () => {
    expect(parseEffectFolderWorkspaceState({ hostModelPath: "a.numdlb" })).toBeNull();
    expect(parseEffectFolderWorkspaceState(null)).toBeNull();
  });
});
