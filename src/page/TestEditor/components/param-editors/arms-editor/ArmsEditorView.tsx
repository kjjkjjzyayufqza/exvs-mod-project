import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Braces,
  ClipboardCopy,
  CopyPlus,
  Eye,
  FileInput,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { AppRndModalShell } from "@/components/AppRndModalShell";
import { Button } from "@/components/ui/button";
import { FilePathInput } from "@/components/ui/filePathInput";
import { IOReadFile } from "@/IO/fileSystem";
import { cn } from "@/lib/utils";
import { formatHash } from "@/models/commandTable";
import { EntryListPanel } from "../shared/EntryListPanel";
import { EditorStatusBar } from "../shared/EditorStatusBar";
import type { EditorEntryRow } from "../shared/types";
import { WeaponSlotDiagram } from "./WeaponSlotDiagram";
import { ArmsPropertyPanel } from "./ArmsPropertyPanel";
import { AmmoTimeline } from "./AmmoTimeline";
import { ActionReloadTimelinePanel } from "./ActionReloadTimelinePanel";
import { useArmsEditorStore } from "./ArmsEditorStore";
import { numField, resolveArmsLabels } from "./armsFieldModel";
import { describeChargeInputFlags } from "@/lib/gameAlgorithms/chargeSystem";
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes";
import {
  applyHexBytesToTypedEntry,
  buildTypedEntryFieldLayout,
  buildTypedEntryHexPreview,
  createBlankTypedParamEntry,
  createCopyAsNewTypedParamEntry,
  formatHexPreviewEditText,
  parseHexPreviewEditText,
  readTypedEntryId,
} from "../../param-editor/paramEntryUtils";
import {
  copyTypedParamEntryJsonToClipboard,
  copyTypedParamFileJsonToClipboard,
} from "../../param-editor/typedParamClipboard";
import { TypedParamImportDialog } from "../../param-editor/TypedParamImportDialog";

const STORE_KEY = "paramEditors.v2.fp.armsparam";
const PARAM_TYPE = "armsparam";
/** Estimate only — rows measure real height so long labels can wrap. */
const ENTRY_ROW_HEIGHT = 64;

const TOOLBAR_BUTTON_CLASS =
  "h-7 gap-1 px-2 text-[10px] transition-[background-color,transform,box-shadow] duration-200 hover:bg-muted/60 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30";

const HEX_PREVIEW_MODAL_DIMENSIONS = {
  width: 900,
  height: 700,
  minWidth: 640,
  minHeight: 420,
};

interface ArmsEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void;
  workspaceDefaultPath?: string;
}

function ArmsEntryLabel({
  row,
  fileBytes,
}: {
  row: EditorEntryRow;
  fileBytes: Uint8Array | null;
}) {
  const { t } = useTranslation("test-arms-editor");
  const ammo = numField(row.entry, "ammoCount");
  const initialAmmo = numField(row.entry, "initialAmmoCount");
  const slotIndex = numField(row.entry, "slotIndex");
  const chargeInputFlags = numField(row.entry, "chargeInputFlags") >>> 0;
  const chargeStageCount = numField(row.entry, "chargeStageCount");
  const labels = resolveArmsLabels(row.entry, fileBytes);
  const actionLabel = labels.actionLabel;
  const resourceLabel = labels.resourceLabel;
  const showResource =
    Boolean(resourceLabel) && resourceLabel !== actionLabel;

  return (
    <div className="min-w-0 w-full space-y-0.5 overflow-hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] font-semibold tabular-nums tracking-tight">
          {formatHash(row.entryId)}
        </span>
      </div>
      {actionLabel || resourceLabel ? (
        <div className="min-w-0 space-y-0.5 overflow-hidden">
          {actionLabel ? (
            <div
              className="min-w-0 break-all font-mono text-[10px] leading-snug text-muted-foreground"
              title={actionLabel}
            >
              {actionLabel}
            </div>
          ) : null}
          {showResource ? (
            <div
              className="min-w-0 break-all font-mono text-[10px] leading-snug text-muted-foreground/85"
              title={resourceLabel ?? undefined}
            >
              {resourceLabel}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="min-w-0 break-all font-mono text-[10px] leading-snug text-muted-foreground/70">
          {labels.actionOffset
            ? `${t("entryLabel.actionAt")}@${formatHash(labels.actionOffset)}`
            : labels.resourceOffset
              ? `${t("entryLabel.resourceAt")}@${formatHash(labels.resourceOffset)}`
              : t("entryLabel.noLabel")}
        </div>
      )}
      <div className="flex gap-2 font-mono text-[9px] tabular-nums text-muted-foreground">
        <span>{t("entryLabel.ammo", { initial: initialAmmo, max: ammo })}</span>
        <span>{t("entryLabel.slot", { index: slotIndex })}</span>
        {chargeInputFlags !== 0 ? (
          <span>
            {describeChargeInputFlags(chargeInputFlags)} ×{chargeStageCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ArmsEditorView({
  onUnsavedChanges,
  workspaceDefaultPath,
}: ArmsEditorViewProps) {
  const { t } = useTranslation("test-arms-editor");
  const [filePath, setFilePath] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hexPreviewMode, setHexPreviewMode] = useState<"view" | "edit">("view");
  const [hexEditDraft, setHexEditDraft] = useState("");

  const data = useArmsEditorStore((s) => s.data);
  const fileBytes = useArmsEditorStore((s) => s.fileBytes);
  const selectedIndex = useArmsEditorStore((s) => s.selectedIndex);
  const dirty = useArmsEditorStore((s) => s.dirty);
  const dirtyEntryIndices = useArmsEditorStore((s) => s.dirtyEntryIndices);
  const validationMessages = useArmsEditorStore((s) => s.validationMessages);
  const store = useArmsEditorStore;

  useEffect(() => {
    onUnsavedChanges?.(dirty);
  }, [dirty, onUnsavedChanges]);

  useEffect(() => {
    if (!previewOpen) {
      setHexPreviewMode("view");
      setHexEditDraft("");
    }
  }, [previewOpen]);

  useEffect(() => {
    setHexPreviewMode("view");
    setHexEditDraft("");
  }, [selectedIndex]);

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim()) return;
      setLoading(true);
      try {
        const [parsed, raw] = await Promise.all([
          invoke<TypedParamFile>("parse_typed_param_file", {
            path,
            paramType: PARAM_TYPE,
          }),
          IOReadFile(path),
        ]);
        const bytes = new Uint8Array(raw);
        store.getState().setData(parsed, path, bytes);
        toast.success(t("toast.loaded", { count: parsed.entries.length }));
      } catch (e) {
        toast.error(t("errors.loadFailed", { error: String(e) }));
      } finally {
        setLoading(false);
      }
    },
    [store],
  );

  const saveFile = useCallback(async () => {
    const current = store.getState();
    if (!current.data || !current.filePath.trim()) return;
    setSaving(true);
    try {
      await invoke("build_typed_param_file", {
        dataJson: current.data,
        outputPath: current.filePath,
        paramType: PARAM_TYPE,
      });
      store.getState().markClean();
      toast.success(t("toast.saved"));
    } catch (e) {
      toast.error(t("errors.saveFailed", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }, [store]);

  const entry = data?.entries[selectedIndex] ?? null;
  const entryCount = data?.entries.length ?? 0;
  const selectedId =
    entry != null ? readTypedEntryId(entry, selectedIndex) : null;

  const hexPreview = useMemo(
    () => (data ? buildTypedEntryHexPreview(data, selectedIndex) : null),
    [data, selectedIndex],
  );

  const hexEditDirty = useMemo(() => {
    if (!hexPreview || hexPreviewMode !== "edit") return false;
    return hexEditDraft !== formatHexPreviewEditText(hexPreview.bytes);
  }, [hexEditDraft, hexPreview, hexPreviewMode]);

  const beginHexEdit = useCallback(() => {
    if (!hexPreview) return;
    setHexEditDraft(formatHexPreviewEditText(hexPreview.bytes));
    setHexPreviewMode("edit");
  }, [hexPreview]);

  const cancelHexEdit = useCallback(() => {
    if (!hexPreview) {
      setHexPreviewMode("view");
      setHexEditDraft("");
      return;
    }
    setHexEditDraft(formatHexPreviewEditText(hexPreview.bytes));
    setHexPreviewMode("view");
  }, [hexPreview]);

  const saveHexEdit = useCallback(() => {
    if (!hexPreview || !entry || !data) return;
    const fieldLayout = buildTypedEntryFieldLayout(data, selectedIndex);
    if (!fieldLayout) {
      toast.error(t("errors.fieldLayout"));
      return;
    }
    const parsed = parseHexPreviewEditText(hexEditDraft, hexPreview.bytes.length);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const nextEntry = applyHexBytesToTypedEntry(entry, fieldLayout, parsed.bytes);
    store.getState().replaceSelectedEntry(nextEntry);
    setHexPreviewMode("view");
    toast.success(t("toast.hexSaved"));
  }, [data, entry, hexEditDraft, hexPreview, selectedIndex, store]);

  const copySelectedEntryJson = useCallback(() => {
    if (!data) return;
    void copyTypedParamEntryJsonToClipboard(PARAM_TYPE, data, selectedIndex);
  }, [data, selectedIndex]);

  const copyFullViewJson = useCallback(() => {
    if (!data) return;
    void copyTypedParamFileJsonToClipboard(PARAM_TYPE, data);
  }, [data]);

  const applyImportedEntry = useCallback(
    (nextEntry: TypedParamEntry) => {
      store.getState().replaceSelectedEntry(nextEntry);
    },
    [store],
  );

  const duplicateEntry = useCallback(() => {
    if (!data) return;
    const created = createCopyAsNewTypedParamEntry(data.entries, selectedIndex);
    if (!created) {
      toast.error(t("errors.noEntryDuplicate"));
      return;
    }
    store.getState().appendEntry(created);
    toast.success(t("toast.duplicated"));
  }, [data, selectedIndex, store]);

  const addEntry = useCallback(() => {
    if (!data) return;
    const created = createBlankTypedParamEntry(data.entries, selectedIndex);
    if (!created) {
      toast.error(t("errors.noTemplate"));
      return;
    }
    store.getState().appendEntry(created);
    toast.success(t("toast.added"));
  }, [data, selectedIndex, store]);

  const deleteEntry = useCallback(() => {
    if (!data?.entries.length) return;
    store.getState().deleteSelectedEntry();
    toast.success(t("toast.deleted"));
  }, [data, store]);

  const headerSpecs = useMemo(() => {
    if (!data) return null;
    const header = data.header ?? {};
    return {
      entrySize: typeof header.entrySize === "number" ? header.entrySize : null,
      commandsCount:
        typeof header.commandsCount === "number" ? header.commandsCount : null,
      fieldCount: data.fieldSpecs?.length ?? 0,
    };
  }, [data]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/60 bg-muted/10 px-3 py-2.5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {t("outdated")}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {t("subtitle")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilePathInput
            className="h-8 min-w-[16rem] flex-1 font-mono text-[11px]"
            storeKey={STORE_KEY}
            value={filePath}
            onChange={(e) => setFilePath(e.target.value)}
            picker={{
              kind: "file",
              title: t("filePicker.title"),
              filters: [{ name: "Param", extensions: ["bin"] }],
              defaultPath: workspaceDefaultPath,
            }}
            onPickedValue={(v) => {
              const p = Array.isArray(v) ? v[0] : v;
              if (typeof p === "string" && p) {
                setFilePath(p);
                void loadFile(p);
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[11px] transition-[transform,background-color] duration-200 active:scale-[0.98]"
            disabled={loading || !filePath.trim()}
            onClick={() => void loadFile(filePath)}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderOpen className="h-3.5 w-3.5" />
            )}
            {t("toolbar.load")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-[11px] transition-[transform,background-color] duration-200 active:scale-[0.98]"
            disabled={loading || !store.getState().filePath}
            onClick={() => {
              const path = store.getState().filePath;
              if (path) void loadFile(path);
            }}
            title={t("toolbar.reloadTooltip")}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            {t("toolbar.reload")}
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1.5 text-[11px] transition-[transform,background-color] duration-200 active:scale-[0.98]"
            onClick={() => void saveFile()}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? t("toolbar.saving") : t("toolbar.save")}
          </Button>
        </div>

        {headerSpecs && (
          <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{t("counts.entries", { count: entryCount })}</span>
            {headerSpecs.fieldCount > 0 && (
              <span>{t("counts.fieldSpecs", { count: headerSpecs.fieldCount })}</span>
            )}
            {headerSpecs.entrySize != null && (
              <span>{t("counts.entrySize", { size: headerSpecs.entrySize })}</span>
            )}
            {selectedId != null && (
              <span className="text-foreground/80">
                {t("counts.selected", { id: formatHash(selectedId) })}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_340px]">
        <aside className="min-h-0 border-r border-border/50 p-2">
          <EntryListPanel
            entries={data?.entries ?? []}
            selectedIndex={selectedIndex}
            onSelect={(i) => store.getState().selectEntry(i)}
            renderLabel={(row) => (
              <ArmsEntryLabel row={row} fileBytes={fileBytes} />
            )}
            rowHeight={ENTRY_ROW_HEIGHT}
            className="h-full border-0 shadow-none"
          />
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden border-r border-border/50">
          {loading ? (
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="h-36 animate-pulse rounded-lg bg-muted/40" />
              <div className="h-28 animate-pulse rounded-lg bg-muted/30" />
              <div className="h-40 animate-pulse rounded-lg bg-muted/25" />
            </div>
          ) : entry ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <WeaponSlotDiagram entry={entry} />
              <section className="rounded-lg border border-border/60 bg-card/80 p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
                <ActionReloadTimelinePanel entry={entry} />
              </section>
              <AmmoTimeline entry={entry} />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <div className="rounded-full border border-border/50 bg-muted/20 p-3">
                <FolderOpen className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium tracking-tight">
                  No armsparam loaded
                </p>
                <p className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                  {t("empty.help", { file: "armsparam.bin" })}
                </p>
              </div>
            </div>
          )}
        </main>

        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden">
          {data ? (
            <>
              <div className="shrink-0 space-y-2 border-b border-border/50 bg-muted/15 px-2.5 py-2">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-xs font-semibold tracking-tight">
                    Entry detail
                  </h3>
                  {entry ? (
                    <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {formatHash(readTypedEntryId(entry, selectedIndex))} ·{" "}
                      {Object.keys(entry).length} fields
                    </span>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div
                    className="flex flex-wrap items-center gap-1 rounded-md border border-border/50 bg-background/70 p-0.5"
                    role="group"
                    aria-label={t("aria.importExport")}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={TOOLBAR_BUTTON_CLASS}
                      disabled={!entry}
                      title={t("buttons.importTooltip")}
                      onClick={() => setImportOpen(true)}
                    >
                      <FileInput className="h-3 w-3" />
                      {t("buttons.import")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={TOOLBAR_BUTTON_CLASS}
                      disabled={!entry}
                      title={t("buttons.entryJsonTooltip")}
                      onClick={copySelectedEntryJson}
                    >
                      <ClipboardCopy className="h-3 w-3" />
                      {t("buttons.entryJson")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={TOOLBAR_BUTTON_CLASS}
                      disabled={!data.entries.length}
                      title={t("buttons.allJsonTooltip")}
                      onClick={copyFullViewJson}
                    >
                      <Braces className="h-3 w-3" />
                      {t("buttons.allJson")}
                    </Button>
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-1 rounded-md border border-border/50 bg-background/70 p-0.5"
                    role="group"
                    aria-label={t("aria.entryTools")}
                  >
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={TOOLBAR_BUTTON_CLASS}
                      disabled={!entry}
                      title={t("buttons.hexTooltip")}
                      onClick={() => setPreviewOpen(true)}
                    >
                      <Eye className="h-3 w-3" />
                      {t("buttons.hex")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={TOOLBAR_BUTTON_CLASS}
                      disabled={!data.entries.length && !entry}
                      title={t("buttons.duplicateTooltip")}
                      onClick={duplicateEntry}
                    >
                      <CopyPlus className="h-3 w-3" />
                      {t("buttons.duplicate")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={TOOLBAR_BUTTON_CLASS}
                      disabled={!data.entries.length && !entry}
                      title={t("buttons.addTooltip")}
                      onClick={addEntry}
                    >
                      <Plus className="h-3 w-3" />
                      {t("buttons.add")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={cn(
                        TOOLBAR_BUTTON_CLASS,
                        "text-destructive hover:bg-destructive/10 hover:text-destructive",
                      )}
                      disabled={!data.entries.length}
                      title={t("buttons.deleteTooltip")}
                      onClick={deleteEntry}
                    >
                      <Trash2 className="h-3 w-3" />
                      {t("buttons.delete")}
                    </Button>
                  </div>
                </div>
              </div>
              {entry ? (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <ArmsPropertyPanel
                    entry={entry}
                    fieldSpecs={data.fieldSpecs}
                    fileBytes={fileBytes}
                    onFieldChange={(key, value) =>
                      store.getState().updateField(key, value)
                    }
                  />
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
                  {t("empty.selectEntry")}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
              {t("empty.loadFile")}
            </div>
          )}
        </aside>
      </div>

      <EditorStatusBar
        entryCount={entryCount}
        selectedIndex={selectedIndex}
        modifiedCount={dirtyEntryIndices.size}
        validationMessages={validationMessages}
        extra={
          dirty ? (
            <span className="text-amber-600 dark:text-amber-400">{t("status.unsaved")}</span>
          ) : (
            <span>{t("status.schema", { type: PARAM_TYPE })}</span>
          )
        }
      />

      {previewOpen ? (
        <AppRndModalShell
          titleId="arms-param-hex-preview-title"
          title={t("hex.title")}
          subtitle={
            hexPreview
              ? t("hex.subtitle", { id: formatHash(hexPreview.entryId), count: hexPreview.bytes.length, mode: hexPreviewMode === "edit" ? t("hex.editing") : t("hex.viewOnly") })
              : t("empty.noEntrySelected")
          }
          headerIcon={<Eye className="h-5 w-5 text-primary" />}
          headerActions={
            hexPreview ? (
              hexPreviewMode === "view" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-[10px]"
                  onClick={beginHexEdit}
                >
                  <Pencil className="h-3 w-3" />
                  {t("buttons.edit")}
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  {hexEditDirty ? (
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                      {t("status.unsavedShort")}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={cancelHexEdit}
                  >
                    <X className="h-3 w-3" />
                    {t("buttons.cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={saveHexEdit}
                  >
                    <Save className="h-3 w-3" />
                    {t("toolbar.save")}
                  </Button>
                </div>
              )
            ) : null
          }
          dimensions={HEX_PREVIEW_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.arms-param-hex-preview"
          onClose={() => setPreviewOpen(false)}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20 p-4">
            {hexPreview ? (
              hexPreviewMode === "view" ? (
                <div className="overflow-auto rounded-md border bg-[#0d1117] text-[#d6deeb] shadow-inner">
                  <div className="grid select-none grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                    <span>{t("hex.offset")}</span>
                    <span>{t("hex.hex")}</span>
                    <span>{t("hex.ascii")}</span>
                  </div>
                  <div className="max-h-[calc(85vh-12rem)] overflow-auto px-3 font-mono text-[11px] leading-6">
                    {hexPreview.rows.map((row) => (
                      <div
                        key={row.offset}
                        className="grid w-full grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/4"
                      >
                        <div className="select-none text-slate-500">
                          {row.offset}
                        </div>
                        <div className="select-text text-slate-100">
                          {row.hex}
                        </div>
                        <div className="pointer-events-none select-none text-cyan-200/90">
                          {row.ascii}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-[#0d1117] text-[#d6deeb] shadow-inner">
                  <div className="border-b border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                    {t("hex.editHeader", { count: hexPreview.bytes.length })}
                  </div>
                  <textarea
                    value={hexEditDraft}
                    onChange={(event) => setHexEditDraft(event.target.value)}
                    spellCheck={false}
                    className="min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2 font-mono text-[11px] leading-6 text-slate-100 outline-none selection:bg-cyan-500/40 selection:text-white"
                  />
                </div>
              )
            ) : (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                {t("empty.noEntrySelected")}
              </div>
            )}
          </div>
        </AppRndModalShell>
      ) : null}

      {data ? (
        <TypedParamImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          fileType={PARAM_TYPE}
          data={data}
          selectedEntryIndex={selectedIndex}
          onApply={applyImportedEntry}
        />
      ) : null}
    </div>
  );
}
