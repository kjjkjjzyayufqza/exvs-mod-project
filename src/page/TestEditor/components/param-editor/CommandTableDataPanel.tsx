import { useCallback, useMemo, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ParsedCommandTable } from "@/models/commandTable"
import { formatHash, KIND_LABELS } from "@/models/commandTable"
import { ParamDataValueInput } from "./ParamDataValueInput"

export function CommandTableDataPanel({
  parsed,
  selectedEntryIndex,
  onSelectEntry,
  onFieldChange,
}: {
  parsed: ParsedCommandTable
  selectedEntryIndex: number
  onSelectEntry: (i: number) => void
  onFieldChange: (entryIndex: number, hash: number, kind: number, v: number | string) => void
}) {
  const [search, setSearch] = useState("")
  const entry = parsed.entries[selectedEntryIndex] ?? null
  const filteredFields = useMemo(() => {
    if (!entry) return []
    if (!search.trim()) return entry.fields
    const q = search.trim().toLowerCase()
    return entry.fields.filter(
      (f) => formatHash(f.hash).toLowerCase().includes(q) || f.offset.toString(16).includes(q)
    )
  }, [entry, search])

  const listRef = useRef<HTMLDivElement>(null)
  const entryV = useVirtualizer({
    count: parsed.entries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 40,
    overscan: 12,
  })

  const fieldRef = useRef<HTMLDivElement>(null)
  const fieldV = useVirtualizer({
    count: filteredFields.length,
    getScrollElement: () => fieldRef.current,
    estimateSize: () => 40,
    overscan: 20,
  })

  const handleField = useCallback(
    (hash: number, kind: number, v: number | string) => {
      onFieldChange(selectedEntryIndex, hash, kind, v)
    },
    [onFieldChange, selectedEntryIndex]
  )

  return (
    <div className="flex min-h-0 flex-1 gap-2">
      <Card className="flex w-52 shrink-0 flex-col">
        <CardHeader className="p-2">
          <CardTitle className="text-xs">Entries ({parsed.entries.length})</CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <div ref={listRef} className="h-full max-h-[min(70vh,560px)] overflow-auto">
            <div className="relative" style={{ height: entryV.getTotalSize() }}>
              {entryV.getVirtualItems().map((vi) => {
                const e = parsed.entries[vi.index]
                return (
                  <button
                    key={vi.key}
                    type="button"
                    className={cn(
                      "absolute left-0 top-0 flex w-full flex-col border-b border-border/40 px-2 py-1 text-left text-xs hover:bg-muted/50",
                    selectedEntryIndex === vi.index && "bg-primary/10 font-medium"
                    )}
                    style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                    onClick={() => onSelectEntry(vi.index)}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground">#{vi.index}</span>
                    <span className="truncate font-mono">{formatHash(e.entryId)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="flex min-w-0 flex-1 flex-col">
        <CardHeader className="shrink-0 p-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs">Entry data</CardTitle>
            {entry && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatHash(entry.entryId)} · {entry.fields.length} fields
              </span>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter hash / offset…"
                className="h-7 w-40 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          {!entry ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">No entry</div>
          ) : (
            <div ref={fieldRef} className="h-full max-h-[min(70vh,560px)] overflow-auto">
              <div className="relative" style={{ height: fieldV.getTotalSize() }}>
                {fieldV.getVirtualItems().map((vi) => {
                  const f = filteredFields[vi.index]
                  return (
                    <div
                      key={`${f.hash}-${f.offset}`}
                      className="absolute left-0 top-0 flex w-full items-center gap-2 border-b border-border/30 px-2 py-1"
                      style={{ height: vi.size, transform: `translateY(${vi.start}px)` }}
                    >
                      <span className="w-[88px] shrink-0 font-mono text-[10px] text-muted-foreground">
                        {formatHash(f.hash)}
                      </span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1 text-[9px]">
                        {KIND_LABELS[f.kind]?.split(" ")[0] ?? `k${f.kind}`}
                      </Badge>
                      <span className="w-10 shrink-0 text-[10px] text-muted-foreground">+0x{f.offset.toString(16).toUpperCase()}</span>
                      <ParamDataValueInput field={f} onChange={(v) => handleField(f.hash, f.kind, v)} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
