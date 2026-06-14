import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  FileCode2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EffectProjectEditorDocument } from "./effectProjectEditorUtils";
import { EffectProjectEditorBody } from "./EffectProjectEditorBody";
import { assertEffectProjectValidForSave } from "./effectProjectEditorUtils";
import type { EffectProjectAuxiliarySnapshot } from "./effectProjectAuxiliaryCache";
import {
  isSsbhEditorDialogActive,
  SsbhEditorModalWindowShell,
  type ModalViewportSuspendInteraction,
} from "./SsbhEditorModalWindowShell";

export type EffectProjectEditorWindowSession = {
  id: string;
  filePath: string;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: EffectProjectEditorDocument | null;
  draftData: EffectProjectEditorDocument | null;
  /** Increments when draft is replaced from disk/base/editor sync; local UI resets from `data`. */
  draftSyncGeneration: number;
  isDirty: boolean;
  zIndex: number;
  auxiliary: EffectProjectAuxiliarySnapshot;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type Props = {
  session: EffectProjectEditorWindowSession;
  cascadeIndex: number;
  onRegisterZLayer: (sessionId: string, setZ: (z: number) => void) => () => void;
  onActivate: () => void;
  onCloseRequest: () => void;
  onDraftChange: (next: EffectProjectEditorDocument) => void;
  onSave: (document: EffectProjectEditorDocument) => void;
  onReset: () => void;
  onReloadRequest: () => void;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function EffectProjectEditorModalWindow({
  session,
  cascadeIndex,
  onRegisterZLayer,
  onActivate,
  onCloseRequest,
  onDraftChange,
  onSave,
  onReset,
  onReloadRequest,
  skipActivate,
  viewportSuspend,
}: Props) {
  const [localZIndex, setLocalZIndex] = useState(session.zIndex);
  const setZLayer = useCallback((z: number) => {
    setLocalZIndex(z);
  }, []);

  useLayoutEffect(() => {
    setZLayer(session.zIndex);
  }, [session.zIndex, setZLayer]);

  useLayoutEffect(() => {
    return onRegisterZLayer(session.id, setZLayer);
  }, [onRegisterZLayer, session.id, setZLayer]);

  const dirty = session.isDirty;
  const titleId = `effect-project-editor-title-${session.id}`;

  const draftRef = useRef(session.draftData);
  const savingRef = useRef(session.saving);
  const loadingRef = useRef(session.loading);
  const flushToParentRef = useRef<(() => EffectProjectEditorDocument) | null>(null);
  draftRef.current = session.draftData;
  savingRef.current = session.saving;
  loadingRef.current = session.loading;

  const runSaveWithLatestDraft = useCallback(() => {
    const baseline = session.draftData;
    if (!baseline || savingRef.current || loadingRef.current) return;
    const latest = flushToParentRef.current?.() ?? baseline;
    try {
      assertEffectProjectValidForSave(latest);
    } catch (err) {
      toast.error(String(err));
      return;
    }
    onSave(latest);
  }, [onSave, session.draftData]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (isSsbhEditorDialogActive(titleId)) {
          e.preventDefault();
          runSaveWithLatestDraft();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [runSaveWithLatestDraft, titleId]);

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
          onClick={runSaveWithLatestDraft}
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
      kind="effectProject"
      cascadeIndex={cascadeIndex}
      zIndex={localZIndex}
      titleId={titleId}
      title={dirty ? `• ${title}` : title}
      subtitle="Effect project (.bin)"
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
          Loading effect project...
        </div>
      ) : session.loadError ? (
        <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
      ) : session.draftData ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <EffectProjectEditorBody
            data={session.draftData}
            draftSyncGeneration={session.draftSyncGeneration}
            onChange={onDraftChange}
            onFlushToParentReady={(fn) => {
              flushToParentRef.current = fn;
            }}
            disabled={session.saving}
            auxiliary={session.auxiliary}
          />
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground">No data.</div>
      )}
    </SsbhEditorModalWindowShell>
  );
}
