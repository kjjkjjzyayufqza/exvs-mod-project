import { describe, expect, it } from "vitest";
import {
  DEFAULT_EFFECT_FOLDER_PACK_SELECTION,
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
