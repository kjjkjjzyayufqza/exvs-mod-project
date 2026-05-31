import { useMemo, type ReactNode } from "react";
import { Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SceneEditRndModalShell } from "../SceneEditRndModalShell";
import { getDetailViewModalDimensions } from "../sceneEditRndModalUtils";
import { SCENE_EDIT_RND_SIZE_KEYS } from "../sceneEditRndSizePersistence";
import { NumdlbMappingEditorBody } from "@/components/ssbh-model-preview/NumdlbMappingEditorBody";
import { NuhlpbEditorBody } from "@/components/ssbh-model-preview/NuhlpbEditorBody";
import { NumatbTemplateEditorModalBody } from "@/components/ssbh-model-preview/NumatbTemplateEditorModalBody";
import { collectNumatbEmptyTexturePathErrors } from "@/components/ssbh-model-preview/store/numatbTemplateStoreHelpers";
import type { NumatbModalBundle } from "@/components/ssbh-model-preview/numatbEditorUtils";
import { NumatbValidationErrorsPanel } from "./NumatbValidationErrorsPanel";
import { shouldMountDetailTab } from "../../utils/sceneDetailViewTabPolicy";
import type {
  DetailViewSession,
  DetailViewModelTab,
  DetailViewModelData,
} from "./sceneDetailViewTypes";
import { SkeletonReadonlyTab } from "./SkeletonReadonlyTab";
import { MeshReadonlyTab } from "./MeshReadonlyTab";
import { TexturesReadonlyTab } from "./TexturesReadonlyTab";

type SceneDetailViewWindowProps = {
  session: DetailViewSession;
  cascadeIndex: number;
  skipActivate?: boolean;
  onActivate: () => void;
  onClose: () => void;
  onTabChange: (tab: DetailViewModelTab) => void;
  onNumdlbDraftChange: (draft: NonNullable<DetailViewModelData["numdlb"]["draft"]>) => void;
  onNumdlbSave: () => void;
  onNumatbDraftChange: (draft: NumatbModalBundle) => void;
  onNumatbSave: () => void;
  onNuhlpbDraftChange: (draft: NonNullable<DetailViewModelData["nuhlpb"]["draft"]>) => void;
  onNuhlpbSave: () => void;
};

export function SceneDetailViewWindow({
  session,
  cascadeIndex,
  skipActivate,
  onActivate,
  onClose,
  onTabChange,
  onNumdlbDraftChange,
  onNumdlbSave,
  onNumatbDraftChange,
  onNumatbSave,
  onNuhlpbDraftChange,
  onNuhlpbSave,
}: SceneDetailViewWindowProps) {
  const data = session.modelData;
  const numatbDraft = data?.numatb.draft ?? null;
  const numatbPaths = data?.numatbPaths ?? null;
  const numatbErrors = useMemo(() => {
    if (!numatbDraft || !numatbPaths) return [];
    return collectNumatbEmptyTexturePathErrors(numatbDraft, {
      modelName: session.nodeLabel,
      mayaNumatbName: basenameOrNull(numatbPaths.maya),
      nustNumatbName: basenameOrNull(numatbPaths.nust),
    });
  }, [numatbDraft, numatbPaths, session.nodeLabel]);

  if (!data) return null;

  const numdlbDirty = data.numdlb.draft !== null && data.numdlb.draft !== data.numdlb.base;
  const numatbDirty = data.numatb.draft !== null && data.numatb.draft !== data.numatb.base;
  const nuhlpbDirty = data.nuhlpb.draft !== null && data.nuhlpb.draft !== data.nuhlpb.base;
  const activeTab = session.activeTab as DetailViewModelTab;

  return (
    <SceneEditRndModalShell
      cascadeIndex={cascadeIndex}
      zIndex={session.zIndex}
      titleId={`detail-view-title-${session.id}`}
      title={`Properties — ${session.nodeLabel}`}
      subtitle="SSBH Model Detail View"
      headerIcon={<Settings className="h-4 w-4 text-primary" />}
      skipActivate={skipActivate}
      onActivate={onActivate}
      onClose={onClose}
      getDimensions={getDetailViewModalDimensions}
      sizeStorageKey={SCENE_EDIT_RND_SIZE_KEYS.detailView}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as DetailViewModelTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="shrink-0 border-b px-2" data-no-drag>
          <TabsTrigger value="model">{numdlbDirty && "• "}Model</TabsTrigger>
          <TabsTrigger value="material">{numatbDirty && "• "}Material</TabsTrigger>
          <TabsTrigger value="skeleton">Skeleton</TabsTrigger>
          <TabsTrigger value="mesh">Mesh</TabsTrigger>
          <TabsTrigger value="helper">{nuhlpbDirty && "• "}Helper</TabsTrigger>
          <TabsTrigger value="textures">Textures</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-hidden" style={{ contain: "strict" }}>
          {shouldMountDetailTab(activeTab, "model") && (
            <DetailTabPanel tab="model">
              {data.numdlb.loading ? (
                <LoadingState label="Loading .numdlb..." />
              ) : data.numdlb.error ? (
                <ErrorState error={data.numdlb.error} />
              ) : data.numdlb.draft ? (
                <div className="space-y-3">
                  <TabSaveBar dirty={numdlbDirty} onSave={onNumdlbSave} />
                  <NumdlbMappingEditorBody
                    data={data.numdlb.draft}
                    onChange={onNumdlbDraftChange}
                  />
                </div>
              ) : (
                <EmptyState label="No .numdlb data available" />
              )}
            </DetailTabPanel>
          )}

          {shouldMountDetailTab(activeTab, "material") && (
            <DetailTabPanel tab="material">
              {data.numatb.loading ? (
                <LoadingState label="Loading .numatb..." />
              ) : data.numatb.error ? (
                <ErrorState error={data.numatb.error} />
              ) : data.numatb.draft ? (
                <div className="space-y-3">
                  <TabSaveBar dirty={numatbDirty} onSave={onNumatbSave} />
                  <NumatbValidationErrorsPanel errors={numatbErrors} />
                  <NumatbTemplateEditorModalBody
                    bundle={data.numatb.draft}
                    onChange={onNumatbDraftChange}
                  />
                </div>
              ) : (
                <EmptyState label="No .numatb data available" />
              )}
            </DetailTabPanel>
          )}

          {shouldMountDetailTab(activeTab, "skeleton") && (
            <DetailTabPanel tab="skeleton">
              <SkeletonReadonlyTab skel={data.bundle.skel} />
            </DetailTabPanel>
          )}

          {shouldMountDetailTab(activeTab, "mesh") && (
            <DetailTabPanel tab="mesh">
              <MeshReadonlyTab mesh={data.bundle.mesh} />
            </DetailTabPanel>
          )}

          {shouldMountDetailTab(activeTab, "helper") && (
            <DetailTabPanel tab="helper">
              {data.nuhlpb.loading ? (
                <LoadingState label="Loading .nuhlpb..." />
              ) : data.nuhlpb.error ? (
                <ErrorState error={data.nuhlpb.error} />
              ) : data.nuhlpb.draft ? (
                <div className="space-y-3">
                  <TabSaveBar dirty={nuhlpbDirty} onSave={onNuhlpbSave} />
                  <NuhlpbEditorBody
                    data={data.nuhlpb.draft}
                    onChange={onNuhlpbDraftChange}
                  />
                </div>
              ) : (
                <EmptyState label="No .nuhlpb data available" />
              )}
            </DetailTabPanel>
          )}

          {shouldMountDetailTab(activeTab, "textures") && (
            <DetailTabPanel tab="textures">
              <TexturesReadonlyTab
                textureResolve={data.bundle.textureResolve}
                resolvedPaths={data.bundle.resolvedNutexbPaths}
              />
            </DetailTabPanel>
          )}
        </div>
      </Tabs>
    </SceneEditRndModalShell>
  );
}

function basenameOrNull(path: string | null): string | null {
  if (!path) return null;
  return path.split(/[/\\]/).pop() ?? path;
}

function DetailTabPanel({
  tab,
  children,
}: {
  tab: DetailViewModelTab;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`detail-tab-${tab}`}
      className="h-full overflow-auto p-3 m-0"
    >
      {children}
    </div>
  );
}

function TabSaveBar({ dirty, onSave }: { dirty: boolean; onSave: () => void }) {
  if (!dirty) return null;
  return (
    <div className="flex items-center justify-end gap-2 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-1.5">
      <span className="text-xs text-amber-600">Unsaved changes</span>
      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs text-destructive">{error}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
