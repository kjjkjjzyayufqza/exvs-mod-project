import { describe, expect, it } from "vitest";
import {
  buildReverseReferenceMap,
  findEntryByHash,
  findEntryById,
  followChildBulletChain,
  resolveBulletCrossReferences,
} from "./crossParamResolver";
import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

describe("crossParamResolver", () => {
  it("finds entries by the typed param entryId field", () => {
    const target: TypedParamEntry = { entryId: 0x2222, damage: 100 };
    const entries: TypedParamEntry[] = [{ entryId: 0x1111 }, target];

    expect(findEntryByHash(entries, 0x2222)).toBe(target);
    expect(findEntryById(entries, 0x2222)).toBe(target);
  });

  it("falls back to the array index when entryId is absent", () => {
    const target: TypedParamEntry = { damage: 80 };
    const entries: TypedParamEntry[] = [{ damage: 40 }, target];

    expect(findEntryById(entries, 1)).toBe(target);
  });

  it("resolves bullet references against target entryId values", () => {
    const bulletEntry: TypedParamEntry = {
      entryId: 0x1000,
      hitgroupHash: 0x3000,
    };
    const hitgroupEntry: TypedParamEntry = { entryId: 0x3000, hitType: 1 };

    const refs = resolveBulletCrossReferences(bulletEntry, {
      hitgroupiddef: [hitgroupEntry],
    });

    expect(refs).toHaveLength(1);
    expect(refs[0]!.sourceEntryId).toBe(0x1000);
    expect(refs[0]!.targetEntry).toBe(hitgroupEntry);
  });

  it("uses entryId in reverse reference maps", () => {
    const map = buildReverseReferenceMap(
      [
        { entryId: 0x10, hitgroupHash: 0x99 },
        { entryId: 0x11, hitgroupHash: 0x99 },
      ],
      "hitgroupHash",
    );

    expect(map.get(0x99)).toEqual([
      { index: 0, entryId: 0x10 },
      { index: 1, entryId: 0x11 },
    ]);
  });

  it("follows child bullet chains by child bullet entryId", () => {
    const child: TypedParamEntry = { entryId: 0x2222, childBulletHash: 0 };
    const parent: TypedParamEntry = { entryId: 0x1111, childBulletHash: 0x2222 };

    const chain = followChildBulletChain(parent, [parent, child]);

    expect(chain).toEqual([{ depth: 1, hash: 0x2222, entry: child }]);
  });
});
