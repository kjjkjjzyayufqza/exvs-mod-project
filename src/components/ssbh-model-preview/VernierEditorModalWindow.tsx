import { useEffect, useRef } from "react";
import { Flame, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TypedParamFile } from "./vernierIoService";
import { VernierEditorBody } from "./VernierEditorBody";
import { isVernierDraftDirty } from "./vernierEditorUtils";
import {
  isSsbhEditorDialogActive,
  SsbhEditorModalWindowShell,
  type ModalViewportSuspendInteraction,
} from "./SsbhEditorModalWindowShell";

export type VernierEditorWindowSession = {
  id: string;
  filePath: string;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: TypedParamFile | null;
  draftData: TypedParamFile | null;
  zIndex: number;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type VernierEditorModalWindowProps = {
  session: VernierEditorWindowSession;
  cascadeIndex: number;
  onActivate: () => void;
  onCloseRequest: () => void;
  onReloadRequest: () => void;
  onDraftChange: (next: TypedParamFile) => void;
  onSave: () => void;
  onReset: () => void;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function VernierEditorModalWindow({
  session,
  cascadeIndex,
  onActivate,
  onCloseRequest,
  onReloadRequest,
  onDraftChange,
  onSave,
  onReset,
  skipActivate,
  viewportSuspend,
}: VernierEditorModalWindowProps) {
  const dirty = isVernierDraftDirty(session.baseData, session.draftData);
  const titleId = `vernier-editor-title-${session.id}`;

  const savingRef = useRef(session.saving);
  const loadingRef = useRef(session.loading);
  const draftRef = useRef(session.draftData);
  savingRef.current = session.saving;
  loadingRef.current = session.loading;
  draftRef.current = session.draftData;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (isSsbhEditorDialogActive(titleId)) {
          e.preventDefault();
          if (!savingRef.current && draftRef.current && !loadingRef.current) {
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
          onClick={onSave}
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
      kind="vernier"
      cascadeIndex={cascadeIndex}
      zIndex={session.zIndex}
      titleId={titleId}
      title={dirty ? `• ${title}` : title}
      subtitle="Edit vernier table (thruster/effect slots)"
      headerIcon={<Flame className="h-4 w-4 text-primary" />}
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
          Loading vernier table...
        </div>
      ) : session.loadError ? (
        <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
      ) : session.draftData ? (
        <VernierEditorBody
          data={session.draftData}
          onChange={onDraftChange}
          disabled={session.saving}
        />
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground">No data.</div>
      )}
    </SsbhEditorModalWindowShell>
  );
}
