/**
 * The EXVS2 (Over Boost) deferred renderer.
 *
 * Reconstructed from the shipped shaders; the pass graph and the source shader
 * each pass came from are documented in `docs/exvs2-deferred-renderer.md`.
 */

export { ExvsRenderer, type ExvsRendererProps } from "./ExvsRenderer";
export {
  ExvsRenderPipeline,
  createEmptyExvsSceneTextures,
  type ExvsSceneTextures,
} from "./ExvsRenderPipeline";
export {
  EXVS_GBUFFER_FLAG,
  EXVS_MATERIAL_CLASS,
  createDefaultExvsObjectParams,
  createDefaultExvsRenderSettings,
  readExvsObjectParams,
  type ExvsMaterialClass,
  type ExvsObjectParams,
  type ExvsRenderSettings,
} from "./exvsRenderSettings";
export { packExvsFlagByte } from "./exvsGBufferMaterial";
export {
  EXVS_ENGINE_SUN_ROT_X_DEG,
  EXVS_ENGINE_SUN_ROT_Y_DEG,
  EXVS_ENGINE_SUN_ROT_Z_DEG,
  EXVS_PREVIEW_SUN_DISTANCE,
  EXVS_PREVIEW_SUN_INTENSITY,
  EXVS_UNIT_SUN_INTENSITY_SCALE,
  exvsEngineSunPosition,
  exvsSunDirectionFromDegrees,
} from "./exvsSunLight";
export {
  computeExvsPartitionIntervals,
  fitExvsShadowPartitions,
  type ExvsShadowFit,
  type ExvsShadowPartition,
} from "./exvsSdsmPartitions";
