import { useEffect, useMemo, useState, useTransition } from "react"
import { Search, CopyPlus, Eye, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatHash } from "@/models/commandTable"
import { DualValueProperty } from "@/components/ui/dual-value-property"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"
import {
  buildTypedEntryHexPreview,
  createBlankTypedParamEntry,
  createCopyAsNewTypedParamEntry,
  filterTypedParamEntryRows,
  readTypedEntryId,
} from "./paramEntryUtils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  const entry = data.entries[selectedEntryIndex] ?? null

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

  const appendEntry = (created: TypedParamEntry | null) => {
    if (!created) return
    const nextEntries = [...data.entries, created]
    const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    onSelectEntry(nextEntries.length - 1)
  }

  const copyEntryAsNew = () => {
    appendEntry(createCopyAsNewTypedParamEntry(data.entries, selectedEntryIndex))
  }

  const addEntry = () => {
    appendEntry(createBlankTypedParamEntry(data.entries, selectedEntryIndex))
  }

  const deleteEntry = () => {
    if (!data.entries.length) return
    const nextEntries = data.entries.filter((_, idx) => idx !== selectedEntryIndex)
    const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    if (!nextEntries.length) {
      onSelectEntry(0)
      return
    }
    const nextIndex = Math.min(selectedEntryIndex, nextEntries.length - 1)
    onSelectEntry(nextIndex)
  }

  return (
    <div className="grid h-full min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="space-y-2 border-b bg-muted/20 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold">Entries</h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              {entrySearch.trim() ? `${filteredEntryRows.length} / ${data.entries.length}` : `${data.entries.length} rows`}
              {isEntrySearchPending ? " ..." : ""}
            </span>
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filteredEntryRows.length === 0 ? (
            <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
              No entries match the search.
            </div>
          ) : filteredEntryRows.map(({ entry: e, index: i, entryId: id }) => {
            return (
              <button
                key={`${i}-${id}`}
                type="button"
                className={`flex w-full flex-col border-b border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 ${
                  selectedEntryIndex === i ? "bg-primary/10 border-l-2 border-l-primary" : "border-l-2 border-l-transparent"
                }`}
                onClick={() => onSelectEntry(i)}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate font-mono font-medium">{formatHash(id)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">#{i}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold">{fileType} typed entry</h3>
            {entry && (
              <span className="rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {formatHash(readTypedEntryId(entry, selectedEntryIndex))} · {Object.keys(entry).length} fields
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/5 p-4">
          {!entry ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No entry selected</div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredKeys.map((key) => {
                const value = entry[key]
                const current = value === undefined ? null : value
                const info = fieldInfoMap[key]
                const kind = info?.kind || 1
                const offset = info?.offset ?? -1
                const isFloat = kind === 5

                const offsetLabel = offset !== -1 ? ` (0x${offset.toString(16).toUpperCase()})` : ""

                return (
                  <DualValueProperty
                    key={key}
                    label={`${key}${offsetLabel}`}
                    value={typeof current === "number" ? current : 0}
                    property={key}
                    editable={true}
                    editingProperty={null}
                    editValue={""}
                    validationError={""}
                    onStartEdit={() => {}}
                    onSaveEdit={() => {}}
                    onCancelEdit={() => {}}
                    onValueChange={() => {}}
                    onCommit={(nextValue) => {
                      const nextEntries = data.entries.map((item, idx) =>
                        idx === selectedEntryIndex ? { ...item, [key]: nextValue } : item
                      )
                      const nextEntryIds = nextEntries.map((item, idx) => readTypedEntryId(item, idx))
                      onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
                    }}
                    showHex={true}
                    isFloat={isFloat}
                    variant="compact"
                    mode="live"
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="grid max-h-[85vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Hex Preview
            </DialogTitle>
            <DialogDescription>
              {preview
                ? `${formatHash(preview.entryId)} · ${preview.bytes.length} bytes · little-endian row data`
                : "No entry selected"}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto bg-muted/20 p-4">
            {preview ? (
              <div className="overflow-hidden rounded-md border bg-[#0d1117] text-[#d6deeb] shadow-inner">
                <div className="grid select-none grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] border-b border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-slate-400">
                  <span>Offset</span>
                  <span>Hex</span>
                  <span>Ascii</span>
                </div>
                <div className="grid grid-cols-[6.5rem_minmax(24rem,1fr)_minmax(8rem,0.35fr)] px-3 font-mono text-[11px] leading-6">
                  <div className="select-none text-slate-500">
                    {preview.rows.map((row) => (
                      <div key={`${row.offset}-offset`} className="border-b border-white/4 last:border-0">
                        {row.offset}
                      </div>
                    ))}
                  </div>
                  <div
                    className={`${activePreviewSelection === "ascii" ? "select-none" : "select-text"} text-slate-100`}
                    onMouseDown={() => setActivePreviewSelection("hex")}
                  >
                    {preview.rows.map((row) => (
                      <div key={`${row.offset}-hex`} className="border-b border-white/4 last:border-0 hover:bg-cyan-400/10">
                        {row.hex}
                      </div>
                    ))}
                  </div>
                  <div
                    className={`${activePreviewSelection === "hex" ? "select-none" : "select-text"} text-cyan-200/90`}
                    onMouseDown={() => setActivePreviewSelection("ascii")}
                  >
                    {preview.rows.map((row) => (
                      <div key={`${row.offset}-ascii`} className="border-b border-white/4 last:border-0 hover:bg-cyan-400/10">
                        {row.ascii}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">No entry selected</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
