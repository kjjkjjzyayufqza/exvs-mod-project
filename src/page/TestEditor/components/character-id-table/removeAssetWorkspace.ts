import { invoke } from "@tauri-apps/api/core";

export type RemoveAssetTargets = {
  workspaceRoot?: string;
  extractOutputRoot?: string;
  modDirectory?: string;
};

export type RemoveAssetWorkspaceParams = {
  hashHex: string;
  targets: RemoveAssetTargets;
};

export async function removeAssetWorkspace(params: RemoveAssetWorkspaceParams): Promise<void> {
  await invoke("remove_asset_workspace", {
    hashHex: params.hashHex,
    targets: params.targets,
  });
}
