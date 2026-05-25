import { Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDraggableModal } from "@/hooks/useDraggableModal";
import { EffectProjectEditorBody } from "@/page/TestEditor/components/ssbh-model-preview/EffectProjectEditorBody";
import type { DetailViewSession } from "./sceneDetailViewTypes";

type EffectDetailViewWindowProps = {
  session: DetailViewSession;
  cascadeIndex: number;
  onActivate: () => void;
  onClose: () => void;
};

export function EffectDetailViewWindow({
  session,
  cascadeIndex,
  onActivate,
  onClose,
}: EffectDetailViewWindowProps) {
  const { nodeRef, handleProps } = useDraggableModal({
    defaultPosition: { x: 80 + cascadeIndex * 28, y: 60 + cascadeIndex * 28 },
  });

  const data = session.effectData;
  if (!data) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: session.zIndex }}
    >
      <div
        ref={nodeRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`effect-detail-title-${session.id}`}
        tabIndex={-1}
        className="pointer-events-auto w-[720px] max-w-[95vw]"
        style={{ position: "absolute" }}
        onClick={(e) => { e.stopPropagation(); onActivate(); }}
      >
        <Card className="flex max-h-[min(85vh,680px)] min-h-0 flex-col overflow-hidden border shadow-2xl">
          {/* Header */}
          <div
            {...handleProps}
            onPointerDown={(e) => { onActivate(); handleProps.onPointerDown(e); }}
            className="flex shrink-0 items-center justify-between border-b bg-linear-to-r from-muted/80 to-muted/40 px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10">
                <Sparkles className="h-4 w-4 text-purple-500" />
              </div>
              <div className="min-w-0">
                <h2
                  id={`effect-detail-title-${session.id}`}
                  className="truncate text-sm font-semibold"
                >
                  Properties — {session.nodeLabel}
                </h2>
                <p className="text-xs text-muted-foreground">Effect (View Only)</p>
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

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {data.loading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading effect data...</span>
              </div>
            ) : data.error ? (
              <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-destructive">{data.error}</p>
              </div>
            ) : data.document ? (
              <EffectProjectEditorBody
                data={data.document}
                draftSyncGeneration={0}
                onChange={() => {}}
                disabled={true}
                auxiliary={data.auxiliary}
              />
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No effect data available
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
