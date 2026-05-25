import { invoke, Channel } from "@tauri-apps/api/core";
import type { DaeImportConfig, HktSimplifyConfig } from "../components/dae-import/daeImportTypes";
import { DEFAULT_HKT_SIMPLIFY } from "./hktSimplifyUtils";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";

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
  writeNumdlb: boolean;
  writeNumshb: boolean;
  writeNusktb: boolean;
  writeNumatb: boolean;
  writeJnttbl: boolean;
  writeMayaProfile: boolean;
  materialTemplate: string | null;
}

export interface ImportResult {
  importId: string;
  name: string;
  ssbhGenerated: boolean;
  hktGenerated: boolean;
  hktDetail: string | null;
  warnings: string[];
}

export interface SaveResult {
  success: boolean;
  filesWritten: number;
  warnings: string[];
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

export function sceneExecuteImport(sessionId: string, importId: string): Promise<ImportResult> {
  return invoke<ImportResult>("scene_execute_import", {
    options: { sessionId, importId },
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
    hktSimplify: config.hktSimplify ?? { ...DEFAULT_HKT_SIMPLIFY },
    ssbhConfig: needsAxis
      ? {
          baseFilename: config.ssbhConfig.baseFilename,
          scaleFactor: config.ssbhConfig.scaleFactor,
          upAxis: config.ssbhConfig.upAxis,
          writeNumdlb: config.convertToSsbh && config.ssbhConfig.writeNumdlb,
          writeNumshb: config.convertToSsbh && config.ssbhConfig.writeNumshb,
          writeNusktb: config.convertToSsbh && config.ssbhConfig.writeNusktb,
          writeNumatb: config.convertToSsbh && config.ssbhConfig.writeNumatb,
          writeJnttbl: config.convertToSsbh && config.ssbhConfig.writeJnttbl,
          writeMayaProfile: config.convertToSsbh && config.ssbhConfig.writeMayaProfile,
          materialTemplate: config.convertToSsbh
            ? config.ssbhConfig.materialTemplate || null
            : null,
        }
      : null,
  };
}
