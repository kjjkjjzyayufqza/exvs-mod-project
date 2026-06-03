import type { HktSimplifyConfig } from "../dae-import/daeImportTypes";
import { serializeHktPreviewConfigKey } from "../../utils/hktSimplifyUtils";
import type { ImportConfig } from "../../utils/sceneSessionService";

export interface CachedHktFromModelGeneration {
  sourcePath: string;
  configKey: string;
  hktBytes: number[];
  triangleCount: number;
}

export function buildHktFromModelConfigKey(
  importConfig: ImportConfig,
  simplify: HktSimplifyConfig,
): string {
  return serializeHktPreviewConfigKey(importConfig, simplify);
}

export function isCachedHktFromModelValid(
  cached: CachedHktFromModelGeneration | null | undefined,
  sourcePath: string | null,
  configKey: string,
): cached is CachedHktFromModelGeneration {
  return Boolean(
    cached &&
      sourcePath &&
      cached.sourcePath === sourcePath &&
      cached.configKey === configKey &&
      cached.hktBytes.length > 0,
  );
}
