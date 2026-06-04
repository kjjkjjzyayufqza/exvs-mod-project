import { invoke, Channel } from "@tauri-apps/api/core";
import type { DaeImportConfig, HktSimplifyConfig } from "../components/dae-import/daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY, normalizeHktSimplifyConfig } from "./hktSimplifyUtils";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type {
  MatlDataJson,
  NumdlbMappingRow,
} from "@/components/ssbh-model-preview/daeSsbhTypes";

export type SceneSource =
  | { type: "fhm2d"; path: string }
  | { type: "folder"; path: string }
  | { type: "new" };

export interface SceneOpenResult {
  sessionId: string;
  rootPath: string;
  warnings: string[];
}

export interface ImportConfig {
  loadToScene: boolean;
  convertToSsbh: boolean;
  generateHkt: boolean;
  ssbhConfig: SsbhConvertConfig | null;
  hktSimplify: HktSimplifyConfig;
}

export interface HktCollisionPreview {
  renderTriangleCount: number;
  mergedTriangleCount: number;
  simplifiedTriangleCount: number;
  vertexCount: number;
}

export interface SsbhConvertConfig {
  baseFilename: string;
  scaleFactor: number;
  upAxis: string;
  flipUv?: boolean;
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeJnttbl: boolean;
  writeMayaProfile: boolean;
  materialTemplate: string | null;
  mayaFile?: MatlDataJson | null;
  nustFile?: MatlDataJson | null;
  numdlbEntries?: NumdlbMappingRow[];
}

export interface ImportResult {
  importId: string;
  name: string;
  ssbhGenerated: boolean;
  hktGenerated: boolean;
  hktDetail: string | null;
  warnings: string[];
}

export interface StaticMeshDirectConvertResult {
  sourcePath: string;
  outputDir: string;
  modelDir: string;
  baseFilename: string;
  ssbhGenerated: boolean;
  hktGenerated: boolean;
  filesWritten: string[];
  hktDetail: string | null;
  warnings: string[];
}

export type StaticMeshImportProgress =
  | { kind: "status"; phase: string; label: string }
  | { kind: "sourceFile"; path: string; bytes: number; format: string }
  | {
      kind: "ipcWarning";
      phase: string;
      bytes: number;
      thresholdBytes: number;
      message: string;
    }
  | {
      kind: "convertStarted";
      format: string;
      sourceName: string;
      baseFilename: string;
    }
  | { kind: "convertFinished"; totalBytes: number; fileCount: number }
  | { kind: "writeStarted"; outputDir: string; baseFilename: string }
  | { kind: "writeFinished"; fileCount: number }
  | { kind: "hktStarted"; sourceName: string }
  | { kind: "hktFinished"; bytes: number; triangleCount: number }
  | { kind: "complete" }
  | { kind: "error"; message: string };

export interface SaveResult {
  success: boolean;
  filesWritten: number;
  warnings: string[];
}

export interface ExvsStageValidationError {
  phase: string;
  message: string;
  path: string | null;
}

export interface ExvsStageValidationResult {
  valid: boolean;
  errors: ExvsStageValidationError[];
}

/**
 * Pre-flight gate: detect numatb material texture parameters whose path is empty.
 * Layout-independent — safe to run before any save/repack mutation.
 */
export function validateNumatbEmptyParams(
  stageRoot: string,
): Promise<ExvsStageValidationResult> {
  return invoke<ExvsStageValidationResult>("scene_validate_numatb_empty_params", { stageRoot });
}

/**
 * Full repack validation (structure + on-disk numatb texture existence). Assumes
 * the per-model `0//1/` texture layout, so only run after redistribute_stage_textures.
 */
export function validateStageForRepack(
  stageRoot: string,
): Promise<ExvsStageValidationResult> {
  return invoke<ExvsStageValidationResult>("exvs_stage_validate_for_repack", { stageRoot });
}

export function sceneSessionCreate(source: SceneSource): Promise<string> {
  return invoke<string>("scene_session_create", { source });
}

export function sceneSessionDestroy(sessionId: string): Promise<void> {
  return invoke<void>("scene_session_destroy", { sessionId });
}

export function sceneSessionIsDirty(sessionId: string): Promise<boolean> {
  return invoke<boolean>("scene_session_is_dirty", { sessionId });
}

export function sceneImportDae(
  sessionId: string,
  daeBytes: number[],
  name: string,
): Promise<string> {
  return invoke<string>("scene_import_dae", { sessionId, daeBytes, name });
}

export function sceneImportDaeFromPath(
  sessionId: string,
  filePath: string,
  name: string,
): Promise<string> {
  return invoke<string>("scene_import_dae_from_path", { sessionId, filePath, name });
}

export function sceneImportDaeFromPathWithProgress(
  sessionId: string,
  filePath: string,
  name: string,
  onProgress: (chunk: StaticMeshImportProgress) => void,
): Promise<string> {
  const channel = new Channel<StaticMeshImportProgress>();
  channel.onmessage = onProgress;
  return invoke<string>("scene_import_dae_from_path_streamed", {
    sessionId,
    filePath,
    name,
    onProgress: channel,
  });
}

export function sceneConfigureImport(
  sessionId: string,
  importId: string,
  config: ImportConfig,
): Promise<void> {
  return invoke<void>("scene_configure_import", { sessionId, importId, config });
}

export function sceneRemoveImport(sessionId: string, importId: string): Promise<void> {
  return invoke<void>("scene_remove_import", { sessionId, importId });
}

export function sceneRemoveHavokData(sessionId: string, sourceId: string): Promise<void> {
  return invoke<void>("scene_remove_havok_data", { sessionId, sourceId });
}

/**
 * Forget a sub-model from the in-memory session by its on-disk folder name.
 * Drops a lingering converted import so a later save commits the deletion
 * instead of re-materializing the folder. Memory-only; disk is untouched.
 * Resolves to whether the session held anything for that folder.
 */
export function sceneForgetModel(sessionId: string, folderName: string): Promise<boolean> {
  return invoke<boolean>("scene_forget_model", { sessionId, folderName });
}

/**
 * Forget the in-memory base model (root SSBH files) so a later save commits its
 * deletion. Memory-only; disk is untouched.
 */
export function sceneForgetBaseModel(sessionId: string): Promise<boolean> {
  return invoke<boolean>("scene_forget_base_model", { sessionId });
}

export function sceneExecuteImport(sessionId: string, importId: string): Promise<ImportResult> {
  return invoke<ImportResult>("scene_execute_import", {
    options: { sessionId, importId },
  });
}

export function sceneExecuteImportWithProgress(
  sessionId: string,
  importId: string,
  onProgress: (chunk: StaticMeshImportProgress) => void,
): Promise<ImportResult> {
  const channel = new Channel<StaticMeshImportProgress>();
  channel.onmessage = onProgress;
  return invoke<ImportResult>("scene_execute_import_streamed", {
    options: { sessionId, importId },
    onProgress: channel,
  });
}

export function sceneBuildImportPreviewBundle(params: {
  sessionId: string;
  importId: string;
  stageRoot?: string | null;
  sourcePath?: string | null;
}): Promise<SsbhModelPreviewBundle> {
  return invoke<SsbhModelPreviewBundle>("scene_build_import_preview_bundle", {
    sessionId: params.sessionId,
    importId: params.importId,
    stageRoot: params.stageRoot ?? null,
    sourcePath: params.sourcePath ?? null,
  });
}

export function sceneGenerateHkt(
  sessionId: string,
  importId: string,
  configProfile: string,
): Promise<boolean> {
  return invoke<boolean>("scene_generate_hkt", {
    options: { sessionId, importId, configProfile },
  });
}

export function sceneGenerateHktFromMesh(
  sessionId: string,
  folderName: string,
  hktSimplify: HktSimplifyConfig,
): Promise<boolean> {
  return invoke<boolean>("scene_generate_hkt_from_mesh", {
    options: { sessionId, folderName, hktSimplify },
  });
}

export function sceneReplaceHkt(
  sessionId: string,
  importId: string,
  hktPath: string,
): Promise<boolean> {
  return invoke<boolean>("scene_replace_hkt", {
    options: { sessionId, importId, hktPath },
  });
}

export interface HktCollisionMeshGeometry {
  /** Flattened [x, y, z, ...] collision-space vertex positions. */
  positions: Float32Array;
  /** Triangle list indices (length divisible by 3). */
  indices: Uint32Array;
  triangleCount: number;
  vertexCount: number;
  renderTriangleCount: number;
  mergedTriangleCount: number;
}

/**
 * Light header returned by `scene_preview_hkt_collision_mesh_path`: collision stats plus
 * the registry id of the packed geometry buffer (positions `f32` LE, then indices `u32`
 * LE), fetched separately via `take_mesh_geometry`.
 */
interface HktCollisionMeshGeometryHeader {
  binary: true;
  geometryId: string;
  vertexCount: number;
  indexCount: number;
  triangleCount: number;
  renderTriangleCount: number;
  mergedTriangleCount: number;
}

/**
 * Build the simplified collision mesh geometry for a freshly-selected DAE/FBX
 * (skin-bake → merge → simplify only, no Havok), for a live 3D collision
 * preview before the HKT is generated and applied.
 *
 * Geometry travels as a binary blob over the IPC side-channel (the same path the SSBH
 * model loader uses) rather than a JSON number array: the command returns a light header
 * and the packed buffer is fetched once via `take_mesh_geometry`, then sliced into
 * typed-array views with no `JSON.parse` of float arrays.
 */
export async function scenePreviewHktCollisionMeshPath(
  filePath: string,
  sourceName: string,
  config: ImportConfig,
): Promise<HktCollisionMeshGeometry> {
  const header = await invoke<HktCollisionMeshGeometryHeader>(
    "scene_preview_hkt_collision_mesh_path",
    { filePath, sourceName, config },
  );
  const buffer = await invoke<ArrayBuffer>("take_mesh_geometry", {
    geometryId: header.geometryId,
  });
  return {
    positions: new Float32Array(buffer, 0, header.vertexCount * 3),
    indices: new Uint32Array(buffer, header.vertexCount * 3 * 4, header.indexCount),
    triangleCount: header.triangleCount,
    vertexCount: header.vertexCount,
    renderTriangleCount: header.renderTriangleCount,
    mergedTriangleCount: header.mergedTriangleCount,
  };
}

/**
 * Generate a mesh-accurate HKT from a newly-selected DAE/FBX and apply it onto
 * the target import — the "generate HKT from a new model" replace flow.
 */
export interface GeneratedHktFromDaePayload {
  hktBytes: number[];
  triangleCount: number;
  /** Havok-decoded XML; matches what the scene collision overlay renders. */
  hktXml: string;
}

/** Generate HKT bytes from a model path without applying to the session. */
export function sceneGenerateReplacementHktFromDaePath(
  filePath: string,
  sourceName: string,
  config: ImportConfig,
): Promise<GeneratedHktFromDaePayload> {
  return invoke<GeneratedHktFromDaePayload>("scene_generate_replacement_hkt_from_dae_path", {
    filePath,
    sourceName,
    config,
  });
}

/** Apply pre-generated HKT bytes to a session import (no regeneration). */
export function sceneApplyReplacementHktBytes(
  sessionId: string,
  importId: string,
  hktBytes: number[],
  displayName: string,
): Promise<boolean> {
  return invoke<boolean>("scene_apply_replacement_hkt_bytes", {
    options: { sessionId, importId, hktBytes, displayName },
  });
}

export function sceneReplaceHktFromDaePath(
  sessionId: string,
  importId: string,
  filePath: string,
  sourceName: string,
  config: ImportConfig,
): Promise<boolean> {
  return invoke<boolean>("scene_replace_hkt_from_dae_path", {
    options: { sessionId, importId, filePath, sourceName, config },
  });
}

export function scenePreviewHktCollisionBytes(
  daeBytes: number[],
  sourceName: string,
  config: ImportConfig,
): Promise<HktCollisionPreview> {
  return invoke<HktCollisionPreview>("scene_preview_hkt_collision_bytes", {
    args: { daeBytes, sourceName, config },
  });
}

export function scenePreviewHktCollisionPath(
  filePath: string,
  sourceName: string,
  config: ImportConfig,
): Promise<HktCollisionPreview> {
  return invoke<HktCollisionPreview>("scene_preview_hkt_collision_path", {
    filePath,
    sourceName,
    config,
  });
}

export function scenePreviewHktCollisionSession(
  sessionId: string,
  importId: string,
  config: ImportConfig,
): Promise<HktCollisionPreview> {
  return invoke<HktCollisionPreview>("scene_preview_hkt_collision_session", {
    args: { sessionId, importId, config },
  });
}

export function sceneGetImportConfig(
  sessionId: string,
  importId: string,
): Promise<ImportConfig> {
  return invoke<ImportConfig>("scene_get_import_config", {
    options: { sessionId, importId },
  });
}

export function sceneConvertStaticMeshToStageFiles(params: {
  sourcePath: string;
  outputDir: string;
  config: ImportConfig;
}): Promise<StaticMeshDirectConvertResult> {
  return invoke<StaticMeshDirectConvertResult>("scene_convert_static_mesh_to_stage_files", {
    options: params,
  });
}

export function sceneConvertStaticMeshToStageFilesWithProgress(
  params: {
    sourcePath: string;
    outputDir: string;
    config: ImportConfig;
  },
  onProgress: (chunk: StaticMeshImportProgress) => void,
): Promise<StaticMeshDirectConvertResult> {
  const channel = new Channel<StaticMeshImportProgress>();
  channel.onmessage = onProgress;
  return invoke<StaticMeshDirectConvertResult>("scene_convert_static_mesh_to_stage_files_streamed", {
    options: params,
    onProgress: channel,
  });
}

export interface HavokDataMeta {
  sourceId: string;
  displayName: string;
  objectNodeId: string | null;
  hktXml: string;
}

export function sceneGetHavokMeta(
  sessionId: string,
  sourceId: string,
): Promise<HavokDataMeta | null> {
  return invoke<HavokDataMeta | null>("scene_get_havok_meta", { sessionId, sourceId });
}

export function sceneListHavokMeta(sessionId: string): Promise<HavokDataMeta[]> {
  return invoke<HavokDataMeta[]>("scene_list_havok_meta", { sessionId });
}

export function sceneGetHavokRawBytes(
  sessionId: string,
  sourceId: string,
): Promise<ArrayBuffer> {
  return invoke<ArrayBuffer>("scene_get_havok_raw_bytes", { sessionId, sourceId });
}

export function sceneSaveAsFolder(sessionId: string, outputPath: string): Promise<SaveResult> {
  return invoke<SaveResult>("scene_save_as_folder", { sessionId, outputPath });
}

export function sceneRepackInPlace(sessionId: string): Promise<SaveResult> {
  return invoke<SaveResult>("scene_repack_in_place", { sessionId });
}

export function convertHktToXml(inputPath: string, outputPath: string): Promise<string> {
  return invoke<string>("convert_hkt_to_xml", { inputPath, outputPath });
}

export function convertXmlToHkt(inputPath: string, outputPath: string): Promise<string> {
  return invoke<string>("convert_xml_to_hkt", { inputPath, outputPath });
}

export function sceneListImports(sessionId: string): Promise<ImportResult[]> {
  return invoke<ImportResult[]>("scene_list_imports", { sessionId });
}

export function sceneOpenFolder(path: string): Promise<SceneOpenResult> {
  return invoke<SceneOpenResult>("scene_open_folder", { path });
}

export interface SubModelManifestEntry {
  folderName: string;
  objectIndex: number;
}

export interface StageSkeleton {
  rootPath: string;
  placementHeader: string[];
  placementEntries: Array<{
    vdkType: string;
    objectNumber: number | null;
    posX: number;
    posY: number;
    posZ: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    scaleX: number;
    scaleY: number;
    scaleZ: number;
    rawFields: string[];
  }>;
  graphicParams: Array<{ key: string; value: string }>;
  subModelManifest: SubModelManifestEntry[];
  hasBaseModel: boolean;
  warnings: string[];
}

export type StageStreamChunk =
  | { kind: "baseModel"; bundle: SsbhModelPreviewBundle }
  | { kind: "subModel"; folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }
  | { kind: "progress"; loaded: number; total: number }
  | { kind: "complete"; totalModels: number; elapsedMs: number }
  | { kind: "error"; message: string; folderName: string | null };

export function stageLoadSkeleton(stageRoot: string): Promise<StageSkeleton> {
  return invoke<StageSkeleton>("stage_load_skeleton", { stageRoot });
}

/** Reload a single model slot from disk after out-of-scene replace (avoids large IPC import). */
export function stageLoadModelSlotBundle(
  stageRoot: string,
  folderName: string,
): Promise<SsbhModelPreviewBundle> {
  return invoke<SsbhModelPreviewBundle>("stage_load_model_slot_bundle", {
    stageRoot,
    folderName,
  });
}

export function stageStreamBundles(
  stageRoot: string,
  onChunk: (chunk: StageStreamChunk) => void,
): Promise<void> {
  const channel = new Channel<StageStreamChunk>();
  channel.onmessage = onChunk;
  return invoke<void>("stage_stream_bundles", { stageRoot, onChunk: channel });
}

export function mapDaeImportConfigToBackend(config: DaeImportConfig): ImportConfig {
  const needsAxis = config.convertToSsbh || config.generateHkt;
  return {
    loadToScene: config.loadToScene,
    convertToSsbh: config.convertToSsbh,
    generateHkt: config.generateHkt,
    hktSimplify: normalizeHktSimplifyConfig(config.hktSimplify ?? DEFAULT_HKT_SIMPLIFY),
    ssbhConfig: needsAxis
      ? {
          baseFilename: config.ssbhConfig.baseFilename,
          scaleFactor: config.ssbhConfig.scaleFactor,
          upAxis: config.ssbhConfig.upAxis,
          flipUv: config.ssbhConfig.flipUv ?? false,
          writeNumdlb: config.convertToSsbh && config.ssbhConfig.writeNumdlb,
          writeNumshb: config.convertToSsbh && config.ssbhConfig.writeNumshb,
          writeNusktb: config.convertToSsbh && config.ssbhConfig.writeNusktb,
          writeNumatb: config.convertToSsbh && config.ssbhConfig.writeNumatb,
          writeJnttbl: config.convertToSsbh && config.ssbhConfig.writeJnttbl,
          writeMayaProfile: config.convertToSsbh && config.ssbhConfig.writeMayaProfile,
          materialTemplate: config.convertToSsbh
            ? config.ssbhConfig.materialTemplate || null
            : null,
          mayaFile:
            config.convertToSsbh && config.ssbhConfig.writeMayaProfile
              ? config.ssbhConfig.mayaFile ?? null
              : null,
          nustFile:
            config.convertToSsbh && config.ssbhConfig.writeNumatb
              ? config.ssbhConfig.nustFile ?? null
              : null,
        }
      : null,
  };
}
