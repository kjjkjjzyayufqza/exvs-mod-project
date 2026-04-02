import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  DialogLastPathKey,
  getDialogDefaultPath,
  rememberDialogSelection,
} from "@/utils/dialogLastPath";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { BufferGeometry } from "three";
import {
  buildDrawListFromBundle,
  buildMatlLookup,
  collectPathSlotCounts,
  countTextureDecodeSteps,
  createDefaultTextureSlotLoadEnabled,
  resolveMaterialBinding,
  resolveMaterialTexturePaths,
  TEXTURE_PREVIEW_SLOT_META,
  TEXTURE_SLOT_TO_PATH_FIELD,
  type DrawMaterialDataUrls,
  type ResolvedMaterialBinding,
  type TexturePreviewSlotKey,
} from "./meshFromSsbh";
import { getOrDecodeNutexbPngBlobUrl, resolveNutexbVersionId } from "./nutexbPreviewCache";
import {
  buildNextRecentPaths,
  readAutoLoadAfterConvertFromStorage,
  readRecentModelPathsFromStorage,
  writeAutoLoadAfterConvertToStorage,
  writeRecentModelPathsToStorage,
} from "./ssbhPreviewRecentPaths";
import { buildSkeletonLineGeometry } from "./skeletonLines";
import type {
  BuiltMeshDraw,
  MatlDataJson,
  MeshDataJson,
  ModlDataJson,
  SkelDataJson,
  SsbhModelPreviewBundle,
} from "./types";

export type BoneTransformMode = "translate" | "rotate" | "scale";

/** Physical PBR preview vs stylized look inspired by cortiz2894/water-anime-shader (bloom + warm lights). */
export type PreviewRenderStyle = "standard" | "anime";

export type MaterialDebugViewMode =
  | "full"
  | "baseColor"
  | "normals"
  | "roughnessMetalness"
  | "emissive"
  | "reflection";

/** Progress while decoding .nutexb → PNG for the WebGL preview (per slot step, deduped by disk path inside the loop). */
export type SsbhModelPreviewTextureDecodeProgress = {
  done: number;
  total: number;
  currentLabel: string | null;
};

function fileBasename(path: string): string {
  const p = path.replace(/\\/g, "/");
  const seg = p.split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

/** Parallel nutexb→PNG IPC for cache misses; LRU avoids re-decoding across model switches. */
const NUTEXB_DECODE_CONCURRENCY = 12;

function buildRefToPathMap(bundle: SsbhModelPreviewBundle): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of bundle.textureResolve) {
    if (row.nutexbPath) {
      m.set(row.reference, row.nutexbPath);
    }
  }
  return m;
}

export type SsbhModelPreviewContextValue = {
  workspaceRoot: string | null;
  bundle: SsbhModelPreviewBundle | null;
  draws: BuiltMeshDraw[];
  drawError: string | null;
  loading: boolean;
  /** True while reading bundle from disk (Rust). */
  loadError: string | null;
  /** True while .nutexb textures are being decoded for preview. */
  textureDecoding: boolean;
  /** Null when idle or finished; set while decoding with step counts and last file label. */
  textureDecodeProgress: SsbhModelPreviewTextureDecodeProgress | null;
  /** Shorthand: `loading || textureDecoding` — use to block actions that conflict with I/O. */
  previewBusy: boolean;
  previewRenderStyle: PreviewRenderStyle;
  setPreviewRenderStyle: (v: PreviewRenderStyle) => void;
  visibleKeys: ReadonlySet<string>;
  wireframe: boolean;
  setWireframe: (v: boolean) => void;
  showSkeleton: boolean;
  setShowSkeleton: (v: boolean) => void;
  showGrid: boolean;
  setShowGrid: (v: boolean) => void;
  showAxesGizmo: boolean;
  setShowAxesGizmo: (v: boolean) => void;
  showStats: boolean;
  setShowStats: (v: boolean) => void;
  background: string;
  setBackground: (v: string) => void;
  ambientIntensity: number;
  setAmbientIntensity: (v: number) => void;
  directionalIntensity: number;
  setDirectionalIntensity: (v: number) => void;
  directionalX: number;
  setDirectionalX: (v: number) => void;
  directionalY: number;
  setDirectionalY: (v: number) => void;
  directionalZ: number;
  setDirectionalZ: (v: number) => void;
  normalMapEnabled: boolean;
  setNormalMapEnabled: (v: boolean) => void;
  selectedDebugDrawKey: string | null;
  setSelectedDebugDrawKey: (v: string | null) => void;
  drawMaterialDataUrlsByDrawKey: ReadonlyMap<string, DrawMaterialDataUrls>;
  drawMaterialBindingsByDrawKey: ReadonlyMap<string, ResolvedMaterialBinding>;
  materialDebugViewMode: MaterialDebugViewMode;
  setMaterialDebugViewMode: (v: MaterialDebugViewMode) => void;
  textureFlipY: boolean;
  setTextureFlipY: (v: boolean) => void;
  /** Mirror mesh UVs horizontally (U -> 1-U) for preview. */
  uvFlipU: boolean;
  setUvFlipU: (v: boolean) => void;
  /** Mirror mesh UVs vertically (V -> 1-V) for preview. */
  uvFlipV: boolean;
  setUvFlipV: (v: boolean) => void;
  /** When false for a slot, that texture is not decoded from disk (saves CPU/GPU memory). */
  textureSlotLoadEnabled: Readonly<Record<TexturePreviewSlotKey, boolean>>;
  setTextureSlotLoadEnabled: (key: TexturePreviewSlotKey, enabled: boolean) => void;
  setAllTextureSlotsLoadEnabled: (enabled: boolean) => void;
  fitRequestId: number;
  requestCameraFit: () => void;
  skeletonGeometry: BufferGeometry | null;
  pickFolder: () => Promise<void>;
  pickNumdlb: () => Promise<void>;
  tryWorkspaceRoot: () => Promise<void>;
  /** When true, a successful DAE/FBX → SSBH export loads the generated `.numdlb` here. Persisted in localStorage. */
  autoLoadAfterConvertToSsbh: boolean;
  setAutoLoadAfterConvertToSsbh: (v: boolean) => void;
  /** Load preview from a folder path or a `.numdlb` file path (same as Open model). */
  loadModelAt: (path: string) => Promise<void>;
  /** Unloads the model from GPU/memory. Throws if a load or texture decode is in progress. */
  clearScene: () => void;
  /** Reloads the same `.numdlb` path from disk. Throws when no model is loaded. */
  reloadCurrentModel: () => Promise<void>;
  /** Resets viewport toggles and lighting to installation defaults (does not unload the model). */
  resetDisplaySettingsToDefaults: () => void;
  recentModelPaths: readonly string[];
  clearRecentModelPaths: () => void;
  removeRecentModelPath: (path: string) => void;
  toggleVisible: (key: string, checked: boolean) => void;
  showAllMeshes: () => void;
  hideAllMeshes: () => void;
  vertexTriangleStats: { verts: number; tris: number };
  bonePoseEnabled: boolean;
  setBonePoseEnabled: (v: boolean) => void;
  selectedBoneIndex: number | null;
  setSelectedBoneIndex: (v: number | null) => void;
  boneTransformMode: BoneTransformMode;
  setBoneTransformMode: (v: BoneTransformMode) => void;
  bonePoseResetNonce: number;
  resetBonePose: () => void;
  /** When true, the 3D canvas stops its render loop (kept-alive background route). */
  previewSuspended: boolean;
};

const SsbhModelPreviewContext = createContext<SsbhModelPreviewContextValue | null>(null);

export function useSsbhModelPreview(): SsbhModelPreviewContextValue {
  const ctx = useContext(SsbhModelPreviewContext);
  if (!ctx) {
    throw new Error("useSsbhModelPreview must be used within SsbhModelPreviewProvider");
  }
  return ctx;
}

type ProviderProps = {
  workspaceRoot: string | null | undefined;
  /** When true, pause the Three.js render loop while the Test Editor route stays mounted in the background. */
  previewSuspended?: boolean;
  children: ReactNode;
};

export function SsbhModelPreviewProvider({
  workspaceRoot,
  previewSuspended = false,
  children,
}: ProviderProps) {
  const root = workspaceRoot?.trim() ? workspaceRoot : null;

  const [bundle, setBundle] = useState<SsbhModelPreviewBundle | null>(null);
  const [draws, setDraws] = useState<BuiltMeshDraw[]>([]);
  const [drawError, setDrawError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [wireframe, setWireframe] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxesGizmo, setShowAxesGizmo] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [background, setBackground] = useState("#1a1d23");
  const [ambientIntensity, setAmbientIntensity] = useState(0.4);
  const [directionalIntensity, setDirectionalIntensity] = useState(1.05);
  const [directionalX, setDirectionalX] = useState(8);
  const [directionalY, setDirectionalY] = useState(14);
  const [directionalZ, setDirectionalZ] = useState(6);
  const [normalMapEnabled, setNormalMapEnabled] = useState(true);
  const [selectedDebugDrawKey, setSelectedDebugDrawKey] = useState<string | null>(null);
  const [drawMaterialDataUrlsByDrawKey, setDrawMaterialDataUrlsByDrawKey] = useState<
    Map<string, DrawMaterialDataUrls>
  >(() => new Map());
  const [drawMaterialBindingsByDrawKey, setDrawMaterialBindingsByDrawKey] = useState<
    Map<string, ResolvedMaterialBinding>
  >(() => new Map());
  const [materialDebugViewMode, setMaterialDebugViewMode] = useState<MaterialDebugViewMode>("full");
  const [textureFlipY, setTextureFlipY] = useState(false);
  const [uvFlipU, setUvFlipU] = useState(false);
  const [uvFlipV, setUvFlipV] = useState(false);
  const [textureSlotLoadEnabled, setTextureSlotLoadEnabledState] = useState(createDefaultTextureSlotLoadEnabled);
  const [textureDecodeProgress, setTextureDecodeProgress] = useState<SsbhModelPreviewTextureDecodeProgress | null>(null);
  const [fitRequestId, setFitRequestId] = useState(0);
  const [modelLoadNonce, setModelLoadNonce] = useState(0);
  const [bonePoseEnabled, setBonePoseEnabled] = useState(false);
  const [selectedBoneIndex, setSelectedBoneIndex] = useState<number | null>(null);
  const [boneTransformMode, setBoneTransformMode] = useState<BoneTransformMode>("translate");
  const [bonePoseResetNonce, setBonePoseResetNonce] = useState(0);
  const [previewRenderStyle, setPreviewRenderStyle] = useState<PreviewRenderStyle>("standard");
  const [recentModelPaths, setRecentModelPaths] = useState<string[]>(() =>
    readRecentModelPathsFromStorage(),
  );
  const [autoLoadAfterConvertToSsbh, setAutoLoadAfterConvertToSsbhState] = useState(() =>
    readAutoLoadAfterConvertFromStorage(),
  );

  const setAutoLoadAfterConvertToSsbh = useCallback((v: boolean) => {
    setAutoLoadAfterConvertToSsbhState(v);
    writeAutoLoadAfterConvertToStorage(v);
  }, []);

  const skeletonGeometry = useMemo(() => {
    if (!bundle?.skel) return null;
    try {
      return buildSkeletonLineGeometry(bundle.skel as SkelDataJson);
    } catch (e) {
      toast.error(`Skeleton parse failed: ${String(e)}`);
      return null;
    }
  }, [bundle?.skel]);

  useEffect(() => {
    return () => {
      skeletonGeometry?.dispose();
    };
  }, [skeletonGeometry]);

  useEffect(() => {
    if (!bundle) {
      setDraws([]);
      setDrawError(null);
      setBonePoseEnabled(false);
      setSelectedBoneIndex(null);
      return;
    }
    let created: BuiltMeshDraw[] = [];
    try {
      const skelJson = bundle.skel ? (bundle.skel as SkelDataJson) : null;
      created = buildDrawListFromBundle(
        bundle.modl as ModlDataJson,
        bundle.mesh as MeshDataJson,
        skelJson,
      );
      setDrawError(null);
    } catch (e) {
      setDrawError(String(e));
      created = [];
    }
    setDraws(created);
    setBonePoseEnabled(false);
    setSelectedBoneIndex(null);
    setBonePoseResetNonce((n) => n + 1);
    return () => {
      created.forEach((d) => d.geometry.dispose());
    };
  }, [bundle]);

  useEffect(() => {
    setVisibleKeys(new Set(draws.map((d) => d.key)));
    setSelectedDebugDrawKey((prev) => {
      if (!draws.length) return null;
      if (prev && draws.some((d) => d.key === prev)) return prev;
      return draws[0]?.key ?? null;
    });
  }, [draws]);

  useEffect(() => {
    if (!bundle || draws.length === 0) {
      setDrawMaterialDataUrlsByDrawKey(new Map());
      setDrawMaterialBindingsByDrawKey(new Map());
      setTextureDecodeProgress(null);
      return;
    }
    let cancelled = false;
    const matl = bundle.matl as MatlDataJson | null;
    const lookup = buildMatlLookup(matl);
    const refMap = buildRefToPathMap(bundle);

    const totalSteps = countTextureDecodeSteps(draws, lookup, refMap, textureSlotLoadEnabled);
    if (totalSteps === 0) {
      const nextBindings = new Map<string, ResolvedMaterialBinding>();
      const next = new Map<string, DrawMaterialDataUrls>();
      for (const d of draws) {
        nextBindings.set(d.key, resolveMaterialBinding(d.materialLabel, lookup, refMap));
        next.set(d.key, {
          map: null,
          normalMap: null,
          roughnessMap: null,
          metalnessMap: null,
          emissiveMap: null,
          aoMap: null,
          cubeMap: null,
        });
      }
      setDrawMaterialBindingsByDrawKey(nextBindings);
      setDrawMaterialDataUrlsByDrawKey(next);
      setTextureDecodeProgress(null);
      return;
    }

    setTextureDecodeProgress({ done: 0, total: totalSteps, currentLabel: null });

    (async () => {
      const next = new Map<string, DrawMaterialDataUrls>();
      const nextBindings = new Map<string, ResolvedMaterialBinding>();
      const failedTextures: string[] = [];
      const pathToDataUrl = new Map<string, string>();
      const pathSlotCounts = collectPathSlotCounts(draws, lookup, refMap, textureSlotLoadEnabled);
      const uniquePaths = [...pathSlotCounts.keys()];
      const versionByPath = new Map<string, Awaited<ReturnType<typeof resolveNutexbVersionId>>>();
      if (uniquePaths.length > 0) {
        await Promise.all(
          uniquePaths.map((p) =>
            resolveNutexbVersionId(p)
              .then((v) => {
                versionByPath.set(p, v);
              })
              .catch((e) => {
                failedTextures.push(`${p}: ${String(e)}`);
              }),
          ),
        );
      }
      if (cancelled) {
        return;
      }

      const bumpDoneBy = (n: number) => {
        if (cancelled || n <= 0) return;
        setTextureDecodeProgress((prev) =>
          prev ? { ...prev, done: prev.done + n } : null,
        );
      };

      const decodeOneDiskPath = async (diskPath: string): Promise<void> => {
        const slotCount = pathSlotCounts.get(diskPath) ?? 0;
        if (!cancelled) {
          setTextureDecodeProgress((prev) =>
            prev ? { ...prev, currentLabel: `${fileBasename(diskPath)} · decode` } : null,
          );
        }
        try {
          const meta = versionByPath.get(diskPath);
          if (!meta) {
            throw new Error("Missing CRC identity for texture path (see earlier errors)");
          }
          const { versionId, persistEligible } = meta;
          const url = await getOrDecodeNutexbPngBlobUrl(versionId, persistEligible, () =>
            invoke<ArrayBuffer | Uint8Array>("nutexb_png_bytes", { inputPath: diskPath }),
          );
          if (cancelled) return;
          pathToDataUrl.set(diskPath, url);
        } catch (e) {
          failedTextures.push(`${diskPath}: ${String(e)}`);
        } finally {
          bumpDoneBy(slotCount);
        }
      };

      if (uniquePaths.length > 0) {
        const queue = [...uniquePaths];
        const workerCount = Math.min(NUTEXB_DECODE_CONCURRENCY, uniquePaths.length);
        const worker = async () => {
          while (!cancelled) {
            const diskPath = queue.shift();
            if (diskPath === undefined) return;
            await decodeOneDiskPath(diskPath);
          }
        };
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      }

      for (const d of draws) {
        if (cancelled) return;
        const binding = resolveMaterialBinding(d.materialLabel, lookup, refMap);
        nextBindings.set(d.key, binding);
        const paths = resolveMaterialTexturePaths(d.materialLabel, lookup, refMap);
        const urls: DrawMaterialDataUrls = {
          map: null,
          normalMap: null,
          roughnessMap: null,
          metalnessMap: null,
          emissiveMap: null,
          aoMap: null,
          cubeMap: null,
        };
        for (const { key } of TEXTURE_PREVIEW_SLOT_META) {
          const field = TEXTURE_SLOT_TO_PATH_FIELD[key];
          const pathVal = paths[field];
          if (!textureSlotLoadEnabled[key]) {
            urls[key] = null;
            continue;
          }
          if (!pathVal) {
            urls[key] = null;
            continue;
          }
          urls[key] = pathToDataUrl.get(pathVal) ?? null;
        }
        next.set(d.key, urls);
      }
      if (!cancelled) {
        setDrawMaterialDataUrlsByDrawKey(next);
        setDrawMaterialBindingsByDrawKey(nextBindings);
        setTextureDecodeProgress(null);
        if (failedTextures.length > 0) {
          const preview = failedTextures.slice(0, 4).join("\n");
          const more =
            failedTextures.length > 4 ? `\n… and ${failedTextures.length - 4} more` : "";
          toast.error("Some textures failed to decode", {
            description: `${preview}${more}`,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bundle, draws, textureSlotLoadEnabled]);

  useEffect(() => {
    if (modelLoadNonce === 0 || draws.length === 0) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setFitRequestId((n) => n + 1));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [modelLoadNonce, draws.length]);

  const loadAt = useCallback(async (path: string) => {
    setLoading(true);
    setLoadError(null);
    setTextureDecodeProgress(null);
    try {
      const b = await invoke<SsbhModelPreviewBundle>("ssbh_load_model_preview", { rootPath: path });
      startTransition(() => setBundle(b));
      setRecentModelPaths((prev) => {
        const next = buildNextRecentPaths(prev, path);
        writeRecentModelPathsToStorage(next);
        return next;
      });
      setModelLoadNonce((n) => n + 1);
      if (b.warnings.length) {
        for (const w of b.warnings) {
          toast.message("Model preview notice", { description: w });
        }
      }
    } catch (e) {
      const msg = String(e);
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [startTransition]);

  const pickFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenModelFolder, root),
    });
    if (typeof selected === "string") {
      rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenModelFolder, selected, "directory");
      await loadAt(selected);
    }
  }, [loadAt, root]);

  const pickNumdlb = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenNumdlb, root),
      filters: [{ name: "NUMDLB", extensions: ["numdlb"] }],
    });
    if (typeof selected === "string") {
      rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenNumdlb, selected, "file");
      await loadAt(selected);
    }
  }, [loadAt, root]);

  const tryWorkspaceRoot = useCallback(async () => {
    if (!root) {
      toast.error("No workspace folder is open.");
      return;
    }
    await loadAt(root);
  }, [loadAt, root]);

  const loadModelAt = useCallback(
    async (path: string) => {
      const t = path.trim();
      if (!t) {
        throw new Error("Path is empty");
      }
      await loadAt(t);
    },
    [loadAt],
  );

  const requestCameraFit = useCallback(() => {
    setFitRequestId((r) => r + 1);
  }, []);

  const clearScene = useCallback(() => {
    if (loading) {
      throw new Error("Cannot clear the scene while loading or decoding textures.");
    }
    const decoding =
      textureDecodeProgress !== null &&
      textureDecodeProgress.done < textureDecodeProgress.total;
    if (decoding) {
      throw new Error("Cannot clear the scene while loading or decoding textures.");
    }
    setBundle(null);
    setLoadError(null);
    setDrawError(null);
  }, [loading, textureDecodeProgress]);

  const reloadCurrentModel = useCallback(async () => {
    const path = bundle?.modlPath?.trim();
    if (!path) {
      throw new Error("No model loaded to reload.");
    }
    await loadAt(path);
  }, [bundle?.modlPath, loadAt]);

  const resetDisplaySettingsToDefaults = useCallback(() => {
    setWireframe(false);
    setShowSkeleton(true);
    setShowGrid(true);
    setShowAxesGizmo(true);
    setShowStats(false);
    setBackground("#1a1d23");
    setAmbientIntensity(0.4);
    setDirectionalIntensity(1.05);
    setDirectionalX(8);
    setDirectionalY(14);
    setDirectionalZ(6);
    setNormalMapEnabled(true);
    setMaterialDebugViewMode("full");
    setTextureFlipY(false);
    setUvFlipU(false);
    setUvFlipV(false);
    setPreviewRenderStyle("standard");
    setTextureSlotLoadEnabledState(createDefaultTextureSlotLoadEnabled());
    setBonePoseEnabled(false);
    setSelectedBoneIndex(null);
    setBoneTransformMode("translate");
    setBonePoseResetNonce((n) => n + 1);
    setFitRequestId((r) => r + 1);
  }, []);

  const clearRecentModelPaths = useCallback(() => {
    writeRecentModelPathsToStorage([]);
    setRecentModelPaths([]);
  }, []);

  const removeRecentModelPath = useCallback((path: string) => {
    setRecentModelPaths((prev) => {
      const next = prev.filter((p) => p !== path);
      writeRecentModelPathsToStorage(next);
      return next;
    });
  }, []);

  const resetBonePose = useCallback(() => {
    setBonePoseResetNonce((n) => n + 1);
  }, []);

  const toggleVisible = useCallback((key: string, checked: boolean) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const showAllMeshes = useCallback(() => {
    setVisibleKeys(new Set(draws.map((d) => d.key)));
  }, [draws]);

  const hideAllMeshes = useCallback(() => {
    setVisibleKeys(new Set());
  }, []);

  const setTextureSlotLoadEnabled = useCallback((key: TexturePreviewSlotKey, enabled: boolean) => {
    setTextureSlotLoadEnabledState((prev) => ({ ...prev, [key]: enabled }));
  }, []);

  const setAllTextureSlotsLoadEnabled = useCallback((enabled: boolean) => {
    if (enabled) {
      setTextureSlotLoadEnabledState(createDefaultTextureSlotLoadEnabled());
    } else {
      setTextureSlotLoadEnabledState({
        map: false,
        normalMap: false,
        roughnessMap: false,
        metalnessMap: false,
        emissiveMap: false,
        aoMap: false,
        cubeMap: false,
      });
    }
  }, []);

  const vertexTriangleStats = useMemo(() => {
    let verts = 0;
    let tris = 0;
    for (const d of draws) {
      const pos = d.geometry.getAttribute("position");
      if (pos) {
        verts += pos.count;
        tris += Math.floor(pos.count / 3);
      }
    }
    return { verts, tris };
  }, [draws]);

  const textureDecoding = useMemo(
    () =>
      textureDecodeProgress !== null &&
      textureDecodeProgress.done < textureDecodeProgress.total,
    [textureDecodeProgress],
  );

  const previewBusy = loading || textureDecoding;

  const value = useMemo<SsbhModelPreviewContextValue>(
    () => ({
      workspaceRoot: root,
      bundle,
      draws,
      drawError,
      loading,
      loadError,
      textureDecoding,
      textureDecodeProgress,
      previewBusy,
      previewRenderStyle,
      setPreviewRenderStyle,
      visibleKeys,
      wireframe,
      setWireframe,
      showSkeleton,
      setShowSkeleton,
      showGrid,
      setShowGrid,
      showAxesGizmo,
      setShowAxesGizmo,
      showStats,
      setShowStats,
      background,
      setBackground,
      ambientIntensity,
      setAmbientIntensity,
      directionalIntensity,
      setDirectionalIntensity,
      directionalX,
      setDirectionalX,
      directionalY,
      setDirectionalY,
      directionalZ,
      setDirectionalZ,
      normalMapEnabled,
      setNormalMapEnabled,
      selectedDebugDrawKey,
      setSelectedDebugDrawKey,
      drawMaterialDataUrlsByDrawKey,
      drawMaterialBindingsByDrawKey,
      materialDebugViewMode,
      setMaterialDebugViewMode,
      textureFlipY,
      setTextureFlipY,
      uvFlipU,
      setUvFlipU,
      uvFlipV,
      setUvFlipV,
      textureSlotLoadEnabled,
      setTextureSlotLoadEnabled,
      setAllTextureSlotsLoadEnabled,
      fitRequestId,
      requestCameraFit,
      skeletonGeometry,
      pickFolder,
      pickNumdlb,
      tryWorkspaceRoot,
      autoLoadAfterConvertToSsbh,
      setAutoLoadAfterConvertToSsbh,
      loadModelAt,
      clearScene,
      reloadCurrentModel,
      resetDisplaySettingsToDefaults,
      recentModelPaths,
      clearRecentModelPaths,
      removeRecentModelPath,
      toggleVisible,
      showAllMeshes,
      hideAllMeshes,
      vertexTriangleStats,
      bonePoseEnabled,
      setBonePoseEnabled,
      selectedBoneIndex,
      setSelectedBoneIndex,
      boneTransformMode,
      setBoneTransformMode,
      bonePoseResetNonce,
      resetBonePose,
      previewSuspended,
    } satisfies SsbhModelPreviewContextValue),
    [
      root,
      bundle,
      draws,
      drawError,
      loading,
      loadError,
      textureDecoding,
      textureDecodeProgress,
      previewBusy,
      previewRenderStyle,
      visibleKeys,
      wireframe,
      showSkeleton,
      showGrid,
      showAxesGizmo,
      showStats,
      background,
      ambientIntensity,
      directionalIntensity,
      directionalX,
      directionalY,
      directionalZ,
      normalMapEnabled,
      selectedDebugDrawKey,
      drawMaterialDataUrlsByDrawKey,
      drawMaterialBindingsByDrawKey,
      materialDebugViewMode,
      textureFlipY,
      uvFlipU,
      uvFlipV,
      textureSlotLoadEnabled,
      setTextureSlotLoadEnabled,
      setAllTextureSlotsLoadEnabled,
      fitRequestId,
      requestCameraFit,
      skeletonGeometry,
      pickFolder,
      pickNumdlb,
      tryWorkspaceRoot,
      autoLoadAfterConvertToSsbh,
      setAutoLoadAfterConvertToSsbh,
      loadModelAt,
      clearScene,
      reloadCurrentModel,
      resetDisplaySettingsToDefaults,
      recentModelPaths,
      clearRecentModelPaths,
      removeRecentModelPath,
      toggleVisible,
      showAllMeshes,
      hideAllMeshes,
      vertexTriangleStats,
      bonePoseEnabled,
      selectedBoneIndex,
      boneTransformMode,
      bonePoseResetNonce,
      resetBonePose,
      previewSuspended,
    ],
  );

  return (
    <SsbhModelPreviewContext.Provider value={value}>{children}</SsbhModelPreviewContext.Provider>
  );
}
