import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BULLET_CLASS_FIELD_ROLES, getBulletClassRoleSet, getBulletEntryFieldRoles, readBulletProjectileId } from "./bulletClassFieldRoles";
import { buildBulletGroups, BULLET_GROUPS } from "@/page/TestEditor/components/param-editors/bullet-editor/BulletPropertyPanel";

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

function readCanonicalPool(): Map<string, number> {
  const source = readFileSync(resolve(__dirname, "../../../src-tauri/src/format/bulletparam.rs"), "utf8");
  const pool = new Map<string, number>();
  for (const match of source.matchAll(/^\s*\((0x[0-9A-Fa-f]{8}),\s*\d+,\s*"([a-z0-9_]+)"\)/gm)) {
    pool.set(snakeToCamel(match[2]), Number.parseInt(match[1], 16));
  }
  return pool;
}

describe("bulletClassFieldRoles", () => {
  it("only names canonical pool keys with their exact hash", () => {
    const pool = readCanonicalPool();
    expect(pool.size).toBeGreaterThan(70);
    for (const set of BULLET_CLASS_FIELD_ROLES) {
      for (const role of set.roles) {
        expect(pool.get(role.fieldKey), `${set.className}.${role.role}`).toBe(role.hash >>> 0);
      }
    }
  });

  it("keeps field keys and role ids unique inside each class", () => {
    for (const set of BULLET_CLASS_FIELD_ROLES) {
      expect(new Set(set.roles.map((role) => role.fieldKey)).size).toBe(set.roles.length);
      expect(new Set(set.roles.map((role) => role.role)).size).toBe(set.roles.length);
    }
  });

  it("maps a FunnelModel row to its deploy and standby roles", () => {
    const roles = getBulletEntryFieldRoles({ entryId: 0x80cc6361, projectileId: 150080102 });
    expect(roles?.roleSet.className).toBe("015GNDMUC_008FAUNIG_001_FunnelModel");
    expect(roles?.byField.get("rotationAngle")?.role).toBe("deployOffsetX");
    expect(roles?.byField.get("aimCorrectionAngle")?.role).toBe("standbyDistance");
    expect(roles?.byField.get("elevationAngle")?.role).toBe("standbyYaw");
    expect(roles?.byField.get("targetHeightOffset")?.role).toBe("standbyPitch");
  });

  it("gives the same column different roles for different classes", () => {
    expect(getBulletClassRoleSet(150080102)?.roles.find((r) => r.fieldKey === "homingEffectiveDistance")?.role).toBe("deployOffsetZ");
    expect(getBulletClassRoleSet(150080105)?.roles.find((r) => r.fieldKey === "homingEffectiveDistance")?.role).toBe("swarmSpeed");
    expect(getBulletClassRoleSet(150080106)?.roles.find((r) => r.fieldKey === "homingEffectiveDistance")?.role).toBe("swarmSpeed");
    expect(getBulletClassRoleSet(150080107)?.roles.find((r) => r.fieldKey === "homingEffectiveDistance")?.role).toBe("shotCount");
  });

  it("returns null for unmapped classes and rows without a class id", () => {
    expect(getBulletEntryFieldRoles({ entryId: 1, projectileId: 10050102 })).toBeNull();
    expect(getBulletEntryFieldRoles({ entryId: 1 })).toBeNull();
    expect(readBulletProjectileId({ entryId: 1, projectileId: "x" })).toBeNull();
  });
});

describe("buildBulletGroups", () => {
  it("leaves unmapped rows on the generic groups", () => {
    expect(buildBulletGroups({ entryId: 1, projectileId: 10050102 })).toBe(BULLET_GROUPS);
  });

  it("moves remapped columns into a leading class-role group without duplicates", () => {
    const groups = buildBulletGroups({ entryId: 0x6be2fab8, projectileId: 150080105 });
    expect(groups[0].id).toBe("classRoles");
    expect(groups[0].fields.map((field) => field.key)).toEqual(["homingEffectiveDistance", "launchAngleHorizontal", "muzzleOffsetHorizontal", "offsetAngleVertical"]);
    expect(groups[0].fields[0].label).toBe("Swarm move speed");
    const keys = groups.flatMap((group) => group.fields.map((field) => field.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
