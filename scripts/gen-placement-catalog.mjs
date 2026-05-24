import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsonPath = path.join(
  root,
  "docs/agent-sessions/scene-object-texture-param-placement/stage_csv_common_values.json",
);
const outPath = path.join(root, "src/page/SceneEdit/utils/placementFieldCatalog.ts");

const raw = fs.readFileSync(jsonPath, "utf8").replace(/^\uFEFF/, "");
const j = JSON.parse(raw);
const fields = j.placement.fields;
const TRANSFORM = new Set([
  "VDK_POSITION_X",
  "VDK_POSITION_Y",
  "VDK_POSITION_Z",
  "VDK_ROTATION_X",
  "VDK_ROTATION_Y",
  "VDK_ROTATION_Z",
  "VDK_SCALE_X",
  "VDK_SCALE_Y",
  "VDK_SCALE_Z",
  "VDK_TYPE",
]);

function cat(k) {
  if (TRANSFORM.has(k)) return "transform";
  if (k.includes("ANIM")) return "animation";
  if (k.includes("ATTACH")) return "attach";
  if (k.includes("PROP")) return "prop";
  if (k.includes("EFFECT") || k.startsWith("VDK_SE_")) return "effect";
  if (
    [
      "VDK_OBJECTNUMBER",
      "VDK_PLACEMENT_NAME",
      "VDK_PROGRAMID",
      "VDK_INITIAL_SPAWN",
      "VDK_HITPOINT",
      "VDK_SHADOW_CAST",
    ].includes(k)
  )
    return "identity";
  if (
    ["VDK_CAMERA_BIND_PLACEMENT", "VDK_CHAINBREAK_PLACEMENT", "VDK_SUBSTITUTE_PLACEMENT"].includes(
      k,
    )
  )
    return "links";
  if (k.includes("BREAK") || k.includes("SHOCKWAVE")) return "physics";
  return "other";
}

function kind(f) {
  const sv = (f.sampleValues || []).map((v) => String(v).toUpperCase());
  if (sv.length && sv.every((v) => v === "TRUE" || v === "FALSE")) return "bool";
  if (f.numericCount > 0 && f.numericCount === f.count) return "number";
  return "string";
}

const catalog = fields.map((f) => ({
  key: f.key,
  category: cat(f.key),
  kind: kind(f),
  sampleValues: (f.sampleValues || []).slice(0, 6),
}));

const header = `// Auto-derived from docs/agent-sessions/scene-object-texture-param-placement/stage_csv_common_values.json
export type PlacementVdkType = "EFFECT" | "OBJECT" | "PROP" | "SKY";
export type PlacementFieldCategory =
  | "transform"
  | "identity"
  | "animation"
  | "attach"
  | "prop"
  | "effect"
  | "links"
  | "physics"
  | "other";
export type PlacementFieldKind = "bool" | "number" | "string";
export interface PlacementFieldMeta {
  key: string;
  category: PlacementFieldCategory;
  kind: PlacementFieldKind;
  sampleValues: string[];
}
export const PLACEMENT_VDK_TYPES: PlacementVdkType[] = ["EFFECT", "OBJECT", "PROP", "SKY"];
export const PLACEMENT_FIELD_CATALOG: PlacementFieldMeta[] = `;

fs.writeFileSync(outPath, `${header}${JSON.stringify(catalog, null, 2)};\n`);
console.log(`Wrote ${catalog.length} fields to ${outPath}`);
