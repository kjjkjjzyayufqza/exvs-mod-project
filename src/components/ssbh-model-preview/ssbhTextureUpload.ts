import * as THREE from "three";
import {
  COMPRESSED_FORMAT_MAP,
  type NutexbCompressedData,
  type NutexbRgbaData,
} from "./nutexbPreviewCache";
import type { ResolvedMaterialBinding, ResolvedTextureSampling } from "./meshFromSsbh";

/**
 * Shared GPU texture upload + pooling for SSBH model rendering.
 *
 * This is the canonical "scene editor core" texture path: decoded nutexb pixels
 * (`NutexbTextureData`) are uploaded directly as `THREE.DataTexture` /
 * `THREE.CompressedTexture` and shared through a content-keyed pool, instead of
 * round-tripping through PNG data URLs + drei `useTexture` (which re-decodes per
 * draw and never dedups). Both the Scene Editor (`MapViewport`) and the Unit
 * Model preview (`SsbhModelCanvas`) consume this module so they stay in sync.
 */

export type NutexbTextureData =
  | (NutexbRgbaData & { kind: "rgba" })
  | (NutexbCompressedData & { kind: "compressed" });

export type NutexbTextureDataMap = Map<string, NutexbTextureData>;

export type PbrSlotKind =
  | "map"
  | "normalMap"
  | "roughnessMap"
  | "metalnessMap"
  | "emissiveMap"
  | "aoMap"
  | "cubeMap";

export const SLOT_KEYS: PbrSlotKind[] = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
  "cubeMap",
];

export const SRGB_SLOTS = new Set<PbrSlotKind>(["map", "emissiveMap"]);

/**
 * Skip GPU mip chains on decoded nutexb DataTextures (~1/3 less VRAM per 2D
 * texture); the editor preview favors stability over distant minification.
 */
const SSBH_TEXTURE_MIPS = false;

/**
 * Shared GPU texture pool — multiple meshes referencing the same texture file +
 * slot + sampling parameters share a single THREE texture, eliminating
 * per-draw / per-placement VRAM duplication.
 */
export class SceneTexturePool {
  private pool = new Map<string, THREE.Texture>();

  has(key: string): boolean {
    return this.pool.has(key);
  }

  acquire(key: string, factory: () => THREE.Texture): THREE.Texture {
    const existing = this.pool.get(key);
    if (existing) return existing;
    const tex = factory();
    this.pool.set(key, tex);
    return tex;
  }

  disposeAll(): void {
    for (const tex of this.pool.values()) {
      tex.dispose();
    }
    this.pool.clear();
  }

  /**
   * Dispose and drop every pooled texture whose key is not in `activeKeys`.
   * Call after a model/draw change so textures no longer referenced by the
   * current draws are freed (otherwise the pool grows unbounded across model
   * switches and leaks GPU memory). Returns the number of textures disposed.
   */
  pruneExcept(activeKeys: ReadonlySet<string>): number {
    let removed = 0;
    for (const [key, tex] of this.pool) {
      if (!activeKeys.has(key)) {
        tex.dispose();
        this.pool.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.pool.size;
  }

  get estimatedBytes(): number {
    let total = 0;
    for (const tex of this.pool.values()) {
      const img = tex.image as { width?: number; height?: number } | null;
      if (img?.width && img?.height) {
        total += img.width * img.height * 4;
      }
    }
    return total;
  }
}

export function toThreeWrapping(mode: ResolvedTextureSampling["wrapS"]): THREE.Wrapping {
  switch (mode) {
    case "Repeat":
      return THREE.RepeatWrapping;
    case "MirroredRepeat":
      return THREE.MirroredRepeatWrapping;
    case "ClampToBorder":
    case "ClampToEdge":
    default:
      return THREE.ClampToEdgeWrapping;
  }
}

export function samplingForSlot(
  binding: ResolvedMaterialBinding,
  kind: PbrSlotKind,
): ResolvedTextureSampling | null {
  if (kind === "cubeMap") return null;
  switch (kind) {
    case "map":
      return binding.sampling.map;
    case "normalMap":
      return binding.sampling.normal;
    case "roughnessMap":
      return binding.sampling.roughness;
    case "metalnessMap":
      return binding.sampling.metalness;
    case "emissiveMap":
      return binding.sampling.emissive;
    case "aoMap":
      return binding.sampling.ao;
    default:
      return null;
  }
}

export function pathForSlot(binding: ResolvedMaterialBinding, slot: PbrSlotKind): string | null {
  const p = binding.texturePaths;
  switch (slot) {
    case "map":
      return p.mapPath;
    case "normalMap":
      return p.normalPath;
    case "roughnessMap":
      return p.roughnessPath;
    case "metalnessMap":
      return p.metalnessPath;
    case "emissiveMap":
      return p.emissivePath;
    case "aoMap":
      return p.aoPath;
    case "cubeMap":
      return p.cubePath;
  }
}

export function buildTexturePoolKey(
  path: string,
  slot: PbrSlotKind,
  binding: ResolvedMaterialBinding,
  dataWidth: number,
  dataHeight: number,
): string {
  const sampling = samplingForSlot(binding, slot);
  return [
    path.toLowerCase(),
    slot,
    `${dataWidth}x${dataHeight}`,
    sampling?.wrapS ?? "ClampToEdge",
    sampling?.wrapT ?? "ClampToEdge",
    sampling?.uvTransform?.scale_u ?? 1,
    sampling?.uvTransform?.scale_v ?? 1,
    sampling?.uvTransform?.translate_u ?? 0,
    sampling?.uvTransform?.translate_v ?? 0,
    sampling?.uvTransform?.rotation ?? 0,
  ].join("|");
}

export function lookupTextureData(
  textureDataMap: ReadonlyMap<string, NutexbTextureData>,
  path: string | null,
): NutexbTextureData | null {
  if (!path) return null;
  return textureDataMap.get(path) ?? textureDataMap.get(path.toLowerCase()) ?? null;
}

function applySamplingToTexture(
  tex: THREE.Texture,
  slot: PbrSlotKind,
  binding: ResolvedMaterialBinding,
): void {
  if (slot === "cubeMap") {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return;
  }
  const sampling = samplingForSlot(binding, slot);
  tex.wrapS = toThreeWrapping(sampling?.wrapS ?? "ClampToEdge");
  tex.wrapT = toThreeWrapping(sampling?.wrapT ?? "ClampToEdge");
  tex.center.set(0, 0);
  tex.repeat.set(sampling?.uvTransform?.scale_u ?? 1, sampling?.uvTransform?.scale_v ?? 1);
  tex.offset.set(sampling?.uvTransform?.translate_u ?? 0, sampling?.uvTransform?.translate_v ?? 0);
  tex.rotation = sampling?.uvTransform?.rotation ?? 0;
}

export function createDataTexture(
  data: NutexbTextureData,
  slot: PbrSlotKind,
  binding: ResolvedMaterialBinding,
  sourcePath: string,
): THREE.Texture {
  if (data.kind === "compressed") {
    return createCompressedTexture(data, slot, binding, sourcePath);
  }

  const tex = new THREE.DataTexture(
    data.rgba,
    data.width,
    data.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  tex.colorSpace = SRGB_SLOTS.has(slot) ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = SSBH_TEXTURE_MIPS;
  tex.minFilter = SSBH_TEXTURE_MIPS ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  applySamplingToTexture(tex, slot, binding);
  tex.needsUpdate = true;
  tex.userData.sceneTexturePath = sourcePath;
  return tex;
}

export function createCompressedTexture(
  data: NutexbCompressedData,
  slot: PbrSlotKind,
  binding: ResolvedMaterialBinding,
  sourcePath: string,
): THREE.CompressedTexture {
  const entry = COMPRESSED_FORMAT_MAP[data.formatId]!;
  const isSrgb = SRGB_SLOTS.has(slot);
  const internalFormat =
    isSrgb && entry.srgbInternalFormat ? entry.srgbInternalFormat : entry.internalFormat;

  const mipmaps = [{ data: data.data, width: data.width, height: data.height }];
  const tex = new THREE.CompressedTexture(
    mipmaps as unknown as ImageData[],
    data.width,
    data.height,
    internalFormat as unknown as THREE.CompressedPixelFormat,
  );
  tex.colorSpace = isSrgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  applySamplingToTexture(tex, slot, binding);
  tex.needsUpdate = true;
  tex.userData.sceneTexturePath = sourcePath;
  return tex;
}
