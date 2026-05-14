import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import {
  getOrDecodeNutexbPngBlobUrl,
  makeNutexbVersionId,
} from "@/page/TestEditor/components/ssbh-model-preview/nutexbPreviewCache";
import {
  getMemoryNutexbPreviewIdentity,
  getMemoryNutexbPngBytes,
} from "@/page/TestEditor/components/ssbh-model-preview/fhm2dMemoryPreviewService";

export interface TextureDecodeProgress {
  done: number;
  total: number;
  currentLabel: string;
}

export type NutexbBlobUrlMap = Map<string, string>;

function collectUniqueNutexbPaths(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ bundle: SsbhModelPreviewBundle }>,
): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  const addFromBundle = (bundle: SsbhModelPreviewBundle) => {
    for (const p of bundle.resolvedNutexbPaths) {
      const key = p.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        paths.push(p);
      }
    }
  };

  if (baseModel) addFromBundle(baseModel);
  for (const sub of subModels) addFromBundle(sub.bundle);

  return paths;
}

function basenameOf(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function useSceneTextureLoader(
  baseModel: SsbhModelPreviewBundle | null,
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>,
  sessionId: string | null,
): {
  blobUrlMap: NutexbBlobUrlMap;
  progress: TextureDecodeProgress | null;
  warnings: string[];
} {
  const [blobUrlMap, setBlobUrlMap] = useState<NutexbBlobUrlMap>(() => new Map());
  const [progress, setProgress] = useState<TextureDecodeProgress | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const cancelledRef = useRef(false);
  const runIdRef = useRef(0);

  const sourceKind = baseModel?.sourceKind ?? subModels[0]?.bundle.sourceKind ?? "disk";

  useEffect(() => {
    const uniquePaths = collectUniqueNutexbPaths(baseModel, subModels);
    if (uniquePaths.length === 0) {
      setBlobUrlMap(new Map());
      setProgress(null);
      setWarnings([]);
      return;
    }

    if (sourceKind === "memory" && !sessionId) {
      return;
    }

    cancelledRef.current = false;
    const currentRunId = ++runIdRef.current;
    const nextMap = new Map<string, string>();
    const nextWarnings: string[] = [];
    let done = 0;
    const total = uniquePaths.length;

    console.log(
      `[SceneEdit:Decode] START unique=${uniquePaths.length} source=${sourceKind} concurrency=${Math.min(12, uniquePaths.length)}`,
    );
    const batchT0 = performance.now();
    let freshDecodes = 0;
    let errors = 0;

    setProgress({ done: 0, total, currentLabel: "" });

    const queue = [...uniquePaths];
    const concurrency = Math.min(12, queue.length);
    let idx = 0;

    const flushMap = () => {
      if (cancelledRef.current || currentRunId !== runIdRef.current) return;
      setBlobUrlMap(new Map(nextMap));
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
          let persistEligible: boolean;
          let decodeFn: () => Promise<ArrayBuffer | Uint8Array>;

          if (sourceKind === "memory" && sessionId) {
            const identity = await getMemoryNutexbPreviewIdentity({
              sessionId,
              virtualPath: path,
            });
            versionId = makeNutexbVersionId(path, identity.nutexbSize, identity.crc32);
            persistEligible = false;
            decodeFn = () =>
              getMemoryNutexbPngBytes({ sessionId, virtualPath: path });
          } else {
            const identity = await invoke<{ nutexbSize: number; crc32: number }>(
              "nutexb_preview_file_identity",
              { path },
            );
            versionId = makeNutexbVersionId(path, identity.nutexbSize, identity.crc32);
            persistEligible = true;
            decodeFn = () =>
              invoke<ArrayBuffer | Uint8Array>("nutexb_png_bytes", { inputPath: path });
          }

          if (cancelledRef.current || currentRunId !== runIdRef.current) return;

          const blobUrl = await getOrDecodeNutexbPngBlobUrl(versionId, persistEligible, decodeFn);
          if (blobUrl) freshDecodes++;

          if (cancelledRef.current || currentRunId !== runIdRef.current) return;

          nextMap.set(path, blobUrl);
          nextMap.set(path.toLowerCase(), blobUrl);
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
      setBlobUrlMap(new Map(nextMap));
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
  }, [baseModel, subModels, sessionId, sourceKind]);

  return { blobUrlMap, progress, warnings };
}
