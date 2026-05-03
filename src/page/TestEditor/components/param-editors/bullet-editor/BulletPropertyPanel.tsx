import { AutoPropertyPanel } from "../shared/AutoPropertyPanel";
import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import type { TypedParamFile } from "../../param-editor/typedParamTypes";

interface BulletPropertyPanelProps {
  entry: TypedParamEntry;
  fieldSpecs?: TypedParamFile["fieldSpecs"];
  onFieldChange: (key: string, value: number) => void;
}

const BULLET_GROUPS: Record<string, string[]> = {
  Movement: [
    "moveType",
    "initialSpeed",
    "speedAcceleration",
    "accelerationValue",
    "speedScale",
    "maxDistance",
    "maxRange",
    "effectiveRange",
  ],
  Homing: [
    "homingType",
    "homingStrength",
    "homingAngle",
    "homingRange",
    "homingDuration",
    "homingStartDistance",
    "homingEffectiveDistance",
    "minHomingDistance",
    "turnRate",
    "turnAcceleration",
    "trackingAngle",
    "trackingStartDistance",
    "inductionAngle",
  ],
  Hitbox: [
    "hitboxWidth",
    "hitboxHeight",
    "hitboxDepth",
    "collisionType",
    "collisionHeight",
    "blastRadius",
  ],
  Lifetime: [
    "lifetime",
    "durationFrame",
    "delayFrame",
    "hitIntervalFrame",
    "pierceCount",
  ],
  Spawn: [
    "spawnOffsetForward",
    "spawnOffsetVertical",
    "horizontalAimAngle",
    "verticalLaunchAngle",
    "initialAngle",
    "spreadAngle",
    "elevationAngle",
    "rotationAngle",
    "launchAngleHorizontal",
  ],
  Aim: [
    "aimOffsetVertical",
    "aimCorrectionAngle",
    "aimLimitAngle",
    "targetHeightOffset",
    "targetDistance",
    "offsetAngleHorizontal",
    "offsetAngleVertical",
    "maxAltitude",
  ],
  Scale: [
    "visualScale",
    "hitEffectScale",
    "modelScale",
    "muzzleOffsetHorizontal",
    "muzzleOffsetVertical",
    "spreadDistance",
  ],
  Effects: [
    "hitEffectHash",
    "bulletEffectHash",
    "trailEffectHash",
    "muzzleFlashHash",
    "explosionEffectHash",
    "soundEffectHash",
    "secondaryEffectHash",
    "onExpireHash",
  ],
  References: [
    "bulletResourceHash",
    "bulletActionHash",
    "childBulletHash",
    "spawnPatternHash",
    "hitgroupHash",
    "interactionHash",
    "ammoTypeHash",
    "behaviorType",
    "beamTypeHash",
    "penetrateTypeHash",
    "inheritSpeedHash",
    "bulletShape",
  ],
  Misc: [
    "gravityRate",
    "speedInternal",
    "reservedFlag110",
    "reserved050",
    "reserved060",
    "reserved0d8",
    "reserved0e8",
    "reservedF4",
    "reserved118",
    "reserved124",
  ],
};

export function BulletPropertyPanel({
  entry,
  fieldSpecs,
  onFieldChange,
}: BulletPropertyPanelProps) {
  return (
    <AutoPropertyPanel
      entry={entry}
      fieldSpecs={fieldSpecs}
      onFieldChange={onFieldChange}
      groupOverrides={BULLET_GROUPS}
    />
  );
}
