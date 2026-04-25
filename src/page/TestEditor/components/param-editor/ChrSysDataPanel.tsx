import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatHash } from "@/models/commandTable"
import type { ChrSysParamFile } from "./chrSysTypes"

export function ChrSysDataPanel({
  data,
  onChange,
}: {
  data: ChrSysParamFile
  onChange: (next: ChrSysParamFile) => void
}) {
  const setEntry = (i: number, key: "hash" | "valueA" | "valueB" | "valueC" | "valueD", raw: string) => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const v = n >>> 0
    onChange({ ...data, entries: data.entries.map((e, j) => (j === i ? { ...e, [key]: v } : e)) })
  }

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader className="p-2">
        <CardTitle className="text-xs">Entries — magic 0x{(data.magic >>> 0).toString(16)} · {data.entries.length} rows</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        <div className="w-full min-w-[640px] text-xs">
          <div className="sticky top-0 z-[1] grid grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] gap-1 border-b bg-muted/80 px-2 py-1 font-medium backdrop-blur">
            <span>hash</span>
            <span>valueA</span>
            <span>valueB</span>
            <span>valueC</span>
            <span>valueD</span>
          </div>
          {data.entries.map((e, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] gap-1 border-b border-border/40 px-2 py-0.5"
            >
              <Input
                className="h-7 font-mono"
                value={String(e.hash >>> 0)}
                onChange={(ev) => setEntry(i, "hash", ev.target.value)}
                title={formatHash(e.hash)}
              />
              <Input
                className="h-7 font-mono"
                value={String(e.valueA >>> 0)}
                onChange={(ev) => setEntry(i, "valueA", ev.target.value)}
              />
              <Input
                className="h-7 font-mono"
                value={String(e.valueB >>> 0)}
                onChange={(ev) => setEntry(i, "valueB", ev.target.value)}
              />
              <Input
                className="h-7 font-mono"
                value={String(e.valueC >>> 0)}
                onChange={(ev) => setEntry(i, "valueC", ev.target.value)}
              />
              <Input
                className="h-7 font-mono"
                value={String(e.valueD >>> 0)}
                onChange={(ev) => setEntry(i, "valueD", ev.target.value)}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
