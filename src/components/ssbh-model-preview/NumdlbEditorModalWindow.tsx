import { useEffect, useMemo, useRef } from "react";
import {
  FileCode2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { NumdlbReadResult } from "./ssbhDaeIoService";
import { NumdlbMappingEditorBody } from "./NumdlbMappingEditorBody";
import { assertNumdlbValidForSave, isNumdlbDraftDirty } from "./numdlbEditorUtils";
import {
  isSsbhEditorDialogActive,
  SsbhEditorModalWindowShell,
  type ModalViewportSuspendInteraction,
} from "./SsbhEditorModalWindowShell";

export type NumdlbEditorWindowSession = {
  id: string;
  filePath: string;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: NumdlbReadResult | null;
  draftData: NumdlbReadResult | null;
  zIndex: number;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type NumdlbEditorModalWindowProps = {
  session: NumdlbEditorWindowSession;
  cascadeIndex: number;
  onActivate: () => void;
  onCloseRequest: () => void;
  onDraftChange: (next: NumdlbReadResult) => void;
  onSave: () => void;
  onReset: () => void;
  onReloadRequest: () => void;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function NumdlbEditorModalWindow({
  session,
  cascadeIndex,
  onActivate,
  onCloseRequest,
  onDraftChange,
  onSave,
  onReset,
  onReloadRequest,
  skipActivate,
  viewportSuspend,
}: NumdlbEditorModalWindowProps) {
  const dirty = useMemo(
    () => isNumdlbDraftDirty(session.baseData, session.draftData),
    [session.baseData, session.draftData],
  );
  const titleId = `numdlb-editor-title-${session.id}`;

  const draftRef = useRef(session.draftData);
  const savingRef = useRef(session.saving);
  const loadingRef = useRef(session.loading);
  draftRef.current = session.draftData;
  savingRef.current = session.saving;
  loadingRef.current = session.loading;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (isSsbhEditorDialogActive(titleId)) {
          e.preventDefault();
          const draft = draftRef.current;
          if (!savingRef.current && draft && !loadingRef.current) {
            try {
              assertNumdlbValidForSave(draft);
            } catch (err) {
              toast.error(String(err));
              return;
            }
            onSave();
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSave, titleId]);

  const title = fileBasename(session.filePath);
  const footer =
    !session.loading && !session.loadError && session.draftData ? (
      <div className="flex flex-wrap items-center justify-end gap-2 bg-muted/20 px-5 py-4">
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
          onClick={() => {
            const d = session.draftData;
            if (!d) return;
            try {
              assertNumdlbValidForSave(d);
            } catch (e) {
              toast.error(String(e));
              return;
            }
            onSave();
          }}
        >
          {session.saving ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1 h-3.5 w-3.5" />
          )}
          {session.saving ? "Saving..." : "Save"}
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
    ) : null;

  return (
    <SsbhEditorModalWindowShell
      kind="numdlb"
      cascadeIndex={cascadeIndex}
      zIndex={session.zIndex}
      titleId={titleId}
      title={dirty ? `• ${title}` : title}
      subtitle="Edit SSBH (.numdlb) file"
      headerIcon={<FileCode2 className="h-4 w-4 text-primary" />}
      onActivate={onActivate}
      onClose={onCloseRequest}
      closeDisabled={session.saving}
      skipActivate={skipActivate}
      viewportSuspend={viewportSuspend}
      footer={footer}
    >
      {session.loading ? (
        <div className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading NUMDLB...
        </div>
      ) : session.loadError ? (
        <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
      ) : session.draftData ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-4 border-b border-border/60 bg-muted/20 px-5 py-4">
            <p
              className="break-all font-mono text-[10px] leading-relaxed text-muted-foreground"
              title={session.filePath}
            >
              {session.filePath}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <NumdlbMappingEditorBody
              data={session.draftData}
              onChange={onDraftChange}
              disabled={session.saving}
              embedTableWithoutInnerScroll
            />
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground">No data.</div>
      )}
    </SsbhEditorModalWindowShell>
  );
}
