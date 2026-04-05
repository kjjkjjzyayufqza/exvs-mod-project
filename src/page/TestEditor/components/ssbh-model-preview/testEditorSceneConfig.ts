import type { SsbhModelPreviewInstance } from "./types";

export const TEST_EDITOR_SCENE_CONFIG_VERSION = 1;

export type SceneModelAttachment = {
  id: string;
  parentInstanceId: string;
  parentBoneName: string;
  childInstanceId: string;
  childBoneName: string;
};

export type TestEditorSceneConfig = {
  schemaVersion: typeof TEST_EDITOR_SCENE_CONFIG_VERSION;
  workspaceRoot: string | null;
  instances: {
    instanceId: string;
    displayLabel: string;
    hidden: boolean;
    rootFolder: string;
    modlPath: string;
    meshPath: string;
    skelPath: string | null;
    matlPaths: string[];
    textureRefs: string[];
    resolvedNutexbPaths: string[];
  }[];
  activePreviewInstanceId: string | null;
  previewViewMode: "all" | "single";
  previewControlScope: "all" | "single";
  visibleKeys: string[];
  renderSettings: {
    wireframe: boolean;
    showSkeleton: boolean;
    showGrid: boolean;
    showAxesGizmo: boolean;
    showStats: boolean;
    background: string;
    ambientIntensity: number;
    directionalIntensity: number;
    directionalX: number;
    directionalY: number;
    directionalZ: number;
    normalMapEnabled: boolean;
    materialDebugViewMode: "full" | "baseColor" | "normals" | "roughnessMetalness" | "emissive" | "reflection";
    textureFlipY: boolean;
    uvFlipU: boolean;
    uvFlipV: boolean;
    textureSlotLoadEnabled: Record<string, boolean>;
    previewRenderStyle: "standard" | "anime";
  };
  motion: {
    applyCamera: boolean;
    applyLighting: boolean;
    forceVisibleDuringPlayback: boolean;
    byInstanceId: Record<
      string,
      {
        nuanmbPaths: string[];
        selectedNuanmbPath: string | null;
        playing: boolean;
        loop: boolean;
        speed: number;
        frame: number;
      }
    >;
  };
  attachments: SceneModelAttachment[];
  autoLoadAfterConvertToSsbh: boolean;
};

const WINDOWS_EXTENDED_PREFIX = "\\\\?\\";

export function normalizeScenePath(path: string | null | undefined): string | null {
  if (path === null || path === undefined) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  const withoutExtended = trimmed.startsWith(WINDOWS_EXTENDED_PREFIX)
    ? trimmed.slice(WINDOWS_EXTENDED_PREFIX.length)
    : trimmed;
  return withoutExtended.replace(/\\/g, "/");
}

export function normalizeScenePathStrict(path: string): string {
  const normalized = normalizeScenePath(path);
  if (!normalized) {
    throw new Error("Scene path cannot be empty.");
  }
  return normalized;
}

export function buildSceneConfigInstanceEntries(
  instances: readonly SsbhModelPreviewInstance[],
  hiddenInstanceIds: ReadonlySet<string>,
): TestEditorSceneConfig["instances"] {
  return instances.map((inst) => ({
    instanceId: inst.id,
    displayLabel: inst.displayLabel,
    hidden: hiddenInstanceIds.has(inst.id),
    rootFolder: normalizeScenePathStrict(inst.bundle.rootFolder),
    modlPath: normalizeScenePathStrict(inst.bundle.modlPath),
    meshPath: normalizeScenePathStrict(inst.bundle.meshPath),
    skelPath: normalizeScenePath(inst.bundle.skelPath),
    matlPaths: inst.bundle.matlPaths.map((p) => normalizeScenePathStrict(p)),
    textureRefs: [...inst.bundle.textureRefs],
    resolvedNutexbPaths: inst.bundle.resolvedNutexbPaths.map((p) => normalizeScenePathStrict(p)),
  }));
}

export function ensureSceneConfigSchema(v: unknown): asserts v is TestEditorSceneConfig {
  if (!v || typeof v !== "object") {
    throw new Error("Scene config must be an object.");
  }
  const obj = v as Record<string, unknown>;
  if (obj.schemaVersion !== TEST_EDITOR_SCENE_CONFIG_VERSION) {
    throw new Error(`Unsupported scene config schema version: ${String(obj.schemaVersion)}`);
  }
  if (!Array.isArray(obj.instances)) {
    throw new Error("Scene config missing instances array.");
  }
}
