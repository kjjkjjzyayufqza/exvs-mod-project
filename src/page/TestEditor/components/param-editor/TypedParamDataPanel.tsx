import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search, CopyPlus, Eye, Plus, Trash2 } from "lucide-react"
import { AppRndModalShell } from "@/components/AppRndModalShell"
import { Button } from "@/components/ui/button"
import { formatHash } from "@/models/commandTable"
import { DualValueProperty } from "@/components/ui/dual-value-property"
import { cn } from "@/lib/utils"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import {
  appendEntryEditorMeta,
  buildTypedEntryHexPreview,
  createBlankTypedParamEntry,
  createCopyAsNewTypedParamEntry,
  createInitialEntryEditorMeta,
  filterTypedParamEntryRows,
  markEntryEditorMetaDirty,
  readTypedEntryId,
  removeEntryEditorMetaAt,
  shiftHighlightedEntryIndices,
  type TypedParamEntryEditorMeta,
} from "./paramEntryUtils"
import { ParamEntryListBadges } from "./ParamEntryListBadges"
import { ParamEntryListRow } from "./ParamEntryListRow"

const ENTRY_ROW_HEIGHT = 56
const FIELD_ROW_HEIGHT = 94
const FIELDS_PER_ROW = 2
const HEX_PREVIEW_ROW_HEIGHT = 24
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
  value: number
  kind: number
  offset: number
  onCommit: (nextValue: number) => void
}) {
  const isFloat = kind === 5
  const offsetBadge =
    offset !== -1 ? (
      <span className="shrink-0 rounded border border-border/50 bg-muted/50 px-1 py-0.5 font-mono text-[9px] tabular-nums tracking-wide text-muted-foreground">
        {formatFieldOffset(offset)}
      </span>
    ) : null
  const kindBadge = isFloat ? (
    <span className="shrink-0 rounded bg-cyan-500/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
      f32
    </span>
  ) : (
    <span className="shrink-0 rounded bg-violet-500/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
      i32
    </span>
  )

  return (
    <DualValueProperty
      label={fieldKey}
      labelExtra={
        <div className="flex items-center gap-1">
          {kindBadge}
          {offsetBadge}
        </div>
      }
      value={value}
      property={fieldKey}
      editable={true}
      editingProperty={null}
      editValue={""}
      validationError={""}
      onStartEdit={() => {}}
      onSaveEdit={() => {}}
      onCancelEdit={() => {}}
      onValueChange={() => {}}
      onCommit={onCommit}
      showHex={true}
      isFloat={isFloat}
      variant="compact"
      mode="live"
      containerClassName={cn(
        "min-h-[5.25rem] border-border/45 bg-background/90 p-2.5 shadow-sm transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-primary/30 hover:bg-background hover:shadow-md focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20",
        isFloat && "border-cyan-500/20 bg-cyan-950/[0.07] hover:bg-cyan-950/[0.12]",
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
}: {
  fileType: string
  data: TypedParamFile
  selectedEntryIndex: number
  onSelectEntry: (i: number) => void
  onChange: (next: TypedParamFile) => void
}) {
  const [fieldSearch, setFieldSearch] = useState("")
  const [entrySearchDraft, setEntrySearchDraft] = useState("")
  const [entrySearch, setEntrySearch] = useState("")
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activePreviewSelection, setActivePreviewSelection] = useState<"hex" | "ascii" | null>(null)
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
    if (!activePreviewSelection) return
    const clearSelectionMode = () => setActivePreviewSelection(null)
    window.addEventListener("mouseup", clearSelectionMode)
    window.addEventListener("blur", clearSelectionMode)
    return () => {
      window.removeEventListener("mouseup", clearSelectionMode)
      window.removeEventListener("blur", clearSelectionMode)
    }
  }, [activePreviewSelection])

  const fieldInfoMap = useMemo(() => {
    if (!entry || !data.fieldSpecs) return {}
    const map: Record<string, { kind: number; offset: number }> = {}
    const keys = Object.keys(entry).filter((k) => k !== "entryId" && !k.endsWith("Size"))
    keys.forEach((key, index) => {
      const spec = data.fieldSpecs[index]
      if (spec) {
        map[key] = {
          kind: spec.kind ?? 1,
          offset: spec.entryOffset ?? spec.offset ?? 0,
        }
      }
    })
    return map
  }, [entry, data.fieldSpecs])

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

  const commitEntryFieldChange = (key: string, nextValue: number) => {
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

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="space-y-2 border-b bg-muted/20 px-3 py-2">
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
          <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              value={entrySearchDraft}
              onChange={(e) => {
                const next = e.target.value
                setEntrySearchDraft(next)
                startEntrySearchTransition(() => setEntrySearch(next))
              }}
              placeholder="Search id / field / value..."
              className="h-4 w-full bg-transparent font-mono text-[10px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div ref={entryListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filteredEntryRows.length === 0 ? (
            <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
              No entries match the search.
            </div>
          ) : (
            <div className="relative w-full" style={{ height: entryVirtualizer.getTotalSize() }}>
              {entryVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = filteredEntryRows[virtualRow.index]
                if (!row) return null
                const { index: i, entryId: id } = row
                const meta = entryEditorMeta[i]
                const isSelected = selectedEntryIndex === i
                const isHighlighted = highlightedEntryIndices.has(i)
                return (
                  <ParamEntryListRow
                    key={`${i}-${id}`}
                    entryIndex={i}
                    entryId={id}
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold">{fileType} typed entry</h3>
            {entry && (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {formatHash(readTypedEntryId(entry, selectedEntryIndex))} · {Object.keys(entry).length} fields
                </span>
                <ParamEntryListBadges meta={entryEditorMeta[selectedEntryIndex]} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="Filter field…"
                className="h-4 w-32 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[10px]"
              disabled={!entry}
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-3 w-3" />
              Hex Preview
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={copyEntryAsNew}>
              <CopyPlus className="h-3 w-3" />
              Copy as New
            </Button>
            <Button type="button" size="sm" variant="secondary" className="h-7 gap-1 px-2 text-[10px]" onClick={addEntry}>
              <Plus className="h-3 w-3" />
              Add New
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={!data.entries.length}
              onClick={deleteEntry}
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>
        <div ref={fieldListRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_55%)] p-4 dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.03),transparent_55%)]">
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
                      "absolute left-0 top-0 w-full pb-3",
                      virtualRow.index % 2 === 1 && "rounded-md bg-muted/10",
                    )}
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {rowKeys.map((key) => {
                        const value = entry[key]
                        const current = value === undefined ? null : value
                        const info = fieldInfoMap[key]
                        const kind = info?.kind || 1
                        const offset = info?.offset ?? -1

                        return (
                          <ParamFieldCell
                            key={key}
                            fieldKey={key}
                            value={typeof current === "number" ? current : 0}
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
              ? `${formatHash(preview.entryId)} · ${preview.bytes.length} bytes · little-endian row data`
              : "No entry selected"
          }
          headerIcon={<Eye className="h-5 w-5 text-primary" />}
          dimensions={HEX_PREVIEW_MODAL_DIMENSIONS}
          storageKey="app.rnd-size.typed-param-hex-preview"
          onClose={() => setPreviewOpen(false)}
        >
          <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4">
            {preview ? (
              <HexPreviewRows
                rows={preview.rows}
                activePreviewSelection={activePreviewSelection}
                onPreviewSelectionChange={setActivePreviewSelection}
              />
            ) : (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">No entry selected</div>
            )}
          </div>
        </AppRndModalShell>
      ) : null}
    </div>
  )
}

function HexPreviewRows({
  rows,
  activePreviewSelection,
  onPreviewSelectionChange,
}: {
  rows: Array<{ offset: string; hex: string; ascii: string }>
  activePreviewSelection: "hex" | "ascii" | null
  onPreviewSelectionChange: (next: "hex" | "ascii") => void
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const getScrollElement = useCallback(() => scrollRef.current, [])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement,
    estimateSize: () => HEX_PREVIEW_ROW_HEIGHT,
    overscan: 20,
  })

  return (
    <div className="overflow-hidden rounded-md border bg-[#0d1117] text-[#d6deeb] shadow-inner">
      <div className="grid select-none grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
        <span>Offset</span>
        <span>Hex</span>
        <span>Ascii</span>
      </div>
      <div ref={scrollRef} className="max-h-[calc(85vh-12rem)] overflow-auto px-3 font-mono text-[11px] leading-6">
        <div className="relative min-w-[42rem]" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            if (!row) return null
            return (
              <div
                key={`${row.offset}-${virtualRow.index}`}
                className="absolute left-0 top-0 grid w-full grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/4 hover:bg-cyan-400/10"
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="select-none text-slate-500">{row.offset}</div>
                <div
                  className={`${activePreviewSelection === "ascii" ? "select-none" : "select-text"} text-slate-100`}
                  onMouseDown={() => onPreviewSelectionChange("hex")}
                >
                  {row.hex}
                </div>
                <div
                  className={`${activePreviewSelection === "hex" ? "select-none" : "select-text"} text-cyan-200/90`}
                  onMouseDown={() => onPreviewSelectionChange("ascii")}
                >
                  {row.ascii}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
