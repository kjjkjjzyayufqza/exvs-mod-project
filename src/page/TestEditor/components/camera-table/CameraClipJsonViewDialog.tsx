import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import JsonView from "@uiw/react-json-view";
import { vscodeTheme } from "@uiw/react-json-view/vscode";
import { Braces, ClipboardCopy, ClipboardPaste, CopyPlus, Pencil, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCameraHash, type CameraTableData } from "./cameraTableDocument";
import {
  applyCameraTableJson,
  cloneCameraTableFromJson,
  formatCameraShotJson,
  previewCameraTableImport,
  type CameraTableJsonApplyResult,
} from "./cameraTableJson";
import type { CameraClipPack } from "./groupCameraPacks";

const JSON_VIEW_TITLE_ID = "camera-table-json-view-title";

const JSON_VIEW_MODAL_DIMENSIONS = {
  width: 820,
  height: 640,
  minWidth: 560,
  minHeight: 420,
};

const TOOLBAR_BUTTON_CLASS =
  "h-7 gap-1 px-2 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]";

type CameraClipJsonViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: string;
  table: CameraTableData;
  pack: CameraClipPack | null;
  selectedEntryIndex: number | null;
  writable: boolean;
  onCommit: (result: Extract<CameraTableJsonApplyResult, { ok: true }>) => void;
};

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function CameraClipJsonViewDialog({
  open,
  onOpenChange,
  family,
  table,
  pack,
  selectedEntryIndex,
  writable,
  onCommit,
}: CameraClipJsonViewDialogProps) {
  const { t } = useTranslation("test-lists");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [draft, setDraft] = useState("");
  const [originalDraft, setOriginalDraft] = useState("");
  const tableRef = useRef(table);
  tableRef.current = table;

  useEffect(() => {
    if (!open) {
      setMode("view");
      setDraft("");
      setOriginalDraft("");
      return;
    }
    const text =
      selectedEntryIndex != null
        ? (formatCameraShotJson(tableRef.current, family, selectedEntryIndex) ?? "")
        : "";
    setDraft(text);
    setOriginalDraft(text);
    setMode("view");
  }, [family, open, selectedEntryIndex]);

  const parsedObject = useMemo(() => parseJsonObject(draft), [draft]);
  const preview = useMemo(
    () => previewCameraTableImport(draft, table, family, selectedEntryIndex, pack),
    [draft, family, pack, selectedEntryIndex, table],
  );
  const jsonReady = preview.ok && (preview.format === "clip-json" || preview.format === "shot-json");
  const dirty = draft !== originalDraft;

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await readText();
      if (!text?.trim()) {
        toast.error(t("cameraTable.jsonView.toast.pasteEmpty"));
        return;
      }
      setDraft(text);
      setMode("edit");
    } catch {
      toast.error(t("cameraTable.jsonView.toast.pasteFailed"));
    }
  }, [t]);

  const copyDraft = useCallback(async () => {
    if (!draft.trim()) {
      toast.error(t("cameraTable.selectPack"));
      return;
    }
    try {
      await writeText(draft);
      toast.success(t("cameraTable.jsonView.toast.copied"));
    } catch {
      toast.error(t("cameraTable.jsonView.toast.copyFailed"));
    }
  }, [draft, t]);

  const formatDraft = useCallback(() => {
    const parsed = parseJsonObject(draft);
    if (!parsed) {
      toast.error(t("cameraTable.jsonView.toast.invalid"));
      return;
    }
    setDraft(JSON.stringify(parsed, null, 2));
  }, [draft, t]);

  const handleApply = useCallback(() => {
    const result = applyCameraTableJson(draft, table, family, selectedEntryIndex, pack);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onCommit(result);
    onOpenChange(false);
    toast.success(t("cameraTable.jsonView.toast.applied"));
  }, [draft, family, onCommit, onOpenChange, pack, selectedEntryIndex, t, table]);

  const handleClone = useCallback(() => {
    const result = cloneCameraTableFromJson(draft, table, family, selectedEntryIndex, pack);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onCommit(result);
    onOpenChange(false);
    toast.success(
      t("cameraTable.jsonView.toast.cloned", { id: formatCameraHash(result.selection.entryId) }),
    );
  }, [draft, family, onCommit, onOpenChange, pack, selectedEntryIndex, t, table]);

  if (!open) return null;

  const statusLine = !draft.trim() ? (
    <span className="text-[11px] text-muted-foreground">{t("cameraTable.selectPack")}</span>
  ) : jsonReady ? (
    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
      {t("cameraTable.jsonView.ready")}
      {preview.shotCount != null ? ` · ${t("cameraTable.shotCount", { count: preview.shotCount })}` : ""}
    </span>
  ) : preview.error ? (
    <span className="text-[11px] text-destructive">{preview.error}</span>
  ) : (
    <span className="text-[11px] text-destructive">{t("cameraTable.jsonView.toast.invalid")}</span>
  );

  return (
    <AppRndModalShell
      titleId={JSON_VIEW_TITLE_ID}
      title={t("cameraTable.jsonView.title")}
      subtitle={
        selectedEntryIndex != null
          ? `${formatCameraHash(table.entries[selectedEntryIndex]?.entryId ?? 0)} · ${t("cameraTable.jsonView.subtitle")} · ${
              mode === "edit" ? t("cameraTable.jsonView.editing") : t("cameraTable.jsonView.viewOnly")
            }`
          : t("cameraTable.selectPack")
      }
      headerIcon={<Braces className="h-5 w-5 text-primary" />}
      headerActions={
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
              {t("cameraTable.jsonView.unsaved")}
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={TOOLBAR_BUTTON_CLASS}
            onClick={() => void pasteFromClipboard()}
          >
            <ClipboardPaste className="h-3 w-3" />
            {t("cameraTable.jsonView.paste")}
          </Button>
          {mode === "view" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={TOOLBAR_BUTTON_CLASS}
              disabled={selectedEntryIndex == null}
              onClick={() => setMode("edit")}
            >
              <Pencil className="h-3 w-3" />
              {t("cameraTable.jsonView.edit")}
            </Button>
          ) : (
            <>
              <Button type="button" size="sm" variant="outline" className={TOOLBAR_BUTTON_CLASS} onClick={formatDraft}>
                {t("cameraTable.jsonView.format")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={TOOLBAR_BUTTON_CLASS}
                onClick={() => {
                  setDraft(originalDraft);
                  setMode("view");
                }}
              >
                <X className="h-3 w-3" />
                {t("cameraTable.jsonView.cancel")}
              </Button>
            </>
          )}
        </div>
      }
      dimensions={JSON_VIEW_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.camera-table-json-view"
      onClose={() => onOpenChange(false)}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-muted/20 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]"
            disabled={!draft.trim()}
            onClick={() => void copyDraft()}
          >
            <ClipboardCopy className="h-3 w-3" />
            {t("cameraTable.jsonView.copy")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]"
              disabled={!writable || selectedEntryIndex == null}
              onClick={handleClone}
            >
              <CopyPlus className="h-3 w-3" />
              {t("cameraTable.jsonView.clone")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-[10px] transition-[background-color,transform] duration-200 active:scale-[0.98]"
              disabled={!writable || !jsonReady}
              onClick={handleApply}
            >
              <Save className="h-3 w-3" />
              {t("cameraTable.jsonView.apply")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
              jsonReady
                ? "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200"
                : "border-border/60 bg-muted/40 text-muted-foreground",
            )}
          >
            {preview.format === "shot-json" ? t("cameraTable.jsonView.badgeShot") : t("cameraTable.jsonView.badge")}
          </span>
          {statusLine}
        </div>

        {preview.warning ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">{preview.warning}</p>
        ) : null}

        {mode === "edit" ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-label={t("cameraTable.jsonView.editAria")}
            className="min-h-0 flex-1 resize-none rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
          />
        ) : parsedObject ? (
          <div
            data-i18n-ignore=""
            className="min-h-0 flex-1 overflow-auto rounded-md border bg-[#0d1117] p-3 text-[#d6deeb] shadow-inner"
          >
            <JsonView
              value={parsedObject}
              style={vscodeTheme}
              displayDataTypes={false}
              collapsed={1}
              enableClipboard={false}
              shortenTextAfterLength={0}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            {t("cameraTable.jsonView.toast.invalid")}
          </div>
        )}
      </div>
    </AppRndModalShell>
  );
}
