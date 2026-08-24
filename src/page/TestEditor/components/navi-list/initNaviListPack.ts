import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType } from "@/models/fhm2d";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

export const NAVI_LIST_PACK_HASH = "0x6FCC0FBA";

export type InitNaviListPackInput = {
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
};

export function buildNaviListSourceFhm2dPath(dplCacheDir: string): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${NAVI_LIST_PACK_HASH}.fhm2d`;
}

export async function initNaviListPack(input: InitNaviListPackInput) {
  const sourceFhm2dPath = input.sourceFhm2dPath.trim();
  const workspaceRoot = input.workspaceRoot.trim();
  if (!sourceFhm2dPath) throw new Error("Source FHM2D path is required");
  if (!workspaceRoot) throw new Error("Test Editor workspace root is required");
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }

  const content = await resolveWorkspaceContent(
    workspaceRoot,
    input.workspaceDocument ?? DEFAULT_TEST_EDITOR_WORKSPACE,
    "navi-list",
  );
  const pack = content.configured;
  const extractResult = await ExtractFHMData(sourceFhm2dPath, pack.folderPath, ExtractType.SingleFolder);
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }
  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    filePath: content.configured.filePath,
  };
}
