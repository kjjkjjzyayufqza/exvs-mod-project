/**
 * Schema-aligned armsparam UI model.
 * Field keys match Rust ARMSPARAM_COMMAND_POOL via snake_to_camel
 * (src-tauri/src/format/armsparam.rs).
 */

import {
  BULLET_TYPE_LABELS,
  CANCEL_ROUTE_LABELS,
  CHARGE_WEAPON_TYPE_LABELS,
  GUARD_BREAK_TYPE_LABELS,
  LANDING_BEHAVIOR_LABELS,
  RELOAD_TYPE_LABELS,
  SHOT_TYPE_LABELS,
  type ReloadType,
  getActionTimeline,
  getReloadTimeline,
} from "@/lib/gameAlgorithms/reloadSystem";
import { readTypedEntryLabels } from "../../param-editor/paramEntryUtils";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { PropertyFieldDef, PropertyGroupDef } from "../shared/types";
import type { ComputedSection } from "../shared/GameAccuratePropertyPanel";

/** Pool hash → camelCase JSON key (must stay in sync with armsparam.rs). */
export const ARMS_FIELD_HASH_BY_KEY: Record<string, number> = {
  isEnabled: 0x020a35dd,
  unk04Reserved: 0x02d35f32,
  isContinuousFire: 0x0496c136,
  reloadStartFrame: 0x04a2cfd6,
  reloadTimeTotal: 0x103171ae,
  reloadType: 0x11dee0c8,
  chargeWeaponType: 0x1348893f,
  canMoveWhileFiring: 0x1e8e41ef,
  homingAngle: 0x31427cc3,
  inductionRate: 0x3a1d6254,
  homingStartRate: 0x3bc65821,
  homingEndRate: 0x3cab9c38,
  ammoCount: 0x4961274c,
  damageCorrectionRate: 0x4a7796db,
  downCorrectionRate: 0x4bacacae,
  shotType: 0x4c527468,
  damage: 0x4c84f7c0,
  stunCorrectionRate: 0x4d1a52c2,
  downValue: 0x4e692acd,
  cancelRouteType: 0x596fc1c3,
  isVernier: 0x5b072b6c,
  cooldownFrame: 0x67364138,
  startupFrame: 0x73a5ff40,
  activeFrame: 0x74c83b59,
  recoveryFrame: 0x89382014,
  totalDurationFrame: 0x8e55e40d,
  landingRecoveryFrame: 0x9ac65a75,
  stunValue: 0xa06caad5,
  boostConsumptionRate: 0xa2cf099b,
  range: 0xa353f222,
  muzzleCorrectionRate: 0xa479f7f7,
  reloadPerShotFrame: 0xa502bcf2,
  reloadLockFrame: 0xa635cfc2,
  overheatFrame: 0xab9aef6c,
  chargeFrame: 0xabc33f14,
  guardBreakType: 0xac243293,
  landingBehaviorType: 0xb669a42a,
  isSuperArmor: 0xb686e88c,
  bulletType: 0xbb93d195,
  trackingSpeedRate: 0xd37ec761,
  bulletSpeedRate: 0xd5c8390d,
  actionLabel: 0xe6213731,
  actionLabelOffset: 0xe6213731,
  ammoReloadWaitFrame: 0xedc16ae3,
  hitEffectType: 0xef3f41b3,
  resourceLabel: 0xf3c4cae9,
  resourceLabelOffset: 0xf3c4cae9,
  bulletCountPerShot: 0xf8aeec77,
  firingIntervalFrame: 0xf8e59f33,
  fullChargeFrame: 0xf952d49b,
};

function enumOptions(map: Record<number, string>): { value: number; label: string }[] {
  return Object.entries(map).map(([value, label]) => ({
    value: Number(value),
    label: `${value}: ${label}`,
  }));
}

function field(
  key: string,
  partial: Omit<PropertyFieldDef, "key" | "label"> & { label?: string },
): PropertyFieldDef {
  return {
    key,
    label: partial.label ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
    ...partial,
  };
}

/** Explicit groups for GameAccuratePropertyPanel — keys from ARMSPARAM_COMMAND_POOL only. */
export function buildArmsPropertyGroups(): PropertyGroupDef[] {
  return [
    {
      id: "labels",
      label: "Labels",
      fields: [
        field("actionLabel", {
          type: "string",
          label: "actionLabel",
          tooltip: "Decoded kind-7 action name (0xE6213731)",
        }),
        field("resourceLabel", {
          type: "string",
          label: "resourceLabel",
          tooltip: "Decoded kind-7 resource name (0xF3C4CAE9)",
        }),
      ],
    },
    {
      id: "state",
      label: "State flags",
      fields: [
        field("isEnabled", { type: "bool", tooltip: "0x020A35DD" }),
        field("isContinuousFire", { type: "bool", tooltip: "0x0496C136" }),
        field("isVernier", {
          type: "bool",
          tooltip: "0x5B072B6C — arms schema flag; not task_param vernier gate",
        }),
        field("isSuperArmor", { type: "bool", tooltip: "0xB686E88C" }),
        field("canMoveWhileFiring", { type: "bool", tooltip: "0x1E8E41EF" }),
        field("unk04Reserved", {
          type: "u32",
          tooltip: "0x02D35F32 — nearly always 0 in corpus",
        }),
      ],
    },
    {
      id: "ammo",
      label: "Ammo and shot",
      fields: [
        field("ammoCount", { type: "i32", min: 0, max: 1000, unit: "rounds", tooltip: "0x4961274C" }),
        field("bulletCountPerShot", { type: "i32", min: 0, unit: "count", tooltip: "0xF8AEEC77" }),
        field("firingIntervalFrame", { type: "i32", min: 0, unit: "f", tooltip: "0xF8E59F33" }),
        field("shotType", {
          type: "enum",
          enumOptions: enumOptions(SHOT_TYPE_LABELS),
          tooltip: "0x4C527468",
        }),
        field("bulletType", {
          type: "enum",
          enumOptions: enumOptions(BULLET_TYPE_LABELS),
          tooltip: "0xBB93D195",
        }),
      ],
    },
    {
      id: "reload",
      label: "Reload (schema fields, unverified semantics)",
      fields: [
        field("reloadType", {
          type: "enum",
          enumOptions: enumOptions(RELOAD_TYPE_LABELS),
          tooltip: "0x11DEE0C8 — enum labels unverified against MSC",
        }),
        field("reloadStartFrame", { type: "i32", unit: "f", tooltip: "0x04A2CFD6" }),
        field("reloadTimeTotal", { type: "i32", unit: "f", tooltip: "0x103171AE" }),
        field("reloadPerShotFrame", {
          type: "i32",
          unit: "f",
          tooltip: "0xA502BCF2 — RX-78 type2 uses 180 here",
        }),
        field("reloadLockFrame", { type: "i32", unit: "f", tooltip: "0xA635CFC2" }),
        field("ammoReloadWaitFrame", { type: "i32", unit: "f", tooltip: "0xEDC16AE3" }),
        field("overheatFrame", { type: "i32", unit: "f", tooltip: "0xAB9AEF6C" }),
      ],
    },
    {
      id: "timing",
      label: "Action timing",
      fields: [
        field("startupFrame", { type: "i32", unit: "f", tooltip: "0x73A5FF40" }),
        field("activeFrame", { type: "i32", unit: "f", tooltip: "0x74C83B59" }),
        field("recoveryFrame", { type: "i32", unit: "f", tooltip: "0x89382014" }),
        field("cooldownFrame", { type: "i32", unit: "f", tooltip: "0x67364138" }),
        field("totalDurationFrame", { type: "i32", unit: "f", tooltip: "0x8E55E40D" }),
        field("landingRecoveryFrame", { type: "i32", unit: "f", tooltip: "0x9AC65A75" }),
      ],
    },
    {
      id: "charge",
      label: "Charge",
      fields: [
        field("chargeWeaponType", {
          type: "enum",
          enumOptions: enumOptions(CHARGE_WEAPON_TYPE_LABELS),
          tooltip: "0x1348893F",
        }),
        field("chargeFrame", { type: "i32", unit: "f", tooltip: "0xABC33F14" }),
        field("fullChargeFrame", { type: "i32", unit: "f", tooltip: "0xF952D49B" }),
      ],
    },
    {
      id: "damage",
      label: "Damage and stun",
      fields: [
        field("damage", { type: "i32", min: 0, tooltip: "0x4C84F7C0" }),
        field("downValue", { type: "i32", min: 0, tooltip: "0x4E692ACD" }),
        field("stunValue", { type: "i32", min: 0, tooltip: "0xA06CAAD5" }),
        field("damageCorrectionRate", { type: "f32", step: 0.01, tooltip: "0x4A7796DB" }),
        field("downCorrectionRate", { type: "f32", step: 0.01, tooltip: "0x4BACACAE" }),
        field("stunCorrectionRate", { type: "f32", step: 0.01, tooltip: "0x4D1A52C2" }),
      ],
    },
    {
      id: "homing",
      label: "Homing and projectile rates",
      fields: [
        field("homingAngle", { type: "i32", unit: "deg", tooltip: "0x31427CC3" }),
        field("inductionRate", { type: "f32", step: 0.01, tooltip: "0x3A1D6254" }),
        field("homingStartRate", { type: "f32", step: 0.01, tooltip: "0x3BC65821" }),
        field("homingEndRate", { type: "f32", step: 0.01, tooltip: "0x3CAB9C38" }),
        field("trackingSpeedRate", { type: "f32", step: 0.01, tooltip: "0xD37EC761" }),
        field("bulletSpeedRate", { type: "f32", step: 0.01, tooltip: "0xD5C8390D" }),
        field("muzzleCorrectionRate", { type: "f32", step: 0.01, tooltip: "0xA479F7F7" }),
      ],
    },
    {
      id: "combat",
      label: "Combat behavior",
      fields: [
        field("range", { type: "i32", tooltip: "0xA353F222" }),
        field("cancelRouteType", {
          type: "enum",
          enumOptions: enumOptions(CANCEL_ROUTE_LABELS),
          tooltip: "0x596FC1C3",
        }),
        field("guardBreakType", {
          type: "enum",
          enumOptions: enumOptions(GUARD_BREAK_TYPE_LABELS),
          tooltip: "0xAC243293",
        }),
        field("landingBehaviorType", {
          type: "enum",
          enumOptions: enumOptions(LANDING_BEHAVIOR_LABELS),
          tooltip: "0xB669A42A",
        }),
        field("hitEffectType", { type: "u32", tooltip: "0xEF3F41B3" }),
        field("boostConsumptionRate", { type: "f32", step: 0.01, tooltip: "0xA2CF099B" }),
      ],
    },
  ];
}

export function numField(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function readOptionalU32(entry: TypedParamEntry, key: string): number | null {
  const v = entry[key];
  return typeof v === "number" && Number.isFinite(v) ? v >>> 0 : null;
}

export function readOptionalString(entry: TypedParamEntry, key: string): string | null {
  const v = entry[key];
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface ArmsResolvedLabels {
  actionOffset: number | null;
  resourceOffset: number | null;
  actionLabel: string | null;
  resourceLabel: string | null;
  /** True when either offset is present or a decoded/string label exists. */
  hasAny: boolean;
}

/**
 * Resolve kind-7 arms labels.
 * armsparam JSON keeps absolute file offsets (`actionLabelOffset` /
 * `resourceLabelOffset`); decode obfuscated C-strings from full file bytes.
 */
export function resolveArmsLabels(
  entry: TypedParamEntry,
  fileBytes?: Uint8Array | null,
): ArmsResolvedLabels {
  const labels = readTypedEntryLabels(entry, fileBytes ?? null);
  const actionOffset =
    readOptionalU32(entry, "actionLabelOffset") ??
    readOptionalU32(entry, "actionLabel");
  const resourceOffset =
    readOptionalU32(entry, "resourceLabelOffset") ??
    readOptionalU32(entry, "resourceLabel");
  const actionLabel =
    labels.actionLabel ??
    readOptionalString(entry, "actionLabel") ??
    readOptionalString(entry, "actionLabelOffset");
  const resourceLabel =
    labels.resourceLabel ??
    readOptionalString(entry, "resourceLabel") ??
    readOptionalString(entry, "resourceLabelOffset");

  return {
    actionOffset,
    resourceOffset,
    actionLabel,
    resourceLabel,
    hasAny: Boolean(
      actionLabel ||
        resourceLabel ||
        (actionOffset != null && actionOffset !== 0) ||
        (resourceOffset != null && resourceOffset !== 0),
    ),
  };
}

export function framesToSeconds(frames: number): number {
  return frames / 60;
}

export function formatFrames(frames: number): string {
  if (!Number.isFinite(frames) || frames === 0) return "0f";
  return `${frames}f (${framesToSeconds(frames).toFixed(2)}s)`;
}

export function formatHashU32(value: number): string {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export interface ArmsFlagChip {
  key: string;
  label: string;
  active: boolean;
}

export function getArmsFlagChips(entry: TypedParamEntry): ArmsFlagChip[] {
  return [
    { key: "isEnabled", label: "Enabled", active: numField(entry, "isEnabled") !== 0 },
    { key: "isContinuousFire", label: "Continuous", active: numField(entry, "isContinuousFire") !== 0 },
    { key: "isVernier", label: "Vernier flag", active: numField(entry, "isVernier") !== 0 },
    { key: "isSuperArmor", label: "Super armor", active: numField(entry, "isSuperArmor") !== 0 },
    {
      key: "canMoveWhileFiring",
      label: "Move while firing",
      active: numField(entry, "canMoveWhileFiring") !== 0,
    },
  ];
}

export function buildArmsComputedSections(entry: TypedParamEntry): ComputedSection[] {
  const action = getActionTimeline(entry);
  const reload = getReloadTimeline(entry);
  const phaseSum =
    action.startupFrame + action.activeFrame + action.recoveryFrame + action.cooldownFrame;
  const reloadTypeLabel =
    RELOAD_TYPE_LABELS[reload.reloadType as ReloadType] ??
    `Type ${reload.reloadType} (outside known 0-3)`;

  return [
    {
      label: "Derived (60 fps)",
      defaultOpen: true,
      values: [
        {
          label: "Action phase sum",
          value: formatFrames(phaseSum),
          tooltip: "startup + active + recovery + cooldown",
        },
        {
          label: "totalDurationFrame",
          value: formatFrames(action.totalDurationFrame),
          tooltip: "Raw schema field 0x8E55E40D (not always equal to phase sum)",
        },
        {
          label: "Reload type",
          value: reloadTypeLabel,
          tooltip: "Semantics unverified — inspect MSC consumers",
        },
        {
          label: "reloadPerShotFrame",
          value: formatFrames(reload.reloadPerShotFrame),
          tooltip: "0xA502BCF2",
        },
        {
          label: "Ammo",
          value: numField(entry, "ammoCount"),
          unit: "rounds",
        },
        {
          label: "Damage",
          value: numField(entry, "damage"),
        },
      ],
    },
  ];
}

export interface ArmsStatBar {
  key: string;
  label: string;
  value: number;
  max: number;
  display: string;
}

/** Single-accent overview bars (no rainbow palette). */
export function buildArmsOverviewStats(entry: TypedParamEntry): ArmsStatBar[] {
  const ammo = numField(entry, "ammoCount");
  const damage = numField(entry, "damage");
  const startup = numField(entry, "startupFrame");
  const active = numField(entry, "activeFrame");
  const recovery = numField(entry, "recoveryFrame");
  const range = numField(entry, "range");

  return [
    {
      key: "damage",
      label: "Damage",
      value: damage,
      max: Math.max(damage, 300),
      display: String(damage),
    },
    {
      key: "ammo",
      label: "Ammo",
      value: ammo,
      max: Math.max(ammo, 20),
      display: String(ammo),
    },
    {
      key: "startup",
      label: "Startup",
      value: startup,
      max: Math.max(startup, 60),
      display: formatFrames(startup),
    },
    {
      key: "active",
      label: "Active",
      value: active,
      max: Math.max(active, 120),
      display: formatFrames(active),
    },
    {
      key: "recovery",
      label: "Recovery",
      value: recovery,
      max: Math.max(recovery, 60),
      display: formatFrames(recovery),
    },
    {
      key: "range",
      label: "Range",
      value: range,
      max: Math.max(range, 200),
      display: String(range),
    },
  ];
}

export interface ArmsSchemaFieldRow {
  hash: string;
  key: string;
  value: string;
}

/** Raw schema dump for evidence-oriented reload/ammo inspection. */
export function buildArmsSchemaFieldRows(
  entry: TypedParamEntry,
  keys: string[],
): ArmsSchemaFieldRow[] {
  return keys.map((key) => {
    const hash = ARMS_FIELD_HASH_BY_KEY[key];
    const raw = entry[key];
    let value: string;
    if (typeof raw === "number") {
      if (key.endsWith("Frame") || key === "ammoReloadWaitFrame") {
        value = formatFrames(raw);
      } else if (key === "actionLabelOffset" || key === "resourceLabelOffset") {
        value = formatHashU32(raw);
      } else if (Number.isInteger(raw)) {
        value = String(raw);
      } else {
        value = raw.toFixed(4);
      }
    } else if (typeof raw === "string") {
      value = raw;
    } else if (raw == null) {
      value = "—";
    } else {
      value = String(raw);
    }
    return {
      hash: hash != null ? formatHashU32(hash) : "—",
      key,
      value,
    };
  });
}

export const ARMS_RELOAD_SCHEMA_KEYS = [
  "ammoCount",
  "reloadType",
  "reloadStartFrame",
  "reloadTimeTotal",
  "reloadPerShotFrame",
  "reloadLockFrame",
  "ammoReloadWaitFrame",
  "overheatFrame",
  "cooldownFrame",
] as const;
