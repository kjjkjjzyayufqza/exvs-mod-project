import { useEffect, useMemo, useRef } from "react";
import {
  FileCode2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDraggableModal } from "@/hooks/useDraggableModal";
import type { NuhlpbReadResult } from "./ssbhDaeIoService";
import { NuhlpbEditorBody } from "./NuhlpbEditorBody";
import { isNuhlpbDraftDirty } from "./nuhlpbEditorUtils";

export type NuhlpbEditorWindowSession = {
  id: string;
  filePath: string;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: NuhlpbReadResult | null;
  draftData: NuhlpbReadResult | null;
  zIndex: number;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type NuhlpbEditorModalWindowProps = {
  session: NuhlpbEditorWindowSession;
  cascadeIndex: number;
  onActivate: () => void;
  onCloseRequest: () => void;
  onDraftChange: (next: NuhlpbReadResult) => void;
  onSave: () => void;
  onReset: () => void;
  onReloadRequest: () => void;
};

export function NuhlpbEditorModalWindow({
  session,
  cascadeIndex,
  onActivate,
  onCloseRequest,
  onDraftChange,
  onSave,
  onReset,
  onReloadRequest,
}: NuhlpbEditorModalWindowProps) {
  const { nodeRef, handleProps } = useDraggableModal({
    defaultPosition: { x: 64 + cascadeIndex * 28, y: 64 + cascadeIndex * 28 },
  });
  const dirty = useMemo(
    () => isNuhlpbDraftDirty(session.baseData, session.draftData),
    [session.baseData, session.draftData],
  );

  const draftRef = useRef(session.draftData);
  const savingRef = useRef(session.saving);
  const loadingRef = useRef(session.loading);
  draftRef.current = session.draftData;
  savingRef.current = session.saving;
  loadingRef.current = session.loading;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        const active = document.activeElement;
        if (nodeRef.current?.contains(active)) {
          e.preventDefault();
          if (!savingRef.current && draftRef.current && !loadingRef.current) {
            onSave();
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, nodeRef]);

  const title = fileBasename(session.filePath);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: session.zIndex }}
      aria-hidden={false}
    >
        <div
          ref={nodeRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`nuhlpb-editor-title-${session.id}`}
          tabIndex={-1}
          className="pointer-events-auto w-[720px] max-w-[95vw]"
          style={{ position: 'absolute' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Card className="flex min-h-0 max-h-[min(90vh,720px)] flex-col overflow-hidden border shadow-2xl">
            {/* Header */}
            <div
              {...handleProps}
              onPointerDown={(e) => {
                onActivate();
                handleProps.onPointerDown(e);
              }}
              className="flex shrink-0 items-center justify-between border-b bg-linear-to-r from-muted/80 to-muted/40 px-5 py-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 shadow-sm">
                  <FileCode2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <h2
                    id={`nuhlpb-editor-title-${session.id}`}
                    className="truncate text-base font-semibold"
                    title={session.filePath}
                  >
                    {dirty ? "• " : ""}
                    {title}
                  </h2>
                  <p className="text-xs text-muted-foreground">Edit SSBH (.nuhlpb) file</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-full transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={onCloseRequest}
                disabled={session.saving}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              {session.loading ? (
                <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading NUHLPB…
                </div>
              ) : session.loadError ? (
                <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
              ) : session.draftData ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <div className="space-y-4 border-b border-border/60 bg-muted/20 px-5 py-4">
                      <p
                        className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground"
                        title={session.filePath}
                      >
                        {session.filePath}
                      </p>
                    </div>
                    <div className="px-5 py-4">
                      <NuhlpbEditorBody
                        data={session.draftData}
                        onChange={onDraftChange}
                        disabled={session.saving}
                      />
                    </div>
                  </div>
                  {/* Footer */}
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-muted/20 px-5 py-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px]"
                      disabled={session.saving || session.loading}
                      onClick={onReloadRequest}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Reload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px]"
                      disabled={session.saving || !dirty}
                      onClick={onReset}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Reset
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-[10px] uppercase tracking-wide"
                      disabled={session.saving || !dirty}
                      onClick={onSave}
                    >
                      {session.saving ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="mr-1 h-3.5 w-3.5" />
                      )}
                      {session.saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-[10px]"
                      disabled={session.saving}
                      onClick={onCloseRequest}
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-4 text-sm text-muted-foreground">No data.</div>
              )}
            </CardContent>
          </Card>
        </div>
    </div>
  );
}
