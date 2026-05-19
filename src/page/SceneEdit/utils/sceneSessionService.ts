import { invoke } from "@tauri-apps/api/core";
import type { DaeImportConfig } from "../components/dae-import/daeImportTypes";

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
}

export interface SaveResult {
  success: boolean;
  filesWritten: number;
  warnings: string[];
}

export interface HavokDataResult {
  sourceId: string;
  hktXml: string;
  rawBytes: number[];
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

export function sceneGetHavokData(
  sessionId: string,
  sourceId: string,
): Promise<HavokDataResult | null> {
  return invoke<HavokDataResult | null>("scene_get_havok_data", { sessionId, sourceId });
}

export function sceneListHavokData(sessionId: string): Promise<HavokDataResult[]> {
  return invoke<HavokDataResult[]>("scene_list_havok_data", { sessionId });
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

export function mapDaeImportConfigToBackend(config: DaeImportConfig): ImportConfig {
  return {
    loadToScene: config.loadToScene,
    convertToSsbh: config.convertToSsbh,
    generateHkt: config.generateHkt,
    ssbhConfig: config.convertToSsbh
      ? {
          baseFilename: config.ssbhConfig.baseFilename,
          scaleFactor: config.ssbhConfig.scaleFactor,
          upAxis: config.ssbhConfig.upAxis,
          writeNumdlb: config.ssbhConfig.writeNumdlb,
          writeNumshb: config.ssbhConfig.writeNumshb,
          writeNusktb: config.ssbhConfig.writeNusktb,
          writeNumatb: config.ssbhConfig.writeNumatb,
          writeJnttbl: config.ssbhConfig.writeJnttbl,
          writeMayaProfile: config.ssbhConfig.writeMayaProfile,
          materialTemplate: config.ssbhConfig.materialTemplate || null,
        }
      : null,
  };
}
