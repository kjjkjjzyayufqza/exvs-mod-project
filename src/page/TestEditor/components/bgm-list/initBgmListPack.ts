import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import {
  BGM_LIST_FILE_NAME,
  BGM_LIST_PACK_HASH,
  parseBgmListPack,
} from "./bgmListDocument";

export type InitBgmListPackInput = {
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
};

export function buildBgmListSourceFhm2dPath(dplCacheDir: string): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${BGM_LIST_PACK_HASH}.fhm2d`;
}

export async function initBgmListPack(input: InitBgmListPackInput) {
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
    "bgm-list",
  );
  const pack = content.configured;
  const extractResult = await ExtractFHMData(
    sourceFhm2dPath,
    pack.folderPath,
    ExtractType.SingleFolder,
    Fhm2d_type_format.fhm2d_list,
    BGM_LIST_FILE_NAME,
  );
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }
  const parsed = await parseBgmListPack(pack.folderPath);
  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    filePath: parsed.filePath,
  };
}
