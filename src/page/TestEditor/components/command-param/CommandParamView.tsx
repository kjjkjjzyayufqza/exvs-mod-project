import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs"
import { join } from "@tauri-apps/api/path"
import { invoke } from "@tauri-apps/api/core"
import { Buffer } from "buffer"
import { toast } from "sonner"
import { Save, RefreshCw, Search, Download, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useVirtualizer } from "@tanstack/react-virtual"

import {
  type ParsedCommandTable,
  type ParsedEntry,
  type CommandFieldValue,
  type CommandDefinition,
  formatHash,
  formatFieldValue,
  getFieldDisplayValue,
  encodeFieldValueToHex,
  KIND_LABELS,
  FILE_TYPE_LABELS,
  detectFileType,
  isCommandTableFile,
} from "@/models/commandTable"

const PARAM_FILE_NAMES = [
  "grapparam.bin",
  "projectile_depiction_table.bin",
  "chrsysparam.csyspm",
  "characterparam.bin",
  "interactionid.bin",
  "hitgroupiddef.bin",
  "bulletparam.bin",
  "speedparam.bin",
  "armsparam.bin",
] as const

interface CommandParamViewProps {
  folderPath: string
  isActive: boolean
  onUnsavedChanges?: (hasChanges: boolean) => void
}

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; tables: ParamTableInfo[] }

interface ParamTableInfo {
  fileName: string
  fileType: string
  filePath: string
  parsed: ParsedCommandTable | null
  error: string | null
}

export default function CommandParamView({ folderPath, isActive, onUnsavedChanges }: CommandParamViewProps) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" })
  const [activeFileType, setActiveFileType] = useState<string>("")
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number>(-1)
  const [hasChanges, setHasChanges] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [kindFilter, setKindFilter] = useState<string>("all")
  const [isSaving, setIsSaving] = useState(false)

  const activeTable = useMemo(() => {
    if (loadState.status !== "ready") return null
    return loadState.tables.find(t => t.fileType === activeFileType) ?? null
  }, [loadState, activeFileType])

  const selectedEntry = useMemo(() => {
    if (!activeTable?.parsed) return null
    return activeTable.parsed.entries[selectedEntryIndex] ?? null
  }, [activeTable, selectedEntryIndex])

  const filteredFields = useMemo(() => {
    if (!selectedEntry) return []
    let fields = selectedEntry.fields
    if (kindFilter !== "all") {
      const k = parseInt(kindFilter)
      fields = fields.filter(f => f.kind === k)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      fields = fields.filter(f =>
        formatHash(f.hash).toLowerCase().includes(q) ||
        formatFieldValue(f).toLowerCase().includes(q)
      )
    }
    return fields
  }, [selectedEntry, kindFilter, searchQuery])

  const loadAllParams = useCallback(async () => {
    if (!folderPath) return
    setLoadState({ status: "loading" })
    try {
      const tables: ParamTableInfo[] = []
      for (const fileName of PARAM_FILE_NAMES) {
        const filePath = await join(folderPath, fileName)
        const fileType = detectFileType(fileName)
        const fileExists = await exists(filePath)
        if (!fileExists) {
          tables.push({ fileName, fileType, filePath, parsed: null, error: "File not found" })
          continue
        }
        if (!isCommandTableFile(fileName)) {
          tables.push({ fileName, fileType, filePath, parsed: null, error: `Non-standard format (${fileType})` })
          continue
        }
        try {
          const parsed = await invoke<ParsedCommandTable>("parse_command_table_file", { path: filePath, fileType })
          tables.push({ fileName, fileType, filePath, parsed, error: null })
        } catch (err: any) {
          tables.push({ fileName, fileType, filePath, parsed: null, error: String(err) })
        }
      }
      setLoadState({ status: "ready", tables })
      const first = tables.find(t => t.parsed !== null)
      if (first) {
        setActiveFileType(first.fileType)
        if (first.parsed && first.parsed.entries.length > 0) {
          setSelectedEntryIndex(0)
        }
      }
    } catch (err: any) {
      setLoadState({ status: "error", message: String(err) })
    }
  }, [folderPath])

  useEffect(() => {
    if (isActive && folderPath) {
      loadAllParams()
    }
  }, [isActive, folderPath, loadAllParams])

  useEffect(() => {
    onUnsavedChanges?.(hasChanges)
  }, [hasChanges, onUnsavedChanges])

  const handleFieldChange = useCallback(
    (entryIndex: number, hash: number, kind: number, newValue: number | string) => {
      if (loadState.status !== "ready" || !activeTable?.parsed) return
      const updatedTables = loadState.tables.map(t => {
        if (t.fileType !== activeFileType || !t.parsed) return t
        const updatedEntries = t.parsed.entries.map((entry, idx) => {
          if (idx !== entryIndex) return entry
          const updatedFields = entry.fields.map(f => {
            if (f.hash !== hash) return f
            const numVal = typeof newValue === "string" ? 0 : newValue
            return {
              ...f,
              valueInt: kind === 2 ? numVal : f.valueInt,
              valueUint: kind === 1 ? (numVal >>> 0) : f.valueUint,
              valueFloat: kind === 5 ? numVal : f.valueFloat,
              valueString: kind === 7 ? String(newValue) : f.valueString,
              valueHex: encodeFieldValueToHex(kind, numVal),
            }
          })
          return { ...entry, fields: updatedFields }
        })
        return { ...t, parsed: { ...t.parsed, entries: updatedEntries } }
      })
      setLoadState({ status: "ready", tables: updatedTables })
      setHasChanges(true)
    },
    [loadState, activeFileType, activeTable]
  )

  const handleSave = useCallback(async () => {
    if (!activeTable?.parsed || !activeTable.filePath) return
    setIsSaving(true)
    try {
      const rawTable = rebuildRawTable(activeTable.parsed)
      await invoke("build_command_table_file", {
        tableJson: rawTable,
        outputPath: activeTable.filePath,
      })
      setHasChanges(false)
      toast.success(`Saved ${activeTable.fileName}`)
    } catch (err: any) {
      toast.error(`Save failed: ${err}`)
    } finally {
      setIsSaving(false)
    }
  }, [activeTable])

  const handleExportJson = useCallback(async () => {
    if (!activeTable?.parsed) return
    try {
      const json = JSON.stringify(activeTable.parsed, null, 2)
      const outPath = activeTable.filePath + ".json"
      await writeFile(outPath, new TextEncoder().encode(json))
      toast.success(`Exported to ${outPath}`)
    } catch (err: any) {
      toast.error(`Export failed: ${err}`)
    }
  }, [activeTable])

  if (loadState.status === "idle") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a character param folder to begin editing
      </div>
    )
  }

  if (loadState.status === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading param files...
      </div>
    )
  }

  if (loadState.status === "error") {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        Error: {loadState.message}
      </div>
    )
  }

  const readyTables = loadState.tables.filter(t => t.parsed !== null)
  const errorTables = loadState.tables.filter(t => t.error !== null && t.parsed === null)

  return (
    <div className="flex flex-col h-full gap-2 p-2">
      <div className="flex items-center gap-2 shrink-0">
        <Tabs value={activeFileType} onValueChange={v => { setActiveFileType(v); setSelectedEntryIndex(0); setSearchQuery(""); setKindFilter("all") }}>
          <TabsList className="h-8">
            {readyTables.map(t => (
              <TabsTrigger key={t.fileType} value={t.fileType} className="text-xs px-2 py-1">
                {FILE_TYPE_LABELS[t.fileType] ?? t.fileType}
                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                  {t.parsed!.entries.length}
                </Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={loadAllParams} className="h-7 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Reload
        </Button>
        <Button size="sm" variant="outline" onClick={handleExportJson} disabled={!activeTable?.parsed} className="h-7 text-xs">
          <Download className="w-3 h-3 mr-1" /> JSON
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!hasChanges || isSaving} className="h-7 text-xs">
          <Save className="w-3 h-3 mr-1" /> Save
        </Button>
      </div>

      {errorTables.length > 0 && (
        <div className="flex gap-1 flex-wrap shrink-0">
          {errorTables.map(t => (
            <Badge key={t.fileName} variant="destructive" className="text-[10px]">
              {t.fileName}: {t.error}
            </Badge>
          ))}
        </div>
      )}

      {activeTable?.parsed && (
        <div className="flex flex-1 gap-2 min-h-0">
          <EntryListPanel
            entries={activeTable.parsed.entries}
            selectedIndex={selectedEntryIndex}
            onSelect={setSelectedEntryIndex}
            fileType={activeTable.fileType}
          />
          <FieldEditorPanel
            entry={selectedEntry}
            commands={activeTable.parsed.commands}
            fields={filteredFields}
            entryIndex={selectedEntryIndex}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            kindFilter={kindFilter}
            onKindFilterChange={setKindFilter}
            onFieldChange={handleFieldChange}
            header={activeTable.parsed.header}
          />
        </div>
      )}
    </div>
  )
}

function EntryListPanel({
  entries,
  selectedIndex,
  onSelect,
  fileType,
}: {
  entries: ParsedEntry[]
  selectedIndex: number
  onSelect: (i: number) => void
  fileType: string
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  })

  return (
    <Card className="w-56 shrink-0 flex flex-col">
      <CardHeader className="p-2 pb-1">
        <CardTitle className="text-xs font-medium">
          Entries ({entries.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <div ref={parentRef} className="h-full overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map(vi => {
              const entry = entries[vi.index]
              return (
                <div
                  key={vi.index}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                  className={cn(
                    "px-2 py-1 text-xs cursor-pointer border-b border-border/50 hover:bg-accent/50 transition-colors",
                    selectedIndex === vi.index && "bg-accent text-accent-foreground font-medium"
                  )}
                  onClick={() => onSelect(vi.index)}
                >
                  <span className="font-mono text-[10px] text-muted-foreground mr-1">#{vi.index}</span>
                  <span className="font-mono">{formatHash(entry.entryId)}</span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FieldEditorPanel({
  entry,
  commands,
  fields,
  entryIndex,
  searchQuery,
  onSearchChange,
  kindFilter,
  onKindFilterChange,
  onFieldChange,
  header,
}: {
  entry: ParsedEntry | null
  commands: CommandDefinition[]
  fields: CommandFieldValue[]
  entryIndex: number
  searchQuery: string
  onSearchChange: (v: string) => void
  kindFilter: string
  onKindFilterChange: (v: string) => void
  onFieldChange: (entryIndex: number, hash: number, kind: number, value: number | string) => void
  header: any
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: fields.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 15,
  })

  if (!entry) {
    return (
      <Card className="flex-1">
        <CardContent className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Select an entry to edit
        </CardContent>
      </Card>
    )
  }

  const kindCounts: Record<number, number> = {}
  for (const f of entry.fields) {
    kindCounts[f.kind] = (kindCounts[f.kind] ?? 0) + 1
  }

  return (
    <Card className="flex-1 flex flex-col min-w-0">
      <CardHeader className="p-2 pb-1 shrink-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">
            Entry {formatHash(entry.entryId)} — {entry.fields.length} fields
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            size={header.entrySize}B
          </Badge>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Search className="w-3 h-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search hash..."
              className="h-6 w-32 text-xs"
            />
          </div>
          <Select value={kindFilter} onValueChange={onKindFilterChange}>
            <SelectTrigger className="h-6 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(kindCounts).map(([k, count]) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[parseInt(k)] ?? `kind=${k}`} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0">
        <div ref={parentRef} className="h-full overflow-auto">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map(vi => {
              const field = fields[vi.index]
              return (
                <div
                  key={vi.index}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                  className="flex items-center gap-2 px-3 py-1 border-b border-border/30 hover:bg-muted/30"
                >
                  <span className="font-mono text-[10px] text-muted-foreground w-20 shrink-0">
                    {formatHash(field.hash)}
                  </span>
                  <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0 w-14 justify-center">
                    {KIND_LABELS[field.kind]?.split(" ")[0] ?? `k${field.kind}`}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground w-12 shrink-0">
                    +0x{field.offset.toString(16).toUpperCase().padStart(3, "0")}
                  </span>
                  <FieldValueEditor
                    field={field}
                    onChange={val => onFieldChange(entryIndex, field.hash, field.kind, val)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FieldValueEditor({
  field,
  onChange,
}: {
  field: CommandFieldValue
  onChange: (val: number | string) => void
}) {
  const displayValue = getFieldDisplayValue(field)

  if (field.kind === 7) {
    return (
      <Input
        value={String(displayValue)}
        onChange={e => onChange(e.target.value)}
        className="h-6 text-xs flex-1"
        placeholder="string value"
      />
    )
  }

  if (field.kind === 5) {
    return (
      <Input
        type="number"
        step="0.01"
        value={Number(displayValue)}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-6 text-xs flex-1 font-mono"
      />
    )
  }

  return (
    <div className="flex items-center gap-1 flex-1">
      <Input
        type="number"
        value={Number(displayValue)}
        onChange={e => {
          const v = parseInt(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-6 text-xs flex-1 font-mono"
      />
      <span className="text-[9px] text-muted-foreground font-mono shrink-0">
        {field.valueHex}
      </span>
    </div>
  )
}

function rebuildRawTable(parsed: ParsedCommandTable): any {
  const entrySize = parsed.header.entrySize
  const entriesRaw = parsed.entries.map(entry => {
    const raw = new Uint8Array(entrySize)
    for (const field of entry.fields) {
      const offset = field.offset
      if (offset + 4 > entrySize) continue
      const buf = new ArrayBuffer(4)
      const dv = new DataView(buf)
      switch (field.kind) {
        case 1:
          dv.setUint32(0, field.valueUint ?? 0, true)
          break
        case 2:
          dv.setInt32(0, field.valueInt ?? 0, true)
          break
        case 5:
          dv.setFloat32(0, field.valueFloat ?? 0, true)
          break
        case 7:
          dv.setUint32(0, field.valueUint ?? 0, true)
          break
        default:
          dv.setUint32(0, field.valueUint ?? 0, true)
          break
      }
      raw.set(new Uint8Array(buf), offset)
    }
    return Array.from(raw)
  })

  return {
    header: parsed.header,
    commands: parsed.commands,
    entryIds: parsed.entries.map(e => e.entryId),
    entriesRaw,
    trailingData: [],
  }
}
