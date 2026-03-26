import type { BufferGeometry } from "three";

export type TextureRefResolve = {
  reference: string;
  nutexbPath: string | null;
};

export type SsbhModelPreviewBundle = {
  rootFolder: string;
  modlPath: string;
  meshPath: string;
  skelPath: string | null;
  matlPaths: string[];
  modl: unknown;
  mesh: unknown;
  skel: unknown | null;
  matl: unknown | null;
  textureRefs: string[];
  resolvedNutexbPaths: string[];
  textureResolve: TextureRefResolve[];
  warnings: string[];
};

export type VectorDataJson =
  | { Vector2: [number, number][] }
  | { Vector3: [number, number, number][] }
  | { Vector4: [number, number, number, number][] };

export type MeshAttributeJson = {
  name: string;
  data: VectorDataJson;
};

export type VertexWeightJson = {
  vertex_index: number;
  vertex_weight: number;
};

export type BoneInfluenceJson = {
  bone_name: string;
  vertex_weights: VertexWeightJson[];
};

export type MeshObjectJson = {
  name: string;
  subindex: number;
  parent_bone_name: string;
  vertex_indices: number[];
  positions: MeshAttributeJson[];
  normals: MeshAttributeJson[];
  texture_coordinates: MeshAttributeJson[];
  bone_influences?: BoneInfluenceJson[];
};

export type MeshDataJson = {
  major_version: number;
  minor_version: number;
  objects: MeshObjectJson[];
  is_vs2: boolean;
};

export type ModlEntryJson = {
  mesh_object_name: string;
  mesh_object_subindex: number;
  material_label: string;
};

export type ModlDataJson = {
  entries: ModlEntryJson[];
};

export type BoneJson = {
  name: string;
  transform: number[][];
  parent_index: number | null;
  billboard_type: unknown;
};

export type SkelDataJson = {
  bones: BoneJson[];
};

export type TextureParamJson = {
  param_id: unknown;
  data: string;
};

export type MatlEntryJson = {
  material_label: string;
  shader_label: string;
  textures: TextureParamJson[];
};

export type MatlDataJson = {
  entries: MatlEntryJson[];
};

/** Per-corner skinning data aligned with expanded triangle vertices (same order as BufferGeometry position). */
export type MeshSkinRuntime = {
  boneCount: number;
  bindPositions: Float32Array;
  boneIndices: Uint16Array;
  boneWeights: Float32Array;
};

export type BuiltMeshDraw = {
  key: string;
  label: string;
  geometry: BufferGeometry;
  materialLabel: string;
  meshObjectName: string;
  meshObjectSubindex: number;
  skin: MeshSkinRuntime | null;
};
