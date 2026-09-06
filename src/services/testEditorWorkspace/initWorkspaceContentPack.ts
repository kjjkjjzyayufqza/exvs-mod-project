import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType } from "@/models/fhm2d";
import { resolveWorkspaceContent, type WorkspaceContentId } from "./contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "./defaults";
import type { TestEditorWorkspaceDocument } from "./types";
import {
  buildWorkspaceContentSourceFhm2dPath,
  workspaceContentExtractSpec,
} from "./workspaceContentExtract";

export type InitWorkspaceContentPackInput = {
  contentId: WorkspaceContentId;
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
};

export type InitWorkspaceContentPackResult = {
  folderPath: string;
  structureJsonPath: string;
  filePath: string | null;
};

export async function initWorkspaceContentPack(
  input: InitWorkspaceContentPackInput,
): Promise<InitWorkspaceContentPackResult> {
  const sourceFhm2dPath = input.sourceFhm2dPath.trim();
  const workspaceRoot = input.workspaceRoot.trim();
  if (!sourceFhm2dPath) throw new Error("Source FHM2D path is required");
  if (!workspaceRoot) throw new Error("EXVS2 Workspace root is required");
  if (!(await exists(sourceFhm2dPath))) {
    throw new Error(`Source FHM2D not found: ${sourceFhm2dPath}`);
  }

  const spec = workspaceContentExtractSpec(input.contentId);
  if (!spec) {
    throw new Error(`No extract format configured for ${input.contentId}`);
  }

  const content = await resolveWorkspaceContent(
    workspaceRoot,
    input.workspaceDocument ?? DEFAULT_TEST_EDITOR_WORKSPACE,
    input.contentId,
  );
  const pack = content.configured;
  const extractResult = await ExtractFHMData(
    sourceFhm2dPath,
    pack.folderPath,
    ExtractType.SingleFolder,
    spec.format,
    spec.listOutputFileName,
  );
  if (extractResult.namingError) {
    throw new Error(extractResult.namingError);
  }
  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    filePath: pack.filePath,
  };
}

export async function initCatalogContentFromDplCache(input: {
  contentId: WorkspaceContentId;
  dplCacheDir: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
}): Promise<InitWorkspaceContentPackResult> {
  const sourceFhm2dPath = buildWorkspaceContentSourceFhm2dPath(input.dplCacheDir, input.contentId);
  if (!sourceFhm2dPath) {
    throw new Error("Source FHM2D path is required");
  }
  return initWorkspaceContentPack({
    contentId: input.contentId,
    sourceFhm2dPath,
    workspaceRoot: input.workspaceRoot,
    workspaceDocument: input.workspaceDocument,
  });
}
