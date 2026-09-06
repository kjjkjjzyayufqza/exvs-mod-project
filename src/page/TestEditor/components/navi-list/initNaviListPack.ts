import { exists } from "@tauri-apps/plugin-fs";
import { Fhm2d_type_format } from "@/models/fhm2d";
import { initWorkspaceContentPack } from "@/services/testEditorWorkspace/initWorkspaceContentPack";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

export const NAVI_LIST_PACK_HASH = "0x6FCC0FBA";
export const NAVI_LIST_FILE_NAME = "navi_list.bin";

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
  if (!workspaceRoot) throw new Error("EXVS2 Workspace root is required");
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }

  const result = await initWorkspaceContentPack({
    contentId: "navi-list",
    sourceFhm2dPath,
    workspaceRoot,
    workspaceDocument: input.workspaceDocument,
  });
  return {
    ...result,
    format: Fhm2d_type_format.fhm2d_list,
    fileName: NAVI_LIST_FILE_NAME,
  };
}
