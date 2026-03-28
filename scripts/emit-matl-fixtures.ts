/**
 * Optional: convert legacy Matl.V16 JSON files to MatlDataJson on disk.
 *
 * Do NOT use this for EXVS embedded fixtures (015gndmuc_* maya/nust): those must
 * come from binary .numatb via ssbh_data_json (ssbh_lib crate):
 *   cd <ssbh_lib repo>
 *   cargo build --release -p ssbh_data_json
 *   target/release/ssbh_data_json.exe <input>.numatb <output>.numatb.json
 *
 * Run from repo root: pnpm dlx tsx scripts/emit-matl-fixtures.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertLegacyNumatbFileToMatlData } from "../src/page/TestEditor/components/ssbh-model-preview/store/numatbProfileMigration";
import type { LegacyNumatbFileJson } from "../src/page/TestEditor/components/ssbh-model-preview/store/numatbProfileMigration";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(
  root,
  "src/page/TestEditor/components/ssbh-model-preview/fixtures",
);

/** Legacy Matl.V16 JSON basenames to migrate; omit 015gndmuc embedded fixtures (use ssbh_data_json). */
const files: readonly string[] = [];

for (const name of files) {
  const p = join(fixturesDir, name);
  const legacy = JSON.parse(readFileSync(p, "utf8")) as LegacyNumatbFileJson;
  const matl = convertLegacyNumatbFileToMatlData(legacy);
  writeFileSync(p, `${JSON.stringify(matl, null, 2)}\n`, "utf8");
  console.log("Wrote MatlData:", p);
}

if (files.length === 0) {
  console.log("emit-matl-fixtures: no legacy files listed; nothing to do.");
}
