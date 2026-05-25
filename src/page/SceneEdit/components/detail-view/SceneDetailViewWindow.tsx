import { useCallback, useEffect, useRef } from "react";
import { Box, Loader2, Settings, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDraggableModal } from "@/hooks/useDraggableModal";
import { NumdlbMappingEditorBody } from "@/page/TestEditor/components/ssbh-model-preview/NumdlbMappingEditorBody";
import { NuhlpbEditorBody } from "@/page/TestEditor/components/ssbh-model-preview/NuhlpbEditorBody";
import { NumatbTemplateEditorModalBody } from "@/page/TestEditor/components/ssbh-model-preview/NumatbTemplateEditorModalBody";
import type { NumatbModalBundle } from "@/page/TestEditor/components/ssbh-model-preview/numatbEditorUtils";
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
  const { nodeRef, handleProps } = useDraggableModal({
    defaultPosition: { x: 80 + cascadeIndex * 28, y: 60 + cascadeIndex * 28 },
  });

  const data = session.modelData;
  if (!data) return null;

  const numdlbDirty = data.numdlb.draft !== null && data.numdlb.draft !== data.numdlb.base;
  const numatbDirty = data.numatb.draft !== null && data.numatb.draft !== data.numatb.base;
  const nuhlpbDirty = data.nuhlpb.draft !== null && data.nuhlpb.draft !== data.nuhlpb.base;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: session.zIndex }}
    >
      <div
        ref={nodeRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`detail-view-title-${session.id}`}
        tabIndex={-1}
        className="pointer-events-auto w-[760px] max-w-[95vw]"
        style={{ position: "absolute" }}
        onClick={(e) => { e.stopPropagation(); onActivate(); }}
      >
        <Card className="flex max-h-[min(85vh,720px)] min-h-0 flex-col overflow-hidden border shadow-2xl">
          {/* Header */}
          <div
            {...handleProps}
            onPointerDown={(e) => { onActivate(); handleProps.onPointerDown(e); }}
            className="flex shrink-0 items-center justify-between border-b bg-linear-to-r from-muted/80 to-muted/40 px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Settings className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2
                  id={`detail-view-title-${session.id}`}
                  className="truncate text-sm font-semibold"
                >
                  Properties — {session.nodeLabel}
                </h2>
                <p className="text-xs text-muted-foreground">SSBH Model Detail View</p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 rounded-full hover:bg-destructive/10 hover:text-destructive"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tabs body */}
          <Tabs
            value={session.activeTab}
            onValueChange={(v) => onTabChange(v as DetailViewModelTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="shrink-0 border-b px-2" data-no-drag>
              <TabsTrigger value="model">
                {numdlbDirty && "• "}Model
              </TabsTrigger>
              <TabsTrigger value="material">
                {numatbDirty && "• "}Material
              </TabsTrigger>
              <TabsTrigger value="skeleton">Skeleton</TabsTrigger>
              <TabsTrigger value="mesh">Mesh</TabsTrigger>
              <TabsTrigger value="helper">
                {nuhlpbDirty && "• "}Helper
              </TabsTrigger>
              <TabsTrigger value="textures">Textures</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-hidden">
              <TabsContent value="model" className="h-full m-0 p-3 overflow-auto">
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
              </TabsContent>

              <TabsContent value="material" className="h-full m-0 p-3 overflow-auto">
                {data.numatb.loading ? (
                  <LoadingState label="Loading .numatb..." />
                ) : data.numatb.error ? (
                  <ErrorState error={data.numatb.error} />
                ) : data.numatb.draft ? (
                  <div className="space-y-3">
                    <TabSaveBar dirty={numatbDirty} onSave={onNumatbSave} />
                    <NumatbTemplateEditorModalBody
                      bundle={data.numatb.draft}
                      onChange={onNumatbDraftChange}
                    />
                  </div>
                ) : (
                  <EmptyState label="No .numatb data available" />
                )}
              </TabsContent>

              <TabsContent value="skeleton" className="h-full m-0 overflow-auto">
                <SkeletonReadonlyTab skel={data.bundle.skel} />
              </TabsContent>

              <TabsContent value="mesh" className="h-full m-0 overflow-auto">
                <MeshReadonlyTab mesh={data.bundle.mesh} />
              </TabsContent>

              <TabsContent value="helper" className="h-full m-0 p-3 overflow-auto">
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
              </TabsContent>

              <TabsContent value="textures" className="h-full m-0 overflow-auto">
                <TexturesReadonlyTab
                  textureResolve={data.bundle.textureResolve}
                  resolvedPaths={data.bundle.resolvedNutexbPaths}
                />
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </div>
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
