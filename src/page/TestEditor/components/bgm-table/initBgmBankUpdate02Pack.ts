import { exists } from "@tauri-apps/plugin-fs";
import { ExtractFHMData, ExtractType, Fhm2d_type_format } from "@/models/fhm2d";
import { resolveWorkspaceContent } from "@/services/testEditorWorkspace/contentCatalog";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import type { TestEditorWorkspaceDocument } from "@/services/testEditorWorkspace/types";
import { BGM_BANK_UPDATE_02_PACK_HASH } from "./bgmTableDocument";

export type InitBgmBankUpdate02PackInput = {
  sourceFhm2dPath: string;
  workspaceRoot: string;
  workspaceDocument?: TestEditorWorkspaceDocument;
};

export function buildBgmBankUpdate02SourceFhm2dPath(dplCacheDir: string): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${BGM_BANK_UPDATE_02_PACK_HASH}.fhm2d`;
}

export async function initBgmBankUpdate02Pack(input: InitBgmBankUpdate02PackInput) {
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
    "bgm-bank-update-02",
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
  return {
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
  };
}
