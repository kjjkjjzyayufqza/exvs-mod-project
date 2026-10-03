import type { GraphicParam } from "../components/GraphicParamPanel";
import type { PlacementRow } from "../types/placement";
import { normalizePlacementObjectNumber } from "./sceneEditorSelection";
import { defaultAppliedSunKeys } from "./graphicParamSceneLighting";
import { reorderPlacementEntriesBySubModels } from "./reorderPlacementBySubModels";
import type { StageSkeleton } from "./sceneSessionService";

export type InfoCsvKind = "graphic" | "placement";

export type InfoCsvReloadPlan = {
  reloadGraphic: boolean;
  reloadPlacement: boolean;
};

const GRAPHIC_CSV = "graphic_param.csv";
const PLACEMENT_CSV = "placement.csv";

function fileNameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return (slash >= 0 ? normalized.slice(slash + 1) : normalized).toLowerCase();
}

/** `graphic_param.csv` and `placement.csv` are the only info files this reload owns. */
export function infoCsvKindFromPath(path: string): InfoCsvKind | null {
  const name = fileNameOf(path);
  if (name === GRAPHIC_CSV) return "graphic";
  if (name === PLACEMENT_CSV) return "placement";
  return null;
}

/**
 * Decide which clean CSVs a filesystem event should pull back into the editor.
 * A dirty flag keeps the in-editor copy. An event that does not name either CSV
 * (directory notify, or a sibling info file) does not reload.
 * An empty path list is treated as an unscoped directory event and refreshes
 * whichever of the two CSVs is still clean.
 */
export function infoCsvReloadPlan(
  paths: readonly string[],
  dirty: { graphicParams: boolean; placementOrder: boolean },
): InfoCsvReloadPlan {
  if (paths.length === 0) {
    return {
      reloadGraphic: !dirty.graphicParams,
      reloadPlacement: !dirty.placementOrder,
    };
  }
  let reloadGraphic = false;
  let reloadPlacement = false;
  for (const path of paths) {
    const kind = infoCsvKindFromPath(path);
    if (kind === "graphic" && !dirty.graphicParams) reloadGraphic = true;
    if (kind === "placement" && !dirty.placementOrder) reloadPlacement = true;
  }
  return { reloadGraphic, reloadPlacement };
}

export function graphicParamsFromSkeleton(skeleton: StageSkeleton): GraphicParam[] {
  return skeleton.graphicParams.map((row) => ({ key: row.key, value: row.value }));
}

export function placementFromSkeleton(skeleton: StageSkeleton): {
  header: string[];
  colMap: Record<string, number>;
  entries: PlacementRow[];
} {
  const header = skeleton.placementHeader;
  const colMap: Record<string, number> = {};
  header.forEach((name, index) => {
    colMap[name.toUpperCase()] = index;
  });
  const mapped: PlacementRow[] = skeleton.placementEntries.map((entry) => ({
    vdkType: entry.vdkType,
    objectNumber: normalizePlacementObjectNumber(entry.objectNumber),
    posX: entry.posX,
    posY: entry.posY,
    posZ: entry.posZ,
    rotX: entry.rotX,
    rotY: entry.rotY,
    rotZ: entry.rotZ,
    scaleX: entry.scaleX,
    scaleY: entry.scaleY,
    scaleZ: entry.scaleZ,
    rawFields: entry.rawFields,
  }));
  return {
    header,
    colMap,
    entries: reorderPlacementEntriesBySubModels(mapped, skeleton.subModelManifest),
  };
}

export function sameGraphicParams(
  left: readonly GraphicParam[],
  right: readonly GraphicParam[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((row, index) => row.key === right[index]?.key && row.value === right[index]?.value);
}

export function samePlacementRows(
  left: readonly PlacementRow[],
  right: readonly PlacementRow[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((row, index) => {
    const other = right[index];
    if (!other) return false;
    if (row.vdkType !== other.vdkType || row.objectNumber !== other.objectNumber) return false;
    if (row.rawFields.length !== other.rawFields.length) return false;
    return row.rawFields.every((field, fieldIndex) => field === other.rawFields[fieldIndex]);
  });
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Keep keys the user already applied, drop keys the file no longer has, and turn new sun keys on. */
export function mergeAppliedGraphicParamKeys(
  existing: ReadonlySet<string>,
  params: ReadonlyArray<{ key: string }>,
): Set<string> {
  const live = new Set(params.map((row) => row.key));
  const next = new Set<string>();
  for (const key of existing) {
    if (live.has(key)) next.add(key);
  }
  for (const key of defaultAppliedSunKeys(params)) next.add(key);
  return next;
}

export type InfoCsvDiskPatch = {
  graphicParams?: GraphicParam[];
  appliedSunKeys?: Set<string>;
  placementHeader?: string[];
  placementColMap?: Record<string, number>;
  placementEntries?: PlacementRow[];
  changedFiles: string[];
};

export function buildInfoCsvDiskPatch(
  skeleton: StageSkeleton,
  current: {
    graphicParams: readonly GraphicParam[];
    placementHeader: readonly string[];
    placementEntries: readonly PlacementRow[];
    appliedGraphicParamKeys: ReadonlySet<string>;
  },
  plan: InfoCsvReloadPlan,
): InfoCsvDiskPatch {
  const patch: InfoCsvDiskPatch = { changedFiles: [] };
  if (plan.reloadGraphic) {
    const next = graphicParamsFromSkeleton(skeleton);
    if (!sameGraphicParams(current.graphicParams, next)) {
      patch.graphicParams = next;
      patch.appliedSunKeys = mergeAppliedGraphicParamKeys(current.appliedGraphicParamKeys, next);
      patch.changedFiles.push(GRAPHIC_CSV);
    }
  }
  if (plan.reloadPlacement) {
    const next = placementFromSkeleton(skeleton);
    const headerChanged = !sameStringList(current.placementHeader, next.header);
    const rowsChanged = !samePlacementRows(current.placementEntries, next.entries);
    if (headerChanged || rowsChanged) {
      patch.placementHeader = next.header;
      patch.placementColMap = next.colMap;
      patch.placementEntries = next.entries;
      patch.changedFiles.push(PLACEMENT_CSV);
    }
  }
  return patch;
}
