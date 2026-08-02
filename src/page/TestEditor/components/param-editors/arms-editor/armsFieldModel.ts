/**
 * Native-evidence armsparam UI model.
 * Field keys match Rust ARMSPARAM_COMMAND_POOL via snake_to_camel.
 */

import {
  RELOAD_BEHAVIOR_TYPE_LABELS,
  getArmsReloadProfile,
  type ReloadBehaviorType,
} from "@/lib/gameAlgorithms/reloadSystem";
import {
  CHARGE_INPUT_FLAG_LABELS,
  describeChargeInputFlags,
  getArmsChargeProfile,
  getChargeFullDurationForSelector,
} from "@/lib/gameAlgorithms/chargeSystem";
import { readTypedEntryLabels } from "../../param-editor/paramEntryUtils";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { ComputedSection } from "../shared/GameAccuratePropertyPanel";
import type { PropertyFieldDef, PropertyGroupDef } from "../shared/types";

/** Pool hash -> canonical camelCase JSON key. */
export const ARMS_FIELD_HASH_BY_KEY: Record<string, number> = {
  field020a35dd: 0x020a35dd,
  field02d35f32: 0x02d35f32,
  field0496c136: 0x0496c136,
  reloadDurationGroupBMode4: 0x04a2cfd6,
  reloadDurationGroupAMode2: 0x103171ae,
  field11dee0c8: 0x11dee0c8,
  field1348893f: 0x1348893f,
  field1e8e41ef: 0x1e8e41ef,
  chargeAccumulateDurationDefaultFrame: 0x31427cc3,
  chargeDecayDurationMode4Scale: 0x3a1d6254,
  chargeAccumulateDurationMode1Scale: 0x3bc65821,
  chargeAccumulateDurationMode5Scale: 0x3cab9c38,
  ammoCount: 0x4961274c,
  chargeDecayDurationMode1Scale: 0x4a7796db,
  chargeAccumulateDurationMode4Scale: 0x4bacacae,
  chargeStageCount: 0x4c527468,
  reloadDurationGroupBDefault: 0x4c84f7c0,
  chargeDecayDurationMode5Scale: 0x4d1a52c2,
  initialAmmoCount: 0x4e692acd,
  chargeInputFlags: 0x596fc1c3,
  field5b072b6c: 0x5b072b6c,
  reloadDurationGroupAMode3: 0x67364138,
  reloadDurationGroupBMode5: 0x73a5ff40,
  reloadDurationGroupBMode1: 0x74c83b59,
  reloadDurationGroupAMode1: 0x89382014,
  reloadDurationGroupAMode5: 0x8e55e40d,
  reloadDurationGroupBMode3: 0x9ac65a75,
  fieldA06caad5: 0xa06caad5,
  chargeAccumulateDurationMode2Scale: 0xa2cf099b,
  reloadAuxGroupB: 0xa353f222,
  chargeDecayDurationMode3Scale: 0xa479f7f7,
  reloadDurationGroupADefault: 0xa502bcf2,
  chargeDecayDurationDefaultFrame: 0xa635cfc2,
  slotIndex: 0xab9aef6c,
  reloadAuxGroupA: 0xabc33f14,
  reloadBehaviorType: 0xac243293,
  behaviorFlags: 0xb669a42a,
  reloadGroupBEnabled: 0xb686e88c,
  fieldBb93d195: 0xbb93d195,
  chargeDecayDurationMode2Scale: 0xd37ec761,
  chargeAccumulateDurationMode3Scale: 0xd5c8390d,
  actionLabel: 0xe6213731,
  actionLabelOffset: 0xe6213731,
  reloadDurationGroupBMode2: 0xedc16ae3,
  fieldEf3f41b3: 0xef3f41b3,
  resourceLabel: 0xf3c4cae9,
  resourceLabelOffset: 0xf3c4cae9,
  chargeAccumulateDurationBaseFrame: 0xf8aeec77,
  chargeDecayDurationBaseFrame: 0xf8e59f33,
  reloadDurationGroupAMode4: 0xf952d49b,
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

function hashTooltip(hash: number, evidence: string): string {
  return `${formatHashU32(hash)} — ${evidence}`;
}

function reloadDurationField(key: string, hash: number): PropertyFieldDef {
  return field(key, {
    type: "i32",
    min: 0,
    unit: "f",
    tooltip: hashTooltip(hash, "native-selected reload duration"),
  });
}

function chargeScaleField(key: string, hash: number): PropertyFieldDef {
  return field(key, {
    type: "f32",
    step: 0.01,
    min: 0,
    tooltip: hashTooltip(hash, "native runtime-mode multiplier for charge timing"),
  });
}

function chargeDurationField(
  key: string,
  hash: number,
  direction: "accumulate" | "decay",
): PropertyFieldDef {
  return field(key, {
    type: "i32",
    min: 0,
    unit: "f/stage",
    tooltip: hashTooltip(hash, `native charge ${direction} duration per stage`),
  });
}

export function buildArmsPropertyGroups(): PropertyGroupDef[] {
  return [
    {
      id: "labels",
      label: "Labels",
      fields: [
        field("actionLabel", {
          type: "string",
          tooltip: "Decoded kind-7 action label (0xE6213731)",
        }),
        field("resourceLabel", {
          type: "string",
          tooltip: "Decoded kind-7 resource label (0xF3C4CAE9)",
        }),
      ],
    },
    {
      id: "native-core",
      label: "Native-verified ammo, charge, and reload",
      fields: [
        field("ammoCount", {
          type: "i32",
          min: 0,
          unit: "rounds",
          tooltip: hashTooltip(0x4961274c, "capacity / maximum ammo"),
        }),
        field("initialAmmoCount", {
          type: "i32",
          min: 0,
          unit: "rounds",
          tooltip: hashTooltip(0x4e692acd, "copied into current ammo during reset"),
        }),
        field("slotIndex", {
          type: "i32",
          min: 0,
          max: 8,
          tooltip: hashTooltip(0xab9aef6c, "0-8 CArmsParamManager binding slot"),
        }),
        field("reloadBehaviorType", {
          type: "enum",
          enumOptions: enumOptions(RELOAD_BEHAVIOR_TYPE_LABELS),
          tooltip: hashTooltip(0xac243293, "native reload state-machine switch 0-5"),
        }),
        field("behaviorFlags", {
          type: "u32",
          tooltip: hashTooltip(0xb669a42a, "native bit flags copied into runtime state"),
        }),
        field("reloadGroupBEnabled", {
          type: "bool",
          tooltip: hashTooltip(0xb686e88c, "gates duration group B in native selector"),
        }),
        field("chargeInputFlags", {
          type: "enum",
          enumOptions: enumOptions(CHARGE_INPUT_FLAG_LABELS),
          tooltip: hashTooltip(
            0x596fc1c3,
            "native input flags; corpus-proven 1=CSA and 2=CSB",
          ),
        }),
        field("chargeStageCount", {
          type: "i32",
          min: 0,
          tooltip: hashTooltip(0x4c527468, "maximum integer charge stage"),
        }),
      ],
    },
    {
      id: "reload-group-a",
      label: "Reload duration group A",
      fields: [
        field("reloadAuxGroupA", {
          type: "i32",
          min: 0,
          tooltip: hashTooltip(0xabc33f14, "group-A auxiliary divisor/value"),
        }),
        reloadDurationField("reloadDurationGroupADefault", 0xa502bcf2),
        reloadDurationField("reloadDurationGroupAMode1", 0x89382014),
        reloadDurationField("reloadDurationGroupAMode2", 0x103171ae),
        reloadDurationField("reloadDurationGroupAMode3", 0x67364138),
        reloadDurationField("reloadDurationGroupAMode4", 0xf952d49b),
        reloadDurationField("reloadDurationGroupAMode5", 0x8e55e40d),
      ],
    },
    {
      id: "reload-group-b",
      label: "Reload duration group B",
      fields: [
        field("reloadAuxGroupB", {
          type: "i32",
          min: 0,
          tooltip: hashTooltip(0xa353f222, "group-B auxiliary divisor/value"),
        }),
        reloadDurationField("reloadDurationGroupBDefault", 0x4c84f7c0),
        reloadDurationField("reloadDurationGroupBMode1", 0x74c83b59),
        reloadDurationField("reloadDurationGroupBMode2", 0xedc16ae3),
        reloadDurationField("reloadDurationGroupBMode3", 0x9ac65a75),
        reloadDurationField("reloadDurationGroupBMode4", 0x04a2cfd6),
        reloadDurationField("reloadDurationGroupBMode5", 0x73a5ff40),
      ],
    },
    {
      id: "charge-accumulate",
      label: "Charge accumulation duration",
      fields: [
        chargeDurationField(
          "chargeAccumulateDurationDefaultFrame",
          0x31427cc3,
          "accumulate",
        ),
        chargeDurationField(
          "chargeAccumulateDurationBaseFrame",
          0xf8aeec77,
          "accumulate",
        ),
        chargeScaleField("chargeAccumulateDurationMode1Scale", 0x3bc65821),
        chargeScaleField("chargeAccumulateDurationMode2Scale", 0xa2cf099b),
        chargeScaleField("chargeAccumulateDurationMode3Scale", 0xd5c8390d),
        chargeScaleField("chargeAccumulateDurationMode4Scale", 0x4bacacae),
        chargeScaleField("chargeAccumulateDurationMode5Scale", 0x3cab9c38),
      ],
    },
    {
      id: "charge-decay",
      label: "Charge decay duration",
      fields: [
        chargeDurationField(
          "chargeDecayDurationDefaultFrame",
          0xa635cfc2,
          "decay",
        ),
        chargeDurationField(
          "chargeDecayDurationBaseFrame",
          0xf8e59f33,
          "decay",
        ),
        chargeScaleField("chargeDecayDurationMode1Scale", 0x4a7796db),
        chargeScaleField("chargeDecayDurationMode2Scale", 0xd37ec761),
        chargeScaleField("chargeDecayDurationMode3Scale", 0xa479f7f7),
        chargeScaleField("chargeDecayDurationMode4Scale", 0x3a1d6254),
        chargeScaleField("chargeDecayDurationMode5Scale", 0x4d1a52c2),
      ],
    },
    {
      id: "unresolved",
      label: "Unresolved native fields",
      fields: [
        field("field020a35dd", { type: "u32", tooltip: "0x020A35DD" }),
        field("field02d35f32", { type: "u32", tooltip: "0x02D35F32" }),
        field("field0496c136", { type: "u32", tooltip: "0x0496C136" }),
        field("field11dee0c8", { type: "u32", tooltip: "0x11DEE0C8" }),
        field("field1348893f", { type: "u32", tooltip: "0x1348893F" }),
        field("field1e8e41ef", { type: "u32", tooltip: "0x1E8E41EF" }),
        field("field5b072b6c", { type: "u32", tooltip: "0x5B072B6C" }),
        field("fieldA06caad5", { type: "i32", tooltip: "0xA06CAAD5" }),
        field("fieldBb93d195", { type: "u32", tooltip: "0xBB93D195" }),
        field("fieldEf3f41b3", { type: "u32", tooltip: "0xEF3F41B3" }),
      ],
    },
  ];
}

export function numField(entry: TypedParamEntry, key: string): number {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function readOptionalU32(entry: TypedParamEntry, key: string): number | null {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value >>> 0 : null;
}

export function readOptionalString(entry: TypedParamEntry, key: string): string | null {
  const value = entry[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface ArmsResolvedLabels {
  actionOffset: number | null;
  resourceOffset: number | null;
  actionLabel: string | null;
  resourceLabel: string | null;
  hasAny: boolean;
}

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
  const flags = numField(entry, "behaviorFlags") >>> 0;
  return [
    { key: "behaviorBit0", label: "behavior bit 0", active: (flags & 1) !== 0 },
    { key: "behaviorBit1", label: "behavior bit 1", active: (flags & 2) !== 0 },
    { key: "behaviorBit2", label: "behavior bit 2", active: (flags & 4) !== 0 },
    {
      key: "reloadGroupBEnabled",
      label: "reload group B gate",
      active: numField(entry, "reloadGroupBEnabled") !== 0,
    },
  ];
}

export function buildArmsComputedSections(entry: TypedParamEntry): ComputedSection[] {
  const profile = getArmsReloadProfile(entry);
  const charge = getArmsChargeProfile(entry);
  const reloadLabel =
    RELOAD_BEHAVIOR_TYPE_LABELS[
      profile.reloadBehaviorType as ReloadBehaviorType
    ] ?? `Type ${profile.reloadBehaviorType} (outside native 0-5 range)`;

  return [
    {
      label: "Native evidence",
      defaultOpen: true,
      values: [
        { label: "Capacity", value: profile.ammoCount, unit: "rounds" },
        { label: "Initial ammo", value: profile.initialAmmoCount, unit: "rounds" },
        { label: "Slot index", value: profile.slotIndex },
        {
          label: "Charge input",
          value: describeChargeInputFlags(charge.inputFlags),
          tooltip: "0x596FC1C3; 1=CSA, 2=CSB in the complete 432-file corpus",
        },
        { label: "Charge stages", value: charge.stageCount },
        {
          label: "Charge / stage",
          value: formatFrames(charge.accumulate.defaultFrames),
          tooltip: "Default runtime selector; 0x31427CC3",
        },
        {
          label: "Charge to maximum",
          value: formatFrames(getChargeFullDurationForSelector(charge, 0)),
          tooltip: "Default per-stage duration multiplied by chargeStageCount",
        },
        {
          label: "Decay / stage",
          value: formatFrames(charge.decay.defaultFrames),
          tooltip: "Default runtime selector; 0xA635CFC2",
        },
        { label: "Reload behavior", value: reloadLabel },
        {
          label: "Group A default",
          value: formatFrames(profile.groupA.defaultFrames),
          tooltip: "0xA502BCF2; native selector default",
        },
        {
          label: "Group B default",
          value: formatFrames(profile.groupB.defaultFrames),
          tooltip: "0x4C84F7C0; this field is not damage",
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

export function buildArmsOverviewStats(entry: TypedParamEntry): ArmsStatBar[] {
  const profile = getArmsReloadProfile(entry);
  const charge = getArmsChargeProfile(entry);
  const rows = [
    ["capacity", "Capacity", profile.ammoCount, String(profile.ammoCount)],
    ["initial", "Initial", profile.initialAmmoCount, String(profile.initialAmmoCount)],
    [
      "group-a-default",
      "Group A default",
      profile.groupA.defaultFrames,
      formatFrames(profile.groupA.defaultFrames),
    ],
    [
      "group-b-default",
      "Group B default",
      profile.groupB.defaultFrames,
      formatFrames(profile.groupB.defaultFrames),
    ],
    [
      "charge-stages",
      "Charge stages",
      charge.stageCount,
      String(charge.stageCount),
    ],
    [
      "charge-per-stage",
      "Charge / stage",
      charge.accumulate.defaultFrames,
      formatFrames(charge.accumulate.defaultFrames),
    ],
    [
      "charge-full",
      "Charge to max",
      getChargeFullDurationForSelector(charge, 0),
      formatFrames(getChargeFullDurationForSelector(charge, 0)),
    ],
  ] as const;

  return rows.map(([key, label, value, display]) => ({
    key,
    label,
    value,
    max: Math.max(
      value,
      key === "capacity" || key === "initial"
        ? 20
        : key === "charge-stages"
          ? 3
          : 300,
    ),
    display,
  }));
}

export interface ArmsSchemaFieldRow {
  hash: string;
  key: string;
  value: string;
}

export function buildArmsSchemaFieldRows(
  entry: TypedParamEntry,
  keys: readonly string[],
): ArmsSchemaFieldRow[] {
  return keys.map((key) => {
    const hash = ARMS_FIELD_HASH_BY_KEY[key];
    const raw = entry[key];
    let value: string;
    if (typeof raw === "number") {
      if (key.includes("Duration") && !key.endsWith("Scale")) {
        value = formatFrames(raw);
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
  "initialAmmoCount",
  "slotIndex",
  "behaviorFlags",
  "reloadBehaviorType",
  "reloadGroupBEnabled",
  "reloadAuxGroupA",
  "reloadDurationGroupADefault",
  "reloadDurationGroupAMode1",
  "reloadDurationGroupAMode2",
  "reloadDurationGroupAMode3",
  "reloadDurationGroupAMode4",
  "reloadDurationGroupAMode5",
  "reloadAuxGroupB",
  "reloadDurationGroupBDefault",
  "reloadDurationGroupBMode1",
  "reloadDurationGroupBMode2",
  "reloadDurationGroupBMode3",
  "reloadDurationGroupBMode4",
  "reloadDurationGroupBMode5",
] as const;

export const ARMS_CHARGE_SCHEMA_KEYS = [
  "chargeInputFlags",
  "chargeStageCount",
  "chargeAccumulateDurationDefaultFrame",
  "chargeAccumulateDurationBaseFrame",
  "chargeAccumulateDurationMode1Scale",
  "chargeAccumulateDurationMode2Scale",
  "chargeAccumulateDurationMode3Scale",
  "chargeAccumulateDurationMode4Scale",
  "chargeAccumulateDurationMode5Scale",
  "chargeDecayDurationDefaultFrame",
  "chargeDecayDurationBaseFrame",
  "chargeDecayDurationMode1Scale",
  "chargeDecayDurationMode2Scale",
  "chargeDecayDurationMode3Scale",
  "chargeDecayDurationMode4Scale",
  "chargeDecayDurationMode5Scale",
] as const;

export const ARMS_NATIVE_SCHEMA_KEYS = [
  ...ARMS_RELOAD_SCHEMA_KEYS,
  ...ARMS_CHARGE_SCHEMA_KEYS,
] as const;
