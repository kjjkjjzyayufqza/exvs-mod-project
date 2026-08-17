/**
 * Native armsparam reload model.
 *
 * OB v27's CArmsController selects one of two six-value duration groups using
 * a runtime selector (default or modes 1-5). reloadBehaviorType then drives the
 * refill state machine. Names outside this proven control surface stay neutral.
 */

import type { TypedParamEntry } from "@/page/TestEditor/components/param-editor/typedParamTypes";

function field(entry: TypedParamEntry, key: string): number {
  const value = entry[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export type ReloadBehaviorType = 0 | 1 | 2 | 3 | 4 | 5;

export const RELOAD_BEHAVIOR_TYPE_LABELS: Record<ReloadBehaviorType, string> = {
  0: "Type 0 (no automatic refill branch)",
  1: "Type 1 (duration-based refill)",
  2: "Type 2 (step refill)",
  3: "Type 3 (no automatic refill branch)",
  4: "Type 4 (+1 on full charge)",
  5: "Type 5 (duration-based variant)",
};

export const RELOAD_BEHAVIOR_TYPE_DESCRIPTIONS: Record<ReloadBehaviorType, string> = {
  0: "Native switch performs no automatic refill in this branch.",
  1: "Native switch advances current ammo using the selected duration.",
  2: "Native switch accumulates progress and restores one step at completion.",
  3: "Native switch performs no automatic refill in this branch.",
  4: "Native switch restores one ammo when the configured charge stages are full, then resets charge progress.",
  5: "Native switch shares the duration-based branch used by type 1.",
};

export interface ReloadDurationGroup {
  auxiliary: number;
  defaultFrames: number;
  modeFrames: [number, number, number, number, number];
}

export interface ArmsReloadProfile {
  ammoCount: number;
  initialAmmoCount: number;
  slotIndex: number;
  behaviorFlags: number;
  reloadBehaviorType: ReloadBehaviorType;
  reloadGroupBEnabled: boolean;
  groupA: ReloadDurationGroup;
  groupB: ReloadDurationGroup;
}

export function getArmsReloadProfile(entry: TypedParamEntry): ArmsReloadProfile {
  return {
    ammoCount: field(entry, "ammoCount"),
    initialAmmoCount: field(entry, "initialAmmoCount"),
    slotIndex: field(entry, "slotIndex"),
    behaviorFlags: field(entry, "behaviorFlags") >>> 0,
    reloadBehaviorType: field(entry, "reloadBehaviorType") as ReloadBehaviorType,
    reloadGroupBEnabled: field(entry, "reloadGroupBEnabled") !== 0,
    groupA: {
      auxiliary: field(entry, "reloadAuxGroupA"),
      defaultFrames: field(entry, "reloadDurationGroupADefault"),
      modeFrames: [
        field(entry, "reloadDurationGroupAMode1"),
        field(entry, "reloadDurationGroupAMode2"),
        field(entry, "reloadDurationGroupAMode3"),
        field(entry, "reloadDurationGroupAMode4"),
        field(entry, "reloadDurationGroupAMode5"),
      ],
    },
    groupB: {
      auxiliary: field(entry, "reloadAuxGroupB"),
      defaultFrames: field(entry, "reloadDurationGroupBDefault"),
      modeFrames: [
        field(entry, "reloadDurationGroupBMode1"),
        field(entry, "reloadDurationGroupBMode2"),
        field(entry, "reloadDurationGroupBMode3"),
        field(entry, "reloadDurationGroupBMode4"),
        field(entry, "reloadDurationGroupBMode5"),
      ],
    },
  };
}

export function getReloadDurationForSelector(
  group: ReloadDurationGroup,
  selector: number,
): number {
  if (selector >= 1 && selector <= 5) {
    return group.modeFrames[selector - 1] ?? group.defaultFrames;
  }
  return group.defaultFrames;
}
