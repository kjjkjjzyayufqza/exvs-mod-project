/** Shared node type for the scene outliner and all tree-related utilities. */
export interface StageTreeNode {
  id: string;
  label: string;
  role: "base" | "sub_model" | "textures" | "root" | "placement" | "effect" | "imported_dae" | "collision";
  children?: StageTreeNode[];
  objectIndex?: number;
  visible?: boolean;
}
