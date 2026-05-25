import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import type { StageTreeNode } from "../components/StageHierarchyTree";

export type DetailViewBundleLookup = {
  baseModel: SsbhModelPreviewBundle | null;
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>;
};

export function findBundleForDetailViewNode(
  node: StageTreeNode,
  lookup: DetailViewBundleLookup,
): SsbhModelPreviewBundle | null {
  if (node.role === "base") return lookup.baseModel;
  if (node.role === "sub_model") {
    const byFolder = lookup.subModels.find((entry) => entry.folderName === node.id);
    if (byFolder) return byFolder.bundle;
    if (node.objectIndex != null) {
      return lookup.subModels.find((entry) => entry.objectIndex === node.objectIndex)?.bundle ?? null;
    }
    return null;
  }
  return null;
}
