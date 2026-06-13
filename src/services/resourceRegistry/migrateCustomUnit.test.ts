import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildRegistryDocumentFromCustomUnitJson } from "./migrateCustomUnit";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixturePath = join(repoRoot, "tools/custom_unit.json");

describe("migrateCustomUnit", () => {
  it("builds twelve unit slot entries from bundled custom_unit.json fixture", () => {
    const raw = readFileSync(fixturePath, "utf8");
    const { doc, warnings } = buildRegistryDocumentFromCustomUnitJson(raw);
    expect(doc.version).toBe(1);
    expect(doc.entries).toHaveLength(12);
    expect(doc.entries.every((row) => row.category === "unit")).toBe(true);
    expect(warnings).toEqual([]);
    const deltaKaiModel = doc.entries.find(
      (row) => row.slot === "model" && row.seed === "026gnbelt_003delatkai_001",
    );
    expect(deltaKaiModel?.hashInt32).toBe(-1571248862);
  });
});
