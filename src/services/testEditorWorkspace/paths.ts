import { join } from "@tauri-apps/api/path";
import { exists, readDir, readTextFile } from "@tauri-apps/plugin-fs";
import { normalizeFhm2dHashName, sanitizeFhm2dStructureName } from "@/utils/fhm2dStructureMetadata";
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

function stripStructureJsonSuffix(fileName: string): string | null {
  const suffix = "_structure.json";
  if (!fileName.toLowerCase().endsWith(suffix)) return null;
  const stem = fileName.slice(0, fileName.length - suffix.length);
  return stem || null;
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
  packName?: string,
): Promise<ResolvedFhm2dPackPaths> {
  const route = routeFor(document, routeId);
  const prefix = normalizeWorkspacePrefix(route.prefix);
  const normalizedHashHex = normalizeHashHex(hashHex);
  const physicalName = packName?.trim()
    ? sanitizeFhm2dStructureName(packName)
    : normalizedHashHex;
  const routeRootPath = await joinPrefix(workspaceRoot, prefix);

  return {
    routeId,
    prefix,
    routeRootPath,
    hashHex: normalizedHashHex,
    folderPath: await join(routeRootPath, physicalName),
    structureJsonPath: await join(routeRootPath, `${physicalName}_structure.json`),
    packKey: packKey(prefix, physicalName),
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

async function resolveNamedFhm2dPackPaths(
  routeRootPath: string,
  routeId: WorkspaceAssetRouteId,
  prefix: string,
  hashHex: string,
): Promise<ResolvedFhm2dPackPaths | null> {
  const normalizedHashHex = normalizeHashHex(hashHex);
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(routeRootPath);
  } catch {
    return null;
  }

  const structureNames = entries
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string")
    .filter((name) => Boolean(stripStructureJsonSuffix(name)))
    .sort((a, b) => a.localeCompare(b));

  for (const structureName of structureNames) {
    const stem = stripStructureJsonSuffix(structureName);
    if (!stem) continue;
    const structureJsonPath = await join(routeRootPath, structureName);

    let hashName: string | null = null;
    try {
      const raw = await readTextFile(structureJsonPath);
      const parsed = JSON.parse(raw) as { HashName?: unknown };
      hashName = typeof parsed.HashName === "string"
        ? normalizeFhm2dHashName(parsed.HashName)
        : null;
    } catch {
      continue;
    }
    if (hashName !== normalizedHashHex) continue;

    const folderPath = await join(routeRootPath, stem);
    if (!(await exists(folderPath))) continue;

    return {
      routeId,
      prefix,
      routeRootPath,
      hashHex: normalizedHashHex,
      folderPath,
      structureJsonPath,
      packKey: packKey(prefix, stem),
    };
  }

  return null;
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

  const namedConfigured = await resolveNamedFhm2dPackPaths(
    configured.routeRootPath,
    routeId,
    configured.prefix,
    configured.hashHex,
  );
  if (namedConfigured) {
    let duplicateLayout = false;
    if (document.legacyReadFallback) {
      const legacy = await resolveLegacyFhm2dPackPaths(workspaceRoot, routeId, hashHex);
      duplicateLayout = (await probePack(legacy)).complete;
    }
    return {
      configured,
      existing: namedConfigured,
      sourceLayout: "configured",
      folderExists: true,
      structureJsonExists: true,
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

    const namedLegacy = await resolveNamedFhm2dPackPaths(
      legacy.routeRootPath,
      routeId,
      legacy.prefix,
      legacy.hashHex,
    );
    if (namedLegacy) {
      return {
        configured,
        existing: namedLegacy,
        sourceLayout: "legacy",
        folderExists: true,
        structureJsonExists: true,
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
