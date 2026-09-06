import { Fhm2d_type_format } from "@/models/fhm2d";
import {
  getWorkspaceContentDescriptor,
  resolveWorkspaceContent,
  type WorkspaceContentId,
} from "./contentCatalog";
import type { TestEditorWorkspaceDocument } from "./types";
import { renameExtractPayloads, type RenameExtractPayloadsResult } from "./renameExtractPayloads";

export const FHM2D_INIT_CONTENT_BY_ITEM_ID: Record<string, WorkspaceContentId> = {
  character_id_table: "character-id-table",
  character_list: "character-list",
  series_list: "series-list",
  navi_list: "navi-list",
  bgm_list: "bgm-list",
  stage_list: "stage-list",
  stage_image_list: "stage-icons-primary",
  stage_image_list_2: "stage-icons-secondary",
  series_image_list: "series-icons",
  card_icon_list: "card-icons",
  character_cost: "character-cost",
  striker_table: "striker-table",
  raw_path_id: "raw-path-id",
  pilot_voice_resource: "pilot-voice-resource",
  bgm_table: "bgm-table",
  bgm_bank_update_02: "bgm-bank-update-02",
  exvs_common_camera: "camera-table",
};

/** Init modal items that extract via initWorkspaceContentPack (no dedicated init*Pack). */
export const GENERIC_FHM2D_INIT_ITEM_IDS = new Set([
  "character_id_table",
  "character_list",
  "series_list",
  "stage_list",
  "character_cost",
  "stage_image_list",
  "stage_image_list_2",
  "series_image_list",
  "card_icon_list",
]);

export const CHARACTER_COST_PAYLOAD_NAMES = [
  "foroutgamecharacterparam_playable.bin",
  "foroutgamecharacterparam_boss.bin",
  "foroutgamecharacterparam_zako.bin",
] as const;

export const CHARACTER_PARAM_PAYLOAD_NAMES = [
  "grapparam.bin",
  "projectile_depiction_table.bin",
  "chrsysparam.csyspm",
  "characterparam.bin",
  "interactionid.bin",
  "hitgroupiddef.bin",
  "bulletparam.bin",
  "speedparam.bin",
  "armsparam.bin",
] as const;

export type WorkspaceContentExtractSpec = {
  contentId: WorkspaceContentId;
  format: Fhm2d_type_format;
  listOutputFileName?: string;
};

const WORKSPACE_CONTENT_EXTRACT_FORMAT: Partial<Record<WorkspaceContentId, Fhm2d_type_format>> = {
  "character-id-table": Fhm2d_type_format.fhm2d_list,
  "character-list": Fhm2d_type_format.fhm2d_list,
  "series-list": Fhm2d_type_format.fhm2d_list,
  "navi-list": Fhm2d_type_format.fhm2d_list,
  "bgm-list": Fhm2d_type_format.fhm2d_list,
  "stage-list": Fhm2d_type_format.fhm2d_stage_list,
  "character-cost": Fhm2d_type_format.fhm2d_character_cost,
  "striker-table": Fhm2d_type_format.fhm2d_striker_table,
  "card-icons": Fhm2d_type_format.fhm2d_all_nutexb,
  "series-icons": Fhm2d_type_format.fhm2d_all_nutexb,
  "stage-icons-primary": Fhm2d_type_format.fhm2d_all_nutexb,
  "stage-icons-secondary": Fhm2d_type_format.fhm2d_all_nutexb,
  "raw-path-id": Fhm2d_type_format.fhm2d_sound,
  "pilot-voice-resource": Fhm2d_type_format.fhm2d_sound,
  "bgm-table": Fhm2d_type_format.fhm2d_sound,
  "bgm-bank-update-02": Fhm2d_type_format.fhm2d_sound,
};

export function workspaceContentExtractSpec(
  contentId: WorkspaceContentId,
): WorkspaceContentExtractSpec | null {
  const format = WORKSPACE_CONTENT_EXTRACT_FORMAT[contentId];
  if (!format) return null;
  const relativeFilePath = getWorkspaceContentDescriptor(contentId).relativeFilePath;
  const listOutputFileName =
    (format === Fhm2d_type_format.fhm2d_list || format === Fhm2d_type_format.fhm2d_stage_list) &&
    relativeFilePath &&
    !relativeFilePath.includes("/")
      ? relativeFilePath
      : undefined;
  return { contentId, format, listOutputFileName };
}

export function payloadNamesForContent(contentId: WorkspaceContentId): string[] | null {
  if (contentId === "character-cost") {
    return [...CHARACTER_COST_PAYLOAD_NAMES];
  }
  const relativeFilePath = getWorkspaceContentDescriptor(contentId).relativeFilePath;
  if (!relativeFilePath || relativeFilePath.includes("/")) {
    return null;
  }
  return [relativeFilePath];
}

export function buildWorkspaceContentSourceFhm2dPath(
  dplCacheDir: string,
  contentId: WorkspaceContentId,
): string {
  const base = dplCacheDir.trim().replace(/[\\/]+$/g, "");
  if (!base) return "";
  return `${base}\\${getWorkspaceContentDescriptor(contentId).hashHex}.fhm2d`;
}

export async function renameCatalogContentPayloads(input: {
  contentId: WorkspaceContentId;
  workspaceRoot: string;
  workspaceDocument: TestEditorWorkspaceDocument;
}): Promise<RenameExtractPayloadsResult> {
  const names = payloadNamesForContent(input.contentId);
  if (!names) {
    throw new Error(`No indexed 0.bin rename table for ${input.contentId}`);
  }
  const content = await resolveWorkspaceContent(
    input.workspaceRoot,
    input.workspaceDocument,
    input.contentId,
  );
  const pack = content.existing ?? content.configured;
  return renameExtractPayloads({
    folderPath: pack.folderPath,
    names,
    structureJsonPath: pack.structureJsonPath,
  });
}

export function characterParamFileNameForKind(kindId: string): string | null {
  switch (kindId) {
    case "grapparam":
      return "grapparam.bin";
    case "projectile_depiction_table":
      return "projectile_depiction_table.bin";
    case "chrsysparam":
      return "chrsysparam.csyspm";
    case "characterparam":
      return "characterparam.bin";
    case "interactionid":
      return "interactionid.bin";
    case "hitgroupiddef":
      return "hitgroupiddef.bin";
    case "bulletparam":
      return "bulletparam.bin";
    case "speedparam":
      return "speedparam.bin";
    case "armsparam":
      return "armsparam.bin";
    default:
      return null;
  }
}
