import * as THREE from "three";
import type { GraphicParam } from "../components/GraphicParamPanel";
import {
  EXVS_ENGINE_SUN_ROT_X_DEG,
  EXVS_ENGINE_SUN_ROT_Y_DEG,
  EXVS_ENGINE_SUN_ROT_Z_DEG,
  EXVS_PREVIEW_SUN_DISTANCE,
  EXVS_PREVIEW_SUN_INTENSITY,
  exvsEngineSunPosition,
  exvsSunDirectionFromDegrees,
} from "@/components/exvs-renderer/exvsSunLight";

/** graphic_param keys that drive the viewport sun, IBL scale, and sun shadows. */
const SCENE_SUN_KEY_PREFIXES = [
  "directional_lighting_",
  "ibl_lighting_",
  "shadowing_color_",
  "shadow_add_color_",
  "shadow_culling_",
  "shadow_frustum_",
  "shadow_near_clip",
  "shadow_far_clip",
] as const;

export function isSceneSunGraphicParamKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  if (!normalized || normalized.startsWith("#")) return false;
  return SCENE_SUN_KEY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Keys checked on stage load so the map sun is on without a manual Apply. */
export function defaultAppliedSunKeys(params: ReadonlyArray<{ key: string }>): Set<string> {
  const keys = new Set<string>();
  for (const param of params) {
    if (isSceneSunGraphicParamKey(param.key)) keys.add(param.key);
  }
  return keys;
}

/** Typical game CSV directional_lighting_intensity; aligns preview scale to SCENE_DIRECTIONAL_INTENSITY. */
const GAME_DIRECTIONAL_INTENSITY_NORM = 3.14;

export type GraphicParamLightingDerived = {
  ambientIntensity: number;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  primaryPosition: [number, number, number];
  fillPosition: [number, number, number];
  directionalColor: string;
  directionalIntensity: number;
  fillIntensity: number;
  environmentScale: number;
  /** Added on fully shadowed pixels. Slightly lifted so the dark side is not a void. */
  shadowColor: [number, number, number];
  /** SDSM far clip. Stage ground is much larger than the 1000 default. */
  shadowFar: number;
  /** True when directional_lighting_* or ibl_lighting_intensity keys affected the scene */
  usesGraphicParamLighting: boolean;
};

function buildLookup(params: GraphicParam[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of params) {
    const k = p.key.trim().toLowerCase();
    if (!k || k.startsWith("#")) continue;
    m.set(k, p.value.trim());
  }
  return m;
}

function num(map: Map<string, string>, key: string): number | undefined {
  const raw = map.get(key);
  if (raw === undefined) return undefined;
  const v = Number.parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(v) ? v : undefined;
}

function fillLightPosition(
  px: number,
  py: number,
  pz: number,
): [number, number, number] {
  return [-px * 0.7, py * 0.45, -pz * 0.7];
}

const SCENE_AMBIENT_INTENSITY = 1.05;
const SCENE_DIRECTIONAL_INTENSITY = EXVS_PREVIEW_SUN_INTENSITY;
const SCENE_HEMISPHERE_INTENSITY = 0.65;
const SCENE_FILL_RATIO = 0.38;
const DEFAULT_SHADOW_COLOR: [number, number, number] = [0.07, 0.08, 0.1];
const DEFAULT_SHADOW_FAR = 2500;

function shadowSettings(map: Map<string, string> | null): {
  shadowColor: [number, number, number];
  shadowFar: number;
} {
  if (!map) {
    return { shadowColor: DEFAULT_SHADOW_COLOR, shadowFar: DEFAULT_SHADOW_FAR };
  }
  const r = num(map, "shadowing_color_r");
  const g = num(map, "shadowing_color_g");
  const b = num(map, "shadowing_color_b");
  const shadowColor: [number, number, number] =
    r !== undefined || g !== undefined || b !== undefined
      ? [
          THREE.MathUtils.clamp(r ?? 0, 0, 1),
          THREE.MathUtils.clamp(g ?? 0, 0, 1),
          THREE.MathUtils.clamp(b ?? 0, 0, 1),
        ]
      : DEFAULT_SHADOW_COLOR;
  const culling = num(map, "shadow_culling_far") ?? num(map, "shadow_far_clip");
  const halfDepth = num(map, "shadow_frustum_depth_half");
  const authored = culling ?? (halfDepth !== undefined ? halfDepth * 2 : undefined);
  const shadowFar =
    authored !== undefined && authored > 1
      ? THREE.MathUtils.clamp(authored, 400, 8000)
      : DEFAULT_SHADOW_FAR;
  return { shadowColor, shadowFar };
}

function defaultLighting(
  usesGraphicParamLighting: boolean,
  map: Map<string, string> | null,
): GraphicParamLightingDerived {
  const sun = exvsEngineSunPosition();
  const px = sun.x;
  const py = sun.y;
  const pz = sun.z;
  return {
    ambientIntensity: SCENE_AMBIENT_INTENSITY,
    hemisphereSky: "#dbeafe",
    hemisphereGround: "#1e293b",
    hemisphereIntensity: SCENE_HEMISPHERE_INTENSITY,
    primaryPosition: [px, py, pz],
    fillPosition: fillLightPosition(px, py, pz),
    directionalColor: "#ffffff",
    directionalIntensity: SCENE_DIRECTIONAL_INTENSITY,
    fillIntensity: SCENE_DIRECTIONAL_INTENSITY * SCENE_FILL_RATIO,
    environmentScale: 1,
    ...shadowSettings(map),
    usesGraphicParamLighting,
  };
}

/**
 * Maps graphic_param.csv directional lighting onto the preview sun.
 * Missing rotation uses the engine default pitch (-45). Missing keys still
 * get that sun, so a stage is not left on a flat studio fill.
 */
export function deriveSceneLightingFromGraphicParams(
  params: GraphicParam[],
): GraphicParamLightingDerived {
  const map = buildLookup(params);

  const hasDirectionalKey =
    map.has("directional_lighting_rot_x") ||
    map.has("directional_lighting_rot_y") ||
    map.has("directional_lighting_rot_z") ||
    map.has("directional_lighting_intensity") ||
    map.has("directional_lighting_color_r") ||
    map.has("directional_lighting_color_g") ||
    map.has("directional_lighting_color_b");

  const ibl = num(map, "ibl_lighting_intensity");

  if (!hasDirectionalKey && ibl === undefined) {
    return defaultLighting(false, map);
  }

  const out = defaultLighting(true, map);

  if (ibl !== undefined) {
    const iblClamped = THREE.MathUtils.clamp(ibl, 0, 5);
    // IBL in the CSV scales the game's own cubes. The editor stand-in must
    // stay lit when that value is low, and only get brighter when it is high.
    out.ambientIntensity =
      SCENE_AMBIENT_INTENSITY *
      THREE.MathUtils.clamp(0.9 + iblClamped * 0.12, 0.9, 1.5);
    out.hemisphereIntensity = THREE.MathUtils.clamp(
      0.55 + iblClamped * 0.08,
      0.55,
      0.9,
    );
    out.environmentScale = THREE.MathUtils.clamp(Math.max(iblClamped, 1), 1, 2.5);
  }

  if (!hasDirectionalKey) {
    return out;
  }

  const rx = num(map, "directional_lighting_rot_x") ?? EXVS_ENGINE_SUN_ROT_X_DEG;
  const ry = num(map, "directional_lighting_rot_y") ?? EXVS_ENGINE_SUN_ROT_Y_DEG;
  const rz = num(map, "directional_lighting_rot_z") ?? EXVS_ENGINE_SUN_ROT_Z_DEG;

  const sunDir = exvsSunDirectionFromDegrees(rx, ry, rz);

  const dist = EXVS_PREVIEW_SUN_DISTANCE;
  const px = sunDir.x * dist;
  const py = sunDir.y * dist;
  const pz = sunDir.z * dist;
  out.primaryPosition = [px, py, pz];
  out.fillPosition = fillLightPosition(px, py, pz);

  const cr = num(map, "directional_lighting_color_r") ?? 1;
  const cg = num(map, "directional_lighting_color_g") ?? 1;
  const cb = num(map, "directional_lighting_color_b") ?? 1;
  const lum = Math.max(cr, cg, cb, 1e-6);
  const nr = THREE.MathUtils.clamp(cr / lum, 0, 1);
  const ng = THREE.MathUtils.clamp(cg / lum, 0, 1);
  const nb = THREE.MathUtils.clamp(cb / lum, 0, 1);
  const tint = new THREE.Color(nr, ng, nb);
  out.directionalColor = `#${tint.getHexString()}`;

  const gpIntensity = num(map, "directional_lighting_intensity");
  const baseIntensity =
    gpIntensity !== undefined
      ? THREE.MathUtils.clamp(
          (gpIntensity / GAME_DIRECTIONAL_INTENSITY_NORM) *
            SCENE_DIRECTIONAL_INTENSITY,
          0.1,
          10,
        )
      : SCENE_DIRECTIONAL_INTENSITY;

  out.directionalIntensity = baseIntensity * THREE.MathUtils.clamp(lum, 1, 4);
  out.fillIntensity = out.directionalIntensity * SCENE_FILL_RATIO;

  return out;
}
