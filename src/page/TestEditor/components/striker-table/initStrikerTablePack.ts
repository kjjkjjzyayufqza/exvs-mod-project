import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import { loadTestEditorWorkspace } from "@/services/testEditorWorkspace/persistence";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import {
  STRIKER_TABLE_PACK_HASH,
  findStrikerTableFile,
} from "./strikerTableDocument";

export type InitStrikerTablePackInput = {
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
};

export type InitStrikerTablePackResult = {
  folderPath: string;
  structureJsonPath: string;
  filePath: string | null;
};

export function buildStrikerTableSourceFhm2dPath(dplCacheDir: string): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${STRIKER_TABLE_PACK_HASH}.fhm2d`;
}

export async function initStrikerTablePack(
  input: InitStrikerTablePackInput,
): Promise<InitStrikerTablePackResult> {
  const sourceFhm2dPath = input.sourceFhm2dPath.trim();
  const workspaceRoot = input.workspaceRoot.trim();
  if (!sourceFhm2dPath) throw new Error("Source FHM2D path is required");
  if (!workspaceRoot) throw new Error("EXVS2 Workspace root is required");
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }

  const workspaceDocument =
    input.workspaceDocument ??
    (await loadTestEditorWorkspace(workspaceRoot)).document ??
    DEFAULT_TEST_EDITOR_WORKSPACE;
  const content = await resolveWorkspaceContent(
    workspaceRoot,
    workspaceDocument,
    "striker-table",
  );
  const pack = content.configured;
  const extractResult = await ExtractFHMData(
    sourceFhm2dPath,
    pack.folderPath,
    ExtractType.SingleFolder,
    Fhm2d_type_format.fhm2d_striker_table,
  );
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }

  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    filePath: (await findStrikerTableFile(pack.folderPath)) ?? content.configured.filePath,
  };
}
