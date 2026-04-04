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
  useRef,
  useState,
  useTransition,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { BufferGeometry } from "three";
import {
  buildDrawListFromBundle,
  buildMatlLookup,
  buildTextureRefToPathMap,
  bundleForPreviewDraw,
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
  SsbhModelPreviewInstance,
} from "./types";
import type { MotionClip, MotionSample, NuanmbManifest } from "./motionPreviewTypes";
import { sampleMotionClipFrame } from "./motionPlaybackMath";

export type BoneTransformMode = "translate" | "rotate" | "scale";
export type PreviewInstanceViewMode = "all" | "single";
export type PreviewControlScope = "all" | "single";

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

type PreviewInstanceMaterialContext = {
  lookup: Map<string, MatlDataJson["entries"][number]>;
  refMap: Map<string, string>;
};

/** Parallel nutexb→PNG IPC for cache misses; LRU avoids re-decoding across model switches. */
const NUTEXB_DECODE_CONCURRENCY = 12;

const INSTANCE_LOAD_CONCURRENCY = 4;

function previewInstanceIdFromModlPath(modlPath: string): string {
  const s = modlPath.trim().replace(/\\/g, "/");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `pi${(h >>> 0).toString(16)}`;
}

export type SsbhModelPreviewContextValue = {
  workspaceRoot: string | null;
  bundle: SsbhModelPreviewBundle | null;
  /** All loaded `.numdlb` instances (folder open may load many). */
  previewInstances: readonly SsbhModelPreviewInstance[];
  activePreviewInstanceId: string | null;
  setActivePreviewInstanceId: (id: string | null) => void;
  previewViewMode: PreviewInstanceViewMode;
  setPreviewViewMode: (mode: PreviewInstanceViewMode) => void;
  previewControlScope: PreviewControlScope;
  setPreviewControlScope: (scope: PreviewControlScope) => void;
  hiddenPreviewInstanceIds: ReadonlySet<string>;
  setPreviewInstanceVisible: (id: string, visible: boolean) => void;
  showAllPreviewInstances: () => void;
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
  selectedBoneIndex: number | null;
  setSelectedBoneIndex: (v: number | null) => void;
  boneTransformMode: BoneTransformMode;
  setBoneTransformMode: (v: BoneTransformMode) => void;
  bonePoseResetNonce: number;
  resetBonePose: () => void;
  /** Set by BonePreviewRig; used for undo/redo to read the current pose. */
  bonePoseGetterRef: MutableRefObject<(() => Float32Array) | null>;
  bonePoseApplyNonce: number;
  bonePoseToApply: Float32Array | null;
  consumeBonePoseApply: () => void;
  commitBonePoseUndo: (beforeTransformSnapshot: Float32Array) => void;
  undoBonePose: () => void;
  redoBonePose: () => void;
  canUndoBonePose: boolean;
  canRedoBonePose: boolean;
  /** When true, the 3D canvas stops its render loop (kept-alive background route). */
  previewSuspended: boolean;
  /** NUANMB motion (active model only). */
  motionNuanmbPaths: readonly string[];
  motionSelectedNuanmbPath: string | null;
  setMotionSelectedNuanmbPath: (path: string | null) => void;
  motionManifest: NuanmbManifest | null;
  motionPlaying: boolean;
  setMotionPlaying: (v: boolean) => void;
  motionLoop: boolean;
  setMotionLoop: (v: boolean) => void;
  motionSpeed: number;
  setMotionSpeed: (v: number) => void;
  motionFrame: number;
  setMotionFrame: (v: number) => void;
  motionClip: MotionClip | null;
  motionSample: MotionSample | null;
  motionSampling: boolean;
  motionSampleError: string | null;
  motionApplyCamera: boolean;
  setMotionApplyCamera: (v: boolean) => void;
  motionApplyLighting: boolean;
  setMotionApplyLighting: (v: boolean) => void;
  motionForceVisibleDuringPlayback: boolean;
  setMotionForceVisibleDuringPlayback: (v: boolean) => void;
  pickMotionNuanmbFile: () => Promise<void>;
  pickMotionFolder: () => Promise<void>;
  reloadMotionClip: () => void;
  clearMotion: () => void;
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

  const [previewInstances, setPreviewInstances] = useState<SsbhModelPreviewInstance[]>([]);
  const [activePreviewInstanceId, setActivePreviewInstanceId] = useState<string | null>(null);
  const [previewViewMode, setPreviewViewMode] = useState<PreviewInstanceViewMode>("all");
  const [previewControlScope, setPreviewControlScope] = useState<PreviewControlScope>("single");
  const [hiddenPreviewInstanceIds, setHiddenPreviewInstanceIds] = useState<Set<string>>(new Set());
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
  const textureDecoding = useMemo(
    () =>
      textureDecodeProgress !== null &&
      textureDecodeProgress.done < textureDecodeProgress.total,
    [textureDecodeProgress],
  );
  const previewBusy = loading || textureDecoding;
  const [fitRequestId, setFitRequestId] = useState(0);
  const [modelLoadNonce, setModelLoadNonce] = useState(0);
  const [selectedBoneIndex, setSelectedBoneIndex] = useState<number | null>(null);
  const [boneTransformMode, setBoneTransformMode] = useState<BoneTransformMode>("translate");
  const [bonePoseResetNonce, setBonePoseResetNonce] = useState(0);
  const bonePoseGetterRef = useRef<(() => Float32Array) | null>(null);
  const [bonePoseHistory, setBonePoseHistory] = useState<{
    undoStack: Float32Array[];
    redoStack: Float32Array[];
    applyNonce: number;
    applyData: Float32Array | null;
  }>({ undoStack: [], redoStack: [], applyNonce: 0, applyData: null });
  const [previewRenderStyle, setPreviewRenderStyle] = useState<PreviewRenderStyle>("standard");
  const [recentModelPaths, setRecentModelPaths] = useState<string[]>(() =>
    readRecentModelPathsFromStorage(),
  );
  const [autoLoadAfterConvertToSsbh, setAutoLoadAfterConvertToSsbhState] = useState(() =>
    readAutoLoadAfterConvertFromStorage(),
  );

  const [motionNuanmbPaths, setMotionNuanmbPaths] = useState<string[]>([]);
  const [motionSelectedNuanmbPath, setMotionSelectedNuanmbPath] = useState<string | null>(null);
  const [motionManifest, setMotionManifest] = useState<NuanmbManifest | null>(null);
  const [motionPlaying, setMotionPlaying] = useState(false);
  const [motionLoop, setMotionLoop] = useState(true);
  const [motionSpeed, setMotionSpeed] = useState(1);
  const [motionFrame, setMotionFrame] = useState(0);
  const [motionClip, setMotionClip] = useState<MotionClip | null>(null);
  const [motionSampling, setMotionSampling] = useState(false);
  const [motionSampleError, setMotionSampleError] = useState<string | null>(null);
  const [motionApplyCamera, setMotionApplyCamera] = useState(false);
  const [motionApplyLighting, setMotionApplyLighting] = useState(false);
  const [motionForceVisibleDuringPlayback, setMotionForceVisibleDuringPlayback] = useState(true);
  const [motionReloadNonce, setMotionReloadNonce] = useState(0);
  const loadedMotionClipKeyRef = useRef<string | null>(null);
  const motionSample = useMemo<MotionSample | null>(() => {
    if (!motionClip) {
      return null;
    }
    const frameSample = sampleMotionClipFrame(motionClip, motionFrame, motionLoop);
    return {
      frame: motionFrame,
      finalFrameIndex: motionClip.finalFrameIndex,
      boneLocals: frameSample.boneLocals,
      visibility: frameSample.visibility,
      materialTracks: frameSample.materialTracks,
      camera: frameSample.camera,
      lighting: frameSample.lighting,
      elapsedMs: 0,
    };
  }, [motionClip, motionFrame, motionLoop]);

  const setAutoLoadAfterConvertToSsbh = useCallback((v: boolean) => {
    setAutoLoadAfterConvertToSsbhState(v);
    writeAutoLoadAfterConvertToStorage(v);
  }, []);

  const clearMotion = useCallback(() => {
    setMotionNuanmbPaths([]);
    setMotionSelectedNuanmbPath(null);
    setMotionManifest(null);
    setMotionPlaying(false);
    setMotionFrame(0);
    setMotionClip(null);
    setMotionSampleError(null);
    loadedMotionClipKeyRef.current = null;
    setMotionReloadNonce((n) => n + 1);
    setBonePoseResetNonce((n) => n + 1);
  }, []);

  const reloadMotionClip = useCallback(() => {
    loadedMotionClipKeyRef.current = null;
    setMotionClip(null);
    setMotionFrame(0);
    setMotionPlaying(false);
    setMotionSampleError(null);
    setMotionReloadNonce((n) => n + 1);
  }, []);

  const pickMotionNuanmbFile = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenNuanmb, root),
      filters: [{ name: "NUANMB", extensions: ["nuanmb"] }],
    });
    if (typeof selected !== "string") return;
    rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenNuanmb, selected, "file");
    setMotionNuanmbPaths([selected]);
    setMotionSelectedNuanmbPath(selected);
    setMotionFrame(0);
    setMotionPlaying(false);
    setMotionClip(null);
    setMotionSampleError(null);
    loadedMotionClipKeyRef.current = null;
  }, [root]);

  const pickMotionFolder = useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenMotionFolder, root),
    });
    if (typeof selected !== "string") return;
    rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenMotionFolder, selected, "directory");
    const listed = await invoke<string[]>("ssbh_list_nuanmb_under_tree", { rootPath: selected });
    if (listed.length === 0) {
      const msg = "No .nuanmb files under the selected folder.";
      toast.error(msg);
      throw new Error(msg);
    }
    setMotionNuanmbPaths(listed);
    setMotionSelectedNuanmbPath(listed[0] ?? null);
    setMotionFrame(0);
    setMotionPlaying(false);
    setMotionClip(null);
    setMotionSampleError(null);
    loadedMotionClipKeyRef.current = null;
  }, [root]);

  const bundle = useMemo((): SsbhModelPreviewBundle | null => {
    if (previewInstances.length === 0) return null;
    if (activePreviewInstanceId) {
      const hit = previewInstances.find((i) => i.id === activePreviewInstanceId);
      return hit?.bundle ?? previewInstances[0]!.bundle;
    }
    return previewInstances[0]!.bundle;
  }, [previewInstances, activePreviewInstanceId]);

  const loadInstancesFromPaths = useCallback(async (paths: string[]) => {
    const instances: SsbhModelPreviewInstance[] = [];
    const allDraws: BuiltMeshDraw[] = [];
    const collectedWarnings: string[] = [];
    for (let offset = 0; offset < paths.length; offset += INSTANCE_LOAD_CONCURRENCY) {
      const chunk = paths.slice(offset, offset + INSTANCE_LOAD_CONCURRENCY);
      const bundles = await Promise.all(
        chunk.map((p) => invoke<SsbhModelPreviewBundle>("ssbh_load_model_preview", { rootPath: p })),
      );
      for (let j = 0; j < chunk.length; j++) {
        const b = bundles[j]!;
        const id = previewInstanceIdFromModlPath(b.modlPath);
        const label = fileBasename(b.modlPath).replace(/\.numdlb$/i, "") || "model";
        const skelJson = b.skel ? (b.skel as SkelDataJson) : null;
        let created: BuiltMeshDraw[];
        try {
          created = buildDrawListFromBundle(
            b.modl as ModlDataJson,
            b.mesh as MeshDataJson,
            skelJson,
            { drawKeyPrefix: id, instanceLabel: label },
          );
        } catch (e) {
          throw new Error(`Failed to build mesh draws for ${b.modlPath}: ${String(e)}`);
        }
        instances.push({ id, modlPath: b.modlPath, displayLabel: label, bundle: b });
        allDraws.push(...created);
        if (b.warnings.length) collectedWarnings.push(...b.warnings);
      }
    }
    if (collectedWarnings.length > 0) {
      const preview = collectedWarnings.slice(0, 4).join("\n");
      const more =
        collectedWarnings.length > 4 ? `\n… and ${collectedWarnings.length - 4} more` : "";
      toast.message("Model preview notices", {
        description: `${preview}${more}`,
      });
    }
    startTransition(() => {
      setDraws((prev) => {
        prev.forEach((d) => d.geometry.dispose());
        return allDraws;
      });
      setPreviewInstances(instances);
      setActivePreviewInstanceId(instances[0]?.id ?? null);
      setHiddenPreviewInstanceIds(new Set());
      setDrawError(null);
    });
  }, [startTransition]);

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
    setSelectedBoneIndex(null);
    setBonePoseResetNonce((n) => n + 1);
    setBonePoseHistory({ undoStack: [], redoStack: [], applyNonce: 0, applyData: null });
  }, [activePreviewInstanceId]);

  useEffect(() => {
    if (previewInstances.length === 0) return;
    if (activePreviewInstanceId && previewInstances.some((i) => i.id === activePreviewInstanceId)) {
      return;
    }
    setActivePreviewInstanceId(previewInstances[0]!.id);
  }, [previewInstances, activePreviewInstanceId]);

  useEffect(() => {
    setMotionFrame(0);
    setMotionClip(null);
    setMotionSampleError(null);
    loadedMotionClipKeyRef.current = null;
  }, [activePreviewInstanceId]);

  useEffect(() => {
    setMotionClip(null);
    setMotionSampleError(null);
    loadedMotionClipKeyRef.current = null;
    if (!motionSelectedNuanmbPath) {
      setMotionManifest(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const m = await invoke<NuanmbManifest>("ssbh_nuanmb_manifest", { path: motionSelectedNuanmbPath });
        if (!cancelled) setMotionManifest(m);
      } catch (e) {
        if (!cancelled) {
          setMotionManifest(null);
          setMotionSampleError(String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [motionSelectedNuanmbPath]);

  useEffect(() => {
    const matlPath = bundle?.matlPaths[0] ?? null;
    if (!bundle?.skelPath || !motionSelectedNuanmbPath) {
      loadedMotionClipKeyRef.current = null;
      setMotionClip(null);
      return;
    }
    if (previewBusy) {
      return;
    }
    const key = `${bundle.skelPath}\n${motionSelectedNuanmbPath}\n${matlPath ?? ""}\n${motionReloadNonce}`;
    if (loadedMotionClipKeyRef.current === key && motionClip !== null) {
      return;
    }

    const ac = new AbortController();
    (async () => {
      setMotionSampling(true);
      setMotionSampleError(null);
      try {
        const clip = await invoke<MotionClip>("ssbh_load_motion_clip", {
          request: {
            skelPath: bundle.skelPath,
            nuanmbPath: motionSelectedNuanmbPath,
            matlPath,
          },
        });
        if (!ac.signal.aborted) {
          loadedMotionClipKeyRef.current = key;
          setMotionClip(clip);
        }
      } catch (e) {
        if (!ac.signal.aborted) {
          setMotionClip(null);
          loadedMotionClipKeyRef.current = null;
          setMotionSampleError(String(e));
        }
      } finally {
        if (!ac.signal.aborted) setMotionSampling(false);
      }
    })();
    return () => {
      ac.abort();
    };
  }, [bundle?.skelPath, bundle?.matlPaths?.[0], motionSelectedNuanmbPath, motionClip, previewBusy, motionReloadNonce]);

  useEffect(() => {
    setVisibleKeys((prev) => {
      if (prev.size === 0) {
        return new Set(draws.map((d) => d.key));
      }
      const next = new Set<string>();
      const drawKeySet = new Set(draws.map((d) => d.key));
      for (const key of prev) {
        if (drawKeySet.has(key)) next.add(key);
      }
      return next.size > 0 ? next : new Set(draws.map((d) => d.key));
    });
    setSelectedDebugDrawKey((prev) => {
      const activeId = previewControlScope === "single" ? activePreviewInstanceId : null;
      const scoped = draws.filter(
        (d) =>
          !activeId ||
          d.previewInstanceId === activeId ||
          (!d.previewInstanceId && previewInstances.length <= 1),
      );
      if (!scoped.length) return null;
      if (prev && scoped.some((d) => d.key === prev)) return prev;
      return scoped[0]?.key ?? null;
    });
  }, [draws, activePreviewInstanceId, previewControlScope, previewInstances.length]);

  useEffect(() => {
    if (previewInstances.length === 0 || draws.length === 0) {
      setDrawMaterialDataUrlsByDrawKey(new Map());
      setDrawMaterialBindingsByDrawKey(new Map());
      setTextureDecodeProgress(null);
      return;
    }
    let cancelled = false;

    const instanceById = new Map(previewInstances.map((inst) => [inst.id, inst] as const));
    const materialCtxByInstanceId = new Map<string, PreviewInstanceMaterialContext>();
    for (const inst of previewInstances) {
      materialCtxByInstanceId.set(inst.id, {
        lookup: buildMatlLookup(inst.bundle.matl as MatlDataJson | null),
        refMap: buildTextureRefToPathMap(inst.bundle),
      });
    }
    const fallbackCtx: PreviewInstanceMaterialContext | null =
      previewInstances.length > 0
        ? {
            lookup: buildMatlLookup(previewInstances[0]!.bundle.matl as MatlDataJson | null),
            refMap: buildTextureRefToPathMap(previewInstances[0]!.bundle),
          }
        : null;
    const drawPathsByKey = new Map<string, ReturnType<typeof resolveMaterialTexturePaths>>();
    const pathSlotCounts = new Map<string, number>();
    let totalSteps = 0;
    for (const d of draws) {
      const inst =
        (d.previewInstanceId ? instanceById.get(d.previewInstanceId) : null) ??
        (previewInstances[0] ?? null);
      const ctx =
        (inst ? materialCtxByInstanceId.get(inst.id) : null) ??
        fallbackCtx;
      if (!ctx) {
        continue;
      }
      const paths = resolveMaterialTexturePaths(d.materialLabel, ctx.lookup, ctx.refMap);
      drawPathsByKey.set(d.key, paths);
      for (const { key } of TEXTURE_PREVIEW_SLOT_META) {
        if (!textureSlotLoadEnabled[key]) continue;
        const field = TEXTURE_SLOT_TO_PATH_FIELD[key];
        const pathVal = paths[field];
        if (!pathVal) continue;
        totalSteps += 1;
        pathSlotCounts.set(pathVal, (pathSlotCounts.get(pathVal) ?? 0) + 1);
      }
    }
    if (totalSteps === 0) {
      const nextBindings = new Map<string, ResolvedMaterialBinding>();
      const next = new Map<string, DrawMaterialDataUrls>();
      for (const d of draws) {
        const instBundle = bundleForPreviewDraw(d, previewInstances);
        if (!instBundle) {
          throw new Error("Missing preview bundle for draw (instance mapping)");
        }
        const ctx = materialCtxByInstanceId.get(
          d.previewInstanceId ?? previewInstances[0]!.id,
        ) ?? {
          lookup: buildMatlLookup(instBundle.matl as MatlDataJson | null),
          refMap: buildTextureRefToPathMap(instBundle),
        };
        nextBindings.set(d.key, resolveMaterialBinding(d.materialLabel, ctx.lookup, ctx.refMap));
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
        const instId = d.previewInstanceId ?? previewInstances[0]?.id ?? null;
        const ctx = instId ? materialCtxByInstanceId.get(instId) : null;
        if (!ctx) {
          throw new Error("Missing preview material context for draw");
        }
        const binding = resolveMaterialBinding(d.materialLabel, ctx.lookup, ctx.refMap);
        nextBindings.set(d.key, binding);
        const paths =
          drawPathsByKey.get(d.key) ??
          resolveMaterialTexturePaths(d.materialLabel, ctx.lookup, ctx.refMap);
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
  }, [previewInstances, draws, textureSlotLoadEnabled]);

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

  const loadAt = useCallback(
    async (path: string) => {
      const t = path.trim();
      if (!t) {
        const msg = "Path is empty";
        setLoadError(msg);
        toast.error(msg);
        return;
      }
      setLoading(true);
      setLoadError(null);
      setTextureDecodeProgress(null);
      try {
        if (/\.numdlb$/i.test(t)) {
          await loadInstancesFromPaths([t]);
        } else {
          const listed = await invoke<string[]>("ssbh_list_numdlb_under_tree", { rootPath: t });
          if (listed.length === 0) {
            throw new Error("No .numdlb files found under the selected folder.");
          }
          await loadInstancesFromPaths(listed);
        }
        setRecentModelPaths((prev) => {
          const next = buildNextRecentPaths(prev, t);
          writeRecentModelPathsToStorage(next);
          return next;
        });
        setModelLoadNonce((n) => n + 1);
      } catch (e) {
        const msg = String(e);
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [loadInstancesFromPaths],
  );

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
    setDraws((prev) => {
      prev.forEach((d) => d.geometry.dispose());
      return [];
    });
    setPreviewInstances([]);
    setActivePreviewInstanceId(null);
    setHiddenPreviewInstanceIds(new Set());
    setLoadError(null);
    setDrawError(null);
    clearMotion();
  }, [loading, textureDecodeProgress, clearMotion]);

  const reloadCurrentModel = useCallback(async () => {
    if (previewInstances.length === 0) {
      throw new Error("No model loaded to reload.");
    }
    const paths = previewInstances.map((i) => i.modlPath);
    setLoading(true);
    setLoadError(null);
    setTextureDecodeProgress(null);
    try {
      await loadInstancesFromPaths(paths);
      setModelLoadNonce((n) => n + 1);
    } catch (e) {
      const msg = String(e);
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [previewInstances, loadInstancesFromPaths]);

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
    setSelectedBoneIndex(null);
    setBoneTransformMode("translate");
    setBonePoseHistory({ undoStack: [], redoStack: [], applyNonce: 0, applyData: null });
    setFitRequestId((r) => r + 1);
    clearMotion();
  }, [clearMotion]);

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

  const commitBonePoseUndo = useCallback((beforeTransformSnapshot: Float32Array) => {
    const snap = new Float32Array(beforeTransformSnapshot);
    setBonePoseHistory((h) => ({
      ...h,
      undoStack: [...h.undoStack, snap],
      redoStack: [],
    }));
  }, []);

  const undoBonePose = useCallback(() => {
    setBonePoseHistory((h) => {
      if (h.undoStack.length === 0) return h;
      const get = bonePoseGetterRef.current;
      if (!get) return h;
      const prev = h.undoStack[h.undoStack.length - 1]!;
      const current = get();
      return {
        undoStack: h.undoStack.slice(0, -1),
        redoStack: [...h.redoStack, new Float32Array(current)],
        applyNonce: h.applyNonce + 1,
        applyData: new Float32Array(prev),
      };
    });
  }, []);

  const redoBonePose = useCallback(() => {
    setBonePoseHistory((h) => {
      if (h.redoStack.length === 0) return h;
      const get = bonePoseGetterRef.current;
      if (!get) return h;
      const next = h.redoStack[h.redoStack.length - 1]!;
      const current = get();
      return {
        undoStack: [...h.undoStack, new Float32Array(current)],
        redoStack: h.redoStack.slice(0, -1),
        applyNonce: h.applyNonce + 1,
        applyData: new Float32Array(next),
      };
    });
  }, []);

  const consumeBonePoseApply = useCallback(() => {
    setBonePoseHistory((h) => ({ ...h, applyData: null }));
  }, []);

  const resetBonePose = useCallback(() => {
    setBonePoseResetNonce((n) => n + 1);
    setBonePoseHistory({ undoStack: [], redoStack: [], applyNonce: 0, applyData: null });
  }, []);

  const toggleVisible = useCallback((key: string, checked: boolean) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const controllableDraws = useMemo(() => {
    if (previewControlScope === "all") return draws;
    if (!activePreviewInstanceId) return draws;
    return draws.filter(
      (d) =>
        d.previewInstanceId === activePreviewInstanceId ||
        (!d.previewInstanceId && previewInstances.length <= 1),
    );
  }, [draws, previewControlScope, activePreviewInstanceId, previewInstances.length]);

  const showAllMeshes = useCallback(() => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      for (const d of controllableDraws) next.add(d.key);
      return next;
    });
  }, [controllableDraws]);

  const hideAllMeshes = useCallback(() => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      for (const d of controllableDraws) next.delete(d.key);
      return next;
    });
  }, [controllableDraws]);

  const setPreviewInstanceVisible = useCallback((id: string, visible: boolean) => {
    setHiddenPreviewInstanceIds((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const showAllPreviewInstances = useCallback(() => {
    setHiddenPreviewInstanceIds(new Set());
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

  const canUndoBonePose = bonePoseHistory.undoStack.length > 0;
  const canRedoBonePose = bonePoseHistory.redoStack.length > 0;

  const value = useMemo<SsbhModelPreviewContextValue>(
    () => ({
      workspaceRoot: root,
      bundle,
      previewInstances,
      activePreviewInstanceId,
      setActivePreviewInstanceId,
      previewViewMode,
      setPreviewViewMode,
      previewControlScope,
      setPreviewControlScope,
      hiddenPreviewInstanceIds,
      setPreviewInstanceVisible,
      showAllPreviewInstances,
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
      selectedBoneIndex,
      setSelectedBoneIndex,
      boneTransformMode,
      setBoneTransformMode,
      bonePoseResetNonce,
      resetBonePose,
      bonePoseGetterRef,
      bonePoseApplyNonce: bonePoseHistory.applyNonce,
      bonePoseToApply: bonePoseHistory.applyData,
      consumeBonePoseApply,
      commitBonePoseUndo,
      undoBonePose,
      redoBonePose,
      canUndoBonePose,
      canRedoBonePose,
      previewSuspended,
      motionNuanmbPaths,
      motionSelectedNuanmbPath,
      setMotionSelectedNuanmbPath,
      motionManifest,
      motionPlaying,
      setMotionPlaying,
      motionLoop,
      setMotionLoop,
      motionSpeed,
      setMotionSpeed,
      motionFrame,
      setMotionFrame,
      motionClip,
      motionSample,
      motionSampling,
      motionSampleError,
      motionApplyCamera,
      setMotionApplyCamera,
      motionApplyLighting,
      setMotionApplyLighting,
      motionForceVisibleDuringPlayback,
      setMotionForceVisibleDuringPlayback,
      pickMotionNuanmbFile,
      pickMotionFolder,
      reloadMotionClip,
      clearMotion,
    } satisfies SsbhModelPreviewContextValue),
    [
      root,
      bundle,
      previewInstances,
      activePreviewInstanceId,
      setActivePreviewInstanceId,
      previewViewMode,
      setPreviewViewMode,
      previewControlScope,
      setPreviewControlScope,
      hiddenPreviewInstanceIds,
      setPreviewInstanceVisible,
      showAllPreviewInstances,
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
      selectedBoneIndex,
      boneTransformMode,
      bonePoseResetNonce,
      resetBonePose,
      bonePoseGetterRef,
      bonePoseHistory.applyNonce,
      bonePoseHistory.applyData,
      bonePoseHistory.undoStack.length,
      bonePoseHistory.redoStack.length,
      consumeBonePoseApply,
      commitBonePoseUndo,
      undoBonePose,
      redoBonePose,
      canUndoBonePose,
      canRedoBonePose,
      previewSuspended,
      motionNuanmbPaths,
      motionSelectedNuanmbPath,
      setMotionSelectedNuanmbPath,
      motionManifest,
      motionPlaying,
      setMotionPlaying,
      motionLoop,
      setMotionLoop,
      motionSpeed,
      setMotionSpeed,
      motionFrame,
      setMotionFrame,
      motionClip,
      motionSample,
      motionSampling,
      motionSampleError,
      motionApplyCamera,
      setMotionApplyCamera,
      motionApplyLighting,
      setMotionApplyLighting,
      motionForceVisibleDuringPlayback,
      setMotionForceVisibleDuringPlayback,
      pickMotionNuanmbFile,
      pickMotionFolder,
      reloadMotionClip,
      clearMotion,
    ],
  );

  return (
    <SsbhModelPreviewContext.Provider value={value}>{children}</SsbhModelPreviewContext.Provider>
  );
}
