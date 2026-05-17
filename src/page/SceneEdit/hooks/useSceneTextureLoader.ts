import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  collectUniqueTexturePathsForSceneBundles,
  type TexturePreviewSlotKey,
} from "@/page/TestEditor/components/ssbh-model-preview/meshFromSsbh";
import {
  getOrDecodeNutexbRgba,
  makeNutexbVersionId,
  type NutexbRgbaData,
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

export type NutexbTextureDataMap = Map<string, NutexbRgbaData>;

const DECODE_CONCURRENCY = 4;

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

    cancelledRef.current = false;
    const currentRunId = ++runIdRef.current;
    const nextMap = new Map<string, NutexbRgbaData>();
    const nextWarnings: string[] = [];
    let done = 0;
    const total = uniquePaths.length;
    const concurrency = Math.min(DECODE_CONCURRENCY, uniquePaths.length);

    console.log(
      `[SceneEdit:Decode] START unique=${uniquePaths.length} source=${sourceKind}` +
      ` concurrency=${concurrency} maxDim=${maxDimension ?? "full"} mode=RGBA`,
    );
    const batchT0 = performance.now();
    let errors = 0;

    setProgress({ done: 0, total, currentLabel: "" });

    const queue = [...uniquePaths];
    let idx = 0;

    const flushMap = () => {
      if (cancelledRef.current || currentRunId !== runIdRef.current) return;
      setTextureDataMap(new Map(nextMap));
    };

    let pendingFlush: ReturnType<typeof requestAnimationFrame> | null = null;
    const scheduleFlush = () => {
      if (pendingFlush != null) return;
      pendingFlush = requestAnimationFrame(() => {
        pendingFlush = null;
        flushMap();
      });
    };

    const processNext = async (): Promise<void> => {
      while (idx < queue.length) {
        if (cancelledRef.current || currentRunId !== runIdRef.current) return;

        const path = queue[idx++];
        const label = basenameOf(path);

        try {
          let versionId: string;
          let decodeFn: () => Promise<ArrayBuffer | Uint8Array>;

          if (sourceKind === "memory" && sessionId) {
            const identity = await getMemoryNutexbPreviewIdentity({
              sessionId,
              virtualPath: path,
            });
            versionId = makeNutexbVersionId(path, identity.nutexbSize, identity.crc32) + `@${maxDimension ?? "full"}`;
            decodeFn = () =>
              invoke<ArrayBuffer | Uint8Array>("fhm2d_memory_nutexb_rgba_bytes", {
                sessionId,
                virtualPath: path,
                maxDimension: maxDimension ?? undefined,
              });
          } else {
            const identity = await invoke<{ nutexbSize: number; crc32: number }>(
              "nutexb_preview_file_identity",
              { path },
            );
            versionId = makeNutexbVersionId(path, identity.nutexbSize, identity.crc32) + `@${maxDimension ?? "full"}`;
            decodeFn = () =>
              invoke<ArrayBuffer | Uint8Array>("nutexb_rgba_bytes", {
                inputPath: path,
                maxDimension: maxDimension ?? undefined,
              });
          }

          if (cancelledRef.current || currentRunId !== runIdRef.current) return;

          const rgbaData = await getOrDecodeNutexbRgba(versionId, decodeFn);

          if (cancelledRef.current || currentRunId !== runIdRef.current) return;

          nextMap.set(path, rgbaData);
          nextMap.set(path.toLowerCase(), rgbaData);
        } catch (err) {
          errors++;
          nextWarnings.push(`${label}: ${err}`);
        }

        done += 1;
        setProgress({ done, total, currentLabel: label });
        scheduleFlush();
      }
    };

    const workers = Array.from({ length: concurrency }, () => processNext());

    Promise.all(workers).then(() => {
      if (cancelledRef.current || currentRunId !== runIdRef.current) return;
      if (pendingFlush != null) {
        cancelAnimationFrame(pendingFlush);
        pendingFlush = null;
      }
      const elapsed = performance.now() - batchT0;
      console.log(
        `[SceneEdit:Decode] DONE total=${uniquePaths.length} resolved=${nextMap.size / 2}` +
        ` errors=${errors} elapsed=${(elapsed / 1000).toFixed(1)}s`,
      );
      setTextureDataMap(new Map(nextMap));
      setProgress(null);
      setWarnings(nextWarnings);
    });

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
