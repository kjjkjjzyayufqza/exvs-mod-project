/** Native armsparam charge-input, stage, and timing model. */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function numericField(entry: TypedParamEntry, key: string): number {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export const CHARGE_INPUT_FLAG_LABELS: Record<number, string> = {
  0: "None",
  1: "CSA (shooting CS)",
  2: "CSB (melee CS)",
  4: "Native input flag 0x4 (unresolved)",
  8: "Native input flag 0x8 (unresolved)",
};

export interface ChargeDurationFamily {
  defaultFrames: number;
  baseFrames: number;
  modeScales: [number, number, number, number, number];
}

export interface ArmsChargeProfile {
  inputFlags: number;
  stageCount: number;
  accumulate: ChargeDurationFamily;
  decay: ChargeDurationFamily;
}

export function getArmsChargeProfile(entry: TypedParamEntry): ArmsChargeProfile {
  return {
    inputFlags: numericField(entry, "chargeInputFlags") >>> 0,
    stageCount: numericField(entry, "chargeStageCount"),
    accumulate: {
      defaultFrames: numericField(entry, "chargeAccumulateDurationDefaultFrame"),
      baseFrames: numericField(entry, "chargeAccumulateDurationBaseFrame"),
      modeScales: [
        numericField(entry, "chargeAccumulateDurationMode1Scale"),
        numericField(entry, "chargeAccumulateDurationMode2Scale"),
        numericField(entry, "chargeAccumulateDurationMode3Scale"),
        numericField(entry, "chargeAccumulateDurationMode4Scale"),
        numericField(entry, "chargeAccumulateDurationMode5Scale"),
      ],
    },
    decay: {
      defaultFrames: numericField(entry, "chargeDecayDurationDefaultFrame"),
      baseFrames: numericField(entry, "chargeDecayDurationBaseFrame"),
      modeScales: [
        numericField(entry, "chargeDecayDurationMode1Scale"),
        numericField(entry, "chargeDecayDurationMode2Scale"),
        numericField(entry, "chargeDecayDurationMode3Scale"),
        numericField(entry, "chargeDecayDurationMode4Scale"),
        numericField(entry, "chargeDecayDurationMode5Scale"),
      ],
    },
  };
}

/** Mirrors the native non-negative frame conversion: (int)(base * scale + 0.5). */
export function getChargeDurationForSelector(
  family: ChargeDurationFamily,
  selector: number,
): number {
  if (selector < 1 || selector > 5) return family.defaultFrames;
  const scale = family.modeScales[selector - 1] ?? 0;
  return Math.trunc(family.baseFrames * scale + 0.5);
}

export function getChargeFullDurationForSelector(
  profile: ArmsChargeProfile,
  selector: number,
): number {
  return (
    Math.max(0, profile.stageCount) *
    Math.max(0, getChargeDurationForSelector(profile.accumulate, selector))
  );
}

export function describeChargeInputFlags(inputFlags: number): string {
  const normalized = inputFlags >>> 0;
  const exact = CHARGE_INPUT_FLAG_LABELS[normalized];
  if (exact) return exact;

  const parts = [1, 2, 4, 8]
    .filter((flag) => (normalized & flag) !== 0)
    .map((flag) => CHARGE_INPUT_FLAG_LABELS[flag]);
  const unknownBits = normalized & ~0xf;
  if (unknownBits !== 0) {
    parts.push(`unknown bits 0x${unknownBits.toString(16).toUpperCase()}`);
  }
  return parts.length > 0 ? parts.join(" + ") : `0x${normalized.toString(16)}`;
}
