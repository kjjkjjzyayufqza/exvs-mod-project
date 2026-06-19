import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface ArmsPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

// AI decision (2026-06-19): retain JSON keys for save compatibility, but mark
// reload names unverified because current IDA-derived labels conflict with fixtures.
const ARMS_GROUPS: Record<string, string[]> = {
  State: [
    "isEnabled",
    "isContinuousFire",
    "isVernier",
    "isSuperArmor",
    "canMoveWhileFiring",
  ],
  Ammo: [
    "ammoCount",
    "bulletCountPerShot",
    "firingIntervalFrame",
    "shotType",
    "bulletType",
  ],
  "Reload (Unverified)": [
    "reloadType",
    "reloadTimeTotal",
    "reloadStartFrame",
    "reloadPerShotFrame",
    "reloadLockFrame",
    "ammoReloadWaitFrame",
  ],
  Timing: [
    "startupFrame",
    "activeFrame",
    "recoveryFrame",
    "cooldownFrame",
    "totalDurationFrame",
    "landingRecoveryFrame",
  ],
  Charge: ["chargeWeaponType", "chargeFrame", "fullChargeFrame"],
  Damage: [
    "damage",
    "downValue",
    "stunValue",
    "damageCorrectionnRate",
    "downCorrectionRate",
    "stunCorrectionRate",
  ],
  Homing: [
    "homingAngle",
    "inductionRate",
    "homingStartRate",
    "homingEndRate",
    "trackingSpeedRate",
    "bulletSpeedRate",
    "muzzleCorrectionRate",
  ],
  Combat: [
    "range",
    "cancelRouteType",
    "guardBreakType",
    "hitEffectType",
    "landingBehaviorType",
    "boostConsumptionRate",
  ],
  Labels: ["actionLabelOffset", "resourceLabelOffset"],
  Misc: ["unk04Reserved", "overheatFrame"],
};

export function ArmsPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: ArmsPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={ARMS_GROUPS}
    />
  );
}
