/**
 * Legacy `{ Matl: { V16: { entries: [{ attributes[] }] } } }` JSON is converted to
 * `MatlDataJson` (grouped buckets) when loading templates and persisted DAE sessions.
 * Re-export MatlData JSON from `.numatb` via the app command to rebuild templates if needed.
 */
import type { MatlDataJson, MatlEntryJson } from "../types";
import type { NumatbMaterialEntry } from "../daeSsbhTypes";
import {
  createEmptyMaterialEntry,
  createEmptyNumatbFile,
  ensureMatlDataSerdeFields,
} from "../daeSsbhTypes";
import { addLegacyAttributeDataToEntry } from "./matlEntryFlat";

export type LegacyNumatbFileJson = {
  Matl: {
    V16: {
      entries: NumatbMaterialEntry[];
    };
  };
};

export function isLegacyNumatbFileJson(raw: unknown): raw is LegacyNumatbFileJson {
  if (!raw || typeof raw !== "object") {
    return false;
  }
  const matl = (raw as LegacyNumatbFileJson).Matl;
  return (
    !!matl &&
    typeof matl === "object" &&
    matl.V16 !== undefined &&
    typeof matl.V16 === "object" &&
    Array.isArray(matl.V16.entries)
  );
}

function legacyMaterialEntryToMatlEntry(entry: NumatbMaterialEntry): MatlEntryJson {
  const next = createEmptyMaterialEntry(entry.material_label, "maya");
  next.shader_label = entry.shader_label;
  for (const attribute of entry.attributes) {
    addLegacyAttributeDataToEntry(next, attribute.param_id, attribute.param.data);
  }
  return next;
}

export function convertLegacyNumatbFileToMatlData(legacy: LegacyNumatbFileJson): MatlDataJson {
  return {
    major_version: 1,
    minor_version: 6,
    entries: legacy.Matl.V16.entries.map(legacyMaterialEntryToMatlEntry),
  };
}

export function normalizeMatlDataJson(raw: unknown): MatlDataJson {
  if (isLegacyNumatbFileJson(raw)) {
    return ensureMatlDataSerdeFields(convertLegacyNumatbFileToMatlData(raw));
  }
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as MatlDataJson).entries)) {
    return createEmptyNumatbFile();
  }
  const data = raw as MatlDataJson;
  return ensureMatlDataSerdeFields({
    major_version: data.major_version ?? 1,
    minor_version: data.minor_version ?? 6,
    entries: data.entries,
  });
}
