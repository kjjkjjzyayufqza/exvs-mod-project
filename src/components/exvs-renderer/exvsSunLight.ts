import { Euler, Vector3 } from "three";

const DEG2RAD = Math.PI / 180;

/**
 * graphic_param parser default when `directional_lighting_rot_x` is absent.
 * Pitch is degrees, Y-up. -45 puts the key light above the horizon.
 */
export const EXVS_ENGINE_SUN_ROT_X_DEG = -45;
export const EXVS_ENGINE_SUN_ROT_Y_DEG = 0;
export const EXVS_ENGINE_SUN_ROT_Z_DEG = 0;

/** Preview distance so a directional light's position reads as a far sun. */
export const EXVS_PREVIEW_SUN_DISTANCE = 120;

/**
 * Scene-editor key intensity that matches a typical game
 * `directional_lighting_intensity` of about 3.14.
 */
export const EXVS_PREVIEW_SUN_INTENSITY = 2.2;

/**
 * Unit-editor sliders default to a studio key of 1.05. Scaling by this
 * brings that slider to {@link EXVS_PREVIEW_SUN_INTENSITY}.
 */
export const EXVS_UNIT_SUN_INTENSITY_SCALE = EXVS_PREVIEW_SUN_INTENSITY / 1.05;

/**
 * Direction toward the sun. Unrotated `(0, 1, 0)` is noon; `rot_x` pitches
 * it off zenith. Order is YXZ, matching the scene graphic_param preview.
 */
export function exvsSunDirectionFromDegrees(
  rotXDeg: number,
  rotYDeg: number,
  rotZDeg: number,
): Vector3 {
  const sunDir = new Vector3(0, 1, 0);
  sunDir.applyEuler(new Euler(rotXDeg * DEG2RAD, rotYDeg * DEG2RAD, rotZDeg * DEG2RAD, "YXZ"));
  if (sunDir.lengthSq() < 1e-12) {
    sunDir.set(0, 1, 0);
  }
  return sunDir.normalize();
}

/** Engine-default sun, placed far enough to feed a directional light. */
export function exvsEngineSunPosition(): Vector3 {
  return exvsSunDirectionFromDegrees(
    EXVS_ENGINE_SUN_ROT_X_DEG,
    EXVS_ENGINE_SUN_ROT_Y_DEG,
    EXVS_ENGINE_SUN_ROT_Z_DEG,
  ).multiplyScalar(EXVS_PREVIEW_SUN_DISTANCE);
}
