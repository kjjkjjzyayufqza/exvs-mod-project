import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { formatHash } from "@/models/commandTable"
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
    <div className="flex min-h-0 flex-1 gap-2">
      <Card className="flex w-56 shrink-0 flex-col">
        <CardHeader className="p-2">
          <CardTitle className="text-xs">Entries ({data.entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {data.entries.map((e, i) => {
            const id = readEntryId(e, i)
            return (
              <button
                key={`${i}-${id}`}
                type="button"
                className={`flex w-full flex-col border-b border-border/40 px-2 py-1 text-left text-xs hover:bg-muted/50 ${
                  selectedEntryIndex === i ? "bg-primary/10 font-medium" : ""
                }`}
                onClick={() => onSelectEntry(i)}
              >
                <span className="font-mono text-[10px] text-muted-foreground">#{i}</span>
                <span className="truncate font-mono">{formatHash(id)}</span>
              </button>
            )
          })}
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-1 flex-col">
        <CardHeader className="p-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs">{fileType} typed entry</CardTitle>
            {entry && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatHash(readEntryId(entry, selectedEntryIndex))} · {Object.keys(entry).length} fields
              </span>
            )}
            <div className="flex-1" />
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={addEntry}>
              Add row
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              disabled={!data.entries.length}
              onClick={deleteEntry}
            >
              Delete row
            </Button>
            <div className="flex items-center gap-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter field…"
                className="h-7 w-44 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto p-0">
          {!entry ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No entry</div>
          ) : (
            <div className="w-full min-w-[680px] text-xs">
              <div className="sticky top-0 z-1 grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-1 border-b bg-muted/80 px-2 py-1 font-medium backdrop-blur">
                <span>field</span>
                <span>value</span>
              </div>
              {filteredKeys.map((key) => {
                const value = entry[key]
                const current = value === undefined ? null : value
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-1 border-b border-border/40 px-2 py-0.5"
                  >
                    <span className="h-7 truncate self-center font-mono text-[11px]">{key}</span>
                    <Input
                      className="h-7 font-mono"
                      value={displayValue(current)}
                      onChange={(ev) => updateField(key, ev.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
