import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileCode2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { JnttblEditorDocument } from "./jnttblIoService";
import { JnttblEditorBody } from "./JnttblEditorBody";
import { assertJnttblValidForSave } from "./jnttblEditorUtils";
import {
  isSsbhEditorDialogActive,
  SsbhEditorModalWindowShell,
  type ModalViewportSuspendInteraction,
} from "./SsbhEditorModalWindowShell";

export type JnttblEditorWindowSession = {
  id: string;
  filePath: string;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: JnttblEditorDocument | null;
  draftData: JnttblEditorDocument | null;
  isDirty: boolean;
  zIndex: number;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type JnttblEditorModalWindowProps = {
  session: JnttblEditorWindowSession;
  cascadeIndex: number;
  onRegisterZLayer: (sessionId: string, setZ: (z: number) => void) => () => void;
  onActivate: () => void;
  onCloseRequest: () => void;
  onDraftChange: (next: JnttblEditorDocument) => void;
  onSave: () => void;
  onReset: () => void;
  onReloadRequest: () => void;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
};

export function JnttblEditorModalWindow({
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
}: JnttblEditorModalWindowProps) {
  const { t } = useTranslation("ssbh-modals");
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
  const titleId = `jnttbl-editor-title-${session.id}`;

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
              assertJnttblValidForSave(draft);
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
          {t("common.reload")}
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
          {t("common.reset")}
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
              assertJnttblValidForSave(d);
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
          {session.saving ? t("common.saving") : t("common.save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving}
          onClick={onCloseRequest}
        >
          {t("common.close")}
        </Button>
      </div>
    ) : null;

  return (
    <SsbhEditorModalWindowShell
      kind="jnttbl"
      cascadeIndex={cascadeIndex}
      zIndex={localZIndex}
      titleId={titleId}
      title={dirty ? `• ${title}` : title}
      subtitle={t("jnttbl.subtitle")}
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
          {t("jnttbl.loading")}
        </div>
      ) : session.loadError ? (
        <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
      ) : session.draftData ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <JnttblEditorBody
            data={session.draftData}
            onChange={onDraftChange}
            disabled={session.saving}
          />
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground">{t("common.noData")}</div>
      )}
    </SsbhEditorModalWindowShell>
  );
}
