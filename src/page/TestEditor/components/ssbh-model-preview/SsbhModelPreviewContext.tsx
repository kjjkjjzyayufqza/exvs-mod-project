import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
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
import { normalizeScenePathStrict } from "./testEditorSceneConfig";
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
import {
  buildSceneConfigInstanceEntries,
  ensureSceneConfigSchema,
  normalizeScenePath,
  TEST_EDITOR_SCENE_CONFIG_VERSION,
  type TestEditorSceneConfig,
} from "./testEditorSceneConfig";

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

/** Progress while decoding .nutexb → PNG for the WebGL preview (one step per unique disk path). */
export type SsbhModelPreviewTextureDecodeProgress = {
  done: number;
  total: number;
  currentLabel: string | null;
};

export type PreviewInstanceMotionState = {
  nuanmbPaths: readonly string[];
  selectedNuanmbPath: string | null;
  manifest: NuanmbManifest | null;
  playing: boolean;
  loop: boolean;
  speed: number;
  frame: number;
  clip: MotionClip | null;
  sample: MotionSample | null;
  sampling: boolean;
  sampleError: string | null;
};

export type PreviewModelAttachment = {
  id: string;
  parentInstanceId: string;
  parentBoneName: string;
  childInstanceId: string;
  childBoneName: string;
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

function previewInstanceIdFromModlPath(modlPath: string, slotIndex: number): string {
  const s = modlPath.trim().replace(/\\/g, "/");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  if (!Number.isInteger(slotIndex) || slotIndex < 0) {
    throw new Error("Instance slot index must be a non-negative integer.");
  }
  return `pi${(h >>> 0).toString(16)}_${slotIndex}`;
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
  pickAddNumdlb: () => Promise<void>;
  /** When true, a successful DAE/FBX → SSBH export loads the generated `.numdlb` here. Persisted in localStorage. */
  autoLoadAfterConvertToSsbh: boolean;
  setAutoLoadAfterConvertToSsbh: (v: boolean) => void;
  /** Load preview from a folder path or a `.numdlb` file path (same as Open model). */
  loadModelAt: (path: string) => Promise<void>;
  /** Append a `.numdlb` preview instance without replacing current scene models. */
  addModelAt: (path: string) => Promise<void>;
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
  /** Motion state for each preview instance. */
  motionStatesByInstanceId: ReadonlyMap<string, PreviewInstanceMotionState>;
  setMotionFrameForInstance: (instanceId: string, frame: number) => void;
  setMotionPlayingForInstance: (instanceId: string, playing: boolean) => void;
  /** NUANMB controls for the active model instance. */
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
  modelAttachments: readonly PreviewModelAttachment[];
  setModelAttachments: (next: PreviewModelAttachment[]) => void;
  exportSceneConfig: () => Promise<void>;
  importSceneConfig: () => Promise<void>;
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

type InternalPreviewInstanceMotionState = {
  nuanmbPaths: string[];
  selectedNuanmbPath: string | null;
  manifest: NuanmbManifest | null;
  playing: boolean;
  loop: boolean;
  speed: number;
  frame: number;
  clip: MotionClip | null;
  sample: MotionSample | null;
  sampling: boolean;
  sampleError: string | null;
  reloadNonce: number;
  loadedClipKey: string | null;
};

function createDefaultMotionState(): InternalPreviewInstanceMotionState {
  return {
    nuanmbPaths: [],
    selectedNuanmbPath: null,
    manifest: null,
    playing: false,
    loop: true,
    speed: 1,
    frame: 0,
    clip: null,
    sample: null,
    sampling: false,
    sampleError: null,
    reloadNonce: 0,
    loadedClipKey: null,
  };
}

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
  const textureDecodeProgressDraftRef = useRef<SsbhModelPreviewTextureDecodeProgress | null>(null);
  const textureDecodeProgressFrameRef = useRef<number | null>(null);
  const flushTextureDecodeProgress = useCallback(() => {
    textureDecodeProgressFrameRef.current = null;
    setTextureDecodeProgress(textureDecodeProgressDraftRef.current);
  }, []);
  const setTextureDecodeProgressBatched = useCallback(
    (
      next:
        | SsbhModelPreviewTextureDecodeProgress
        | null
        | ((prev: SsbhModelPreviewTextureDecodeProgress | null) => SsbhModelPreviewTextureDecodeProgress | null),
    ) => {
      const prev = textureDecodeProgressDraftRef.current;
      textureDecodeProgressDraftRef.current = typeof next === "function" ? next(prev) : next;
      if (textureDecodeProgressFrameRef.current !== null) {
        return;
      }
      textureDecodeProgressFrameRef.current = requestAnimationFrame(flushTextureDecodeProgress);
    },
    [flushTextureDecodeProgress],
  );
  useEffect(() => {
    return () => {
      if (textureDecodeProgressFrameRef.current !== null) {
        cancelAnimationFrame(textureDecodeProgressFrameRef.current);
        textureDecodeProgressFrameRef.current = null;
      }
    };
  }, []);
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

  const [motionByInstanceId, setMotionByInstanceId] = useState<Record<string, InternalPreviewInstanceMotionState>>({});
  const [motionApplyCamera, setMotionApplyCamera] = useState(false);
  const [motionApplyLighting, setMotionApplyLighting] = useState(false);
  const [motionForceVisibleDuringPlayback, setMotionForceVisibleDuringPlayback] = useState(true);
  const [modelAttachments, setModelAttachments] = useState<PreviewModelAttachment[]>([]);

  const setAutoLoadAfterConvertToSsbh = useCallback((v: boolean) => {
    setAutoLoadAfterConvertToSsbhState(v);
    writeAutoLoadAfterConvertToStorage(v);
  }, []);

  const clearMotion = useCallback(() => {
    setMotionByInstanceId((prev) => {
      const next: Record<string, InternalPreviewInstanceMotionState> = {};
      for (const key of Object.keys(prev)) {
        next[key] = createDefaultMotionState();
      }
      return next;
    });
    setBonePoseResetNonce((n) => n + 1);
  }, []);

  const bundle = useMemo((): SsbhModelPreviewBundle | null => {
    if (previewInstances.length === 0) return null;
    if (activePreviewInstanceId) {
      const hit = previewInstances.find((i) => i.id === activePreviewInstanceId);
      return hit?.bundle ?? previewInstances[0]!.bundle;
    }
    return previewInstances[0]!.bundle;
  }, [previewInstances, activePreviewInstanceId]);

  const resolvedActivePreviewInstanceId = useMemo(
    () => activePreviewInstanceId ?? previewInstances[0]?.id ?? null,
    [activePreviewInstanceId, previewInstances],
  );

  useEffect(() => {
    setMotionByInstanceId((prev) => {
      const next: Record<string, InternalPreviewInstanceMotionState> = {};
      for (const inst of previewInstances) {
        next[inst.id] = prev[inst.id] ?? createDefaultMotionState();
      }
      return next;
    });
    const existingIds = new Set(previewInstances.map((inst) => inst.id));
    setModelAttachments((prev) =>
      prev.filter(
        (attachment) =>
          existingIds.has(attachment.parentInstanceId) &&
          existingIds.has(attachment.childInstanceId),
      ),
    );
  }, [previewInstances]);

  const reloadMotionClipForInstance = useCallback((instanceId: string) => {
    setMotionByInstanceId((prev) => {
      const current = prev[instanceId] ?? createDefaultMotionState();
      return {
        ...prev,
        [instanceId]: {
          ...current,
          clip: null,
          sample: null,
          frame: 0,
          playing: false,
          sampleError: null,
          loadedClipKey: null,
          reloadNonce: current.reloadNonce + 1,
        },
      };
    });
  }, []);

  const setMotionFrameForInstance = useCallback((instanceId: string, frame: number) => {
    if (!Number.isFinite(frame)) {
      throw new Error("Motion frame must be finite.");
    }
    setMotionByInstanceId((prev) => {
      const current = prev[instanceId] ?? createDefaultMotionState();
      if (Math.abs(current.frame - frame) < 1e-6) {
        return prev;
      }
      return {
        ...prev,
        [instanceId]: {
          ...current,
          frame,
          sample: current.clip
            ? {
                frame,
                finalFrameIndex: current.clip.finalFrameIndex,
                ...sampleMotionClipFrame(current.clip, frame, current.loop),
                elapsedMs: 0,
              }
            : null,
        },
      };
    });
  }, []);

  const setMotionPlayingForInstance = useCallback((instanceId: string, playing: boolean) => {
    setMotionByInstanceId((prev) => {
      const current = prev[instanceId] ?? createDefaultMotionState();
      if (current.playing === playing) {
        return prev;
      }
      return {
        ...prev,
        [instanceId]: {
          ...current,
          playing,
        },
      };
    });
  }, []);

  const pickMotionNuanmbFile = useCallback(async () => {
    const activeId = resolvedActivePreviewInstanceId;
    if (!activeId) {
      throw new Error("No active preview instance.");
    }
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenNuanmb, root),
      filters: [{ name: "NUANMB", extensions: ["nuanmb"] }],
    });
    if (typeof selected !== "string") return;
    rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenNuanmb, selected, "file");
    setMotionByInstanceId((prev) => ({
      ...prev,
      [activeId]: {
        ...(prev[activeId] ?? createDefaultMotionState()),
        nuanmbPaths: [selected],
        selectedNuanmbPath: selected,
        frame: 0,
        playing: false,
        clip: null,
        sample: null,
        sampleError: null,
        loadedClipKey: null,
      },
    }));
  }, [resolvedActivePreviewInstanceId, root]);

  const pickMotionFolder = useCallback(async () => {
    const activeId = resolvedActivePreviewInstanceId;
    if (!activeId) {
      throw new Error("No active preview instance.");
    }
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
    setMotionByInstanceId((prev) => ({
      ...prev,
      [activeId]: {
        ...(prev[activeId] ?? createDefaultMotionState()),
        nuanmbPaths: listed,
        selectedNuanmbPath: listed[0] ?? null,
        frame: 0,
        playing: false,
        clip: null,
        sample: null,
        sampleError: null,
        loadedClipKey: null,
      },
    }));
  }, [resolvedActivePreviewInstanceId, root]);

  const buildInstancesFromPaths = useCallback(async (paths: string[], startSlotIndex: number) => {
    const instances: SsbhModelPreviewInstance[] = [];
    const allDraws: BuiltMeshDraw[] = [];
    const collectedWarnings: string[] = [];
    for (let offset = 0; offset < paths.length; offset += INSTANCE_LOAD_CONCURRENCY) {
      const chunk = paths.slice(offset, offset + INSTANCE_LOAD_CONCURRENCY);
      const bundles = await Promise.all(
        chunk.map((p) =>
          invoke<SsbhModelPreviewBundle>("ssbh_load_model_preview", {
            rootPath: normalizeScenePathStrict(p.trim()),
          }),
        ),
      );
      for (let j = 0; j < chunk.length; j++) {
        const b = bundles[j]!;
        const id = previewInstanceIdFromModlPath(b.modlPath, startSlotIndex + offset + j);
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
    return { instances, draws: allDraws };
  }, []);

  const loadInstancesFromPaths = useCallback(async (paths: string[]) => {
    const loaded = await buildInstancesFromPaths(paths, 0);
    startTransition(() => {
      setDraws((prev) => {
        prev.forEach((d) => d.geometry.dispose());
        return loaded.draws;
      });
      setPreviewInstances(loaded.instances);
      setActivePreviewInstanceId(loaded.instances[0]?.id ?? null);
      setHiddenPreviewInstanceIds(new Set());
      setDrawError(null);
    });
    return loaded.instances;
  }, [buildInstancesFromPaths, startTransition]);

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
    if (previewBusy) {
      return;
    }
    let cancelled = false;
    for (const inst of previewInstances) {
      const current = motionByInstanceId[inst.id] ?? createDefaultMotionState();
      const selectedPath = current.selectedNuanmbPath;
      if (!selectedPath) {
        if (
          current.manifest !== null ||
          current.clip !== null ||
          current.sample !== null ||
          current.sampleError !== null ||
          current.loadedClipKey !== null ||
          current.sampling
        ) {
          setMotionByInstanceId((prev) => ({
            ...prev,
            [inst.id]: {
              ...createDefaultMotionState(),
              loop: prev[inst.id]?.loop ?? true,
              speed: prev[inst.id]?.speed ?? 1,
            },
          }));
        }
        continue;
      }

      if (!current.manifest || current.manifest.filePath !== selectedPath) {
        void (async () => {
          try {
            const manifest = await invoke<NuanmbManifest>("ssbh_nuanmb_manifest", { path: selectedPath });
            if (cancelled) return;
            setMotionByInstanceId((prev) => {
              const p = prev[inst.id];
              if (!p || p.selectedNuanmbPath !== selectedPath) return prev;
              return {
                ...prev,
                [inst.id]: { ...p, manifest },
              };
            });
          } catch (e) {
            if (cancelled) return;
            setMotionByInstanceId((prev) => {
              const p = prev[inst.id];
              if (!p || p.selectedNuanmbPath !== selectedPath) return prev;
              return {
                ...prev,
                [inst.id]: {
                  ...p,
                  manifest: null,
                  sampleError: String(e),
                },
              };
            });
          }
        })();
      }

      const matlPath = inst.bundle.matlPaths[0] ?? null;
      const skelPath = inst.bundle.skelPath;
      if (!skelPath) {
        setMotionByInstanceId((prev) => {
          const p = prev[inst.id];
          if (!p || p.selectedNuanmbPath !== selectedPath) return prev;
          return {
            ...prev,
            [inst.id]: {
              ...p,
              clip: null,
              sample: null,
              loadedClipKey: null,
              sampleError: "Active instance has no skeleton path for motion sampling.",
            },
          };
        });
        continue;
      }

      const loadKey = `${skelPath}\n${selectedPath}\n${matlPath ?? ""}\n${current.reloadNonce}`;
      if (current.loadedClipKey === loadKey && current.clip !== null) {
        continue;
      }
      if (current.sampling) {
        continue;
      }
      setMotionByInstanceId((prev) => {
        const p = prev[inst.id];
        if (!p || p.selectedNuanmbPath !== selectedPath) return prev;
        return {
          ...prev,
          [inst.id]: {
            ...p,
            sampling: true,
            sampleError: null,
          },
        };
      });
      void (async () => {
        try {
          const clip = await invoke<MotionClip>("ssbh_load_motion_clip", {
            request: {
              skelPath,
              nuanmbPath: selectedPath,
              matlPath,
            },
          });
          if (cancelled) return;
          setMotionByInstanceId((prev) => {
            const p = prev[inst.id];
            if (!p || p.selectedNuanmbPath !== selectedPath) return prev;
            return {
              ...prev,
              [inst.id]: {
                ...p,
                clip,
                sample:
                  clip.frames.length > 0
                    ? {
                        frame: p.frame,
                        finalFrameIndex: clip.finalFrameIndex,
                        ...sampleMotionClipFrame(clip, p.frame, p.loop),
                        elapsedMs: 0,
                      }
                    : null,
                loadedClipKey: loadKey,
                sampling: false,
              },
            };
          });
        } catch (e) {
          if (cancelled) return;
          setMotionByInstanceId((prev) => {
            const p = prev[inst.id];
            if (!p || p.selectedNuanmbPath !== selectedPath) return prev;
            return {
              ...prev,
              [inst.id]: {
                ...p,
                clip: null,
                sample: null,
                loadedClipKey: null,
                sampling: false,
                sampleError: String(e),
              },
            };
          });
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [previewInstances, motionByInstanceId, previewBusy]);

  const activeMotionState = useMemo(() => {
    if (!resolvedActivePreviewInstanceId) {
      return createDefaultMotionState();
    }
    return motionByInstanceId[resolvedActivePreviewInstanceId] ?? createDefaultMotionState();
  }, [motionByInstanceId, resolvedActivePreviewInstanceId]);

  const motionNuanmbPaths = activeMotionState.nuanmbPaths;
  const motionSelectedNuanmbPath = activeMotionState.selectedNuanmbPath;
  const motionManifest = activeMotionState.manifest;
  const motionPlaying = activeMotionState.playing;
  const motionLoop = activeMotionState.loop;
  const motionSpeed = activeMotionState.speed;
  const motionFrame = activeMotionState.frame;
  const motionClip = activeMotionState.clip;
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
  const motionSampling = activeMotionState.sampling;
  const motionSampleError = activeMotionState.sampleError;

  const setMotionSelectedNuanmbPath = useCallback((path: string | null) => {
    const instanceId = resolvedActivePreviewInstanceId;
    if (!instanceId) return;
    setMotionByInstanceId((prev) => {
      const current = prev[instanceId] ?? createDefaultMotionState();
      return {
        ...prev,
        [instanceId]: {
          ...current,
          selectedNuanmbPath: path,
          frame: 0,
          playing: false,
          clip: null,
          sample: null,
          manifest: null,
          sampleError: null,
          loadedClipKey: null,
        },
      };
    });
  }, [resolvedActivePreviewInstanceId]);

  const setMotionPlaying = useCallback((v: boolean) => {
    const instanceId = resolvedActivePreviewInstanceId;
    if (!instanceId) return;
    setMotionPlayingForInstance(instanceId, v);
  }, [resolvedActivePreviewInstanceId, setMotionPlayingForInstance]);

  const setMotionLoop = useCallback((v: boolean) => {
    const instanceId = resolvedActivePreviewInstanceId;
    if (!instanceId) return;
    setMotionByInstanceId((prev) => {
      const current = prev[instanceId] ?? createDefaultMotionState();
      return {
        ...prev,
        [instanceId]: {
          ...current,
          loop: v,
        },
      };
    });
  }, [resolvedActivePreviewInstanceId]);

  const setMotionSpeed = useCallback((v: number) => {
    const instanceId = resolvedActivePreviewInstanceId;
    if (!instanceId) return;
    setMotionByInstanceId((prev) => {
      const current = prev[instanceId] ?? createDefaultMotionState();
      return {
        ...prev,
        [instanceId]: {
          ...current,
          speed: v,
        },
      };
    });
  }, [resolvedActivePreviewInstanceId]);

  const setMotionFrame = useCallback((v: number) => {
    const instanceId = resolvedActivePreviewInstanceId;
    if (!instanceId) return;
    setMotionFrameForInstance(instanceId, v);
  }, [resolvedActivePreviewInstanceId, setMotionFrameForInstance]);

  const reloadMotionClip = useCallback(() => {
    const instanceId = resolvedActivePreviewInstanceId;
    if (!instanceId) return;
    reloadMotionClipForInstance(instanceId);
  }, [resolvedActivePreviewInstanceId, reloadMotionClipForInstance]);

  const motionStatesByInstanceId = useMemo<ReadonlyMap<string, PreviewInstanceMotionState>>(() => {
    const map = new Map<string, PreviewInstanceMotionState>();
    for (const inst of previewInstances) {
      const current = motionByInstanceId[inst.id] ?? createDefaultMotionState();
      map.set(inst.id, {
        nuanmbPaths: current.nuanmbPaths,
        selectedNuanmbPath: current.selectedNuanmbPath,
        manifest: current.manifest,
        playing: current.playing,
        loop: current.loop,
        speed: current.speed,
        frame: current.frame,
        clip: current.clip,
        sample:
          current.clip && current.clip.frames.length > 0
            ? {
                frame: current.frame,
                finalFrameIndex: current.clip.finalFrameIndex,
                ...sampleMotionClipFrame(current.clip, current.frame, current.loop),
                elapsedMs: 0,
              }
            : null,
        sampling: current.sampling,
        sampleError: current.sampleError,
      });
    }
    return map;
  }, [motionByInstanceId, previewInstances]);

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
      setTextureDecodeProgressBatched(null);
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
        pathSlotCounts.set(pathVal, (pathSlotCounts.get(pathVal) ?? 0) + 1);
      }
    }
    const totalUniquePaths = pathSlotCounts.size;
    if (totalUniquePaths === 0) {
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
      setTextureDecodeProgressBatched(null);
      return;
    }

    setTextureDecodeProgressBatched({ done: 0, total: totalUniquePaths, currentLabel: null });

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
        setTextureDecodeProgressBatched((prev) =>
          prev ? { ...prev, done: prev.done + n } : null,
        );
      };

      const decodeOneDiskPath = async (diskPath: string): Promise<void> => {
        if (!cancelled) {
          setTextureDecodeProgressBatched((prev) =>
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
          bumpDoneBy(1);
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
        setTextureDecodeProgressBatched(null);
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
      setTextureDecodeProgressBatched(null);
      try {
        const normalized = normalizeScenePathStrict(t);
        if (/\.numdlb$/i.test(normalized)) {
          await loadInstancesFromPaths([normalized]);
        } else {
          const listed = await invoke<string[]>("ssbh_list_numdlb_under_tree", { rootPath: normalized });
          if (listed.length === 0) {
            throw new Error("No .numdlb files found under the selected folder.");
          }
          await loadInstancesFromPaths(listed);
        }
        setRecentModelPaths((prev) => {
          const next = buildNextRecentPaths(prev, normalized);
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

  const addModelAt = useCallback(
    async (path: string) => {
      const t = path.trim();
      if (!t) {
        throw new Error("Path is empty");
      }
      setLoading(true);
      setLoadError(null);
      try {
        const loaded = await buildInstancesFromPaths([t], previewInstances.length);
        if (loaded.instances.length !== 1) {
          throw new Error("Append model operation returned unexpected instance count.");
        }
        const appendedInstance = loaded.instances[0]!;
        setDraws((prev) => [...prev, ...loaded.draws]);
        setPreviewInstances((prev) => [...prev, appendedInstance]);
        setHiddenPreviewInstanceIds((prev) => {
          const next = new Set(prev);
          next.delete(appendedInstance.id);
          return next;
        });
        setActivePreviewInstanceId(appendedInstance.id);
        setVisibleKeys((prev) => {
          const next = new Set(prev);
          for (const d of loaded.draws) {
            next.add(d.key);
          }
          return next;
        });
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
    [buildInstancesFromPaths, previewInstances.length],
  );

  const pickAddNumdlb = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenNumdlb, root),
      filters: [{ name: "NUMDLB", extensions: ["numdlb"] }],
    });
    if (typeof selected === "string") {
      rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenNumdlb, selected, "file");
      await addModelAt(selected);
    }
  }, [addModelAt, root]);

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
    setTextureDecodeProgressBatched(null);
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

  const exportSceneConfig = useCallback(async () => {
    const defaultDir = getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenModelFolder, root);
    const defaultPath = defaultDir ? `${defaultDir.replace(/[/\\]+$/, "")}\\scene-config.json` : "scene-config.json";
    const outputPath = await save({
      title: "Export Test Editor scene config",
      defaultPath,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof outputPath !== "string" || !outputPath.trim()) {
      return;
    }
    const config: TestEditorSceneConfig = {
      schemaVersion: TEST_EDITOR_SCENE_CONFIG_VERSION,
      workspaceRoot: normalizeScenePath(root),
      instances: buildSceneConfigInstanceEntries(previewInstances, hiddenPreviewInstanceIds),
      activePreviewInstanceId: resolvedActivePreviewInstanceId,
      previewViewMode,
      previewControlScope,
      visibleKeys: Array.from(visibleKeys),
      renderSettings: {
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
        materialDebugViewMode,
        textureFlipY,
        uvFlipU,
        uvFlipV,
        textureSlotLoadEnabled: { ...textureSlotLoadEnabled },
        previewRenderStyle,
      },
      motion: {
        applyCamera: motionApplyCamera,
        applyLighting: motionApplyLighting,
        forceVisibleDuringPlayback: motionForceVisibleDuringPlayback,
        byInstanceId: Object.fromEntries(
          previewInstances.map((inst) => {
            const state = motionByInstanceId[inst.id] ?? createDefaultMotionState();
            return [
              inst.id,
              {
                nuanmbPaths: state.nuanmbPaths
                  .map((p) => normalizeScenePath(p))
                  .filter((p): p is string => Boolean(p)),
                selectedNuanmbPath: normalizeScenePath(state.selectedNuanmbPath),
                playing: state.playing,
                loop: state.loop,
                speed: state.speed,
                frame: state.frame,
              },
            ] as const;
          }),
        ),
      },
      attachments: [...modelAttachments],
      autoLoadAfterConvertToSsbh,
    };
    await writeTextFile(outputPath, JSON.stringify(config, null, 2));
    rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenModelFolder, outputPath, "file");
    toast.success("Scene exported", { description: outputPath });
  }, [
    root,
    previewInstances,
    hiddenPreviewInstanceIds,
    resolvedActivePreviewInstanceId,
    previewViewMode,
    previewControlScope,
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
    materialDebugViewMode,
    textureFlipY,
    uvFlipU,
    uvFlipV,
    textureSlotLoadEnabled,
    previewRenderStyle,
    motionApplyCamera,
    motionApplyLighting,
    motionForceVisibleDuringPlayback,
    motionByInstanceId,
    modelAttachments,
    autoLoadAfterConvertToSsbh,
  ]);

  const importSceneConfig = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: getDialogDefaultPath(DialogLastPathKey.ssbhPreviewOpenModelFolder, root),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (typeof selected !== "string" || !selected.trim()) {
      return;
    }
    const selectedPath = selected.trim();
    rememberDialogSelection(DialogLastPathKey.ssbhPreviewOpenModelFolder, selectedPath, "file");
    const rawText = await readTextFile(selectedPath);
    const parsed: unknown = JSON.parse(rawText);
    ensureSceneConfigSchema(parsed);
    const config = parsed as TestEditorSceneConfig;
    const modelPaths = config.instances
      .map((inst) => normalizeScenePath(inst.modlPath))
      .filter((p): p is string => Boolean(p));
    if (modelPaths.length !== config.instances.length) {
      throw new Error("Scene config includes an empty model path.");
    }
    const loadedInstances = await loadInstancesFromPaths(modelPaths);
    const idMap = new Map<string, string>();
    for (let i = 0; i < config.instances.length; i++) {
      const source = config.instances[i];
      const loaded = loadedInstances[i];
      if (!source || !loaded) {
        throw new Error("Instance count mismatch while loading scene config.");
      }
      idMap.set(source.instanceId, loaded.id);
    }
    const mappedHidden = new Set<string>();
    for (const entry of config.instances) {
      const nextId = idMap.get(entry.instanceId);
      if (!nextId) {
        throw new Error(`Missing mapped instance id for ${entry.instanceId}`);
      }
      if (entry.hidden) {
        mappedHidden.add(nextId);
      }
    }
    setPreviewViewMode(config.previewViewMode);
    setPreviewControlScope(config.previewControlScope);
    setHiddenPreviewInstanceIds(mappedHidden);
    setActivePreviewInstanceId(
      config.activePreviewInstanceId ? (idMap.get(config.activePreviewInstanceId) ?? loadedInstances[0]?.id ?? null) : null,
    );
    setVisibleKeys(new Set(config.visibleKeys));
    setWireframe(config.renderSettings.wireframe);
    setShowSkeleton(config.renderSettings.showSkeleton);
    setShowGrid(config.renderSettings.showGrid);
    setShowAxesGizmo(config.renderSettings.showAxesGizmo);
    setShowStats(config.renderSettings.showStats);
    setBackground(config.renderSettings.background);
    setAmbientIntensity(config.renderSettings.ambientIntensity);
    setDirectionalIntensity(config.renderSettings.directionalIntensity);
    setDirectionalX(config.renderSettings.directionalX);
    setDirectionalY(config.renderSettings.directionalY);
    setDirectionalZ(config.renderSettings.directionalZ);
    setNormalMapEnabled(config.renderSettings.normalMapEnabled);
    setMaterialDebugViewMode(config.renderSettings.materialDebugViewMode);
    setTextureFlipY(config.renderSettings.textureFlipY);
    setUvFlipU(config.renderSettings.uvFlipU);
    setUvFlipV(config.renderSettings.uvFlipV);
    setTextureSlotLoadEnabledState(
      config.renderSettings.textureSlotLoadEnabled as Record<TexturePreviewSlotKey, boolean>,
    );
    setPreviewRenderStyle(config.renderSettings.previewRenderStyle);
    setMotionApplyCamera(config.motion.applyCamera);
    setMotionApplyLighting(config.motion.applyLighting);
    setMotionForceVisibleDuringPlayback(config.motion.forceVisibleDuringPlayback);
    setAutoLoadAfterConvertToSsbh(config.autoLoadAfterConvertToSsbh);
    setMotionByInstanceId(() => {
      const next: Record<string, InternalPreviewInstanceMotionState> = {};
      for (const entry of config.instances) {
        const mappedId = idMap.get(entry.instanceId);
        if (!mappedId) {
          throw new Error(`Missing mapped instance id for ${entry.instanceId}`);
        }
        const imported = config.motion.byInstanceId[entry.instanceId];
        const base = createDefaultMotionState();
        next[mappedId] = imported
          ? {
              ...base,
              nuanmbPaths: imported.nuanmbPaths
                .map((p) => normalizeScenePath(p))
                .filter((p): p is string => Boolean(p)),
              selectedNuanmbPath: normalizeScenePath(imported.selectedNuanmbPath),
              playing: imported.playing,
              loop: imported.loop,
              speed: imported.speed,
              frame: imported.frame,
            }
          : base;
      }
      return next;
    });
    const loadedById = new Map(loadedInstances.map((inst) => [inst.id, inst] as const));
    const mappedAttachments = config.attachments.map((attachment) => {
      const parentInstanceId = idMap.get(attachment.parentInstanceId);
      const childInstanceId = idMap.get(attachment.childInstanceId);
      if (!parentInstanceId || !childInstanceId) {
        throw new Error("Attachment instance mapping failed while importing scene.");
      }
      const parentSkel = loadedById.get(parentInstanceId)?.bundle.skel as SkelDataJson | null | undefined;
      const childSkel = loadedById.get(childInstanceId)?.bundle.skel as SkelDataJson | null | undefined;
      const parentHasBone = Boolean(parentSkel?.bones.some((bone) => bone.name === attachment.parentBoneName));
      const childHasBone = Boolean(childSkel?.bones.some((bone) => bone.name === attachment.childBoneName));
      if (!parentHasBone || !childHasBone) {
        throw new Error(
          `Attachment bone resolution failed: ${attachment.parentBoneName} -> ${attachment.childBoneName}`,
        );
      }
      return {
        ...attachment,
        parentInstanceId,
        childInstanceId,
      };
    });
    setModelAttachments(mappedAttachments);
    setFitRequestId((v) => v + 1);
    toast.success("Scene imported", { description: selectedPath });
  }, [loadInstancesFromPaths, root, setAutoLoadAfterConvertToSsbh]);

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
      pickAddNumdlb,
      autoLoadAfterConvertToSsbh,
      setAutoLoadAfterConvertToSsbh,
      loadModelAt,
      addModelAt,
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
      motionStatesByInstanceId,
      setMotionFrameForInstance,
      setMotionPlayingForInstance,
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
      modelAttachments,
      setModelAttachments,
      exportSceneConfig,
      importSceneConfig,
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
      pickAddNumdlb,
      autoLoadAfterConvertToSsbh,
      setAutoLoadAfterConvertToSsbh,
      loadModelAt,
      addModelAt,
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
      motionStatesByInstanceId,
      setMotionFrameForInstance,
      setMotionPlayingForInstance,
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
      modelAttachments,
      setModelAttachments,
      exportSceneConfig,
      importSceneConfig,
    ],
  );

  return (
    <SsbhModelPreviewContext.Provider value={value}>{children}</SsbhModelPreviewContext.Provider>
  );
}
