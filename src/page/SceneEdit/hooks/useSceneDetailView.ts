import { useCallback, useState } from "react";
import { toast } from "sonner";
import type {
  DetailViewSession,
  DetailViewModelTab,
  DetailViewModelData,
  DetailViewNodeKind,
} from "../components/detail-view/sceneDetailViewTypes";
import { SSBH_MODEL_ROLES } from "../components/detail-view/sceneDetailViewTypes";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
import type { MatlDataJson } from "@/page/TestEditor/components/ssbh-model-preview/types";
import type { NumdlbReadResult, NuhlpbReadResult } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import type { NumatbModalBundle } from "@/page/TestEditor/components/ssbh-model-preview/numatbEditorUtils";
import { createEmptyNumatbFile } from "@/page/TestEditor/components/ssbh-model-preview/daeSsbhTypes";
import {
  ssbhReadNumdlbMapping,
  ssbhWriteNumdlbMapping,
  ssbhTemplateReadNumatb,
  ssbhTemplateWriteNumatb,
  ssbhReadNuhlpb,
  ssbhWriteNuhlpb,
} from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import type { StageTreeNode } from "../components/StageHierarchyTree";

type BundleLookup = {
  baseModel: SsbhModelPreviewBundle | null;
  subModels: Array<{ folderName: string; objectIndex: number; bundle: SsbhModelPreviewBundle }>;
};

let sessionCounter = 0;

function findBundleForNode(
  node: StageTreeNode,
  lookup: BundleLookup,
): SsbhModelPreviewBundle | null {
  if (node.role === "base") return lookup.baseModel;
  if (node.role === "sub_model" || node.role === "imported_dae") {
    const match = lookup.subModels.find((s) => s.objectIndex === node.objectIndex);
    return match?.bundle ?? null;
  }
  return null;
}

export function useSceneDetailView(bundleLookup: BundleLookup) {
  const [sessions, setSessions] = useState<DetailViewSession[]>([]);

  const openSession = useCallback(
    (node: StageTreeNode) => {
      // Don't open duplicate session for same node
      const existing = sessions.find((s) => s.nodeId === node.id);
      if (existing) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === existing.id ? { ...s, zIndex: Date.now() } : s,
          ),
        );
        return;
      }

      const kind: DetailViewNodeKind = (SSBH_MODEL_ROLES as readonly string[]).includes(node.role)
        ? "ssbh-model"
        : "effect";

      const id = `detail-${++sessionCounter}-${node.id}`;
      const newSession: DetailViewSession = {
        id,
        nodeId: node.id,
        nodeLabel: node.label,
        kind,
        activeTab: kind === "effect" ? "effect" : "model",
        zIndex: Date.now(),
        modelData: null,
        effectData: null,
      };

      if (kind === "ssbh-model") {
        const bundle = findBundleForNode(node, bundleLookup);
        if (bundle) {
          newSession.modelData = {
            bundle,
            numdlb: { base: null, draft: null, loading: true, error: null },
            numatb: { base: null, draft: null, loading: true, error: null },
            nuhlpb: { base: null, draft: null, loading: false, error: null },
          };
          setSessions((prev) => [...prev, newSession]);
          loadModelData(id, bundle);
        } else {
          toast.error("Cannot find SSBH bundle for this node");
        }
      } else {
        // Effect: set loading state, will be loaded externally
        newSession.effectData = { document: null, auxiliary: { status: "idle", rootDir: null, scannedDirectories: 0, scannedFiles: 0, jnttblDiscovered: 0, nusktbDiscovered: 0, jnttblReady: 0, nusktbReady: 0, failureCount: 0, errors: [], jnttblData: [], nusktbData: [] }, loading: true, error: null };
        setSessions((prev) => [...prev, newSession]);
      }
    },
    [sessions, bundleLookup],
  );

  const loadModelData = useCallback(async (sessionId: string, bundle: SsbhModelPreviewBundle) => {
    // Load numdlb
    try {
      const numdlb = await ssbhReadNumdlbMapping(bundle.modlPath);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: { ...s.modelData, numdlb: { base: numdlb, draft: numdlb, loading: false, error: null } } }
            : s,
        ),
      );
    } catch (e) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: { ...s.modelData, numdlb: { base: null, draft: null, loading: false, error: String(e) } } }
            : s,
        ),
      );
    }

    // Load numatb
    const matlPath = bundle.matlPaths?.[0];
    if (matlPath) {
      try {
        const numatbFile = await ssbhTemplateReadNumatb(matlPath);
        const numatbBundle: NumatbModalBundle = {
          mayaFile: numatbFile,
          nustFile: createEmptyNumatbFile(),
          mirrorTexturePathsAcrossProfiles: false,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId && s.modelData
              ? { ...s, modelData: { ...s.modelData, numatb: { base: numatbBundle, draft: numatbBundle, loading: false, error: null } } }
              : s,
          ),
        );
      } catch (e) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId && s.modelData
              ? { ...s, modelData: { ...s.modelData, numatb: { base: null, draft: null, loading: false, error: String(e) } } }
              : s,
          ),
        );
      }
    } else {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: { ...s.modelData, numatb: { base: null, draft: null, loading: false, error: null } } }
            : s,
        ),
      );
    }

    // Load nuhlpb - derive path from rootFolder
    const hlpbPath = bundle.rootFolder ? `${bundle.rootFolder}/model.nuhlpb` : null;
    if (hlpbPath) {
      try {
        const nuhlpb = await ssbhReadNuhlpb(hlpbPath);
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId && s.modelData
              ? { ...s, modelData: { ...s.modelData, nuhlpb: { base: nuhlpb, draft: nuhlpb, loading: false, error: null } } }
              : s,
          ),
        );
      } catch {
        // nuhlpb is optional — not all models have it
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId && s.modelData
              ? { ...s, modelData: { ...s.modelData, nuhlpb: { base: null, draft: null, loading: false, error: null } } }
              : s,
          ),
        );
      }
    }
  }, []);

  const closeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const activateSession = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, zIndex: Date.now() } : s)),
    );
  }, []);

  const setActiveTab = useCallback((sessionId: string, tab: DetailViewModelTab) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, activeTab: tab } : s)),
    );
  }, []);

  const setNumdlbDraft = useCallback((sessionId: string, draft: NumdlbReadResult) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.modelData
          ? { ...s, modelData: { ...s.modelData, numdlb: { ...s.modelData.numdlb, draft } } }
          : s,
      ),
    );
  }, []);

  const saveNumdlb = useCallback(async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.modelData?.numdlb.draft || !session.modelData.bundle) return;
    const bundle = session.modelData.bundle;
    const draft = session.modelData.numdlb.draft;
    try {
      await ssbhWriteNumdlbMapping({
        filePath: bundle.modlPath,
        modelName: draft.modelName,
        skeletonFileName: draft.skeletonFileName,
        materialFileNames: draft.materialFileNames,
        meshFileName: draft.meshFileName,
        animationFileName: draft.animationFileName,
        entries: draft.entries,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: { ...s.modelData, numdlb: { ...s.modelData.numdlb, base: draft } } }
            : s,
        ),
      );
      toast.success("Saved .numdlb");
    } catch (e) {
      toast.error(`Failed to save .numdlb: ${e}`);
    }
  }, [sessions]);

  const setNumatbDraft = useCallback((sessionId: string, draft: NumatbModalBundle) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.modelData
          ? { ...s, modelData: { ...s.modelData, numatb: { ...s.modelData.numatb, draft } } }
          : s,
      ),
    );
  }, []);

  const saveNumatb = useCallback(async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.modelData?.numatb.draft || !session.modelData.bundle) return;
    const matlPath = session.modelData.bundle.matlPaths?.[0];
    if (!matlPath) return;
    try {
      await ssbhTemplateWriteNumatb(matlPath, session.modelData.numatb.draft.mayaFile);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: { ...s.modelData, numatb: { ...s.modelData.numatb, base: s.modelData.numatb.draft } } }
            : s,
        ),
      );
      toast.success("Saved .numatb");
    } catch (e) {
      toast.error(`Failed to save .numatb: ${e}`);
    }
  }, [sessions]);

  const setNuhlpbDraft = useCallback((sessionId: string, draft: NuhlpbReadResult) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.modelData
          ? { ...s, modelData: { ...s.modelData, nuhlpb: { ...s.modelData.nuhlpb, draft } } }
          : s,
      ),
    );
  }, []);

  const saveNuhlpb = useCallback(async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session?.modelData?.nuhlpb.draft || !session.modelData.bundle) return;
    const draft = session.modelData.nuhlpb.draft;
    const hlpbPath = `${session.modelData.bundle.rootFolder}/model.nuhlpb`;
    try {
      await ssbhWriteNuhlpb({
        filePath: hlpbPath,
        majorVersion: draft.majorVersion,
        minorVersion: draft.minorVersion,
        aimConstraints: draft.aimConstraints,
        orientConstraints: draft.orientConstraints,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: { ...s.modelData, nuhlpb: { ...s.modelData.nuhlpb, base: draft } } }
            : s,
        ),
      );
      toast.success("Saved .nuhlpb");
    } catch (e) {
      toast.error(`Failed to save .nuhlpb: ${e}`);
    }
  }, [sessions]);

  return {
    sessions,
    openSession,
    closeSession,
    activateSession,
    setActiveTab,
    setNumdlbDraft,
    saveNumdlb,
    setNumatbDraft,
    saveNumatb,
    setNuhlpbDraft,
    saveNuhlpb,
  };
}
