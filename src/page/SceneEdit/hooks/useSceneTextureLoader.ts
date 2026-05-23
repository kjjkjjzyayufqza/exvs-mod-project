import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  collectUniqueTexturePathsForSceneBundles,
  type TexturePreviewSlotKey,
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import {
  getOrDecodeNutexbRgba,
  parseIdentityAndCompressedResponse,
  COMPRESSED_FORMAT_MAP,
  type NutexbRgbaData,
  type NutexbCompressedData,
} from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import {
  getMemoryNutexbPreviewIdentity,
} from "@/page/TestEditor/components/ssbh-model-preview/fhm2dMemoryPreviewService";
import type { PlacementRow } from "../types/placement";
import {
  collectEnabledTexturePathsForBundle,
  normalizeTexturePathKey,
  type ObjectTextureLoadState,
} from "../utils/sceneTextureInventory";
import { formatPlacementViewportNodeId } from "../utils/placementNodeId";

export interface TextureDecodeProgress {
  done: number;
  total: number;
  currentLabel: string;
}

export type NutexbTextureData = 
  | (NutexbRgbaData & { kind: "rgba" })
  | (NutexbCompressedData & { kind: "compressed" });

export type NutexbTextureDataMap = Map<string, NutexbTextureData>;

const DECODE_CONCURRENCY = 8;

/** Detect which compressed texture WebGL extensions are available (cached). */
let _gpuExtensions: Set<string> | null = null;
function getGpuCompressedExtensions(): Set<string> {
  if (_gpuExtensions) return _gpuExtensions;
  _gpuExtensions = new Set<string>();
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (gl) {
      for (const ext of [
        "WEBGL_compressed_texture_s3tc",
        "EXT_texture_compression_rgtc",
        "EXT_texture_compression_bptc",
      ]) {
        if (gl.getExtension(ext)) _gpuExtensions.add(ext);
      }
      // SRGB variants
      if (gl.getExtension("WEBGL_compressed_texture_s3tc_srgb")) _gpuExtensions.add("WEBGL_compressed_texture_s3tc_srgb");
      if (gl.getExtension("EXT_texture_compression_bptc")) _gpuExtensions.add("EXT_texture_compression_bptc");
    }
    canvas.remove();
  } catch { /* fallback to empty set */ }
  return _gpuExtensions;
}

function canUseCompressedFormat(formatId: number): boolean {
  const entry = COMPRESSED_FORMAT_MAP[formatId];
  if (!entry) return false;
  return getGpuCompressedExtensions().has(entry.ext);
}

function collectUniqueNutexbPaths(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>,
  placementEntries: PlacementRow[],
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
  objectTextureLoadState: ObjectTextureLoadState,
): string[] {
  if (Object.keys(objectTextureLoadState).length === 0) {
    return collectUniqueTexturePathsForSceneBundles(baseModel, subModels, textureSlotLoadEnabled);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const pushPath = (path: string) => {
    const key = normalizeTexturePathKey(path);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(path);
  };

  if (baseModel) {
    for (const path of collectEnabledTexturePathsForBundle(baseModel, textureSlotLoadEnabled, objectTextureLoadState, "base")) {
      pushPath(path);
    }
  }

  for (const sub of subModels) {
    const rows = placementEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.vdkType.toUpperCase() === "OBJECT" && entry.objectNumber === sub.objectIndex);
    const objectIds = rows.length === 0
      ? [sub.folderName]
      : rows.map(({ index }) => formatPlacementViewportNodeId(sub.folderName, index));
    for (const objectId of objectIds) {
      for (const path of collectEnabledTexturePathsForBundle(sub.bundle, textureSlotLoadEnabled, objectTextureLoadState, objectId)) {
        pushPath(path);
      }
    }
  }

  return out;
}

function basenameOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function useSceneTextureLoader(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>,
  placementEntries: PlacementRow[],
  sessionId: string | null,
  maxDimension: number | null,
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
  objectTextureLoadState: ObjectTextureLoadState,
): {
  textureDataMap: NutexbTextureDataMap;
  progress: TextureDecodeProgress | null;
  warnings: string[];
} {
  const [textureDataMap, setTextureDataMap] = useState<NutexbTextureDataMap>(() => new Map());
  const [progress, setProgress] = useState<TextureDecodeProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const cancelledRef = useRef(false);
  const runIdRef = useRef(0);
  const textureDataMapRef = useRef(textureDataMap);
  textureDataMapRef.current = textureDataMap;

  const sourceKind = baseModel?.sourceKind ?? subModels[0]?.bundle.sourceKind ?? "disk";

  const stablePlacementIdentity = useMemo(
    () => placementEntries.map((e, i) => `${i}:${e.vdkType}:${e.objectNumber ?? ""}`).join("|"),
    [placementEntries],
  );

  const stablePlacementEntries = useRef(placementEntries);
  if (stablePlacementIdentity) {
    stablePlacementEntries.current = placementEntries;
  }

  useEffect(() => {
    const uniquePaths = collectUniqueNutexbPaths(
      baseModel,
      subModels,
      stablePlacementEntries.current,
      textureSlotLoadEnabled,
      objectTextureLoadState,
    );
    if (uniquePaths.length === 0) {
      setTextureDataMap(new Map());
      setProgress(null);
      setWarnings([]);
      return;
    }

    if (sourceKind === "memory" && !sessionId) {
      return;
    }

    const currentMap = textureDataMapRef.current;
    if (uniquePaths.every((p) => currentMap.has(p))) {
      return;
    }

    cancelledRef.current = false;
    const currentRunId = ++runIdRef.current;
    let pendingFlush: ReturnType<typeof requestAnimationFrame> | null = null;

    (async () => {
    const nextMap = new Map<string, NutexbTextureData>();
    const nextWarnings: string[] = [];
    const batchT0 = performance.now();
    let errors = 0;

    // Detect GPU compressed texture support once
    // NOTE: Compressed GPU upload (B2) is disabled pending Three.js CompressedTexture
    // integration with @react-three/fiber's WebGL context. The B4 single-read identity
    // optimization is still active below.
    const useCompressed = false;

    setProgress({ done: 0, total: uniquePaths.length, currentLabel: "Resolving identities..." });

    // Phase 1: Resolve all identities in parallel to get content-based keys
    type PathIdentity = { path: string; versionId: string };
    const identities: PathIdentity[] = [];
    const identityConcurrency = 16;

    // For compressed path: combined identity+data in one file read (B4 optimization)
    const preloadedCompressed = new Map<string, NutexbCompressedData>();

    if (useCompressed) {
      // Single-read path: identity + compressed data together
      const idQueue = [...uniquePaths];
      let idIdx = 0;
      const resolveWorker = async () => {
        while (idIdx < idQueue.length) {
          if (cancelledRef.current || currentRunId !== runIdRef.current) return;
          const path = idQueue[idIdx++];
          try {
            const raw = await invoke<ArrayBuffer | Uint8Array>("nutexb_identity_and_compressed", { inputPath: path });
            const { nutexbSize, crc32, compressed } = parseIdentityAndCompressedResponse(raw);
            const versionId = `nutexb|${nutexbSize}|${(crc32 >>> 0).toString(16).padStart(8, "0")}@full`;
            identities.push({ path, versionId });
            preloadedCompressed.set(versionId, compressed);
          } catch (err) {
            errors++;
            nextWarnings.push(`${basenameOf(path)}: identity failed: ${err}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(identityConcurrency, uniquePaths.length) }, () => resolveWorker()));
    } else {
      // Original path: identity only (memory source or downsampled)
      const idQueue = [...uniquePaths];
      let idIdx = 0;
      const resolveWorker = async () => {
        while (idIdx < idQueue.length) {
          if (cancelledRef.current || currentRunId !== runIdRef.current) return;
          const path = idQueue[idIdx++];
          try {
            let versionId: string;
            if (sourceKind === "memory" && sessionId) {
              const identity = await getMemoryNutexbPreviewIdentity({ sessionId, virtualPath: path });
              versionId = `nutexb|${identity.nutexbSize}|${(identity.crc32 >>> 0).toString(16).padStart(8, "0")}@${maxDimension ?? "full"}`;
            } else {
              const identity = await invoke<{ nutexbSize: number; crc32: number }>("nutexb_preview_file_identity", { path });
              versionId = `nutexb|${identity.nutexbSize}|${(identity.crc32 >>> 0).toString(16).padStart(8, "0")}@${maxDimension ?? "full"}`;
            }
            identities.push({ path, versionId });
          } catch (err) {
            errors++;
            nextWarnings.push(`${basenameOf(path)}: identity failed: ${err}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(identityConcurrency, uniquePaths.length) }, () => resolveWorker()));
    }

    if (cancelledRef.current || currentRunId !== runIdRef.current) return;

    // Phase 2: Deduplicate by versionId
    const uniqueByVersion = new Map<string, PathIdentity>();
    const versionToPaths = new Map<string, string[]>();
    for (const entry of identities) {
      if (!uniqueByVersion.has(entry.versionId)) {
        uniqueByVersion.set(entry.versionId, entry);
        versionToPaths.set(entry.versionId, [entry.path]);
      } else {
        versionToPaths.get(entry.versionId)!.push(entry.path);
      }
    }

    const deduped = Array.from(uniqueByVersion.values());
    const total = uniquePaths.length;
    const uniqueCount = deduped.length;
    let done = 0;
    const concurrency = Math.min(DECODE_CONCURRENCY, deduped.length);

    console.log(
      `[SceneEdit:Decode] START paths=${total} unique=${uniqueCount} (${total - uniqueCount} deduped)` +
      ` source=${sourceKind} concurrency=${concurrency} maxDim=${maxDimension ?? "full"}`,
    );

    setProgress({ done: 0, total: uniqueCount, currentLabel: "Decoding textures..." });

    // Phase 3: Decode only unique textures
    const flushMap = () => {
      if (cancelledRef.current || currentRunId !== runIdRef.current) return;
      setTextureDataMap(new Map(nextMap));
    };

    const scheduleFlush = () => {
      if (pendingFlush != null) return;
      pendingFlush = requestAnimationFrame(() => {
        pendingFlush = null;
        flushMap();
      });
    };

    let decodeIdx = 0;
    const decodeWorker = async (): Promise<void> => {
      while (decodeIdx < deduped.length) {
        if (cancelledRef.current || currentRunId !== runIdRef.current) return;

        const { path, versionId } = deduped[decodeIdx++];
        const label = basenameOf(path);

        try {
          let texData: NutexbTextureData;

          const preloaded = preloadedCompressed.get(versionId);
          if (preloaded) {
            // B4: data already loaded in identity phase — zero additional I/O
            if (preloaded.formatId !== 0 && canUseCompressedFormat(preloaded.formatId)) {
              texData = { ...preloaded, kind: "compressed" };
            } else if (preloaded.formatId === 0) {
              texData = { width: preloaded.width, height: preloaded.height, rgba: preloaded.data, kind: "rgba" };
            } else {
              // GPU doesn't support this BCn — fall back to CPU RGBA decode
              const rgbaFn = () => invoke<ArrayBuffer | Uint8Array>("nutexb_rgba_bytes", { inputPath: path, maxDimension: maxDimension ?? undefined });
              const rgbaData = await getOrDecodeNutexbRgba(versionId, rgbaFn);
              texData = { ...rgbaData, kind: "rgba" };
            }
          } else {
            // Memory source or downsampled: use RGBA path
            const decodeFn = sourceKind === "memory" && sessionId
              ? () => invoke<ArrayBuffer | Uint8Array>("fhm2d_memory_nutexb_rgba_bytes", {
                  sessionId, virtualPath: path, maxDimension: maxDimension ?? undefined,
                })
              : () => invoke<ArrayBuffer | Uint8Array>("nutexb_rgba_bytes", {
                  inputPath: path, maxDimension: maxDimension ?? undefined,
                });
            const rgbaData = await getOrDecodeNutexbRgba(versionId, decodeFn);
            texData = { ...rgbaData, kind: "rgba" };
          }

          if (cancelledRef.current || currentRunId !== runIdRef.current) return;

          const allPaths = versionToPaths.get(versionId) ?? [path];
          for (const p of allPaths) {
            nextMap.set(p, texData);
            nextMap.set(p.toLowerCase(), texData);
          }
        } catch (err) {
          errors++;
          nextWarnings.push(`${label}: ${err}`);
        }

        done += 1;
        setProgress({ done, total: uniqueCount, currentLabel: label });
        if (done % 5 === 0 || done === uniqueCount) {
          scheduleFlush();
        }
      }
    };

    const workers = Array.from({ length: concurrency }, () => decodeWorker());

    await Promise.all(workers);

    if (cancelledRef.current || currentRunId !== runIdRef.current) return;
    if (pendingFlush != null) {
      cancelAnimationFrame(pendingFlush);
      pendingFlush = null;
    }
    const elapsed = performance.now() - batchT0;
    console.log(
      `[SceneEdit:Decode] DONE paths=${total} unique=${uniqueCount} decoded=${done}` +
      ` errors=${errors} elapsed=${(elapsed / 1000).toFixed(1)}s`,
    );
    setTextureDataMap(new Map(nextMap));
    setProgress(null);
    setWarnings(nextWarnings);
    })();

    return () => {
      cancelledRef.current = true;
      if (pendingFlush != null) {
        cancelAnimationFrame(pendingFlush);
        pendingFlush = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stablePlacementIdentity replaces placementEntries to avoid re-decode on coordinate-only changes
  }, [baseModel, subModels, stablePlacementIdentity, sessionId, sourceKind, maxDimension, textureSlotLoadEnabled, objectTextureLoadState]);

  return { textureDataMap, progress, warnings };
}
