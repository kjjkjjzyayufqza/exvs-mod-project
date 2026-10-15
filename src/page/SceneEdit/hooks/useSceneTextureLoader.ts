import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsbhModelPreviewBundle } from "@/components/ssbh-model-preview/types";
import {
  collectUniqueTexturePathsForSceneBundles,
  type TexturePreviewSlotKey,
} from "@/components/ssbh-model-preview/meshFromSsbh";
import {
  getOrDecodeNutexbRgba,
  type NutexbRgbaData,
} from "@/components/ssbh-model-preview/nutexbPreviewCache";
import { getMemoryNutexbPreviewIdentity } from "@/components/ssbh-model-preview/fhm2dMemoryPreviewService";
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
  | (NutexbRgbaData & { kind: "rgba"; revision: number })
  | {
      kind: "png";
      pngPath: string;
      width: number;
      height: number;
      revision: number;
      cacheHit: boolean;
    };

export type NutexbTextureDataMap = Map<string, NutexbTextureData>;

interface SceneNutexbPngCacheEntry {
  nutexbPath: string;
  pngPath: string;
  width: number;
  height: number;
  cacheHit: boolean;
  error: string | null;
}

const MEMORY_DECODE_CONCURRENCY = 8;
const DISK_CACHE_CHUNK = 8;

function collectUniqueNutexbPaths(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>,
  importedSsbhBundles: SsbhModelPreviewBundle[],
  placementEntries: PlacementRow[],
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
  objectTextureLoadState: ObjectTextureLoadState,
): string[] {
  if (Object.keys(objectTextureLoadState).length === 0) {
    return collectUniqueTexturePathsForSceneBundles(
      baseModel,
      [
        ...subModels,
        ...importedSsbhBundles.map((bundle) => ({ bundle })),
      ],
      textureSlotLoadEnabled,
    );
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

  for (const bundle of importedSsbhBundles) {
    const objectId = bundle.virtualModlPath ?? bundle.modlPath;
    for (const path of collectEnabledTexturePathsForBundle(bundle, textureSlotLoadEnabled, objectTextureLoadState, objectId)) {
      pushPath(path);
    }
  }

  return out;
}

function basenameOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function rememberTexture(
  map: NutexbTextureDataMap,
  path: string,
  data: NutexbTextureData,
): void {
  map.set(path, data);
  map.set(path.toLowerCase(), data);
}

function pngTextureFromCache(entry: SceneNutexbPngCacheEntry, revision: number): NutexbTextureData {
  return {
    kind: "png",
    pngPath: entry.pngPath,
    width: entry.width,
    height: entry.height,
    revision,
    cacheHit: entry.cacheHit,
  };
}

export function useSceneTextureLoader(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>,
  importedSsbhBundles: SsbhModelPreviewBundle[],
  placementEntries: PlacementRow[],
  sessionId: string | null,
  textureSlotLoadEnabled: Record<TexturePreviewSlotKey, boolean>,
  objectTextureLoadState: ObjectTextureLoadState,
  /**
   * Master switch for the whole decode stage. `false` loads the scene as
   * geometry only; flipping it back to `true` re-runs this effect and decodes
   * the textures the already-loaded models reference.
   */
  texturesEnabled: boolean,
): {
  textureDataMap: NutexbTextureDataMap;
  progress: TextureDecodeProgress | null;
  warnings: string[];
  regenerateTextureCache: (nutexbPath: string) => Promise<void>;
} {
  const [textureDataMap, setTextureDataMap] = useState<NutexbTextureDataMap>(() => new Map());
  const [progress, setProgress] = useState<TextureDecodeProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const cancelledRef = useRef(false);
  const runIdRef = useRef(0);
  const textureDataMapRef = useRef(textureDataMap);
  textureDataMapRef.current = textureDataMap;

  const stablePlacementIdentity = useMemo(
    () => placementEntries.map((e, i) => `${i}:${e.vdkType}:${e.objectNumber ?? ""}`).join("|"),
    [placementEntries],
  );

  const stablePlacementEntries = useRef(placementEntries);
  if (stablePlacementIdentity) {
    stablePlacementEntries.current = placementEntries;
  }

  const regenerateTextureCache = useCallback(async (nutexbPath: string) => {
    const trimmed = nutexbPath.trim();
    if (!trimmed || trimmed.startsWith("memory://")) {
      throw new Error("Texture cache is only available for nutexb files on disk.");
    }
    const entries = await invoke<SceneNutexbPngCacheEntry[]>("ensure_scene_nutexb_png_cache", {
      paths: [trimmed],
      force: true,
    });
    const entry = entries[0];
    if (!entry || entry.error) {
      throw new Error(entry?.error || "Failed to regenerate the texture cache.");
    }
    const key = normalizeTexturePathKey(trimmed);
    setTextureDataMap((prev) => {
      const next = new Map(prev);
      let revision = 1;
      for (const [path, data] of prev) {
        if (normalizeTexturePathKey(path) === key) {
          revision = Math.max(revision, data.revision + 1);
        }
      }
      const data = pngTextureFromCache(entry, revision);
      let replaced = false;
      for (const path of prev.keys()) {
        if (normalizeTexturePathKey(path) === key) {
          next.set(path, data);
          replaced = true;
        }
      }
      if (!replaced) {
        rememberTexture(next, trimmed, data);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!texturesEnabled) {
      setTextureDataMap(new Map());
      setProgress(null);
      setWarnings([]);
      return;
    }

    const uniquePaths = collectUniqueNutexbPaths(
      baseModel,
      subModels,
      importedSsbhBundles,
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

    const decodablePaths = uniquePaths.filter(
      (path) => !(path.startsWith("memory://") && !sessionId),
    );
    if (decodablePaths.length === 0) {
      return;
    }

    const currentMap = textureDataMapRef.current;
    const missing = decodablePaths.filter(
      (path) => !currentMap.has(path) && !currentMap.has(path.toLowerCase()),
    );
    if (missing.length === 0) {
      return;
    }

    cancelledRef.current = false;
    const currentRunId = ++runIdRef.current;
    const diskPaths = missing.filter((path) => !path.startsWith("memory://"));
    const memoryPaths = missing.filter((path) => path.startsWith("memory://"));

    (async () => {
      const nextMap = new Map(currentMap);
      const nextWarnings: string[] = [];
      const batchT0 = performance.now();
      let done = 0;
      const total = missing.length;

      console.log(
        `[SceneEdit:Cache] START disk=${diskPaths.length} memory=${memoryPaths.length}`,
      );
      setProgress({ done: 0, total, currentLabel: basenameOf(missing[0] ?? "") });

      for (let offset = 0; offset < diskPaths.length; offset += DISK_CACHE_CHUNK) {
        if (cancelledRef.current || currentRunId !== runIdRef.current) return;
        const chunk = diskPaths.slice(offset, offset + DISK_CACHE_CHUNK);
        let entries: SceneNutexbPngCacheEntry[] = [];
        try {
          entries = await invoke<SceneNutexbPngCacheEntry[]>("ensure_scene_nutexb_png_cache", {
            paths: chunk,
            force: false,
          });
        } catch (error) {
          for (const path of chunk) {
            nextWarnings.push(`${basenameOf(path)}: ${error}`);
          }
          done += chunk.length;
          setProgress({ done, total, currentLabel: basenameOf(chunk[0] ?? "") });
          continue;
        }
        if (cancelledRef.current || currentRunId !== runIdRef.current) return;
        for (const entry of entries) {
          if (entry.error) {
            nextWarnings.push(`${basenameOf(entry.nutexbPath)}: ${entry.error}`);
            continue;
          }
          rememberTexture(nextMap, entry.nutexbPath, pngTextureFromCache(entry, 0));
        }
        done += chunk.length;
        setProgress({ done, total, currentLabel: basenameOf(chunk[chunk.length - 1] ?? "") });
        setTextureDataMap(new Map(nextMap));
      }

      let memoryIndex = 0;
      const decodeMemory = async (): Promise<void> => {
        while (memoryIndex < memoryPaths.length) {
          if (cancelledRef.current || currentRunId !== runIdRef.current) return;
          const path = memoryPaths[memoryIndex++];
          try {
            if (!sessionId) {
              throw new Error("memory texture has no session");
            }
            const identity = await getMemoryNutexbPreviewIdentity({ sessionId, virtualPath: path });
            const versionId = `nutexb|${identity.nutexbSize}|${(identity.crc32 >>> 0).toString(16).padStart(8, "0")}@full`;
            const rgbaData = await getOrDecodeNutexbRgba(versionId, () =>
              invoke<ArrayBuffer | Uint8Array>("fhm2d_memory_nutexb_rgba_bytes", {
                sessionId,
                virtualPath: path,
              }),
            );
            if (cancelledRef.current || currentRunId !== runIdRef.current) return;
            rememberTexture(nextMap, path, { ...rgbaData, kind: "rgba", revision: 0 });
          } catch (error) {
            nextWarnings.push(`${basenameOf(path)}: ${error}`);
          }
          done += 1;
          setProgress({ done, total, currentLabel: basenameOf(path) });
        }
      };

      const memoryWorkers = Array.from(
        { length: Math.min(MEMORY_DECODE_CONCURRENCY, memoryPaths.length) },
        () => decodeMemory(),
      );
      await Promise.all(memoryWorkers);
      if (cancelledRef.current || currentRunId !== runIdRef.current) return;

      const elapsed = performance.now() - batchT0;
      console.log(
        `[SceneEdit:Cache] DONE disk=${diskPaths.length} memory=${memoryPaths.length}` +
        ` warnings=${nextWarnings.length} elapsed=${(elapsed / 1000).toFixed(1)}s`,
      );
      setTextureDataMap(new Map(nextMap));
      setProgress(null);
      setWarnings(nextWarnings);
    })();

    return () => {
      cancelledRef.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stablePlacementIdentity replaces placementEntries to avoid re-decode on coordinate-only changes
  }, [baseModel, subModels, importedSsbhBundles, stablePlacementIdentity, sessionId, textureSlotLoadEnabled, objectTextureLoadState, texturesEnabled]);

  return { textureDataMap, progress, warnings, regenerateTextureCache };
}
