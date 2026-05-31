import {
  buildDrawListFromBundle,
  buildMatlLookup,
  buildTextureRefToPathMap,
  resolveMaterialBinding,
  TEXTURE_PREVIEW_SLOT_META,
  type TexturePreviewSlotKey,
} from "@/components/ssbh-model-preview/meshFromSsbh";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import type { NutexbTextureDataMap } from "../hooks/useSceneTextureLoader";

export type ObjectTextureLoadState = Record<string, Record<string, boolean>>;

export interface SceneTextureInventoryEntry {
  path: string;
  pathKey: string;
  internalName: string;
  reference: string | null;
  slots: TexturePreviewSlotKey[];
  materialLabels: string[];
  loaded: boolean;
  resolution: string | null;
  enabled: boolean;
}

export interface ObjectTextureInventory {
  objectId: string;
  objectLabel: string;
  textures: SceneTextureInventoryEntry[];
}

export interface GlobalLoadedNutexbInventoryEntry {
  path: string;
  internalName: string;
  resolution: string;
  objectLabels: string[];
}

const SLOT_PATHS: Array<{
  slot: TexturePreviewSlotKey;
  refField: "map" | "normal" | "roughness" | "metalness" | "emissive" | "ao" | "cube";
  pathField: "mapPath" | "normalPath" | "roughnessPath" | "metalnessPath" | "emissivePath" | "aoPath" | "cubePath";
}> = [
  { slot: "map", refField: "map", pathField: "mapPath" },
  { slot: "normalMap", refField: "normal", pathField: "normalPath" },
  { slot: "roughnessMap", refField: "roughness", pathField: "roughnessPath" },
  { slot: "metalnessMap", refField: "metalness", pathField: "metalnessPath" },
  { slot: "emissiveMap", refField: "emissive", pathField: "emissivePath" },
  { slot: "aoMap", refField: "ao", pathField: "aoPath" },
  { slot: "cubeMap", refField: "cube", pathField: "cubePath" },
];

export function normalizeTexturePathKey(path: string): string {
  return path.trim().replace(/\\/g, "/").toLowerCase();
}

export function getTextureInternalName(path: string, reference: string | null): string {
  const raw = reference?.trim() || path.replace(/\\/g, "/").split("/").pop() || path;
  return raw.replace(/\.nutexb$/i, "");
}

export function isTexturePathEnabledForObject(
  state: ObjectTextureLoadState,
  objectId: string,
  path: string,
): boolean {
  return state[objectId]?.[normalizeTexturePathKey(path)] ?? true;
}

export function setTexturePathEnabledForObject(
  state: ObjectTextureLoadState,
  objectId: string,
  path: string,
  enabled: boolean,
): ObjectTextureLoadState {
  const pathKey = normalizeTexturePathKey(path);
  return {
    ...state,
    [objectId]: {
      ...(state[objectId] ?? {}),
      [pathKey]: enabled,
    },
  };
}

export function hasTextureOverridesForObject(
  state: ObjectTextureLoadState,
  objectId: string,
): boolean {
  return Object.keys(state[objectId] ?? {}).length > 0;
}

export function collectBundleTextureInventory(
  bundle: SsbhModelPreviewBundle,
  textureDataMap: NutexbTextureDataMap,
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
  objectTextureLoadState: ObjectTextureLoadState = {},
  objectId = "",
): SceneTextureInventoryEntry[] {
  const entries = new Map<string, SceneTextureInventoryEntry>();
  const textureRefByPath = buildTextureReferenceByPath(bundle);

  try {
    const modl = bundle.modl as any;
    const mesh = bundle.mesh as any;
    const skel = bundle.skel as any;
    if (!modl || !mesh) return [];

    const draws = buildDrawListFromBundle(modl, mesh, skel ?? undefined);
    const matlLookup = buildMatlLookup(bundle.matl as any);
    const refToPathMap = buildTextureRefToPathMap(bundle);

    for (const draw of draws) {
      const binding = resolveMaterialBinding(draw.materialLabel, matlLookup, refToPathMap);
      for (const meta of SLOT_PATHS) {
        const path = binding.texturePaths[meta.pathField];
        if (!path) continue;
        const pathKey = normalizeTexturePathKey(path);
        const reference = binding.textureRefs[meta.refField] ?? textureRefByPath.get(pathKey) ?? null;
        const existing = entries.get(pathKey);
        const loadedData = textureDataMap.get(path) ?? textureDataMap.get(pathKey) ?? null;
        if (existing) {
          if (!existing.slots.includes(meta.slot)) existing.slots.push(meta.slot);
          if (!existing.materialLabels.includes(binding.materialLabel)) {
            existing.materialLabels.push(binding.materialLabel);
          }
          continue;
        }
        entries.set(pathKey, {
          path,
          pathKey,
          internalName: getTextureInternalName(path, reference),
          reference,
          slots: [meta.slot],
          materialLabels: [binding.materialLabel],
          loaded: !!loadedData,
          resolution: loadedData ? `${loadedData.width}x${loadedData.height}` : null,
          enabled: textureSlotLoadEnabled[meta.slot] && (objectId ? isTexturePathEnabledForObject(objectTextureLoadState, objectId, path) : true),
        });
      }
    }
  } catch {
    return [];
  }

  return [...entries.values()].sort((a, b) => a.internalName.localeCompare(b.internalName));
}

export function collectEnabledTexturePathsForBundle(
  bundle: SsbhModelPreviewBundle,
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
  objectTextureLoadState: ObjectTextureLoadState,
  objectId: string,
): string[] {
  return collectBundleTextureInventory(
    bundle,
    new Map(),
    textureSlotLoadEnabled,
    objectTextureLoadState,
    objectId,
  )
    .filter((entry) => entry.enabled)
    .map((entry) => entry.path);
}

export function collectGlobalLoadedNutexbInventory(
  objects: readonly ObjectTextureInventory[],
): GlobalLoadedNutexbInventoryEntry[] {
  const byPath = new Map<string, GlobalLoadedNutexbInventoryEntry>();
  for (const object of objects) {
    for (const texture of object.textures) {
      if (!texture.loaded || !texture.resolution) continue;
      const existing = byPath.get(texture.pathKey);
      if (existing) {
        if (!existing.objectLabels.includes(object.objectLabel)) {
          existing.objectLabels.push(object.objectLabel);
        }
        continue;
      }
      byPath.set(texture.pathKey, {
        path: texture.path,
        internalName: texture.internalName,
        resolution: texture.resolution,
        objectLabels: [object.objectLabel],
      });
    }
  }
  return [...byPath.values()].sort((a, b) => a.internalName.localeCompare(b.internalName));
}

export function textureSlotShortLabel(slot: TexturePreviewSlotKey): string {
  return TEXTURE_PREVIEW_SLOT_META.find((meta) => meta.key === slot)?.short ?? slot;
}

function buildTextureReferenceByPath(bundle: SsbhModelPreviewBundle): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of bundle.textureResolve) {
    if (!row.nutexbPath) continue;
    result.set(normalizeTexturePathKey(row.nutexbPath), row.reference);
  }
  return result;
}
