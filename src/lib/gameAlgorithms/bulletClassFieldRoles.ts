/**
 * Projectile-class-specific roles of bulletparam fields.
 *
 * bulletparam is a hash-keyed command pool shared by every projectile class. The
 * canonical keys in src-tauri/src/format/bulletparam.rs name one guessed or
 * generic role per hash, but each UnitTask class reads the columns it needs with
 * its own meaning. The same hash can be a spawn angle for one class, a frame
 * count for the standard bullet program and a deploy offset for another.
 *
 * Canonical keys stay unchanged (JSON round trips, the trajectory simulator and
 * every other class depend on them). This table only adds the proven role for
 * rows whose `projectileId` (0x0D6A5CD5, the UnitTask class id) matches a class
 * whose consumer was decompiled in OB v27.
 *
 * Evidence: docs/unit-task-automata-fauc-shield-funnel.md
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";
import type { EvidenceGrade } from "./movementParamSemantics";

export const BULLET_PROJECTILE_ID_KEY = "projectileId";

export interface BulletFieldRole {
  /** Canonical camelCase pool key of the column. */
  fieldKey: string;
  /** Field hash in the command pool. */
  hash: number;
  /** Stable role identifier for this class. */
  role: string;
  /** Short display label for the role. */
  label: string;
  /** Storage type of the column (the role never changes how it is stored). */
  type: "f32" | "hash";
  unit?: string;
  /** Native function that reads the column with this role. */
  source: string;
  evidence: EvidenceGrade;
}

export interface BulletClassRoleSet {
  /** UnitTask class name without the CUnitTaskAutomata_ prefix. */
  className: string;
  classIds: readonly number[];
  roles: readonly BulletFieldRole[];
}

const FUNNEL_MODEL_ROLES: readonly BulletFieldRole[] = [
  { fieldKey: "rotationAngle", hash: 0x3b52daab, role: "deployOffsetX", label: "Deploy offset X", type: "f32", unit: "units", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "accelerationValue", hash: 0x4c55ea3d, role: "deployOffsetY", label: "Deploy offset Y", type: "f32", unit: "units", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "homingEffectiveDistance", hash: 0xdceaf7ac, role: "deployOffsetZ", label: "Deploy offset Z", type: "f32", unit: "units", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "aimLimitAngle", hash: 0xd55cbb87, role: "deployFrames", label: "Deploy duration", type: "f32", unit: "frames", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "launchAngleHorizontal", hash: 0xabedc73a, role: "deployYawOffset", label: "Deploy yaw offset", type: "f32", unit: "deg", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "muzzleOffsetHorizontal", hash: 0xfaa5615c, role: "deployPitch", label: "Deploy pitch", type: "f32", unit: "deg", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "offsetAngleVertical", hash: 0x8da251ca, role: "boneSpinRate", label: "Continuous bone spin", type: "f32", unit: "deg/update", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "targetDistance", hash: 0xa25b8b11, role: "deployShotDelay", label: "Wait before deploy shot", type: "f32", unit: "frames", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "onExpireBulletHash", hash: 0x41435be6, role: "deployShotBullet", label: "Deploy shot bullet", type: "hash", source: "sub_14101AE80", evidence: "A" },
  { fieldKey: "aimCorrectionAngle", hash: 0xa5364f08, role: "standbyDistance", label: "Standby slot distance", type: "f32", unit: "units", source: "sub_1411B0770", evidence: "A" },
  { fieldKey: "elevationAngle", hash: 0x3c3f1eb2, role: "standbyYaw", label: "Standby slot yaw", type: "f32", unit: "deg", source: "sub_1411B0770", evidence: "A" },
  { fieldKey: "targetHeightOffset", hash: 0x4b382e24, role: "standbyPitch", label: "Standby slot pitch", type: "f32", unit: "deg", source: "sub_1411B0770", evidence: "A" },
  { fieldKey: "secondaryEffectHash", hash: 0xd8f283fb, role: "shellModelId", label: "Shell model ID (SHL)", type: "hash", source: "sub_140F631B0", evidence: "A" },
];

const FUNNEL_SANKAI_ROLES: readonly BulletFieldRole[] = [
  { fieldKey: "homingEffectiveDistance", hash: 0xdceaf7ac, role: "swarmSpeed", label: "Swarm move speed", type: "f32", unit: "units/frame", source: "sub_140F639A0", evidence: "A" },
  { fieldKey: "launchAngleHorizontal", hash: 0xabedc73a, role: "swarmTurnRate", label: "Swarm turn rate", type: "f32", unit: "deg/frame", source: "sub_140F639A0", evidence: "A" },
  { fieldKey: "muzzleOffsetHorizontal", hash: 0xfaa5615c, role: "swarmRetargetDistance", label: "Swarm retarget distance", type: "f32", unit: "units", source: "sub_140F639A0", evidence: "A" },
  { fieldKey: "offsetAngleVertical", hash: 0x8da251ca, role: "swarmFirstRadius", label: "First swarm point radius", type: "f32", unit: "units", source: "sub_140F639A0", evidence: "A" },
];

const FUNNEL_FLY_ROLES: readonly BulletFieldRole[] = [
  { fieldKey: "homingEffectiveDistance", hash: 0xdceaf7ac, role: "shotCount", label: "Shot count", type: "f32", source: "sub_14101C490", evidence: "A" },
  { fieldKey: "launchAngleHorizontal", hash: 0xabedc73a, role: "shotInterval", label: "Shot interval", type: "f32", unit: "frames", source: "sub_14101C490", evidence: "A" },
  { fieldKey: "onExpireBulletHash", hash: 0x41435be6, role: "shotBullet", label: "Shot bullet", type: "hash", source: "sub_14101C490", evidence: "A" },
];

export const BULLET_CLASS_FIELD_ROLES: readonly BulletClassRoleSet[] = [
  { className: "015GNDMUC_008FAUNIG_001_FunnelModel", classIds: [150080102], roles: FUNNEL_MODEL_ROLES },
  { className: "015GNDMUC_008FAUNIG_001_FunnelSankaiSelf", classIds: [150080105], roles: FUNNEL_SANKAI_ROLES },
  { className: "015GNDMUC_008FAUNIG_001_FunnelSankaiTarget", classIds: [150080106], roles: FUNNEL_SANKAI_ROLES },
  { className: "015GNDMUC_008FAUNIG_001_FunnelFly", classIds: [150080107], roles: FUNNEL_FLY_ROLES },
];

export interface BulletEntryFieldRoles {
  classId: number;
  roleSet: BulletClassRoleSet;
  byField: ReadonlyMap<string, BulletFieldRole>;
}

export function getBulletClassRoleSet(classId: number): BulletClassRoleSet | null {
  const normalized = classId >>> 0;
  return BULLET_CLASS_FIELD_ROLES.find((set) => set.classIds.includes(normalized)) ?? null;
}

/** Reads the UnitTask class id of a bulletparam row, or null when the row has none. */
export function readBulletProjectileId(entry: TypedParamEntry): number | null {
  const value = entry[BULLET_PROJECTILE_ID_KEY];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value >>> 0;
}

/** Class-specific roles for the columns of one bulletparam row, or null when the class is not mapped. */
export function getBulletEntryFieldRoles(entry: TypedParamEntry): BulletEntryFieldRoles | null {
  const classId = readBulletProjectileId(entry);
  if (classId === null) {
    return null;
  }
  const roleSet = getBulletClassRoleSet(classId);
  if (!roleSet) {
    return null;
  }
  return {
    classId,
    roleSet,
    byField: new Map(roleSet.roles.map((role) => [role.fieldKey, role])),
  };
}
