import * as THREE from "three";
import type { GraphicParam } from "../components/GraphicParamPanel";
import {
  DEFAULT_PREVIEW_AMBIENT_INTENSITY,
  DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY,
  DEFAULT_PREVIEW_DIRECTIONAL_X,
  DEFAULT_PREVIEW_DIRECTIONAL_Y,
  DEFAULT_PREVIEW_DIRECTIONAL_Z,
} from "@/page/TestEditor/components/ssbh-model-preview/SsbhModelPreviewContext";

const DEG2RAD = Math.PI / 180;

/** Typical game CSV directional_lighting_intensity; aligns preview scale to DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY. */
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

function defaultLighting(usesGraphicParamLighting: boolean): GraphicParamLightingDerived {
  const px = DEFAULT_PREVIEW_DIRECTIONAL_X;
  const py = DEFAULT_PREVIEW_DIRECTIONAL_Y;
  const pz = DEFAULT_PREVIEW_DIRECTIONAL_Z;
  return {
    ambientIntensity: DEFAULT_PREVIEW_AMBIENT_INTENSITY,
    hemisphereSky: "#dbeafe",
    hemisphereGround: "#111827",
    hemisphereIntensity: 0.26,
    primaryPosition: [px, py, pz],
    fillPosition: fillLightPosition(px, py, pz),
    directionalColor: "#ffffff",
    directionalIntensity: DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY,
    fillIntensity: DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY * 0.28,
    environmentScale: 1,
    usesGraphicParamLighting,
  };
}

/**
 * Maps VS2 graphic_param.csv entries (see 游戏场景光源配置参数说明.md) onto Three.js preview lights.
 * Falls back to ssbh preview defaults when keys are absent.
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
    return defaultLighting(false);
  }

  const out = defaultLighting(true);

  if (ibl !== undefined) {
    const iblClamped = THREE.MathUtils.clamp(ibl, 0, 5);
    out.ambientIntensity =
      DEFAULT_PREVIEW_AMBIENT_INTENSITY *
      THREE.MathUtils.clamp(0.45 + iblClamped * 0.35, 0.2, 1.65);
    out.hemisphereIntensity = THREE.MathUtils.clamp(
      0.12 + iblClamped * 0.12,
      0.06,
      0.55,
    );
    out.environmentScale = THREE.MathUtils.clamp(iblClamped, 0.15, 5);
  }

  if (!hasDirectionalKey) {
    return out;
  }

  const rx = num(map, "directional_lighting_rot_x") ?? 0;
  const ry = num(map, "directional_lighting_rot_y") ?? 0;
  const rz = num(map, "directional_lighting_rot_z") ?? 0;

  const sunDir = new THREE.Vector3(0, 1, 0);
  sunDir.applyEuler(new THREE.Euler(rx * DEG2RAD, ry * DEG2RAD, rz * DEG2RAD, "YXZ"));
  if (sunDir.lengthSq() < 1e-12) {
    sunDir.set(0, 1, 0);
  }
  sunDir.normalize();

  const dist = 120;
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
            DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY,
          0.06,
          8,
        )
      : DEFAULT_PREVIEW_DIRECTIONAL_INTENSITY;

  out.directionalIntensity = baseIntensity * THREE.MathUtils.clamp(lum, 1, 4);
  out.fillIntensity = out.directionalIntensity * 0.28;

  return out;
}
