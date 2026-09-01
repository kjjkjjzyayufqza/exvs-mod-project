import { join } from "@tauri-apps/api/path";
import { suggestFhm2dStructureName } from "@/utils/fhm2dNameMapping";
import { resolveExistingFhm2dPack, type ResolvedFhm2dPackPaths } from "./paths";
import type {
  TestEditorWorkspaceDocument,
  WorkspaceAssetRouteId,
  WorkspacePackIdentity,
} from "./types";

export const WORKSPACE_CONTENT_CATALOG = Object.freeze({
  "character-id-table": {
    id: "character-id-table",
    routeId: "list.character",
    hashHex: "0x036B9E67",
    relativeFilePath: "character_id_table.bin",
    label: "Character ID Table",
  },
  "character-list": {
    id: "character-list",
    routeId: "list.character",
    hashHex: "0xDFD38C70",
    relativeFilePath: "character_list.bin",
    label: "Character List",
  },
  "series-list": {
    id: "series-list",
    routeId: "list.series",
    hashHex: "0xB7367090",
    relativeFilePath: "series_list.bin",
    label: "Series List",
  },
  "navi-list": {
    id: "navi-list",
    routeId: "list.navi",
    hashHex: "0x6FCC0FBA",
    relativeFilePath: "navi_list.bin",
    defaultPackName: "navi_list",
    label: "Navi List",
  },
  "character-cost": {
    id: "character-cost",
    routeId: "param.for-outgame",
    hashHex: "0xFF832E7F",
    relativeFilePath: null,
    label: "Character Cost",
  },
  "striker-table": {
    id: "striker-table",
    routeId: "unit.param",
    hashHex: "0xFEEB79F0",
    relativeFilePath: "strikertable.vgsht1",
    defaultPackName: "strikertable",
    label: "Striker Table",
  },
  "card-icons": {
    id: "card-icons",
    routeId: "gui.card-icons",
    hashHex: "0x49235031",
    relativeFilePath: null,
    label: "Card Icons",
  },
  "series-icons": {
    id: "series-icons",
    routeId: "gui.series-icons",
    hashHex: "0xA0253AA0",
    relativeFilePath: null,
    label: "Series Icons",
  },
  "stage-list": {
    id: "stage-list",
    routeId: "list.stage",
    hashHex: "0xCE74091E",
    relativeFilePath: "stage_list.bin",
    label: "Stage List",
  },
  "stage-icons-primary": {
    id: "stage-icons-primary",
    routeId: "gui.stage-icons",
    hashHex: "0x3CC8B10B",
    relativeFilePath: null,
    label: "Stage Icons Primary",
  },
  "stage-icons-secondary": {
    id: "stage-icons-secondary",
    routeId: "gui.stage-icons",
    hashHex: "0x0CEE3991",
    relativeFilePath: null,
    label: "Stage Icons Secondary",
  },
  "raw-path-id": {
    id: "raw-path-id",
    routeId: "unit.sound",
    hashHex: "0x264D1CA7",
    relativeFilePath: null,
    defaultPackName: "raw_path_id",
    label: "Raw Path ID",
  },
  "pilot-voice-resource": {
    id: "pilot-voice-resource",
    routeId: "unit.sound",
    hashHex: "0x8C428AF2",
    relativeFilePath: "pilotvoiceresourcetable.vrtbl",
    defaultPackName: "090sound",
    label: "Pilot Voice Table",
  },
  "bgm-table": {
    id: "bgm-table",
    routeId: "unit.sound",
    hashHex: "0x5E92AAEC",
    relativeFilePath: "bgm_table.vgsht2",
    defaultPackName: "bgm_table",
    label: "BGM Table",
  },
  "bgm-list": {
    id: "bgm-list",
    routeId: "list.character",
    hashHex: "0xC91627E8",
    relativeFilePath: "bgm_list.bin",
    defaultPackName: "bgm_list",
    label: "BGM List",
  },
  "bgm-bank-update-02": {
    id: "bgm-bank-update-02",
    routeId: "unit.sound",
    hashHex: "0x0C568109",
    relativeFilePath: null,
    defaultPackName: "bgm_ac27_update_02",
    label: "BGM AC27 Update 02 Bank",
  },
} as const);

export type WorkspaceContentId = keyof typeof WORKSPACE_CONTENT_CATALOG;

export interface WorkspaceContentDescriptor {
  id: WorkspaceContentId;
  routeId: WorkspaceAssetRouteId;
  hashHex: string;
  relativeFilePath: string | null;
  label: string;
  defaultPackName?: string;
}

export interface ResolvedWorkspaceContentPack extends ResolvedFhm2dPackPaths {
  filePath: string | null;
}

export interface ResolvedWorkspaceContentLocation {
  descriptor: WorkspaceContentDescriptor;
  configured: ResolvedWorkspaceContentPack;
  existing: ResolvedWorkspaceContentPack | null;
  sourceLayout: "configured" | "legacy" | "missing";
  writable: boolean;
  duplicateLayout: boolean;
}

export function getWorkspaceContentDescriptor(
  id: WorkspaceContentId,
): WorkspaceContentDescriptor {
  return WORKSPACE_CONTENT_CATALOG[id] as WorkspaceContentDescriptor;
}

export function workspacePackIdentityFromResolved(
  pack: ResolvedWorkspaceContentPack,
  sourceLayout: "configured" | "legacy",
): WorkspacePackIdentity {
  const normalized = pack.folderPath.replace(/\\/g, "/");
  const hashFolderName = normalized.split("/").filter(Boolean).at(-1) ?? pack.hashHex;
  return {
    packKey: pack.packKey,
    routeId: pack.routeId,
    prefix: pack.prefix,
    hashFolderName,
    folderPath: pack.folderPath,
    structureJsonPath: pack.structureJsonPath,
    sourceLayout,
  };
}

async function withFilePath(
  paths: ResolvedFhm2dPackPaths,
  relativeFilePath: string | null,
): Promise<ResolvedWorkspaceContentPack> {
  if (!relativeFilePath) {
    return { ...paths, filePath: null };
  }
  return {
    ...paths,
    filePath: await join(paths.folderPath, ...relativeFilePath.split("/")),
  };
}

export async function resolveWorkspaceContent(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  id: WorkspaceContentId,
): Promise<ResolvedWorkspaceContentLocation> {
  const descriptor = getWorkspaceContentDescriptor(id);
  const packName = suggestFhm2dStructureName(descriptor.hashHex, {
    routeId: descriptor.routeId,
    fallbackName: descriptor.defaultPackName ?? undefined,
  }) ?? undefined;
  const pack = await resolveExistingFhm2dPack(
    workspaceRoot,
    document,
    descriptor.routeId,
    descriptor.hashHex,
    packName,
  );

  const configured = await withFilePath(
    pack.configured,
    descriptor.relativeFilePath,
  );
  const existing = pack.existing
    ? await withFilePath(pack.existing, descriptor.relativeFilePath)
    : null;

  return {
    descriptor,
    configured,
    existing,
    sourceLayout: pack.sourceLayout,
    writable: pack.sourceLayout === "configured",
    duplicateLayout: pack.duplicateLayout,
  };
}
