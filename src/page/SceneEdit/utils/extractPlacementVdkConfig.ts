import type { PlacementRow } from "../components/PlacementPanel";

const TRANSFORM_KEYS = new Set([
  "VDK_TYPE",
  "VDK_OBJECTNUMBER",
  "VDK_PLACEMENT_NAME",
  "VDK_POS_X", "VDK_POS_Y", "VDK_POS_Z",
  "VDK_POSITION_X", "VDK_POSITION_Y", "VDK_POSITION_Z",
  "VDK_ROT_X", "VDK_ROT_Y", "VDK_ROT_Z",
  "VDK_ROTATION_X", "VDK_ROTATION_Y", "VDK_ROTATION_Z",
  "VDK_SCALE_X", "VDK_SCALE_Y", "VDK_SCALE_Z",
]);

export interface VdkConfigEntry {
  key: string;
  value: string;
}

export function extractVdkConfig(
  entry: PlacementRow,
  header: string[],
): VdkConfigEntry[] {
  const result: VdkConfigEntry[] = [];

  if (header.length > 0 && entry.rawFields.length === header.length) {
    for (let i = 0; i < header.length; i++) {
      const key = header[i].trim().toUpperCase();
      if (TRANSFORM_KEYS.has(key)) continue;
      result.push({ key: header[i].trim(), value: entry.rawFields[i] ?? "" });
    }
  } else {
    for (let j = 0; j + 1 < entry.rawFields.length; j += 2) {
      const key = entry.rawFields[j].trim().toUpperCase();
      if (TRANSFORM_KEYS.has(key)) continue;
      result.push({ key: entry.rawFields[j].trim(), value: entry.rawFields[j + 1] ?? "" });
    }
  }

  return result;
}
