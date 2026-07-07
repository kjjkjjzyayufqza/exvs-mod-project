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

interface NamedFhm2dPackCandidate {
  stem: string;
  folderPath: string;
  structureJsonPath: string;
}

type NamedFhm2dPackIndex = Map<string, NamedFhm2dPackCandidate[]>;

const namedPackIndexCache = new Map<string, Promise<NamedFhm2dPackIndex | null>>();

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

function normalizeCachePath(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

export function clearFhm2dPackResolutionCache(routeRootPath?: string): void {
  if (!routeRootPath) {
    namedPackIndexCache.clear();
    return;
  }
  namedPackIndexCache.delete(normalizeCachePath(routeRootPath));
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

async function readNamedFhm2dPackIndex(routeRootPath: string): Promise<NamedFhm2dPackIndex | null> {
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

  const index: NamedFhm2dPackIndex = new Map();
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
    if (!hashName) continue;

    const folderPath = await join(routeRootPath, stem);
    const candidate: NamedFhm2dPackCandidate = {
      stem,
      folderPath,
      structureJsonPath,
    };
    const candidates = index.get(hashName);
    if (candidates) {
      candidates.push(candidate);
    } else {
      index.set(hashName, [candidate]);
    }
  }

  return index;
}

function getNamedFhm2dPackIndex(routeRootPath: string): Promise<NamedFhm2dPackIndex | null> {
  const cacheKey = normalizeCachePath(routeRootPath);
  const cached = namedPackIndexCache.get(cacheKey);
  if (cached) return cached;

  const pending = readNamedFhm2dPackIndex(routeRootPath).catch((error) => {
    namedPackIndexCache.delete(cacheKey);
    throw error;
  });
  namedPackIndexCache.set(cacheKey, pending);
  return pending;
}

async function resolveNamedFhm2dPackPaths(
  routeRootPath: string,
  routeId: WorkspaceAssetRouteId,
  prefix: string,
  hashHex: string,
): Promise<ResolvedFhm2dPackPaths | null> {
  const normalizedHashHex = normalizeHashHex(hashHex);
  const index = await getNamedFhm2dPackIndex(routeRootPath);
  const candidates = index?.get(normalizedHashHex) ?? [];

  for (const candidate of candidates) {
    if (!(await exists(candidate.folderPath))) continue;

    return {
      routeId,
      prefix,
      routeRootPath,
      hashHex: normalizedHashHex,
      folderPath: candidate.folderPath,
      structureJsonPath: candidate.structureJsonPath,
      packKey: packKey(prefix, candidate.stem),
    };
  }

  return null;
}

export async function resolveExistingFhm2dPack(
  workspaceRoot: string,
  document: TestEditorWorkspaceDocument,
  routeId: WorkspaceAssetRouteId,
  hashHex: string,
  packName?: string,
): Promise<ExistingFhm2dPackResolution> {
  const configured = await resolveFhm2dPackPaths(
    workspaceRoot,
    document,
    routeId,
    hashHex,
    packName,
  );
  const configuredProbe = await probePack(configured);
  const hashConfigured = packName?.trim()
    ? await resolveFhm2dPackPaths(workspaceRoot, document, routeId, hashHex)
    : configured;
  const hashConfiguredProbe = hashConfigured === configured
    ? configuredProbe
    : await probePack(hashConfigured);

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

  if (hashConfigured !== configured && hashConfiguredProbe.complete) {
    let duplicateLayout = false;
    if (document.legacyReadFallback) {
      const legacy = await resolveLegacyFhm2dPackPaths(workspaceRoot, routeId, hashHex);
      duplicateLayout = (await probePack(legacy)).complete;
    }
    return {
      configured,
      existing: hashConfigured,
      sourceLayout: "configured",
      folderExists: hashConfiguredProbe.folderExists,
      structureJsonExists: hashConfiguredProbe.structureJsonExists,
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
