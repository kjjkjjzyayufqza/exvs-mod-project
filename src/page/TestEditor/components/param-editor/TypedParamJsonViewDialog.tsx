import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager"
import JsonView from "@uiw/react-json-view"
import { vscodeTheme } from "@uiw/react-json-view/vscode"
import { Braces, ClipboardCopy, ClipboardPaste, CopyPlus, Pencil, Save, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { AppRndModalShell } from "@/components/AppRndModalShell"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatHash } from "@/models/commandTable"
import { formatTypedParamEntryJson } from "./typedParamClipboard"
import {
  applyTypedParamEntryJson,
  cloneTypedParamEntryFromJson,
  previewTypedParamImport,
} from "./typedParamImport"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import { readTypedEntryId } from "./paramEntryUtils"

const JSON_VIEW_TITLE_ID = "typed-param-json-view-title"

const JSON_VIEW_MODAL_DIMENSIONS = {
  width: 820,
  height: 640,
  minWidth: 560,
  minHeight: 420,
}

const TOOLBAR_BUTTON_CLASS =
  "h-7 gap-1 px-2 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]"

type TypedParamJsonViewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileType: string
  data: TypedParamFile
  selectedEntryIndex: number
  onApply: (entry: TypedParamEntry) => void
  onClone: (entry: TypedParamEntry) => void
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export function TypedParamJsonViewDialog({
  open,
  onOpenChange,
  fileType,
  data,
  selectedEntryIndex,
  onApply,
  onClone,
}: TypedParamJsonViewDialogProps) {
  const { t } = useTranslation("test-typed-param")
  const [mode, setMode] = useState<"view" | "edit">("view")
  const [draft, setDraft] = useState("")
  const [originalDraft, setOriginalDraft] = useState("")
  const dataRef = useRef(data)
  dataRef.current = data

  const entry = data.entries[selectedEntryIndex] ?? null
  const entryId = entry ? readTypedEntryId(entry, selectedEntryIndex) : 0

  useEffect(() => {
    if (!open) {
      setMode("view")
      setDraft("")
      setOriginalDraft("")
      return
    }
    const text = formatTypedParamEntryJson(fileType, dataRef.current, selectedEntryIndex) ?? ""
    setDraft(text)
    setOriginalDraft(text)
    setMode("view")
  }, [fileType, open, selectedEntryIndex])

  const parsedObject = useMemo(() => parseJsonObject(draft), [draft])
  const preview = useMemo(
    () => previewTypedParamImport(draft, fileType, data, selectedEntryIndex),
    [data, draft, fileType, selectedEntryIndex],
  )
  const jsonReady = preview.ok && preview.format === "entry-json"
  const dirty = draft !== originalDraft

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await readText()
      if (!text?.trim()) {
        toast.error(t("jsonView.toast.pasteEmpty"))
        return
      }
      setDraft(text)
      setMode("edit")
    } catch {
      toast.error(t("jsonView.toast.pasteFailed"))
    }
  }, [t])

  const copyDraft = useCallback(async () => {
    if (!draft.trim()) {
      toast.error(t("empty.noEntrySelected"))
      return
    }
    try {
      await writeText(draft)
      toast.success(t("jsonView.toast.copied"))
    } catch {
      toast.error(t("jsonView.toast.copyFailed"))
    }
  }, [draft, t])

  const formatDraft = useCallback(() => {
    const parsed = parseJsonObject(draft)
    if (!parsed) {
      toast.error(t("jsonView.toast.invalid"))
      return
    }
    setDraft(JSON.stringify(parsed, null, 2))
  }, [draft, t])

  const cancelEdit = useCallback(() => {
    setDraft(originalDraft)
    setMode("view")
  }, [originalDraft])

  const handleApply = useCallback(() => {
    const result = applyTypedParamEntryJson(draft, fileType, data, selectedEntryIndex)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onApply(result.entry)
    onOpenChange(false)
    toast.success(t("jsonView.toast.applied"))
  }, [data, draft, fileType, onApply, onOpenChange, selectedEntryIndex, t])

  const handleClone = useCallback(() => {
    const result = cloneTypedParamEntryFromJson(draft, fileType, data, selectedEntryIndex)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onClone(result.entry)
    onOpenChange(false)
    toast.success(t("jsonView.toast.cloned"))
  }, [data, draft, fileType, onClone, onOpenChange, selectedEntryIndex, t])

  if (!open) {
    return null
  }

  const statusLine = !draft.trim() ? (
    <span className="text-[11px] text-muted-foreground">{t("empty.noEntrySelected")}</span>
  ) : jsonReady ? (
    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
      {t("jsonView.ready")}
      {preview.fieldCount !== undefined ? ` · ${t("list.fields", { count: preview.fieldCount })}` : ""}
    </span>
  ) : preview.error ? (
    <span className="text-[11px] text-destructive">{preview.error}</span>
  ) : (
    <span className="text-[11px] text-destructive">{t("jsonView.toast.invalid")}</span>
  )

  return (
    <AppRndModalShell
      titleId={JSON_VIEW_TITLE_ID}
      title={t("jsonView.title")}
      subtitle={
        entry
          ? `${formatHash(entryId)} · ${t("jsonView.subtitle")} · ${
              mode === "edit" ? t("jsonView.editing") : t("jsonView.viewOnly")
            }`
          : t("empty.noEntrySelected")
      }
      headerIcon={<Braces className="h-5 w-5 text-primary" />}
      headerActions={
        <div className="flex flex-wrap items-center gap-1.5">
          {dirty ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
              {t("status.unsaved")}
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
            {t("jsonView.paste")}
          </Button>
          {mode === "view" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={TOOLBAR_BUTTON_CLASS}
              disabled={!entry}
              onClick={() => setMode("edit")}
            >
              <Pencil className="h-3 w-3" />
              {t("buttons.edit")}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={TOOLBAR_BUTTON_CLASS}
                onClick={formatDraft}
              >
                {t("jsonView.format")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={TOOLBAR_BUTTON_CLASS}
                onClick={cancelEdit}
              >
                <X className="h-3 w-3" />
                {t("buttons.cancel")}
              </Button>
            </>
          )}
        </div>
      }
      dimensions={JSON_VIEW_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.typed-param-json-view"
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
            {t("jsonView.copy")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-[10px] transition-[background-color,transform] duration-200 hover:bg-muted/60 active:scale-[0.98]"
              disabled={!jsonReady}
              onClick={handleClone}
            >
              <CopyPlus className="h-3 w-3" />
              {t("jsonView.clone")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-[10px] transition-[background-color,transform] duration-200 active:scale-[0.98]"
              disabled={!jsonReady}
              onClick={handleApply}
            >
              <Save className="h-3 w-3" />
              {t("jsonView.apply")}
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
            {t("jsonView.badge")}
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
            aria-label={t("jsonView.editAria")}
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
              collapsed={false}
              enableClipboard={false}
              shortenTextAfterLength={0}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
            {t("jsonView.toast.invalid")}
          </div>
        )}
      </div>
    </AppRndModalShell>
  )
}
