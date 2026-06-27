import { useCallback, useEffect, useMemo, useState } from "react"
import { readText } from "@tauri-apps/plugin-clipboard-manager"
import { ClipboardPaste, FileInput } from "lucide-react"
import { toast } from "sonner"
import { AppRndModalShell } from "@/components/AppRndModalShell"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import { applyTypedParamImport, previewTypedParamImport } from "./typedParamImport"

const IMPORT_MODAL_TITLE_ID = "typed-param-import-title"

const IMPORT_MODAL_DIMENSIONS = {
  width: 720,
  height: 520,
  minWidth: 520,
  minHeight: 420,
}

const FORMAT_LABELS = {
  hex: "Hex bytes",
  "entry-json": "Entry JSON",
  unknown: "Unknown",
} as const

type TypedParamImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileType: string
  data: TypedParamFile
  selectedEntryIndex: number
  onApply: (entry: TypedParamEntry) => void
}

export function TypedParamImportDialog({
  open,
  onOpenChange,
  fileType,
  data,
  selectedEntryIndex,
  onApply,
}: TypedParamImportDialogProps) {
  const [draft, setDraft] = useState("")

  useEffect(() => {
    if (!open) {
      setDraft("")
    }
  }, [open])

  const preview = useMemo(
    () => previewTypedParamImport(draft, fileType, data, selectedEntryIndex),
    [data, draft, fileType, selectedEntryIndex],
  )

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await readText()
      if (!text?.trim()) {
        toast.error("Clipboard is empty")
        return
      }
      setDraft(text)
    } catch {
      toast.error("Failed to read clipboard")
    }
  }, [])

  const handleApply = useCallback(() => {
    const result = applyTypedParamImport(draft, fileType, data, selectedEntryIndex)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    onApply(result.entry)
    onOpenChange(false)
    toast.success(
      result.format === "hex" ? "Imported hex bytes into selected entry" : "Imported entry JSON into selected entry",
    )
  }, [data, draft, fileType, onApply, onOpenChange, selectedEntryIndex])

  if (!open) {
    return null
  }

  const statusLine = preview.idle ? (
    <span className="text-[11px] text-muted-foreground">Paste hex bytes or entry JSON to begin validation.</span>
  ) : preview.ok ? (
    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
      Ready to import
      {preview.byteCount !== undefined ? ` · ${preview.byteCount} bytes` : ""}
      {preview.fieldCount !== undefined ? ` · ${preview.fieldCount} fields` : ""}
    </span>
  ) : preview.error ? (
    <span className="text-[11px] text-destructive">{preview.error}</span>
  ) : null

  return (
    <AppRndModalShell
      titleId={IMPORT_MODAL_TITLE_ID}
      title="Import entry data"
      subtitle='Paste hex from hex preview, or a single "Entry JSON" payload. Full file JSON is not supported.'
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
          Paste clipboard
        </Button>
      }
      dimensions={IMPORT_MODAL_DIMENSIONS}
      storageKey="app.rnd-size.typed-param-import"
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
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-[10px] transition-[background-color,transform] duration-200 active:scale-[0.98]"
            disabled={!preview.ok}
            onClick={handleApply}
          >
            Apply import
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
                preview.format === "entry-json" &&
                  "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
                preview.format === "unknown" && "border-border/60 bg-muted/40 text-muted-foreground",
              )}
            >
              {FORMAT_LABELS[preview.format]}
            </span>
          ) : (
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Awaiting paste
            </span>
          )}
          {statusLine}
        </div>

        {preview.warning ? <p className="text-[11px] text-amber-700 dark:text-amber-300">{preview.warning}</p> : null}

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Hex example:\n78 56 34 12 FE FF FF FF\n\nEntry JSON example:\n{\n  "fileType": "${fileType}",\n  "index": 0,\n  "entryId": 305419896,\n  "entry": { ... }\n}`}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-md border border-border/60 bg-background px-3 py-2 font-mono text-xs leading-relaxed text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/35 focus:ring-1 focus:ring-primary/15"
        />
      </div>
    </AppRndModalShell>
  )
}
