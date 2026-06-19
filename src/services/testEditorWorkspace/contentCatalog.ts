import { join } from "@tauri-apps/api/path";
import { resolveExistingFhm2dPack, type ResolvedFhm2dPackPaths } from "./paths";
import type { TestEditorWorkspaceDocument, WorkspaceAssetRouteId } from "./types";

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
  "character-cost": {
    id: "character-cost",
    routeId: "param.for-outgame",
    hashHex: "0xFF832E7F",
    relativeFilePath: null,
    label: "Character Cost",
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
} as const);

export type WorkspaceContentId = keyof typeof WORKSPACE_CONTENT_CATALOG;

export interface WorkspaceContentDescriptor {
  id: WorkspaceContentId;
  routeId: WorkspaceAssetRouteId;
  hashHex: string;
  relativeFilePath: string | null;
  label: string;
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
  return WORKSPACE_CONTENT_CATALOG[id];
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
  const pack = await resolveExistingFhm2dPack(
    workspaceRoot,
    document,
    descriptor.routeId,
    descriptor.hashHex,
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
