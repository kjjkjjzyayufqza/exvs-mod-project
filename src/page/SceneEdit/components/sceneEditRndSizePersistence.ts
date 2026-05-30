import {
  clampRndSizeToConstraints,
  type SceneEditRndModalDimensions,
} from "./sceneEditRndModalUtils";

export const SCENE_EDIT_RND_SIZE_KEYS = {
  detailView: "scene-edit.rnd-size.detail-view",
  effectDetailView: "scene-edit.rnd-size.effect-detail-view",
  daeImportPreview: "scene-edit.rnd-size.dae-import.preview",
  daeImportSsbh: "scene-edit.rnd-size.dae-import.ssbh",
  texturePreview: "scene-edit.rnd-size.texture-preview",
  textureAddConfirm: "scene-edit.rnd-size.texture-add-confirm",
} as const;

export type SceneEditRndSizeStorageKey =
  (typeof SCENE_EDIT_RND_SIZE_KEYS)[keyof typeof SCENE_EDIT_RND_SIZE_KEYS];

export function readPersistedRndSize(
  storageKey: string,
): { width: number; height: number } | null {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("width" in parsed) ||
      !("height" in parsed)
    ) {
      return null;
    }

    const { width, height } = parsed as { width: unknown; height: unknown };
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }

    return { width, height };
  } catch {
    return null;
  }
}

export function writePersistedRndSize(
  storageKey: string,
  size: { width: number; height: number },
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        width: Math.round(size.width),
        height: Math.round(size.height),
      }),
    );
  } catch {
    // Ignore quota or privacy-mode failures.
  }
}

export function resolveSceneEditRndInitialSize(
  storageKey: string | undefined,
  constraints: SceneEditRndModalDimensions,
): { width: number; height: number } {
  const defaultSize = { width: constraints.width, height: constraints.height };
  if (!storageKey) {
    return defaultSize;
  }

  const persisted = readPersistedRndSize(storageKey);
  if (!persisted) {
    return defaultSize;
  }

  return clampRndSizeToConstraints(persisted, constraints);
}

export function persistSceneEditRndSize(
  storageKey: string | undefined,
  size: { width: number; height: number },
  constraints: SceneEditRndModalDimensions,
): { width: number; height: number } {
  const clamped = clampRndSizeToConstraints(size, constraints);
  if (storageKey) {
    writePersistedRndSize(storageKey, clamped);
  }
  return clamped;
}
