import { useMemo, useState } from "react"
import { Search, CopyPlus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatHash } from "@/models/commandTable"
import { DualValueProperty } from "@/components/ui/dual-value-property"
import type { TypedFieldValue, TypedParamEntry, TypedParamFile } from "./typedParamTypes"

function readEntryId(entry: TypedParamEntry, index: number): number {
  const raw = entry.entryId
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw >>> 0
  }
  return index >>> 0
}

function nextEntryId(entries: TypedParamEntry[]): number {
  return entries.reduce((acc, entry, index) => Math.max(acc, readEntryId(entry, index)), 0) + 1
}

function parseValueByCurrentType(current: TypedFieldValue, raw: string): TypedFieldValue {
  if (typeof current === "number") {
    const n = Number(raw)
    return Number.isFinite(n) ? n : current
  }
  if (typeof current === "boolean") {
    if (raw === "true") return true
    if (raw === "false") return false
    return current
  }
  if (current === null) {
    const n = Number(raw)
    if (Number.isFinite(n)) return n
    if (raw === "true") return true
    if (raw === "false") return false
    if (raw === "null") return null
    return raw
  }
  return raw
}

function displayValue(v: TypedFieldValue): string {
  if (v === null) return "null"
  if (typeof v === "boolean") return v ? "true" : "false"
  return String(v)
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
  const [search, setSearch] = useState("")
  const entry = data.entries[selectedEntryIndex] ?? null

  const filteredKeys = useMemo(() => {
    if (!entry) return []
    const all = Object.keys(entry)
    if (!search.trim()) return all
    const q = search.trim().toLowerCase()
    return all.filter((k) => k.toLowerCase().includes(q))
  }, [entry, search])

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

  const updateField = (key: string, raw: string) => {
    if (!entry) return
    const current = entry[key]
    if (current === undefined) return
    const nextValue = parseValueByCurrentType(current, raw)
    const nextEntries = data.entries.map((item, idx) =>
      idx === selectedEntryIndex ? { ...item, [key]: nextValue } : item
    )
    const nextEntryIds = nextEntries.map((item, idx) => readEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
  }

  const addEntry = () => {
    const template = entry ?? data.entries[0]
    if (!template) return
    const created: TypedParamEntry = { ...template }
    if (typeof created.entryId === "number" && Number.isFinite(created.entryId)) {
      created.entryId = nextEntryId(data.entries)
    }
    const nextEntries = [...data.entries, created]
    const nextEntryIds = nextEntries.map((item, idx) => readEntryId(item, idx))
    onChange({ ...data, entries: nextEntries, entryIds: nextEntryIds })
    onSelectEntry(nextEntries.length - 1)
  }

  const deleteEntry = () => {
    if (!data.entries.length) return
    const nextEntries = data.entries.filter((_, idx) => idx !== selectedEntryIndex)
    const nextEntryIds = nextEntries.map((item, idx) => readEntryId(item, idx))
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
        <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
          <h3 className="text-xs font-semibold">Entries ({data.entries.length})</h3>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {data.entries.map((e, i) => {
            const id = readEntryId(e, i)
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
                {formatHash(readEntryId(entry, selectedEntryIndex))} · {Object.keys(entry).length} fields
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm">
              <Search className="h-3 w-3 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter field…"
                className="h-4 w-32 bg-transparent text-[10px] outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]" onClick={addEntry}>
              <CopyPlus className="h-3 w-3" />
              Add row
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
                      const nextEntryIds = nextEntries.map((item, idx) => readEntryId(item, idx))
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
    </div>
  )
}
