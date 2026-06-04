import type { SsbhDaeUpAxis } from "../components/dae-import/daeImportTypes";
import type { SsbhConvertConfig } from "./sceneSessionService";

export const DEFAULT_HKT_COLLISION_SCALE = 1.0;
export const DEFAULT_HKT_COLLISION_UP_AXIS: SsbhDaeUpAxis = "y_up";

/** Minimal SSBH config for HKT-only flows (collision mesh axis + uniform scale). */
export function createHktOnlySsbhConfig(
  partial?: Partial<Pick<SsbhConvertConfig, "baseFilename" | "scaleFactor" | "upAxis">>,
): SsbhConvertConfig {
  return {
    baseFilename: partial?.baseFilename ?? "collision",
    scaleFactor: partial?.scaleFactor ?? DEFAULT_HKT_COLLISION_SCALE,
    upAxis: partial?.upAxis ?? DEFAULT_HKT_COLLISION_UP_AXIS,
    flipUv: false,
    writeNumdlb: false,
    writeNumshb: false,
    writeNusktb: false,
    writeNumatb: false,
    writeJnttbl: false,
    writeMayaProfile: false,
    materialTemplate: null,
  };
}

export function mergeHktCollisionTransform(
  existing: SsbhConvertConfig | null | undefined,
  scaleFactor: number,
  upAxis: SsbhDaeUpAxis,
): SsbhConvertConfig {
  if (existing) {
    return { ...existing, scaleFactor, upAxis };
  }
  return createHktOnlySsbhConfig({ scaleFactor, upAxis });
}
