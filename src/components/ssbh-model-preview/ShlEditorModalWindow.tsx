import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Layers, Loader2, RefreshCw, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ShlFileData } from "./shlIoService";
import { ShlEditorBody } from "./ShlEditorBody";
import { assertShlValidForSave, isShlDraftDirty } from "./shlEditorUtils";
import {
  buildShlClipboardExportPayload,
  copyShlJsonToClipboard,
} from "./copyShlJson";
import {
  isSsbhEditorDialogActive,
  SsbhEditorModalWindowShell,
  type ModalViewportSuspendInteraction,
} from "./SsbhEditorModalWindowShell";

export type ShlEditorWindowSession = {
  id: string;
  filePath: string;
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  baseData: ShlFileData | null;
  draftData: ShlFileData | null;
  zIndex: number;
};

function fileBasename(path: string): string {
  const seg = path.replace(/\\/g, "/").split("/").filter((x) => x.length > 0).pop();
  return seg ?? path;
}

type ShlEditorModalWindowProps = {
  session: ShlEditorWindowSession;
  cascadeIndex: number;
  onActivate: () => void;
  onCloseRequest: () => void;
  onReloadRequest: () => void;
  onDraftChange: (next: ShlFileData) => void;
  onSave: () => void;
  onReset: () => void;
  skipActivate?: boolean;
  viewportSuspend?: ModalViewportSuspendInteraction;
  modelFolderNames?: string[];
  bodySlotRequired?: boolean;
};

export function ShlEditorModalWindow({
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
  modelFolderNames,
  bodySlotRequired = true,
}: ShlEditorModalWindowProps) {
  const { t } = useTranslation("ssbh-root-b");
  const dirty = isShlDraftDirty(session.baseData, session.draftData);
  const titleId = `shl-editor-title-${session.id}`;

  const draftRef = useRef(session.draftData);
  const savingRef = useRef(session.saving);
  const loadingRef = useRef(session.loading);
  draftRef.current = session.draftData;
  savingRef.current = session.saving;
  loadingRef.current = session.loading;

  const handleCopyJson = useCallback(async () => {
    const draft = draftRef.current;
    if (!draft) return;
    await copyShlJsonToClipboard(
      buildShlClipboardExportPayload({
        filePath: session.filePath,
        draft,
        base: session.baseData,
        modelFolderNames,
      }),
    );
  }, [modelFolderNames, session.baseData, session.filePath]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        if (isSsbhEditorDialogActive(titleId)) {
          e.preventDefault();
          const draft = draftRef.current;
          if (!savingRef.current && draft && !loadingRef.current) {
            try {
              assertShlValidForSave(draft, { requireBody: bodySlotRequired });
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
  }, [bodySlotRequired, onSave, titleId]);

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
          title={t("copyShlTitle")}
          aria-label={t("copyShlAria")}
          onClick={() => void handleCopyJson()}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          {t("copyJson")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving || session.loading}
          onClick={onReloadRequest}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          {t("reload")}
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
          {t("reset")}
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
              assertShlValidForSave(d, { requireBody: bodySlotRequired });
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
          {session.saving ? t("saving") : t("save")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-[10px]"
          disabled={session.saving}
          onClick={onCloseRequest}
        >
          {t("close")}
        </Button>
      </div>
    ) : null;

  return (
    <SsbhEditorModalWindowShell
      kind="shl"
      cascadeIndex={cascadeIndex}
      zIndex={session.zIndex}
      titleId={titleId}
      title={dirty ? `• ${title}` : title}
      subtitle={t("editShl")}
      headerIcon={<Layers className="h-4 w-4 text-primary" />}
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
          {t("loadingShl")}
        </div>
      ) : session.loadError ? (
        <div className="px-5 py-4 text-sm text-destructive">{session.loadError}</div>
      ) : session.draftData ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          <ShlEditorBody
            data={session.draftData}
            onChange={onDraftChange}
            disabled={session.saving}
            modelFolderNames={modelFolderNames}
            bodySlotRequired={bodySlotRequired}
          />
        </div>
      ) : (
        <div className="px-5 py-4 text-sm text-muted-foreground">{t("noData")}</div>
      )}
    </SsbhEditorModalWindowShell>
  );
}
