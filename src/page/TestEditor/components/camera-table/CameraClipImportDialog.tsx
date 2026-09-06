import { useCallback, useEffect, useMemo, useState } from "react";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { ClipboardPaste, FileInput } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CameraTableData } from "./cameraTableDocument";
import {
  applyCameraTableImport,
  previewCameraTableImport,
  type CameraTableImportFormat,
  type CameraTableJsonApplyResult,
} from "./cameraTableJson";
import type { CameraClipPack } from "./groupCameraPacks";

const IMPORT_MODAL_TITLE_ID = "camera-table-import-title";

const IMPORT_MODAL_DIMENSIONS = {
  width: 720,
  height: 520,
  minWidth: 520,
  minHeight: 420,
};

type CameraClipImportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: string;
  table: CameraTableData;
  pack: CameraClipPack | null;
  selectedEntryIndex: number | null;
  writable: boolean;
  onCommit: (result: Extract<CameraTableJsonApplyResult, { ok: true }>) => void;
};

function formatLabel(format: CameraTableImportFormat, t: (key: string) => string): string {
  if (format === "hex") return t("cameraTable.import.hex");
  if (format === "clip-json") return t("cameraTable.import.clipJson");
  if (format === "shot-json") return t("cameraTable.import.shotJson");
  return t("cameraTable.import.unknown");
}

export function CameraClipImportDialog({
  open,
  onOpenChange,
  family,
  table,
  pack,
  selectedEntryIndex,
  writable,
  onCommit,
}: CameraClipImportDialogProps) {
  const { t } = useTranslation("test-lists");
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  const preview = useMemo(
    () => previewCameraTableImport(draft, table, family, selectedEntryIndex, pack),
    [draft, family, pack, selectedEntryIndex, table],
  );

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await readText();
      if (!text?.trim()) {
        toast.error(t("cameraTable.jsonView.toast.pasteEmpty"));
        return;
      }
      setDraft(text);
    } catch {
      toast.error(t("cameraTable.jsonView.toast.pasteFailed"));
    }
  }, [t]);

  const handleApply = useCallback(() => {
    const result = applyCameraTableImport(draft, table, family, selectedEntryIndex, pack);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onCommit(result);
    onOpenChange(false);
    toast.success(
      result.format === "hex" ? t("cameraTable.import.toastHex") : t("cameraTable.import.toastJson"),
    );
  }, [draft, family, onCommit, onOpenChange, pack, selectedEntryIndex, t, table]);

  if (!open) return null;

  const statusLine = preview.idle ? (
    <span className="text-[11px] text-muted-foreground">{t("cameraTable.import.idle")}</span>
  ) : preview.ok ? (
    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
      {t("cameraTable.import.ready")}
      {preview.byteCount !== undefined ? ` · ${preview.byteCount} B` : ""}
      {preview.shotCount !== undefined ? ` · ${t("cameraTable.shotCount", { count: preview.shotCount })}` : ""}
    </span>
  ) : preview.error ? (
    <span className="text-[11px] text-destructive">{preview.error}</span>
  ) : null;

  return (
    <AppRndModalShell
      titleId={IMPORT_MODAL_TITLE_ID}
      title={t("cameraTable.import.title")}
      subtitle={t("cameraTable.import.subtitle")}
      headerIcon={<FileInput className="h-5 w-5 text-primary" />}
      headerActions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]"
          onClick={() => void pasteFromClipboard()}
        >
          <ClipboardPaste className="h-3 w-3" />
          {t("cameraTable.jsonView.paste")}
        </Button>
      }
      dimensions={IMPORT_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.camera-table-import"
      onClose={() => onOpenChange(false)}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/40 bg-muted/20 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]"
            onClick={() => onOpenChange(false)}
          >
            {t("cameraTable.jsonView.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-[10px] transition-[background-color,transform] duration-200 active:scale-[0.98]"
            disabled={!writable || !preview.ok}
            onClick={handleApply}
          >
            {t("cameraTable.import.apply")}
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex flex-wrap items-center gap-2">
          {!preview.idle ? (
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                preview.format === "hex" && "border-cyan-500/30 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200",
                (preview.format === "clip-json" || preview.format === "shot-json") &&
                  "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
                preview.format === "unknown" && "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              {formatLabel(preview.format, t)}
            </span>
          ) : (
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("cameraTable.import.awaiting")}
            </span>
          )}
          {statusLine}
        </div>

        {preview.warning ? <p className="text-[11px] text-amber-700 dark:text-amber-300">{preview.warning}</p> : null}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("cameraTable.import.placeholder")}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
        />
      </div>
    </AppRndModalShell>
  );
}
