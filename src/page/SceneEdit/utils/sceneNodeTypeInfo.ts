import { Box, Copy, Shield, Sparkles, type LucideIcon } from "lucide-react";
import type { StageTreeNode } from "../components/StageHierarchyTree";

export interface NodeTypeInfo {
  label: string;
  Icon: LucideIcon;
}

/**
 * Maps an outliner node role to the type indicator shown at the bottom of its
 * context menu. Only three base categories are surfaced — Collision, Effect and
 * Model — plus a "Model (Clone)" variant for placement instances (the scene
 * copies of a sub_model). Any other role falls back to the generic Model label.
 */
export function getNodeTypeInfo(role: StageTreeNode["role"]): NodeTypeInfo {
  switch (role) {
    case "collision":
      return { label: "Collision", Icon: Shield };
    case "effect":
      return { label: "Effect", Icon: Sparkles };
    case "placement":
      return { label: "Model (Clone)", Icon: Copy };
    case "base":
    case "sub_model":
    case "imported_dae":
    default:
      return { label: "Model", Icon: Box };
  }
}
