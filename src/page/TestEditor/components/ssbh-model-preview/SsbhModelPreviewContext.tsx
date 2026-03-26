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
  createDefaultTextureSlotLoadEnabled,
  resolveMaterialBinding,
  resolveMaterialTexturePaths,
  type DrawMaterialDataUrls,
  type ResolvedMaterialBinding,
  type TexturePreviewSlotKey,
} from "./meshFromSsbh";
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
export type MaterialDebugViewMode =
  | "full"
  | "baseColor"
  | "normals"
  | "roughnessMetalness"
  | "emissive"
  | "reflection";

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
  loadError: string | null;
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
  /** Load preview from a folder path or a `.numdlb` file path (same as Open model). */
  loadModelAt: (path: string) => Promise<void>;
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
  children: ReactNode;
};

export function SsbhModelPreviewProvider({ workspaceRoot, children }: ProviderProps) {
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
  const [fitRequestId, setFitRequestId] = useState(0);
  const [modelLoadNonce, setModelLoadNonce] = useState(0);
  const [bonePoseEnabled, setBonePoseEnabled] = useState(false);
  const [selectedBoneIndex, setSelectedBoneIndex] = useState<number | null>(null);
  const [boneTransformMode, setBoneTransformMode] = useState<BoneTransformMode>("translate");
  const [bonePoseResetNonce, setBonePoseResetNonce] = useState(0);

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
      return;
    }
    let cancelled = false;
    const matl = bundle.matl as MatlDataJson | null;
    const lookup = buildMatlLookup(matl);
    const refMap = buildRefToPathMap(bundle);

    (async () => {
      const next = new Map<string, DrawMaterialDataUrls>();
      const nextBindings = new Map<string, ResolvedMaterialBinding>();
      const failedTextures: string[] = [];
      const pathToDataUrl = new Map<string, string>();

      const decodePath = async (diskPath: string | null): Promise<string | null> => {
        if (!diskPath) return null;
        const cached = pathToDataUrl.get(diskPath);
        if (cached) return cached;
        try {
          const b64 = await invoke<string>("nutexb_png_base64", { inputPath: diskPath });
          if (cancelled) return null;
          const url = `data:image/png;base64,${b64}`;
          pathToDataUrl.set(diskPath, url);
          return url;
        } catch (e) {
          failedTextures.push(`${diskPath}: ${String(e)}`);
          return null;
        }
      };

      for (const d of draws) {
        const binding = resolveMaterialBinding(d.materialLabel, lookup, refMap);
        nextBindings.set(d.key, binding);
        const paths = resolveMaterialTexturePaths(d.materialLabel, lookup, refMap);
        if (cancelled) return;
        const map = textureSlotLoadEnabled.map ? await decodePath(paths.mapPath) : null;
        if (cancelled) return;
        const normalMap = textureSlotLoadEnabled.normalMap ? await decodePath(paths.normalPath) : null;
        if (cancelled) return;
        const roughnessMap = textureSlotLoadEnabled.roughnessMap ? await decodePath(paths.roughnessPath) : null;
        if (cancelled) return;
        const metalnessMap = textureSlotLoadEnabled.metalnessMap ? await decodePath(paths.metalnessPath) : null;
        if (cancelled) return;
        const emissiveMap = textureSlotLoadEnabled.emissiveMap ? await decodePath(paths.emissivePath) : null;
        if (cancelled) return;
        const aoMap = textureSlotLoadEnabled.aoMap ? await decodePath(paths.aoPath) : null;
        if (cancelled) return;
        const cubeMap = textureSlotLoadEnabled.cubeMap ? await decodePath(paths.cubePath) : null;
        if (cancelled) return;
        next.set(d.key, {
          map,
          normalMap,
          roughnessMap,
          metalnessMap,
          emissiveMap,
          aoMap,
          cubeMap,
        });
      }
      if (!cancelled) {
        setDrawMaterialDataUrlsByDrawKey(next);
        setDrawMaterialBindingsByDrawKey(nextBindings);
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
    try {
      const b = await invoke<SsbhModelPreviewBundle>("ssbh_load_model_preview", { rootPath: path });
      startTransition(() => setBundle(b));
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

  const value = useMemo<SsbhModelPreviewContextValue>(
    () => ({
      workspaceRoot: root,
      bundle,
      draws,
      drawError,
      loading,
      loadError,
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
      loadModelAt,
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
    }),
    [
      root,
      bundle,
      draws,
      drawError,
      loading,
      loadError,
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
      loadModelAt,
      toggleVisible,
      showAllMeshes,
      hideAllMeshes,
      vertexTriangleStats,
      bonePoseEnabled,
      selectedBoneIndex,
      boneTransformMode,
      bonePoseResetNonce,
      resetBonePose,
    ],
  );

  return (
    <SsbhModelPreviewContext.Provider value={value}>{children}</SsbhModelPreviewContext.Provider>
  );
}
