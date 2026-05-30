import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import type { StageTreeNode } from "../components/StageHierarchyTree";

export type DetailViewBundleLookup = {
  baseModel: SsbhModelPreviewBundle | null;
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>;
  importedDaeObjects?: Array<{
    id: string;
    name: string;
    sessionImportId?: string;
    ssbhBundle?: SsbhModelPreviewBundle | null;
  }>;
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
  if (node.role === "imported_dae") {
    const imported = lookup.importedDaeObjects?.find(
      (entry) =>
        entry.id === node.id ||
        entry.name === node.id ||
        (entry.sessionImportId != null && entry.sessionImportId === node.id),
    );
    return imported?.ssbhBundle ?? null;
  }
  return null;
}
