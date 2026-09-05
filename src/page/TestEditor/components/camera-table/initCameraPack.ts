import { exists } from "@tauri-apps/plugin-fs";
import { extractExvsCommonBundle } from "@/page/UnitModelEdit/utils/exvsCommonService";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import {
  CAMERA_TABLE_DEFAULT_FAMILY,
  CAMERA_TABLE_PACK_HASH,
  cameraTableFilePath,
  parseCameraTablePack,
  type CameraTableFamily,
} from "./cameraTableDocument";

export type InitCameraPackInput = {
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
  overwrite?: boolean;
};

export function buildCameraTableSourceFhm2dPath(dplCacheDir: string): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${CAMERA_TABLE_PACK_HASH}.fhm2d`;
}

function dplCacheFromSourceFhm2d(sourceFhm2dPath: string): string {
  return sourceFhm2dPath.trim().replace(/[\\/]+[^\\/]+$/, "");
}

export async function initCameraPack(input: InitCameraPackInput) {
  const sourceFhm2dPath = input.sourceFhm2dPath.trim();
  const workspaceRoot = input.workspaceRoot.trim();
  if (!sourceFhm2dPath) throw new Error("Source FHM2D path is required");
  if (!workspaceRoot) throw new Error("EXVS2 Workspace root is required");
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }

  const content = await resolveWorkspaceContent(
    workspaceRoot,
    input.workspaceDocument ?? DEFAULT_TEST_EDITOR_WORKSPACE,
    "camera-table",
  );
  const pack = content.configured;
  const family: CameraTableFamily = CAMERA_TABLE_DEFAULT_FAMILY;
  const existingFile = pack.filePath || (await cameraTableFilePath(pack.folderPath, family));
  if (!input.overwrite && (await exists(existingFile)) && (await exists(pack.structureJsonPath))) {
    const parsed = await parseCameraTablePack(pack.folderPath, family);
    return {
      folderPath: pack.folderPath,
      structureJsonPath: pack.structureJsonPath,
      filePath: parsed.filePath ?? existingFile,
    };
  }

  try {
    await extractExvsCommonBundle({
      extractOutputPath: workspaceRoot,
      obDplCachePath: dplCacheFromSourceFhm2d(sourceFhm2dPath),
      overwrite: Boolean(input.overwrite),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const alreadyThere = await exists(existingFile);
    if (!alreadyThere) throw new Error(message);
  }

  const parsed = await parseCameraTablePack(pack.folderPath, family);
  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    filePath: parsed.filePath ?? existingFile,
  };
}
