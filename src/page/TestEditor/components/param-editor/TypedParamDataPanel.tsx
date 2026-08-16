import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { toast } from "sonner"
import { Search, CopyPlus, Eye, Plus, Trash2, Pencil, Save, X, ClipboardCopy, Braces, FileInput, Copy } from "lucide-react"
import { AppRndModalShell } from "@/components/AppRndModalShell"
import { Button } from "@/components/ui/button"
import { formatHash } from "@/models/commandTable"
import { DualValueProperty } from "@/components/ui/dual-value-property"
import { cn } from "@/lib/utils"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import {
  appendEntryEditorMeta,
  applyHexBytesToTypedEntry,
  buildTypedEntryFieldLayout,
  buildTypedEntryHexPreview,
  createBlankTypedParamEntry,
  createCopyAsNewTypedParamEntry,
  createInitialEntryEditorMeta,
  filterTypedParamEntryRows,
  formatHexPreviewEditText,
  isTypedEntryFieldKey,
  markEntryEditorMetaDirty,
  parseHexPreviewEditText,
  readTypedEntryId,
  readTypedEntryLabels,
  removeEntryEditorMetaAt,
  shiftHighlightedEntryIndices,
  type TypedParamEntryEditorMeta,
} from "./paramEntryUtils"
import { ParamEntryListBadges } from "./ParamEntryListBadges"
import { ParamEntryListRow } from "./ParamEntryListRow"
import {
  copyTypedParamEntryJsonToClipboard,
  copyTypedParamFileJsonToClipboard,
} from "./typedParamClipboard"
import { TypedParamImportDialog } from "./TypedParamImportDialog"
import { ProjectileDepictionCopyDialog } from "./ProjectileDepictionCopyDialog"
import { isProjectileDepictionTableFileType } from "./projectileDepictionCopy"
import {
  HitboxParamAnalysisPanel,
  isHitboxParamFileType,
} from "./HitboxParamAnalysisPanel"
import { readObfLabelAtOffset } from "../../utils/mscParamLabelResolver"

/** Baseline estimate; measureElement adjusts when action/resource labels are present. */
const ENTRY_ROW_HEIGHT = 72
const FIELD_ROW_HEIGHT = 104
const FIELDS_PER_ROW = 2
const HEX_PREVIEW_ROW_HEIGHT = 24
const PANEL_SEARCH_CLASS =
  "flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1.5 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-primary/35 focus-within:ring-1 focus-within:ring-primary/15"
const PANEL_SEARCH_INPUT_CLASS =
  "h-5 w-full min-w-0 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground"
const PANEL_TOOLBAR_BUTTON_CLASS =
  "h-7 gap-1 px-2 text-[10px] transition-[background-color,transform,box-shadow] duration-200 hover:bg-muted/60 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30"
const HEX_PREVIEW_MODAL_DIMENSIONS = {
  width: 900,
  height: 700,
  minWidth: 640,
  minHeight: 420,
}

function chunkFieldKeys(keys: string[], columns: number): string[][] {
  if (columns <= 1) {
    return keys.map((key) => [key])
  }
  const rows: string[][] = []
  for (let index = 0; index < keys.length; index += columns) {
    rows.push(keys.slice(index, index + columns))
  }
  return rows
}

function formatFieldOffset(offset: number): string {
  return `0x${offset.toString(16).toUpperCase().padStart(2, "0")}`
}

function ParamFieldCell({
  fieldKey,
  value,
  kind,
  offset,
  onCommit,
}: {
  fieldKey: string
  value: number | string
  kind: number
  offset: number
  onCommit: (nextValue: number | string) => void
}) {
  const isFloat = kind === 5
  const isString = kind === 7 || typeof value === "string"
  const offsetBadge =
    offset !== -1 && !isString ? (
      <span className="shrink-0 rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[9px] tabular-nums tracking-wide text-muted-foreground">
        {formatFieldOffset(offset)}
      </span>
    ) : null
  const kindBadge = isString ? (
    <span className="shrink-0 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
      string
    </span>
  ) : isFloat ? (
    <span className="shrink-0 rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
      f32
    </span>
  ) : (
    <span className="shrink-0 rounded bg-violet-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
      i32
    </span>
  )

  if (isString) {
    const text = typeof value === "string" ? value : ""
    return (
      <div
        className={cn(
          "flex min-h-[5.5rem] flex-col gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-950/[0.06] p-3 shadow-sm",
          "transition-[border-color,box-shadow,background-color] duration-200",
          "hover:border-emerald-500/40 hover:bg-emerald-950/[0.1] focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium text-muted-foreground">{fieldKey}</span>
          <div className="flex items-center gap-1">
            {kindBadge}
            {offsetBadge}
          </div>
        </div>
        <input
          className="h-8 w-full rounded-md border border-border/60 bg-background px-2 font-mono text-[11px] outline-none focus:border-primary/40"
          value={text}
          onChange={(e) => onCommit(e.target.value)}
          placeholder="(empty string)"
        />
      </div>
    )
  }

  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : 0

  return (
    <DualValueProperty
      label={fieldKey}
      labelExtra={
        <div className="flex items-center gap-1">
          {kindBadge}
          {offsetBadge}
        </div>
      }
      value={numericValue}
      property={fieldKey}
      editable={true}
      editingProperty={null}
      editValue={""}
      validationError={""}
      onStartEdit={() => {}}
      onSaveEdit={() => {}}
      onCancelEdit={() => {}}
      onValueChange={() => {}}
      onCommit={(next) => onCommit(next)}
      showHex={true}
      isFloat={isFloat}
      variant="compact"
      mode="live"
      containerClassName={cn(
        "min-h-[5.5rem] rounded-md border-border/45 bg-background/90 p-3 shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-primary/30 hover:bg-background hover:shadow-md focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20",
        isFloat && "border-cyan-500/25 bg-cyan-950/[0.06] hover:bg-cyan-950/[0.1]",
      )}
    />
  )
}

export function TypedParamDataPanel({
  fileType,
  data,
  selectedEntryIndex,
  onSelectEntry,
  onChange,
  workspaceDefaultPath,
  sourceFilePath,
}: {
  fileType: string
  data: TypedParamFile
  selectedEntryIndex: number
  onSelectEntry: (i: number) => void
  onChange: (next: TypedParamFile) => void
  workspaceDefaultPath?: string
  sourceFilePath?: string
}) {
  const [fieldSearch, setFieldSearch] = useState("")
  const [entrySearchDraft, setEntrySearchDraft] = useState("")
  const [entrySearch, setEntrySearch] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [copyEffectOpen, setCopyEffectOpen] = useState(false)
  const [hexPreviewMode, setHexPreviewMode] = useState<"view" | "edit">("view")
  const [hexEditDraft, setHexEditDraft] = useState("")
  const [isEntrySearchPending, startEntrySearchTransition] = useTransition()
  const [entryEditorMeta, setEntryEditorMeta] = useState<TypedParamEntryEditorMeta[]>(() =>
    createInitialEntryEditorMeta(data.entries.length),
  )
  const [highlightedEntryIndices, setHighlightedEntryIndices] = useState<Set<number>>(() => new Set())
  const entry = data.entries[selectedEntryIndex] ?? null
  const entryListRef = useRef<HTMLDivElement | null>(null)
  const fieldListRef = useRef<HTMLDivElement | null>(null)

  const filteredKeys = useMemo(() => {
    if (!entry) return []
    const all = Object.keys(entry)
    if (!fieldSearch.trim()) return all
    const q = fieldSearch.trim().toLowerCase()
    return all.filter((k) => k.toLowerCase().includes(q))
  }, [entry, fieldSearch])

  const filteredEntryRows = useMemo(
    () => filterTypedParamEntryRows(data.entries, entrySearch),
    [data.entries, entrySearch]
  )
  const filteredFieldRows = useMemo(
    () => chunkFieldKeys(filteredKeys, FIELDS_PER_ROW),
    [filteredKeys],
  )
  const getEntryListScrollElement = useCallback(() => entryListRef.current, [])
  const entryVirtualizer = useVirtualizer({
    count: filteredEntryRows.length,
    getScrollElement: getEntryListScrollElement,
    estimateSize: () => ENTRY_ROW_HEIGHT,
    overscan: 12,
  })
  const getFieldListScrollElement = useCallback(() => fieldListRef.current, [])
  const fieldVirtualizer = useVirtualizer({
    count: filteredFieldRows.length,
    getScrollElement: getFieldListScrollElement,
    estimateSize: () => FIELD_ROW_HEIGHT,
    overscan: 10,
  })

  const preview = useMemo(
    () => buildTypedEntryHexPreview(data, selectedEntryIndex),
    [data, selectedEntryIndex]
  )

  useEffect(() => {
    if (!previewOpen) {
      setHexPreviewMode("view")
      setHexEditDraft("")
    }
  }, [previewOpen])

  useEffect(() => {
    setHexPreviewMode("view")
    setHexEditDraft("")
  }, [selectedEntryIndex])

  const hexEditDirty = useMemo(() => {
    if (!preview || hexPreviewMode !== "edit") return false
    return hexEditDraft !== formatHexPreviewEditText(preview.bytes)
  }, [hexEditDraft, hexPreviewMode, preview])

  const beginHexEdit = useCallback(() => {
    if (!preview) return
    setHexEditDraft(formatHexPreviewEditText(preview.bytes))
    setHexPreviewMode("edit")
  }, [preview])

  const cancelHexEdit = useCallback(() => {
    if (!preview) {
      setHexPreviewMode("view")
      setHexEditDraft("")
      return
    }
    setHexEditDraft(formatHexPreviewEditText(preview.bytes))
    setHexPreviewMode("view")
  }, [preview])

  const saveHexEdit = useCallback(() => {
    if (!preview || !entry) return
    const fieldLayout = buildTypedEntryFieldLayout(data, selectedEntryIndex)
    if (!fieldLayout) {
      toast.error("Unable to resolve entry field layout.")
      return
    }
    const parsed = parseHexPreviewEditText(hexEditDraft, preview.bytes.length)
    if (!parsed.ok) {
      toast.error(parsed.error)
      return
    }
    const nextEntry = applyHexBytesToTypedEntry(entry, fieldLayout, parsed.bytes)
    const nextEntries = data.entries.map((item, idx) =>
      idx === selectedEntryIndex ? nextEntry : item,
    )
    const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    setEntryEditorMeta((prev) => markEntryEditorMetaDirty(prev, selectedEntryIndex))
    setHexPreviewMode("view")
    toast.success("Hex preview changes saved to entry fields")
  }, [data, entry, hexEditDraft, onChange, preview, selectedEntryIndex])

  const fieldInfoMap = useMemo(() => {
    if (!entry || !data.fieldSpecs) return {}
    const map: Record<string, { kind: number; offset: number }> = {}
    const keys = Object.keys(entry).filter(isTypedEntryFieldKey)
    // Prefer hash-name alignment for known kind-7 labels; fall back to index for others.
    const LABEL_HASH: Record<string, number> = {
      actionLabel: 0xe6213731,
      resourceLabel: 0xf3c4cae9,
      actionLabelOffset: 0xe6213731,
      resourceLabelOffset: 0xf3c4cae9,
    }
    keys.forEach((key, index) => {
      const value = entry[key]
      const labelHash = LABEL_HASH[key]
      const byHash =
        labelHash != null
          ? data.fieldSpecs.find((spec) => (spec.hash ?? 0) === labelHash)
          : undefined
      const spec = byHash ?? data.fieldSpecs[index]
      const kindFromValue = typeof value === "string" ? 7 : undefined
      map[key] = {
        kind: kindFromValue ?? spec?.kind ?? 1,
        offset: spec?.entryOffset ?? spec?.offset ?? index * 4,
      }
    })
    return map
  }, [entry, data.fieldSpecs])

  /** Rebuild absolute file view so kind-7 numeric offsets can still be decoded client-side. */
  const trailingFileBytes = useMemo(() => {
    const trailing = data.trailingData
    if (!trailing || trailing.length === 0) return null
    const header = data.header ?? {}
    const entryCount = data.entryIds?.length ?? data.entries.length
    const commandsCount = data.fieldSpecs?.length ?? 0
    const entrySize = header.entrySize ?? 0
    const entriesEnd =
      0x20 + commandsCount * 4 + commandsCount * 12 + entryCount * 4 + entryCount * entrySize
    const bytes = new Uint8Array(entriesEnd + trailing.length)
    for (let i = 0; i < trailing.length; i += 1) {
      bytes[entriesEnd + i] = trailing[i] ?? 0
    }
    return bytes
  }, [data.trailingData, data.header, data.entryIds, data.entries.length, data.fieldSpecs])

  const resolveCellDisplayValue = useCallback(
    (key: string, raw: number | string | boolean | null | undefined, kind: number): number | string => {
      if (typeof raw === "string") return raw
      if (kind === 7 && typeof raw === "number" && raw > 0 && trailingFileBytes) {
        return readObfLabelAtOffset(trailingFileBytes, raw) ?? ""
      }
      if (typeof raw === "number" && Number.isFinite(raw)) return raw
      if (typeof raw === "boolean") return raw ? 1 : 0
      return 0
    },
    [trailingFileBytes],
  )

  const appendEntry = (created: TypedParamEntry | null, meta: TypedParamEntryEditorMeta) => {
    if (!created) return
    const nextEntries = [...data.entries, created]
    const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    setEntryEditorMeta((prev) => appendEntryEditorMeta(prev, meta))
    onSelectEntry(nextEntries.length - 1)
  }

  const copyEntryAsNew = () => {
    const sourceEntryId = readTypedEntryId(data.entries[selectedEntryIndex] ?? {}, selectedEntryIndex)
    appendEntry(createCopyAsNewTypedParamEntry(data.entries, selectedEntryIndex), {
      origin: "copied",
      sourceEntryId,
      sourceIndex: selectedEntryIndex,
      isDirty: false,
    })
  }

  const addEntry = () => {
    appendEntry(createBlankTypedParamEntry(data.entries, selectedEntryIndex), {
      origin: "blank",
      isDirty: false,
    })
  }

  const deleteEntry = () => {
    if (!data.entries.length) return
    const nextEntries = data.entries.filter((_, idx) => idx !== selectedEntryIndex)
    const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    setEntryEditorMeta((prev) => removeEntryEditorMetaAt(prev, selectedEntryIndex))
    setHighlightedEntryIndices((prev) => shiftHighlightedEntryIndices(prev, selectedEntryIndex))
    if (!nextEntries.length) {
      onSelectEntry(0)
      return
    }
    const nextIndex = Math.min(selectedEntryIndex, nextEntries.length - 1)
    onSelectEntry(nextIndex)
  }

  const commitEntryFieldChange = (key: string, nextValue: number | string) => {
    const nextEntries = data.entries.map((item, idx) =>
      idx === selectedEntryIndex ? { ...item, [key]: nextValue } : item,
    )
    const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    setEntryEditorMeta((prev) => markEntryEditorMetaDirty(prev, selectedEntryIndex))
  }

  const entryLegendCounts = useMemo(() => {
    return entryEditorMeta.reduce(
      (acc, meta) => {
        if (meta.origin === "copied") acc.copied += 1
        if (meta.origin === "blank") acc.blank += 1
        if (meta.origin === "loaded" && !meta.isDirty) acc.file += 1
        if (meta.isDirty) acc.edited += 1
        return acc
      },
      { file: 0, copied: 0, blank: 0, edited: 0, highlighted: highlightedEntryIndices.size },
    )
  }, [entryEditorMeta, highlightedEntryIndices])

  const toggleEntryHighlight = useCallback((index: number) => {
    setHighlightedEntryIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const copySelectedEntryJson = useCallback(() => {
    void copyTypedParamEntryJsonToClipboard(fileType, data, selectedEntryIndex)
  }, [data, fileType, selectedEntryIndex])

  const copyFullViewJson = useCallback(() => {
    void copyTypedParamFileJsonToClipboard(fileType, data)
  }, [data, fileType])

  const applyImportedEntry = useCallback(
    (nextEntry: TypedParamEntry) => {
      const nextEntries = data.entries.map((item, idx) => (idx === selectedEntryIndex ? nextEntry : item))
      const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
      onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
      setEntryEditorMeta((prev) => markEntryEditorMetaDirty(prev, selectedEntryIndex))
    },
    [data, onChange, selectedEntryIndex],
  )

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="space-y-2.5 border-b bg-muted/20 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-tight">Entries</h3>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              {entrySearch.trim() ? `${filteredEntryRows.length} / ${data.entries.length}` : `${data.entries.length} rows`}
              {isEntrySearchPending ? " ..." : ""}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
            {entryLegendCounts.file > 0 ? (
              <span className="rounded border border-border/60 bg-muted/30 px-1 py-0.5">File {entryLegendCounts.file}</span>
            ) : null}
            {entryLegendCounts.copied > 0 ? (
              <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1 py-0.5 text-sky-700 dark:text-sky-300">
                Copy {entryLegendCounts.copied}
              </span>
            ) : null}
            {entryLegendCounts.blank > 0 ? (
              <span className="rounded border border-emerald-500/25 bg-emerald-500/10 px-1 py-0.5 text-emerald-700 dark:text-emerald-300">
                New {entryLegendCounts.blank}
              </span>
            ) : null}
            {entryLegendCounts.edited > 0 ? (
              <span className="rounded border border-amber-500/25 bg-amber-500/10 px-1 py-0.5 text-amber-800 dark:text-amber-300">
                Edited {entryLegendCounts.edited}
              </span>
            ) : null}
            {entryLegendCounts.highlighted > 0 ? (
              <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1 py-0.5 text-amber-700 dark:text-amber-200">
                Highlight {entryLegendCounts.highlighted}
              </span>
            ) : null}
          </div>
          <div className={PANEL_SEARCH_CLASS}>
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              value={entrySearchDraft}
              onChange={(e) => {
                const next = e.target.value
                setEntrySearchDraft(next)
                startEntrySearchTransition(() => setEntrySearch(next))
              }}
              placeholder="Search id / field / value..."
              className={cn(PANEL_SEARCH_INPUT_CLASS, "font-mono tabular-nums")}
            />
          </div>
        </div>
        <div ref={entryListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {filteredEntryRows.length === 0 ? (
            <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
              No entries match the search.
            </div>
          ) : (
            <div className="relative w-full" style={{ height: entryVirtualizer.getTotalSize() }}>
              {entryVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = filteredEntryRows[virtualRow.index]
                if (!row) return null
                const { index: i, entryId: id, entry: listEntry } = row
                const meta = entryEditorMeta[i]
                const isSelected = selectedEntryIndex === i
                const isHighlighted = highlightedEntryIndices.has(i)
                const { actionLabel, resourceLabel } = readTypedEntryLabels(
                  listEntry,
                  trailingFileBytes,
                )
                return (
                  <ParamEntryListRow
                    key={`${i}-${id}`}
                    entryIndex={i}
                    entryId={id}
                    actionLabel={actionLabel}
                    resourceLabel={resourceLabel}
                    meta={meta}
                    isSelected={isSelected}
                    isHighlighted={isHighlighted}
                    onSelect={() => onSelectEntry(i)}
                    onToggleHighlight={() => toggleEntryHighlight(i)}
                    measureRef={entryVirtualizer.measureElement}
                    dataIndex={virtualRow.index}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="space-y-2.5 border-b bg-muted/20 px-3 py-2.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-xs font-semibold tracking-tight text-foreground">{fileType} typed entry</h3>
            {entry ? (
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {formatHash(readTypedEntryId(entry, selectedEntryIndex))} · {Object.keys(entry).length} fields
                </span>
                <ParamEntryListBadges meta={entryEditorMeta[selectedEntryIndex]} />
              </span>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-stretch xl:gap-3">
            <div className={cn(PANEL_SEARCH_CLASS, "xl:max-w-xs")}>
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Filter field…"
                className={PANEL_SEARCH_INPUT_CLASS}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div
                className="flex flex-wrap items-center gap-1 rounded-md border border-border/50 bg-background/70 p-0.5"
                role="group"
                aria-label="Import and export"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={PANEL_TOOLBAR_BUTTON_CLASS}
                  disabled={!entry}
                  title="Import hex bytes or entry JSON"
                  onClick={() => setImportOpen(true)}
                >
                  <FileInput className="h-3 w-3" />
                  Import
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={PANEL_TOOLBAR_BUTTON_CLASS}
                  disabled={!entry}
                  title="Copy selected entry as JSON"
                  onClick={copySelectedEntryJson}
                >
                  <ClipboardCopy className="h-3 w-3" />
                  Entry JSON
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={PANEL_TOOLBAR_BUTTON_CLASS}
                  disabled={!data.entries.length}
                  title="Copy full view data as JSON"
                  onClick={copyFullViewJson}
                >
                  <Braces className="h-3 w-3" />
                  All JSON
                </Button>
              </div>
              <div
                className="flex flex-wrap items-center gap-1 rounded-md border border-border/50 bg-background/70 p-0.5"
                role="group"
                aria-label="Entry tools"
              >
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={PANEL_TOOLBAR_BUTTON_CLASS}
                  disabled={!entry}
                  title="Hex preview"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="h-3 w-3" />
                  Hex
                </Button>
                {isProjectileDepictionTableFileType(fileType) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={PANEL_TOOLBAR_BUTTON_CLASS}
                    disabled={!entry}
                    title="Copy this entry's effect hashes into another effect pack"
                    onClick={() => setCopyEffectOpen(true)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy Effect
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={PANEL_TOOLBAR_BUTTON_CLASS}
                  onClick={copyEntryAsNew}
                >
                  <CopyPlus className="h-3 w-3" />
                  Duplicate
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={PANEL_TOOLBAR_BUTTON_CLASS}
                  onClick={addEntry}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    PANEL_TOOLBAR_BUTTON_CLASS,
                    "text-destructive hover:bg-destructive/10 hover:text-destructive",
                  )}
                  disabled={!data.entries.length}
                  onClick={deleteEntry}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </div>
        {entry && isHitboxParamFileType(fileType) ? (
          <div className="max-h-[48%] shrink-0 overflow-y-auto border-b bg-muted/5 px-3 py-3">
            <HitboxParamAnalysisPanel
              key={fileType}
              fileType={fileType}
              data={data}
              selectedEntryIndex={selectedEntryIndex}
              workspaceDefaultPath={workspaceDefaultPath}
            />
          </div>
        ) : null}
        <div
          ref={fieldListRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_55%)] px-4 py-3 pr-3 dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_55%)]"
        >
          {!entry ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No entry selected</div>
          ) : filteredFieldRows.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No fields match the filter.</div>
          ) : (
            <div className="relative w-full" style={{ height: fieldVirtualizer.getTotalSize() }}>
              {fieldVirtualizer.getVirtualItems().map((virtualRow) => {
                const rowKeys = filteredFieldRows[virtualRow.index]
                if (!rowKeys?.length) return null

                return (
                  <div
                    key={`field-row-${virtualRow.index}-${rowKeys.join("-")}`}
                    ref={fieldVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={cn(
                      "absolute left-0 top-0 w-full pb-4",
                      virtualRow.index % 2 === 1 && "rounded-md bg-muted/10",
                    )}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {rowKeys.map((key) => {
                        const value = entry[key]
                        const info = fieldInfoMap[key]
                        const kind = info?.kind || 1
                        const offset = info?.offset ?? -1
                        const cellValue = resolveCellDisplayValue(key, value, kind)

                        return (
                          <ParamFieldCell
                            key={key}
                            fieldKey={key}
                            value={cellValue}
                            kind={kind}
                            offset={offset}
                            onCommit={(nextValue) => commitEntryFieldChange(key, nextValue)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {previewOpen ? (
        <AppRndModalShell
          titleId="typed-param-hex-preview-title"
          title="Hex Preview"
          subtitle={
            preview
              ? `${formatHash(preview.entryId)} · ${preview.bytes.length} bytes · little-endian row data${
                  hexPreviewMode === "edit" ? " · editing" : " · view only"
                }`
              : "No entry selected"
          }
          headerIcon={<Eye className="h-5 w-5 text-primary" />}
          headerActions={
            preview ? (
              hexPreviewMode === "view" ? (
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={beginHexEdit}>
                  <Pencil className="h-3 w-3" />
                  Edit
                </Button>
              ) : (
                <div className="flex items-center gap-1.5">
                  {hexEditDirty ? (
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-200">
                      Unsaved
                    </span>
                  ) : null}
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={cancelHexEdit}>
                    <X className="h-3 w-3" />
                    Cancel
                  </Button>
                  <Button type="button" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={saveHexEdit}>
                    <Save className="h-3 w-3" />
                    Save
                  </Button>
                </div>
              )
            ) : null
          }
          dimensions={HEX_PREVIEW_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.typed-param-hex-preview"
          onClose={() => setPreviewOpen(false)}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20 p-4">
            {preview ? (
              hexPreviewMode === "view" ? (
                <HexPreviewRows rows={preview.rows} />
              ) : (
                <HexPreviewEditor draft={hexEditDraft} onDraftChange={setHexEditDraft} byteCount={preview.bytes.length} />
              )
            ) : (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">No entry selected</div>
            )}
          </div>
        </AppRndModalShell>
      ) : null}
      <TypedParamImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        fileType={fileType}
        data={data}
        selectedEntryIndex={selectedEntryIndex}
        onApply={applyImportedEntry}
      />
      {isProjectileDepictionTableFileType(fileType) ? (
        <ProjectileDepictionCopyDialog
          open={copyEffectOpen}
          onOpenChange={setCopyEffectOpen}
          data={data}
          selectedEntryIndex={selectedEntryIndex}
          sourceFilePath={sourceFilePath}
          workspaceDefaultPath={workspaceDefaultPath}
          onApplyToCurrentFile={onChange}
        />
      ) : null}
    </div>
  )
}

function sanitizeHexSelectionText(text: string): string {
  const bytes = text.match(/[0-9A-Fa-f]{2}/g)
  return bytes ? bytes.join(" ") : ""
}

function HexPreviewEditor({
  draft,
  onDraftChange,
  byteCount,
}: {
  draft: string
  onDraftChange: (next: string) => void
  byteCount: number
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-[#0d1117] text-[#d6deeb] shadow-inner">
      <div className="border-b border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
        Edit hex bytes · {byteCount} bytes · 16 bytes per line
      </div>
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        spellCheck={false}
        className="min-h-0 flex-1 resize-none border-0 bg-transparent px-3 py-2 font-mono text-[11px] leading-6 text-slate-100 outline-none selection:bg-cyan-500/40 selection:text-white"
      />
    </div>
  )
}

function HexPreviewRows({ rows }: { rows: Array<{ offset: string; hex: string; ascii: string }> }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const getScrollElement = useCallback(() => scrollRef.current, [])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize: () => HEX_PREVIEW_ROW_HEIGHT,
    overscan: 20,
  })

  const handleCopy = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const raw = selection.toString()
    if (!raw.trim()) return
    const sanitized = sanitizeHexSelectionText(raw)
    event.preventDefault()
    event.clipboardData.setData("text/plain", sanitized)
  }, [])

  return (
    <div className="overflow-hidden rounded-md border bg-[#0d1117] text-[#d6deeb] shadow-inner">
      <div className="grid select-none grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
        <span>Offset</span>
        <span>Hex</span>
        <span>Ascii</span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[calc(85vh-12rem)] overflow-auto px-3 font-mono text-[11px] leading-6"
        onCopy={handleCopy}
      >
        <div className="relative min-w-[42rem]" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            return (
              <div
                key={`${row.offset}-${virtualRow.index}`}
                className="absolute left-0 top-0 grid w-full grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/4"
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="select-none text-slate-500">{row.offset}</div>
                <div className="select-text text-slate-100 hover:bg-cyan-400/10 selection:bg-cyan-500/40 selection:text-white">
                  {row.hex}
                </div>
                <div className="pointer-events-none select-none text-cyan-200/90">{row.ascii}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
