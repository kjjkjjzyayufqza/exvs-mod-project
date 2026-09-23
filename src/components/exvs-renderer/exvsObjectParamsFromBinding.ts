/**
 * Maps a resolved numatb binding onto the per-object switches the G-buffer needs.
 *
 * The material's shader label already says which of the engine's material shaders
 * a mesh was authored for, and those labels line up with the constant buffers the
 * shipped pixel shaders declare: `vsngCharaBasic` and `vsngCharaSparkle` are the
 * two that read `vsngCharaGBufferControl` and get the additive rim pass, and
 * anything else is background geometry.
 */

import type { ResolvedMaterialBinding } from "@/components/ssbh-model-preview/meshFromSsbh";

import {
  createDefaultExvsObjectParams,
  type ExvsMaterialClass,
  type ExvsObjectParams,
} from "./exvsRenderSettings";

export type ExvsObjectParamsOverrides = {
  /** Forces the material class rather than taking it from the shader label. */
  materialClass?: ExvsMaterialClass;
  isShadowCaster?: boolean;
  isShadowReceiver?: boolean;
  useLightMap?: boolean;
};

export function exvsObjectParamsFromBinding(
  binding: ResolvedMaterialBinding | null,
  overrides: ExvsObjectParamsOverrides = {},
): ExvsObjectParams {
  const params = createDefaultExvsObjectParams();

  const isCharacterShader =
    binding?.shaderFamily === "vsngCharaBasic" || binding?.shaderFamily === "vsngCharaSparkle";

  params.materialClass = overrides.materialClass ?? (isCharacterShader ? "chara" : "background");
  params.charaBasic = params.materialClass === "chara" && isCharacterShader;

  // `EnableAlphaTest` is a numatb flag a resolved binding does not carry, and the
  // cutoff it selects is a hard 0.95 that erases a material which never asked for
  // one. It stays off unless a mesh declares it explicitly; a draw without it still
  // cuts at its own material's `alphaTest`, which is what the other styles use.

  // The numatb `NormalMapBc5` flag is not carried on the resolved binding, so a
  // two-channel normal map stays an explicit per-mesh declaration.
  if (overrides.isShadowCaster !== undefined) params.isShadowCaster = overrides.isShadowCaster;
  if (overrides.isShadowReceiver !== undefined) params.isShadowReceiver = overrides.isShadowReceiver;
  if (overrides.useLightMap !== undefined) params.useLightMap = overrides.useLightMap;

  return params;
}
