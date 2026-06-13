import { describe, expect, it } from "vitest";
import { mergeRegistries, validateDocument } from "./merge";
import { buildRegistryEntryFromSeed, createEmptyRegistryDocument } from "./types";

describe("resourceRegistry merge", () => {
  it("workspace overrides global on same seed key", () => {
    const globalEntry = buildRegistryEntryFromSeed({
      category: "stage",
      slot: "fileName",
      seed: "my_stage",
      displayName: "Global",
    });
    const workspaceEntry = buildRegistryEntryFromSeed({
      category: "stage",
      slot: "fileName",
      seed: "my_stage",
      displayName: "Workspace",
    });
    const merged = mergeRegistries(
      { version: 1, entries: [globalEntry] },
      { version: 1, entries: [workspaceEntry] },
    );
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].displayName).toBe("Workspace");
  });

  it("detects duplicate hash within document", () => {
    const a = buildRegistryEntryFromSeed({ category: "unit", slot: "model", seed: "a" });
    const b = buildRegistryEntryFromSeed({ category: "unit", slot: "model", seed: "b" });
    b.hashInt32 = a.hashInt32;
    b.hashHex = a.hashHex;
    const issues = validateDocument({ version: 1, entries: [a, b] });
    expect(issues.some((issue) => issue.code === "duplicate_hash")).toBe(true);
  });

  it("starts empty", () => {
    expect(createEmptyRegistryDocument().entries).toEqual([]);
  });
});
