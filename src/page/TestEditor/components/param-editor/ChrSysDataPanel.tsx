import { useCallback, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Input } from "@/components/ui/input"
import { formatHash } from "@/models/commandTable"
import type { ChrSysParamFile } from "./chrSysTypes"

const CHRSYS_ROW_HEIGHT = 52

export function ChrSysDataPanel({
  data,
  onChange,
}: {
  data: ChrSysParamFile
  onChange: (next: ChrSysParamFile) => void
}) {
  const rowsViewportRef = useRef<HTMLDivElement | null>(null)
  const getRowsViewport = useCallback(() => rowsViewportRef.current, [])
  const rowVirtualizer = useVirtualizer({
    count: data.entries.length,
    getScrollElement: getRowsViewport,
    estimateSize: () => CHRSYS_ROW_HEIGHT,
    overscan: 12,
  })

  const setEntry = (i: number, key: "hash" | "valueA" | "valueB" | "valueC" | "valueD", raw: string) => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const v = n >>> 0
    const current = data.entries[i]
    if (!current || current[key] === v) return
    const entries = [...data.entries]
    entries[i] = { ...current, [key]: v }
    onChange({ ...data, entries })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2">
        <h3 className="text-xs font-semibold">
          Entries — magic 0x{(data.magic >>> 0).toString(16)}{" "}
          <span className="ml-2 rounded-md border border-border/60 bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {data.entries.length} rows
          </span>
        </h3>
      </div>
      <div ref={rowsViewportRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/5 p-4">
        <div className="min-w-[640px] text-xs">
          <div className="sticky top-0 z-1 grid grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] gap-2 rounded-t-md border-x border-t bg-muted/80 px-3 py-1.5 font-medium backdrop-blur">
            <span>hash</span>
            <span>valueA</span>
            <span>valueB</span>
            <span>valueC</span>
            <span>valueD</span>
          </div>
          <div className="rounded-b-md border bg-background">
            <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const e = data.entries[virtualRow.index]
                if (!e) return null
                const i = virtualRow.index
                return (
                  <div
                    key={i}
                    className="absolute left-0 top-0 grid w-full grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] gap-2 border-b border-border/40 px-3 py-2 transition-colors hover:bg-muted/50"
                    style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="flex flex-col gap-0.5">
                      <Input
                        className="h-7 font-mono text-xs shadow-none"
                        value={String(e.hash >>> 0)}
                        onChange={(ev) => setEntry(i, "hash", ev.target.value)}
                        title={formatHash(e.hash)}
                      />
                      <span className="truncate px-1 font-mono text-[9px] text-muted-foreground">
                        {formatHash(e.hash)}
                      </span>
                    </div>
                  <Input
                    className="h-7 font-mono text-xs shadow-none"
                    value={String(e.valueA >>> 0)}
                    onChange={(ev) => setEntry(i, "valueA", ev.target.value)}
                  />
                  <Input
                    className="h-7 font-mono text-xs shadow-none"
                    value={String(e.valueB >>> 0)}
                    onChange={(ev) => setEntry(i, "valueB", ev.target.value)}
                  />
                  <Input
                    className="h-7 font-mono text-xs shadow-none"
                    value={String(e.valueC >>> 0)}
                    onChange={(ev) => setEntry(i, "valueC", ev.target.value)}
                  />
                  <Input
                    className="h-7 font-mono text-xs shadow-none"
                    value={String(e.valueD >>> 0)}
                    onChange={(ev) => setEntry(i, "valueD", ev.target.value)}
                  />
                </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
