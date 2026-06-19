import { normalizeWorkspacePrefix } from "./validation";
import type {
  TestEditorWorkspaceDocument,
  WorkspaceAssetRouteId,
  WorkspacePackIdentity,
} from "./types";

const STRUCTURE_JSON_SUFFIX = "_structure.json";
const HASH_FOLDER_PATTERN = /^(?:0x)?([0-9a-fA-F]{8})(.*)$/i;

type RoutePrefixEntry = {
  prefix: string;
  segments: string[];
  routeId: WorkspaceAssetRouteId | null;
};

function normalizePathForCompare(input: string): string {
  return input
    .trim()
    .replace(/^\\\\\?\\/, "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function normalizePathForSlice(input: string): string {
  return input
    .trim()
    .replace(/^\\\\\?\\/, "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function preferredSeparator(rootPath: string): "\\" | "/" {
  return rootPath.includes("\\") ? "\\" : "/";
}

function joinDisplayPath(rootPath: string, segments: string[]): string {
  const separator = preferredSeparator(rootPath);
  const normalizedRoot = rootPath.trim().replace(/[\\/]+$/, "");
  if (segments.length === 0) return normalizedRoot;
  return `${normalizedRoot}${separator}${segments.join(separator)}`;
}

function isPackFolderName(name: string): boolean {
  return HASH_FOLDER_PATTERN.test(name.trim());
}

function normalizePackFolderDisplayName(name: string): string {
  const trimmed = name.trim();
  const match = HASH_FOLDER_PATTERN.exec(trimmed);
  if (!match) return trimmed;
  if (match[2]) return trimmed;
  return `0x${match[1].toUpperCase()}`;
}

function stripStructureJsonSuffix(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith(STRUCTURE_JSON_SUFFIX)) return null;
  const base = fileName.slice(0, fileName.length - STRUCTURE_JSON_SUFFIX.length);
  return base || null;
}

function getRoutePrefixEntries(document: TestEditorWorkspaceDocument): RoutePrefixEntry[] {
  const routeIdsByPrefix = new Map<string, WorkspaceAssetRouteId[]>();
  for (const [routeId, route] of Object.entries(document.assetRoutes)) {
    if (route.kind !== "fhm2d-pack") continue;
    const prefix = normalizeWorkspacePrefix(route.prefix);
    if (!prefix) continue;
    const routeIds = routeIdsByPrefix.get(prefix) ?? [];
    routeIds.push(routeId);
    routeIdsByPrefix.set(prefix, routeIds);
  }

  return Array.from(routeIdsByPrefix.entries())
    .map(([prefix, routeIds]) => ({
      prefix,
      segments: prefix.split("/").filter(Boolean),
      routeId: routeIds.length === 1 ? routeIds[0] : null,
    }))
    .sort((a, b) => b.segments.length - a.segments.length || b.prefix.length - a.prefix.length);
}

function relativePathFromRoot(nodePath: string, workspaceRoot: string): string | null {
  const normalizedRoot = normalizePathForCompare(workspaceRoot);
  const normalizedNode = normalizePathForCompare(nodePath);
  if (!normalizedRoot || !normalizedNode) return null;
  if (normalizedNode !== normalizedRoot && !normalizedNode.startsWith(`${normalizedRoot}/`)) {
    return null;
  }

  const displayRoot = normalizePathForSlice(workspaceRoot);
  const displayNode = normalizePathForSlice(nodePath);
  const normalizedDisplayRoot = displayRoot.toLowerCase();
  const normalizedDisplayNode = displayNode.toLowerCase();
  if (normalizedDisplayNode === normalizedDisplayRoot) return "";
  return displayNode.slice(displayRoot.length).replace(/^\/+/, "");
}

function buildIdentity(params: {
  workspaceRoot: string;
  routeId: WorkspaceAssetRouteId | null;
  prefix: string;
  hashFolderName: string;
  sourceLayout: "configured" | "legacy";
}): WorkspacePackIdentity {
  const hashFolderName = normalizePackFolderDisplayName(params.hashFolderName);
  const prefixSegments = params.prefix ? params.prefix.split("/").filter(Boolean) : [];
  const folderPath = joinDisplayPath(params.workspaceRoot, [...prefixSegments, hashFolderName]);
  return {
    packKey: params.prefix ? `${params.prefix}/${hashFolderName}` : hashFolderName,
    routeId: params.routeId,
    prefix: params.prefix,
    hashFolderName,
    folderPath,
    structureJsonPath: joinDisplayPath(params.workspaceRoot, [
      ...prefixSegments,
      `${hashFolderName}${STRUCTURE_JSON_SUFFIX}`,
    ]),
    sourceLayout: params.sourceLayout,
  };
}

function classifyConfiguredPath(params: {
  workspaceRoot: string;
  relativePath: string;
  nodeIsDirectory?: boolean;
  document: TestEditorWorkspaceDocument;
}): WorkspacePackIdentity | null {
  const relativeSegments = params.relativePath.split("/").filter(Boolean);
  if (relativeSegments.length === 0) return null;

  for (const entry of getRoutePrefixEntries(params.document)) {
    if (relativeSegments.length <= entry.segments.length) continue;
    const isPrefixMatch = entry.segments.every(
      (segment, index) => segment.toLowerCase() === relativeSegments[index]?.toLowerCase(),
    );
    if (!isPrefixMatch) continue;

    const packSegment = relativeSegments[entry.segments.length];
    const structureBase =
      params.nodeIsDirectory === false && relativeSegments.length === entry.segments.length + 1
        ? stripStructureJsonSuffix(packSegment)
        : null;
    const hashFolderName = structureBase ?? packSegment;
    if (!isPackFolderName(hashFolderName)) return null;

    return buildIdentity({
      workspaceRoot: params.workspaceRoot,
      routeId: entry.routeId,
      prefix: entry.prefix,
      hashFolderName,
      sourceLayout: "configured",
    });
  }

  return null;
}

function classifyLegacyPath(params: {
  workspaceRoot: string;
  relativePath: string;
  nodeIsDirectory?: boolean;
  document: TestEditorWorkspaceDocument;
}): WorkspacePackIdentity | null {
  if (!params.document.legacyReadFallback) return null;
  const relativeSegments = params.relativePath.split("/").filter(Boolean);
  if (relativeSegments.length === 0) return null;

  const firstSegment = relativeSegments[0];
  const structureBase =
    params.nodeIsDirectory === false && relativeSegments.length === 1
      ? stripStructureJsonSuffix(firstSegment)
      : null;
  const hashFolderName = structureBase ?? firstSegment;
  if (!isPackFolderName(hashFolderName)) return null;

  if (params.nodeIsDirectory === false && relativeSegments.length === 1 && !structureBase) {
    return null;
  }

  return buildIdentity({
    workspaceRoot: params.workspaceRoot,
    routeId: null,
    prefix: "",
    hashFolderName,
    sourceLayout: "legacy",
  });
}

export function classifyWorkspacePackPath(params: {
  workspaceRoot: string;
  nodePath: string;
  nodeIsDirectory?: boolean;
  document: TestEditorWorkspaceDocument;
}): WorkspacePackIdentity | null {
  const relativePath = relativePathFromRoot(params.nodePath, params.workspaceRoot);
  if (relativePath === null || !relativePath) return null;

  return (
    classifyConfiguredPath({
      workspaceRoot: params.workspaceRoot,
      relativePath,
      nodeIsDirectory: params.nodeIsDirectory,
      document: params.document,
    }) ??
    classifyLegacyPath({
      workspaceRoot: params.workspaceRoot,
      relativePath,
      nodeIsDirectory: params.nodeIsDirectory,
      document: params.document,
    })
  );
}

