import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface ArmsPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

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
  Reload: [
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
