import { joinPreviewPath } from "@/components/fhm2d-metadata";
import { DEFAULT_TEST_EDITOR_WORKSPACE } from "@/services/testEditorWorkspace/defaults";
import { normalizeWorkspacePrefix } from "@/services/testEditorWorkspace/validation";
import {
  normalizeFhm2dHashName,
  sanitizeFhm2dStructureName,
} from "@/utils/fhm2dStructureMetadata";
import { suggestFhm2dStructureName } from "@/utils/fhm2dNameMapping";

/**
 * Build extract destinations that match TestEditor workspace layout, e.g.:
 *   {exportRoot}/041cpm/for_outgame
 *   {exportRoot}/012list/series_list
 *   {exportRoot}/009gui/ms_ms_s
 *
 * Export root is EXVS2 Workspace (`testEditorFolder`, e.g. E:\XB\mod),
 * not game inject `obModPath`.
 */

export type Fhm2dInitRouteTarget = {
  routeId: string;
  routePrefix: string;
  routeLabel: string;
};

export type Fhm2dInitExtractOutput = {
  exportRoot: string;
  routeId: string;
  routePrefix: string;
  packName: string;
  /** e.g. 041cpm/for_outgame */
  relativeFolderPath: string;
  /** e.g. E:/XB/mod/041cpm */
  routeRootPath: string;
  /** e.g. E:/XB/mod/041cpm/for_outgame */
  folderPath: string;
  /** e.g. E:/XB/mod/041cpm/for_outgame_structure.json */
  structureJsonPath: string;
  /** e.g. E:/XB/mod/041cpm/0xFF832E7F.fhm2d */
  repackOutputPath: string | null;
  hashName: string | null;
};

export function resolveInitRouteTarget(routeId: string): Fhm2dInitRouteTarget {
  const route = DEFAULT_TEST_EDITOR_WORKSPACE.assetRoutes[routeId];
  if (!route) {
    throw new Error(`Unknown workspace route for FHM2D Init: ${routeId}`);
  }
  return {
    routeId,
    routePrefix: normalizeWorkspacePrefix(route.prefix),
    routeLabel: route.label,
  };
}

export function defaultInitPackName(
  hashHex: string,
  options: {
    routeId: string;
    fallbackName?: string | null;
  },
): string {
  return (
    suggestFhm2dStructureName(hashHex, {
      routeId: options.routeId,
      fallbackName: options.fallbackName ?? null,
    }) ??
    sanitizeFhm2dStructureName(
      options.fallbackName ?? normalizeFhm2dHashName(hashHex) ?? "fhm2d_pack",
    )
  );
}

export function buildFhm2dInitExtractOutput(args: {
  exportRoot: string;
  routeId: string;
  routePrefix: string;
  packName: string;
  hashHex?: string | null;
}): Fhm2dInitExtractOutput {
  const exportRoot = args.exportRoot.trim().replace(/[\\/]+$/g, "");
  if (!exportRoot) {
    throw new Error("Export folder is required.");
  }

  const routePrefix = normalizeWorkspacePrefix(args.routePrefix);
  const packName = sanitizeFhm2dStructureName(args.packName);
  const hashName = normalizeFhm2dHashName(args.hashHex);

  const routeRootPath = routePrefix
    ? joinPreviewPath(exportRoot, routePrefix)
    : exportRoot;
  const folderPath = joinPreviewPath(routeRootPath, packName);
  const structureJsonPath = `${folderPath}_structure.json`;
  const relativeFolderPath = routePrefix
    ? `${routePrefix}/${packName}`
    : packName;
  const repackOutputPath = hashName
    ? joinPreviewPath(routeRootPath, `${hashName}.fhm2d`)
    : null;

  return {
    exportRoot,
    routeId: args.routeId,
    routePrefix,
    packName,
    relativeFolderPath,
    routeRootPath,
    folderPath,
    structureJsonPath,
    repackOutputPath,
    hashName,
  };
}
