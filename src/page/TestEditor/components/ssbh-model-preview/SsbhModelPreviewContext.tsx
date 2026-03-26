import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
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
  resolveTexturePathForMaterial,
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
  textureDataUrlByDrawKey: ReadonlyMap<string, string | null>;
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
  const [textureDataUrlByDrawKey, setTextureDataUrlByDrawKey] = useState<Map<string, string | null>>(
    () => new Map(),
  );
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
  }, [draws]);

  useEffect(() => {
    if (!bundle || draws.length === 0) {
      setTextureDataUrlByDrawKey(new Map());
      return;
    }
    let cancelled = false;
    const matl = bundle.matl as MatlDataJson | null;
    const lookup = buildMatlLookup(matl);
    const refMap = buildRefToPathMap(bundle);

    (async () => {
      const next = new Map<string, string | null>();
      const failedTextures: string[] = [];
      for (const d of draws) {
        const nutexbPath = resolveTexturePathForMaterial(d.materialLabel, lookup, refMap);
        if (!nutexbPath) {
          next.set(d.key, null);
          continue;
        }
        try {
          const b64 = await invoke<string>("nutexb_png_base64", { inputPath: nutexbPath });
          if (cancelled) return;
          next.set(d.key, `data:image/png;base64,${b64}`);
        } catch (e) {
          if (cancelled) return;
          next.set(d.key, null);
          failedTextures.push(`${nutexbPath}: ${String(e)}`);
        }
      }
      if (!cancelled) {
        setTextureDataUrlByDrawKey(next);
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
  }, [bundle, draws]);

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
      defaultPath: root ?? undefined,
    });
    if (typeof selected === "string") {
      await loadAt(selected);
    }
  }, [loadAt, root]);

  const pickNumdlb = useCallback(async () => {
    const selected = await open({
      directory: false,
      multiple: false,
      defaultPath: root ?? undefined,
      filters: [{ name: "NUMDLB", extensions: ["numdlb"] }],
    });
    if (typeof selected === "string") {
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
      textureDataUrlByDrawKey,
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
      textureDataUrlByDrawKey,
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
