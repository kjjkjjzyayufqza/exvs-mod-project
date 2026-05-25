import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type {
  DetailViewSession,
  DetailViewModelTab,
  DetailViewModelData,
  DetailViewNodeKind,
} from "../components/detail-view/sceneDetailViewTypes";
import { SSBH_MODEL_ROLES } from "../components/detail-view/sceneDetailViewTypes";
import type { SsbhModelPreviewBundle } from "@/page/TestEditor/components/ssbh-model-preview/types";
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
import type { NumdlbReadResult, NuhlpbReadResult } from "@/page/TestEditor/components/ssbh-model-preview/ssbhDaeIoService";
import type { StageTreeNode } from "../components/StageHierarchyTree";
import {
  findBundleForDetailViewNode,
  type DetailViewBundleLookup,
} from "../utils/sceneDetailViewBundleLookup";
import {
  modelTabLoadingField,
  shouldLoadModelTab,
} from "../utils/sceneDetailViewTabPolicy";

let sessionCounter = 0;

function markTabLoading(
  data: DetailViewModelData,
  tab: DetailViewModelTab,
): DetailViewModelData {
  const field = modelTabLoadingField(tab);
  if (!field) return data;
  return {
    ...data,
    [field]: { ...data[field], loading: true, error: null },
  };
}

export function useSceneDetailView(bundleLookup: DetailViewBundleLookup) {
  const [sessions, setSessions] = useState<DetailViewSession[]>([]);
  const [, startTransition] = useTransition();

  const loadModelTabData = useCallback(
    async (
      sessionId: string,
      tab: DetailViewModelTab,
      bundle: SsbhModelPreviewBundle,
    ) => {
      if (tab === "model") {
        try {
          const numdlb = await ssbhReadNumdlbMapping(bundle.modlPath);
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId && s.modelData
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      numdlb: { base: numdlb, draft: numdlb, loading: false, error: null },
                    },
                  }
                : s,
            ),
          );
        } catch (e) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId && s.modelData
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      numdlb: { base: null, draft: null, loading: false, error: String(e) },
                    },
                  }
                : s,
            ),
          );
        }
        return;
      }

      if (tab === "material") {
        const matlPath = bundle.matlPaths?.[0];
        if (!matlPath) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId && s.modelData
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      numatb: { base: null, draft: null, loading: false, error: null },
                    },
                  }
                : s,
            ),
          );
          return;
        }

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
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      numatb: { base: numatbBundle, draft: numatbBundle, loading: false, error: null },
                    },
                  }
                : s,
            ),
          );
        } catch (e) {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId && s.modelData
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      numatb: { base: null, draft: null, loading: false, error: String(e) },
                    },
                  }
                : s,
            ),
          );
        }
        return;
      }

      if (tab === "helper") {
        const hlpbPath = bundle.rootFolder ? `${bundle.rootFolder}/model.nuhlpb` : null;
        if (!hlpbPath) return;

        try {
          const nuhlpb = await ssbhReadNuhlpb(hlpbPath);
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId && s.modelData
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      nuhlpb: { base: nuhlpb, draft: nuhlpb, loading: false, error: null },
                    },
                  }
                : s,
            ),
          );
        } catch {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId && s.modelData
                ? {
                    ...s,
                    modelData: {
                      ...s.modelData,
                      nuhlpb: { base: null, draft: null, loading: false, error: null },
                    },
                  }
                : s,
            ),
          );
        }
      }
    },
    [],
  );

  const requestModelTabLoad = useCallback(
    (sessionId: string, tab: DetailViewModelTab, bundle: SsbhModelPreviewBundle) => {
      setSessions((prev) => {
        const session = prev.find((s) => s.id === sessionId);
        if (!session?.modelData || !shouldLoadModelTab(tab, session.modelData)) {
          return prev;
        }

        void loadModelTabData(sessionId, tab, bundle);
        return prev.map((s) =>
          s.id === sessionId && s.modelData
            ? { ...s, modelData: markTabLoading(s.modelData, tab) }
            : s,
        );
      });
    },
    [loadModelTabData],
  );

  const openSession = useCallback(
    (node: StageTreeNode) => {
      const kind: DetailViewNodeKind = (SSBH_MODEL_ROLES as readonly string[]).includes(node.role)
        ? "ssbh-model"
        : "effect";

      startTransition(() => {
        setSessions((prev) => {
          const existing = prev.find((s) => s.nodeId === node.id);
          if (existing) {
            return prev.map((s) =>
              s.id === existing.id ? { ...s, zIndex: Date.now() } : s,
            );
          }

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
            const bundle = findBundleForDetailViewNode(node, bundleLookup);
            if (!bundle) {
              if (node.role === "imported_dae") {
                toast.error("Imported DAE objects have no on-disk SSBH bundle yet");
              } else {
                toast.error("Cannot find SSBH bundle for this node");
              }
              return prev;
            }

            newSession.modelData = {
              bundle,
              numdlb: { base: null, draft: null, loading: false, error: null },
              numatb: { base: null, draft: null, loading: false, error: null },
              nuhlpb: { base: null, draft: null, loading: false, error: null },
            };

            queueMicrotask(() => requestModelTabLoad(id, "model", bundle));
            return [...prev, newSession];
          }

          newSession.effectData = {
            document: null,
            auxiliary: {
              status: "idle",
              rootDir: null,
              scannedDirectories: 0,
              scannedFiles: 0,
              jnttblDiscovered: 0,
              nusktbDiscovered: 0,
              jnttblReady: 0,
              nusktbReady: 0,
              failureCount: 0,
              errors: [],
              jnttblData: [],
              nusktbData: [],
            },
            loading: true,
            error: null,
          };
          return [...prev, newSession];
        });
      });
    },
    [bundleLookup, requestModelTabLoad, startTransition],
  );

  const closeSession = useCallback((sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }, []);

  const activateSession = useCallback(
    (sessionId: string) => {
      startTransition(() => {
        setSessions((prev) => {
          const target = prev.find((s) => s.id === sessionId);
          if (!target) return prev;
          const topZ = prev.reduce((max, s) => Math.max(max, s.zIndex), 0);
          if (target.zIndex >= topZ) return prev;
          return prev.map((s) =>
            s.id === sessionId ? { ...s, zIndex: Date.now() } : s,
          );
        });
      });
    },
    [startTransition],
  );

  const setActiveTab = useCallback(
    (sessionId: string, tab: DetailViewModelTab) => {
      startTransition(() => {
        setSessions((prev) => {
          const session = prev.find((s) => s.id === sessionId);
          if (session?.modelData && shouldLoadModelTab(tab, session.modelData)) {
            queueMicrotask(() =>
              requestModelTabLoad(sessionId, tab, session.modelData!.bundle),
            );
          }
          return prev.map((s) => (s.id === sessionId ? { ...s, activeTab: tab } : s));
        });
      });
    },
    [requestModelTabLoad, startTransition],
  );

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
