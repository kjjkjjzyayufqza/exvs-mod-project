import { useMemo } from "react";
import {
  GameAccuratePropertyPanel,
  type ComputedSection,
} from "../shared/GameAccuratePropertyPanel";
import type { PropertyGroupDef } from "../shared/types";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";
import {
  getMoveTypeDefinition,
  getMoveTypeCategory,
  MOVE_TYPE_CATEGORIES,
} from "@/lib/gameAlgorithms/moveTypes";
import { getBulletEntryFieldRoles } from "@/lib/gameAlgorithms/bulletClassFieldRoles";
import { formatHash } from "@/models/commandTable";

interface BulletPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

export const BULLET_GROUPS: PropertyGroupDef[] = [
  {
    id: "movement",
    label: "Movement",
    fields: [
      { key: "moveType", label: "Move Type", type: "u32" },
      { key: "initialSpeed", label: "Initial Speed", type: "f32", max: 640 },
      { key: "accelerationValue", label: "Acceleration", type: "f32" },
      { key: "speedScale", label: "Speed Scale", type: "f32" },
      { key: "maxDistance", label: "Max Distance", type: "f32" },
      { key: "maxRange", label: "Max Range", type: "f32" },
      { key: "effectiveRange", label: "Effective Range", type: "f32" },
    ],
  },
  {
    id: "homing",
    label: "Homing",
    fields: [
      { key: "homingType", label: "Homing Type", type: "u32" },
      { key: "homingStrength", label: "Homing Strength", type: "f32", min: 0, max: 1, step: 0.01 },
      { key: "homingAngle", label: "Homing Angle", type: "f32", unit: "deg" },
      { key: "homingRange", label: "Homing Range", type: "f32" },
      { key: "homingDuration", label: "Homing Duration", type: "i32", unit: "frames" },
      { key: "homingStartDistance", label: "Start Distance", type: "f32" },
      { key: "homingEffectiveDistance", label: "Effective Distance", type: "f32" },
      { key: "minHomingDistance", label: "Min Distance", type: "f32" },
      { key: "turnRate", label: "Turn Rate", type: "f32" },
      { key: "turnAcceleration", label: "Turn Acceleration", type: "f32" },
      { key: "trackingAngle", label: "Tracking Angle", type: "f32", unit: "deg" },
    ],
  },
  {
    id: "gravity",
    label: "Gravity & Arc",
    fields: [
      { key: "gravityRate", label: "Gravity Rate", type: "f32" },
      { key: "maxAltitude", label: "Max Altitude", type: "f32" },
    ],
  },
  {
    id: "hitbox",
    label: "Hitbox",
    fields: [
      { key: "hitboxWidth", label: "Width", type: "f32" },
      { key: "hitboxHeight", label: "Height", type: "f32" },
      { key: "hitboxDepth", label: "Depth", type: "f32" },
      { key: "collisionType", label: "Collision Type", type: "u32" },
      { key: "collisionHeight", label: "Collision Height", type: "f32" },
      { key: "blastRadius", label: "Blast Radius", type: "f32" },
    ],
  },
  {
    id: "lifetime",
    label: "Lifetime",
    fields: [
      { key: "lifetime", label: "Lifetime", type: "i32", unit: "frames" },
      { key: "delayFrame", label: "Delay Frame", type: "i32", unit: "frames" },
      { key: "hitIntervalFrame", label: "Hit Interval", type: "i32", unit: "frames" },
      { key: "pierceCount", label: "Pierce Count", type: "i32" },
    ],
  },
  {
    id: "spawn",
    label: "Spawn Position",
    fields: [
      { key: "spawnOffsetForward", label: "Spawn Offset Forward", type: "f32", unit: "deg", tooltip: "Converted deg->rad in sub_1405C4400" },
      { key: "spawnOffsetVertical", label: "Spawn Offset Vertical", type: "f32" },
      { key: "horizontalAimAngle", label: "Horizontal Aim Angle", type: "f32", unit: "deg", tooltip: "Converted deg->rad in sub_1405C4400" },
      { key: "spawnHorizontalOffset", label: "Spawn Horizontal Offset", type: "f32", tooltip: "Spawn left/right offset" },
      { key: "spawnForwardOffset", label: "Spawn Forward Offset", type: "f32", tooltip: "Spawn front/back offset" },
      { key: "initialAngle", label: "Initial Angle", type: "f32", unit: "deg" },
      { key: "spreadAngle", label: "Spread Angle", type: "f32", unit: "deg" },
      { key: "elevationAngle", label: "Elevation Angle", type: "f32", unit: "deg" },
      { key: "rotationAngle", label: "Rotation Angle", type: "f32", unit: "deg" },
      { key: "launchAngleHorizontal", label: "Launch Angle Horizontal", type: "f32", unit: "deg" },
    ],
  },
  {
    id: "aim",
    label: "Aim & Offset",
    fields: [
      { key: "aimOffsetVertical", label: "Aim Offset Vertical", type: "f32" },
      { key: "aimCorrectionAngle", label: "Aim Correction Angle", type: "f32" },
      { key: "aimLimitAngle", label: "Aim Limit Angle", type: "f32" },
      { key: "targetHeightOffset", label: "Target Height Offset", type: "f32" },
      { key: "targetDistance", label: "Target Distance", type: "f32" },
      { key: "offsetAngleVertical", label: "Offset Angle Vertical", type: "f32" },
    ],
  },
  {
    id: "visual",
    label: "Visual Scale",
    fields: [
      { key: "visualScale", label: "Visual Scale", type: "f32" },
      { key: "hitEffectScale", label: "Hit Effect Scale", type: "f32" },
      { key: "modelScale", label: "Model Scale", type: "f32" },
    ],
  },
  {
    id: "references",
    label: "Hash References",
    fields: [
      { key: "projectileId", label: "Projectile ID", type: "hash" },
      { key: "onExpireBulletHash", label: "Storm ID", type: "hash", tooltip: "On-expire Bullet hash" },
      { key: "trailEffectHash", label: "Trail Effect", type: "hash" },
      { key: "muzzleFlashHash", label: "Muzzle Flash", type: "hash" },
      { key: "hitId", label: "Hit ID", type: "hash", tooltip: "Indexes interactionid.bin" },
      { key: "soundNameCrc32", label: "SE ID", type: "hash", tooltip: "CRC32 of the sound name" },
      { key: "childBulletHash", label: "Child Bullet", type: "hash" },
      { key: "spawnPatternHash", label: "Spawn Pattern", type: "hash" },
      { key: "hitgroupHash", label: "Hit Group", type: "hash" },
      { key: "secondaryEffectHash", label: "Secondary Effect", type: "hash" },
      { key: "projectileDepictionId", label: "Projectile Depiction ID", type: "hash" },
      { key: "ammoTypeHash", label: "Ammo Type", type: "hash" },
      { key: "behaviorType", label: "Behavior Type", type: "hash" },
      { key: "beamTypeHash", label: "Beam Type", type: "hash" },
      { key: "penetrateTypeHash", label: "Penetrate Type", type: "hash" },
      { key: "inheritSpeedHash", label: "Inherit Speed", type: "hash" },
    ],
  },
  {
    id: "misc",
    label: "Miscellaneous",
    fields: [
      { key: "bulletShape", label: "Bullet Shape", type: "u32" },
      { key: "speedInternal", label: "Speed Internal", type: "i32" },
      { key: "reservedFlag110", label: "Reserved Flag 110", type: "u32" },
      { key: "reserved050", label: "Reserved 050", type: "f32" },
      { key: "reserved060", label: "Reserved 060", type: "f32" },
      { key: "reserved0d8", label: "Reserved 0D8", type: "f32" },
      { key: "reserved0e8", label: "Reserved 0E8", type: "f32" },
      { key: "reservedF4", label: "Reserved F4", type: "f32" },
      { key: "reserved118", label: "Reserved 118", type: "f32" },
      { key: "reserved124", label: "Reserved 124", type: "f32" },
    ],
  },
];

/**
 * Groups for one bulletparam row. When the row's projectile class reads some
 * columns with a class-specific role, those columns move into a leading group
 * labelled with their real role; the canonical keys are unchanged.
 */
export function buildBulletGroups(entry: TypedParamEntry): PropertyGroupDef[] {
  const classRoles = getBulletEntryFieldRoles(entry);
  if (!classRoles) {
    return BULLET_GROUPS;
  }
  const { classId, roleSet, byField } = classRoles;
  const roleGroup: PropertyGroupDef = {
    id: "classRoles",
    label: `Class Roles · ${roleSet.className} (${classId})`,
    fields: roleSet.roles.map((role) => ({
      key: role.fieldKey,
      label: role.label,
      type: role.type,
      unit: role.unit,
      tooltip: `${role.fieldKey} (${formatHash(role.hash)}) is read as ${role.role} by ${role.source} for class ${classId}`,
    })),
  };
  const remainingGroups = BULLET_GROUPS.map((group) => ({
    ...group,
    fields: group.fields.filter((field) => !byField.has(field.key)),
  })).filter((group) => group.fields.length > 0);
  return [roleGroup, ...remainingGroups];
}

export function buildBulletComputedSections(entry: TypedParamEntry): ComputedSection[] {
  const moveType = Math.trunc(num(entry, "moveType"));
  const moveDef = getMoveTypeDefinition(moveType);
  const category = getMoveTypeCategory(moveType);
  const catInfo = MOVE_TYPE_CATEGORIES[category];

  const sections: ComputedSection[] = [];

  sections.push({
    label: "Move Type Analysis",
    values: [
      { label: "Move Type ID", value: moveType },
      { label: "Category", value: catInfo.label, color: catInfo.color },
      { label: "Label", value: moveDef?.label ?? "Unknown" },
      { label: "Description", value: moveDef?.description ?? "\u2014" },
    ],
  });

  const speed = num(entry, "initialSpeed");
  const lifetime = Math.abs(num(entry, "lifetime"));
  const effRange = num(entry, "effectiveRange");

  const estimatedRange = speed > 0 && lifetime > 0 ? speed * lifetime : 0;
  const travelTime =
    speed > 0 && effRange > 0
      ? (effRange / speed / 60).toFixed(2) + "s"
      : "\u2014";

  sections.push({
    label: "Physics Summary",
    values: [
      {
        label: "Estimated Max Range",
        value: estimatedRange > 0 ? estimatedRange.toFixed(0) : "\u2014",
      },
      { label: "Travel Time (to eff. range)", value: travelTime },
      { label: "Speed (game units/frame)", value: speed.toFixed(2) },
      ...(lifetime > 0
        ? [
            {
              label: "Lifetime",
              value: `${lifetime}f (${(lifetime / 60).toFixed(2)}s)`,
            },
          ]
        : []),
    ],
    defaultOpen: false,
  });

  return sections;
}

export function BulletPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: BulletPropertyPanelProps) {
  const computedSections = useMemo(() => buildBulletComputedSections(entry), [entry]);
  const groups = useMemo(() => buildBulletGroups(entry), [entry]);

  return (
    <GameAccuratePropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={(key, value) => {
        if (typeof value !== "number") {
          throw new Error(`Bullet field ${key} requires a numeric value`);
        }
        onFieldChange(key, value);
      }}
      groups={groups}
      computedSections={computedSections}
    />
  );
}
