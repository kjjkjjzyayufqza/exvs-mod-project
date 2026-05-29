import { describe, expect, it } from "vitest";
import { Box, Copy, Shield, Sparkles } from "lucide-react";

import type { StageTreeNode } from "../components/StageHierarchyTree";
import { getNodeTypeInfo } from "./sceneNodeTypeInfo";

describe("getNodeTypeInfo", () => {
  it("maps collision role to the Collision label with the Shield icon", () => {
    const info = getNodeTypeInfo("collision");
    expect(info.label).toBe("Collision");
    expect(info.Icon).toBe(Shield);
  });

  it("maps effect role to the Effect label with the Sparkles icon", () => {
    const info = getNodeTypeInfo("effect");
    expect(info.label).toBe("Effect");
    expect(info.Icon).toBe(Sparkles);
  });

  it("maps placement role to the Model (Clone) label with the Copy icon", () => {
    const info = getNodeTypeInfo("placement");
    expect(info.label).toBe("Model (Clone)");
    expect(info.Icon).toBe(Copy);
  });

  it("maps model-like roles to the Model label with the Box icon", () => {
    const modelRoles: StageTreeNode["role"][] = ["base", "sub_model", "imported_dae"];
    for (const role of modelRoles) {
      const info = getNodeTypeInfo(role);
      expect(info.label).toBe("Model");
      expect(info.Icon).toBe(Box);
    }
  });

  it("falls back to the Model label for non-object roles", () => {
    const fallbackRoles: StageTreeNode["role"][] = ["textures", "root"];
    for (const role of fallbackRoles) {
      const info = getNodeTypeInfo(role);
      expect(info.label).toBe("Model");
      expect(info.Icon).toBe(Box);
    }
  });
});
