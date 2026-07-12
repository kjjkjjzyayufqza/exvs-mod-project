import type { BufferGeometry } from "three";

export type TextureRefResolve = {
  reference: string;
  nutexbPath: string | null;
};

export type SsbhModelPreviewBundleSourceKind = "disk" | "memory";

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
  matlProfiles?: {
    maya?: unknown | null;
    nust?: unknown | null;
  } | null;
  textureRefs: string[];
  resolvedNutexbPaths: string[];
  textureResolve: TextureRefResolve[];
  warnings: string[];
  sourceKind: SsbhModelPreviewBundleSourceKind;
  sourceSessionId?: string | null;
  virtualModlPath?: string | null;
};

/** One loaded `.numdlb` preview instance (multi-folder load may create many). */
export type SsbhModelPreviewInstance = {
  id: string;
  modlPath: string;
  displayLabel: string;
  bundle: SsbhModelPreviewBundle;
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

/**
 * Geometry delivered as a binary side-channel: typed-array views over the packed buffer
 * fetched via `take_mesh_geometry` and attached to each object by `hydrateBundleGeometry`.
 */
export type MeshBinaryObjectViews = {
  positions: Float32Array | null;
  normals: Float32Array | null;
  uv0: Float32Array | null;
  uv1: Float32Array | null;
  indices: Uint32Array;
};

export type MeshObjectJson = {
  name: string;
  subindex: number;
  parent_bone_name: string;
  bone_influences?: BoneInfluenceJson[];
  /** Legacy inline geometry; absent when `__bin` (binary side-channel) is present. */
  vertex_indices?: number[];
  positions?: MeshAttributeJson[];
  normals?: MeshAttributeJson[];
  texture_coordinates?: MeshAttributeJson[];
  /** Runtime-only: typed-array views attached after fetching the binary geometry buffer. */
  __bin?: MeshBinaryObjectViews;
};

export type MeshDataJson = {
  major_version: number;
  minor_version: number;
  objects: MeshObjectJson[];
  is_vs2: boolean;
};

/** Byte-slice descriptor for one attribute inside the packed geometry buffer (camelCase from Rust). */
export type MeshAttributeSliceJson = {
  offset: number;
  count: number;
  components: number;
};

export type MeshIndexSliceJson = {
  offset: number;
  count: number;
};

/** Per-object entry of the binary mesh header emitted by the Rust loader. */
export type MeshObjectGeometryHeaderJson = {
  name: string;
  subindex: number;
  parentBoneName: string;
  boneInfluences?: BoneInfluenceJson[];
  vertexCount: number;
  indexCount: number;
  positions: MeshAttributeSliceJson | null;
  normals: MeshAttributeSliceJson | null;
  uv0: MeshAttributeSliceJson | null;
  uv1: MeshAttributeSliceJson | null;
  indices: MeshIndexSliceJson;
};

/** The light mesh header that replaces inline geometry in the preview bundle. */
export type MeshGeometryHeaderJson = {
  majorVersion: number;
  minorVersion: number;
  isVs2: boolean;
  binary: true;
  geometryId: string;
  objects: MeshObjectGeometryHeaderJson[];
};

export type ModlEntryJson = {
  mesh_object_name: string;
  mesh_object_subindex: number;
  material_label: string;
};

export type ModlDataJson = {
  entries: ModlEntryJson[];
};

export type SsbhMat4Json = number[] | number[][];

export type BoneJson = {
  name: string;
  transform: SsbhMat4Json;
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

export type ParamDataJson<T> = {
  param_id: unknown;
  data: T;
};

export type Vector4Json =
  | { x: number; y: number; z: number; w: number }
  | [number, number, number, number];

export type Color4Json =
  | { r: number; g: number; b: number; a: number }
  | [number, number, number, number];

export type TextureWrapModeJson = "Repeat" | "ClampToEdge" | "MirroredRepeat" | "ClampToBorder";

export type SamplerDataJson = {
  wraps?: TextureWrapModeJson;
  wrapt?: TextureWrapModeJson;
};

export type UvTransformJson = {
  scale_u: number;
  scale_v: number;
  rotation: number;
  translate_u: number;
  translate_v: number;
};

export type MatlEntryJson = {
  material_label: string;
  shader_label: string;
  blend_states?: ParamDataJson<unknown>[];
  floats?: ParamDataJson<number>[];
  float1s?: ParamDataJson<number>[];
  booleans?: ParamDataJson<boolean>[];
  vectors?: ParamDataJson<Vector4Json>[];
  colors?: ParamDataJson<Color4Json>[];
  rasterizer_states?: ParamDataJson<unknown>[];
  samplers?: ParamDataJson<SamplerDataJson>[];
  textures: TextureParamJson[];
  textures2?: TextureParamJson[];
  type4_v16?: ParamDataJson<number[]>[];
  type4_v15?: ParamDataJson<unknown>[];
  uv_transforms?: ParamDataJson<UvTransformJson>[];
};

export type MatlDataJson = {
  major_version: number;
  minor_version: number;
  entries: MatlEntryJson[];
};

/** Per-corner skinning data aligned with expanded triangle vertices (same order as BufferGeometry position). */
export type MeshSkinRuntime = {
  boneCount: number;
  bindPositions: Float32Array;
  boneIndices: Uint16Array;
  boneWeights: Float32Array;
  /** True when geometry already has skinIndex/skinWeight attributes for GPU skinning. */
  gpuAttributesReady: boolean;
};

export type BuiltMeshDraw = {
  key: string;
  label: string;
  geometry: BufferGeometry;
  materialLabel: string;
  meshObjectName: string;
  meshObjectSubindex: number;
  skin: MeshSkinRuntime | null;
  /** Set when multiple models are loaded; used for layout and bone rig scoping. */
  previewInstanceId?: string;
};
