import { join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import { normalizeWorkspacePrefix } from "./validation";
import type { TestEditorWorkspaceDocument, WorkspaceAssetRouteId } from "./types";

export interface ResolvedFhm2dPackPaths {
  routeId: WorkspaceAssetRouteId;
  prefix: string;
  routeRootPath: string;
  hashHex: string;
  folderPath: string;
  structureJsonPath: string;
  packKey: string;
}

export interface ExistingFhm2dPackResolution {
  configured: ResolvedFhm2dPackPaths;
  existing: ResolvedFhm2dPackPaths | null;
  sourceLayout: "configured" | "legacy" | "missing";
  folderExists: boolean;
  structureJsonExists: boolean;
  duplicateLayout: boolean;
}

function normalizeHashHex(hashHex: string): string {
  const trimmed = hashHex.trim();
  const body = trimmed.replace(/^0x/i, "");
  if (!body) {
    throw new Error("FHM2D pack hash is required.");
  }
  return `0x${body.toUpperCase()}`;
}

function packKey(prefix: string, hashHex: string): string {
  return prefix ? `${prefix}/${hashHex}` : hashHex;
}

async function joinPrefix(rootPath: string, prefix: string): Promise<string> {
  const normalizedPrefix = normalizeWorkspacePrefix(prefix);
  if (!normalizedPrefix) {
    return rootPath;
  }
  return join(rootPath, ...normalizedPrefix.split("/"));
}

function routeFor(
  document: TestEditorWorkspaceDocument,
  routeId: WorkspaceAssetRouteId,
) {
  const route = document.assetRoutes[routeId];
  if (!route) {
    throw new Error(`Workspace asset route "${routeId}" is not configured.`);
  }
  if (route.kind !== "fhm2d-pack") {
    throw new Error(`Workspace asset route "${routeId}" is not an FHM2D pack route.`);
  }
  return route;
}

async function resolveLegacyFhm2dPackPaths(
  workspaceRoot: string,
  routeId: WorkspaceAssetRouteId,
  hashHex: string,
): Promise<ResolvedFhm2dPackPaths> {
  const normalizedHashHex = normalizeHashHex(hashHex);
  return {
    routeId,
    prefix: "",
    routeRootPath: workspaceRoot,
    hashHex: normalizedHashHex,
    folderPath: await join(workspaceRoot, normalizedHashHex),
    structureJsonPath: await join(workspaceRoot, `${normalizedHashHex}_structure.json`),
    packKey: normalizedHashHex,
  };
}

export async function resolveWorkspaceRouteRoot(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  routeId: WorkspaceAssetRouteId,
): Promise<string> {
  const route = routeFor(document, routeId);
  return joinPrefix(workspaceRoot, route.prefix);
}

export async function resolveFhm2dPackPaths(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  routeId: WorkspaceAssetRouteId,
  hashHex: string,
): Promise<ResolvedFhm2dPackPaths> {
  const route = routeFor(document, routeId);
  const prefix = normalizeWorkspacePrefix(route.prefix);
  const normalizedHashHex = normalizeHashHex(hashHex);
  const routeRootPath = await joinPrefix(workspaceRoot, prefix);

  return {
    routeId,
    prefix,
    routeRootPath,
    hashHex: normalizedHashHex,
    folderPath: await join(routeRootPath, normalizedHashHex),
    structureJsonPath: await join(routeRootPath, `${normalizedHashHex}_structure.json`),
    packKey: packKey(prefix, normalizedHashHex),
  };
}

async function probePack(paths: ResolvedFhm2dPackPaths): Promise<{
  folderExists: boolean;
  structureJsonExists: boolean;
  complete: boolean;
}> {
  const [folderExists, structureJsonExists] = await Promise.all([
    exists(paths.folderPath),
    exists(paths.structureJsonPath),
  ]);
  return {
    folderExists,
    structureJsonExists,
    complete: folderExists && structureJsonExists,
  };
}

export async function resolveExistingFhm2dPack(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  routeId: WorkspaceAssetRouteId,
  hashHex: string,
): Promise<ExistingFhm2dPackResolution> {
  const configured = await resolveFhm2dPackPaths(workspaceRoot, document, routeId, hashHex);
  const configuredProbe = await probePack(configured);

  if (configuredProbe.complete) {
    let duplicateLayout = false;
    if (document.legacyReadFallback) {
      const legacy = await resolveLegacyFhm2dPackPaths(workspaceRoot, routeId, hashHex);
      duplicateLayout = (await probePack(legacy)).complete;
    }
    return {
      configured,
      existing: configured,
      sourceLayout: "configured",
      folderExists: configuredProbe.folderExists,
      structureJsonExists: configuredProbe.structureJsonExists,
      duplicateLayout,
    };
  }

  if (document.legacyReadFallback) {
    const legacy = await resolveLegacyFhm2dPackPaths(workspaceRoot, routeId, hashHex);
    const legacyProbe = await probePack(legacy);
    if (legacyProbe.complete) {
      return {
        configured,
        existing: legacy,
        sourceLayout: "legacy",
        folderExists: legacyProbe.folderExists,
        structureJsonExists: legacyProbe.structureJsonExists,
        duplicateLayout: false,
      };
    }
  }

  return {
    configured,
    existing: null,
    sourceLayout: "missing",
    folderExists: configuredProbe.folderExists,
    structureJsonExists: configuredProbe.structureJsonExists,
    duplicateLayout: false,
  };
}
