import { describe, expect, it } from "vitest";

import type { StageTreeNode } from "../components/StageHierarchyTree";
import {
  applyOutlinerOrder,
  mergeOutlinerOrder,
  reorderOutlinerIds,
} from "./sceneOutlinerOrder";

function node(id: string, label = id): StageTreeNode {
  return { id, label, role: "imported_dae" };
}

describe("sceneOutlinerOrder", () => {
  it("applies stored order to root outliner children", () => {
    const children = [node("a"), node("b"), node("c")];
    const ordered = applyOutlinerOrder(children, ["c", "a", "b"]);
    expect(ordered.map((child) => child.id)).toEqual(["c", "a", "b"]);
  });

  it("appends newly discovered nodes after the existing order", () => {
    expect(mergeOutlinerOrder(["b", "a"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("moves the dragged node before the drop target", () => {
    expect(reorderOutlinerIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
  });
});
