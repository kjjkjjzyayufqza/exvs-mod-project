import { describe, it, expect } from "vitest";
import {
  getMoveTypeDefinition,
  getMoveTypeLabel,
  getMoveTypeCategory,
  MOVE_TYPE_DEFINITIONS,
  type MoveTypeCategory,
} from "./moveTypes";

/**
 * Verified from hitEffectLabels.ts and actual bulletparam.bin data:
 *   moveType field uses values 0-7 and 255.
 *   0=Missile, 1=Throw, 2=Funnel, 3=FunnelApproach,
 *   4=Anchor/Chain, 5=FunnelFlysword, 6=AttachChange, 7=FunnelThrow, 255=Generic
 *
 * sub_14043C200 (IDA) is a command dispatcher, NOT a bullet physics tick.
 * The 513-595 range are entity command IDs, not move types.
 */

const KNOWN_MOVE_TYPES: Array<{ id: number; label: string; category: MoveTypeCategory }> = [
  { id: 0, label: "Missile", category: "projectile" },
  { id: 1, label: "Throw", category: "projectile" },
  { id: 2, label: "Funnel", category: "funnel" },
  { id: 3, label: "Funnel Approach", category: "funnel" },
  { id: 4, label: "Anchor", category: "anchor" },
  { id: 5, label: "Funnel Flysword", category: "funnel" },
  { id: 6, label: "Attach Change", category: "special" },
  { id: 7, label: "Funnel Throw", category: "funnel" },
  { id: 255, label: "Generic", category: "projectile" },
];

describe("moveTypes", () => {
  describe("MOVE_TYPE_DEFINITIONS", () => {
    it("should contain all 9 known move types", () => {
      expect(MOVE_TYPE_DEFINITIONS.length).toBe(9);
    });

    it("should have unique IDs", () => {
      const ids = MOVE_TYPE_DEFINITIONS.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("should cover all known move type IDs", () => {
      const ids = new Set(MOVE_TYPE_DEFINITIONS.map((d) => d.id));
      for (const known of KNOWN_MOVE_TYPES) {
        expect(ids.has(known.id)).toBe(true);
      }
    });

    it("should use IDs 0-7 and 255 only", () => {
      for (const def of MOVE_TYPE_DEFINITIONS) {
        const valid = (def.id >= 0 && def.id <= 7) || def.id === 255;
        expect(valid, `ID ${def.id} is not in range 0-7 or 255`).toBe(true);
      }
    });
  });

  describe("getMoveTypeDefinition", () => {
    for (const known of KNOWN_MOVE_TYPES) {
      it(`should return definition for moveType ${known.id} (${known.label})`, () => {
        const def = getMoveTypeDefinition(known.id);
        expect(def).toBeDefined();
        expect(def!.label).toBe(known.label);
        expect(def!.category).toBe(known.category);
      });
    }

    it("should return undefined for unknown IDs", () => {
      expect(getMoveTypeDefinition(8)).toBeUndefined();
      expect(getMoveTypeDefinition(100)).toBeUndefined();
      expect(getMoveTypeDefinition(513)).toBeUndefined();
      expect(getMoveTypeDefinition(595)).toBeUndefined();
    });
  });

  describe("getMoveTypeLabel", () => {
    it("should return label for known IDs", () => {
      expect(getMoveTypeLabel(0)).toBe("Missile");
      expect(getMoveTypeLabel(2)).toBe("Funnel");
      expect(getMoveTypeLabel(4)).toBe("Anchor");
      expect(getMoveTypeLabel(255)).toBe("Generic");
    });

    it("should return fallback string for unknown IDs", () => {
      const result = getMoveTypeLabel(99);
      expect(result).toContain("99");
    });
  });

  describe("getMoveTypeCategory", () => {
    it("should categorize projectiles correctly", () => {
      expect(getMoveTypeCategory(0)).toBe("projectile");
      expect(getMoveTypeCategory(1)).toBe("projectile");
      expect(getMoveTypeCategory(255)).toBe("projectile");
    });

    it("should categorize funnels correctly", () => {
      expect(getMoveTypeCategory(2)).toBe("funnel");
      expect(getMoveTypeCategory(3)).toBe("funnel");
      expect(getMoveTypeCategory(5)).toBe("funnel");
      expect(getMoveTypeCategory(7)).toBe("funnel");
    });

    it("should categorize anchor correctly", () => {
      expect(getMoveTypeCategory(4)).toBe("anchor");
    });

    it("should categorize special correctly", () => {
      expect(getMoveTypeCategory(6)).toBe("special");
    });
  });
});
