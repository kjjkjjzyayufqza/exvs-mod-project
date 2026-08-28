import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { parseRawPathIdPack, RAW_PATH_ID_PACK_HASH } from "./rawPathIdDocument";

export type InitRawPathIdPackInput = {
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
};

export type InitRawPathIdPackResult = {
  folderPath: string;
  structureJsonPath: string;
  jsonPath: string;
  vgsht1Path: string;
};

export function buildRawPathIdSourceFhm2dPath(dplCacheDir: string): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${RAW_PATH_ID_PACK_HASH}.fhm2d`;
}

export async function initRawPathIdPack(input: InitRawPathIdPackInput): Promise<InitRawPathIdPackResult> {
  const sourceFhm2dPath = input.sourceFhm2dPath.trim();
  const workspaceRoot = input.workspaceRoot.trim();
  if (!sourceFhm2dPath) {
    throw new Error("Source FHM2D path is required");
  }
  if (!workspaceRoot) {
    throw new Error("EXVS2 Workspace root is required");
  }
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }

  const content = await resolveWorkspaceContent(
    workspaceRoot,
    input.workspaceDocument ?? DEFAULT_TEST_EDITOR_WORKSPACE,
    "raw-path-id",
  );
  const pack = content.configured;

  const extractResult = await ExtractFHMData(
    sourceFhm2dPath,
    pack.folderPath,
    ExtractType.SingleFolder,
    Fhm2d_type_format.fhm2d_sound,
  );
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }

  const parsed = await parseRawPathIdPack(pack.folderPath);
  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    jsonPath: parsed.jsonPath,
    vgsht1Path: parsed.vgsht1Path,
  };
}
