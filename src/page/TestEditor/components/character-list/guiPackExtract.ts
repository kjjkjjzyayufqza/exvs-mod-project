import { invoke } from "@tauri-apps/api/core";

import type { WorkspaceGuiPack } from "./guiPackIndex";

export type ExtractWorkspaceGuiPackRequest = {
  dplCachePath: string;
  workspaceRoot: string;
  obModPath: string | null;
  hash: number;
  packagePath: string;
  structureName: string;
};

export async function extractWorkspaceGuiPack(
  request: ExtractWorkspaceGuiPackRequest,
): Promise<WorkspaceGuiPack> {
  return invoke<WorkspaceGuiPack>("extract_workspace_gui_pack", { request });
}
