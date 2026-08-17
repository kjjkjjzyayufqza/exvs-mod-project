import { exists } from "@tauri-apps/plugin-fs";
import { getAssetRefInfo, int32ToHashHex } from "@/page/TestEditor/components/character-id-table/assetRef";
import { getStageFileNamePaths } from "@/page/TestEditor/components/stage-list/stageFileNameRef";
import { resolveWorkspaceRouteRoot } from "@/services/testEditorWorkspace/paths";
import type { ResourceRegistryCategory } from "./types";
import { UNIT_SLOT_TO_FIELD_KEY } from "./types";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";

export interface ResourcePathProbe {
  hashInt32: number;
  hashHex: string;
  obExists: boolean;
  modExists: boolean;
  workspaceExists: boolean;
}

export async function probeResourcePaths(params: {
  category: ResourceRegistryCategory;
  slot: string;
  hashInt32: number;
  obDplCachePath: string;
  obModPath: string;
  workspacePath: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
}): Promise<ResourcePathProbe> {
  const { category, slot, hashInt32, obDplCachePath, obModPath, workspacePath, workspaceDocument } = params;

  if (category === "stage") {
    const stageRouteRoot = workspaceDocument
      ? await resolveWorkspaceRouteRoot(workspacePath, workspaceDocument, "stage.model")
      : workspacePath;
    const paths = await getStageFileNamePaths(
      hashInt32,
      obDplCachePath,
      obModPath,
      stageRouteRoot,
    );
    const [obExists, modExists, workspaceExists] = await Promise.all([
      paths.obFilePath ? exists(paths.obFilePath) : Promise.resolve(false),
      paths.modFilePath ? exists(paths.modFilePath) : Promise.resolve(false),
      paths.wsFolderPath ? exists(paths.wsFolderPath) : Promise.resolve(false),
    ]);
    return { hashInt32, hashHex: paths.hashHex, obExists, modExists, workspaceExists };
  }

  if (category === "unit") {
    const fieldKey = UNIT_SLOT_TO_FIELD_KEY[slot] ?? slot;
    const info = workspaceDocument
      ? await getAssetRefInfo({
          fieldKey,
          value: hashInt32,
          obDplCachePath,
          obModPath,
          workspaceRoot: workspacePath,
          workspaceDocument,
        })
      : await getAssetRefInfo(
          fieldKey,
          hashInt32,
          obDplCachePath,
          obModPath,
          workspacePath,
        );
    return {
      hashInt32,
      hashHex: info.hashHex,
      obExists: Boolean(info.sourceExists),
      modExists: Boolean(info.modExists),
      workspaceExists: Boolean(info.workspaceExists),
    };
  }

  const hashHex = int32ToHashHex(hashInt32);
  return {
    hashInt32,
    hashHex,
    obExists: false,
    modExists: false,
    workspaceExists: false,
  };
}

export function isApplyCollision(probe: ResourcePathProbe): boolean {
  return probe.modExists || probe.workspaceExists;
}
