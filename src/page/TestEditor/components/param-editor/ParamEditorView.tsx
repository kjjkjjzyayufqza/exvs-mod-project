import { useCallback, useEffect, useState, useTransition } from "react"
import { invoke } from "@tauri-apps/api/core"
import { writeFile } from "@tauri-apps/plugin-fs"
import { Download, FileUp, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FilePathInput } from "@/components/ui/filePathInput"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConfigStore } from "@/store/configStore"
import { FILE_TYPE_LABELS, type ParsedCommandTable } from "@/models/commandTable"
import { rebuildCommandTableForSave, updateEntryField } from "./rebuildCommandTable"
import { CommandTableDataPanel } from "./CommandTableDataPanel"
import { ChrSysDataPanel } from "./ChrSysDataPanel"
import type { ChrSysParamFile } from "./chrSysTypes"
import { PARAM_KINDS, type ParamKindId, resolveCommandFileTypeForPath, getParamKind } from "./paramKinds"

export default function ParamEditorView({ onUnsavedChanges }: { onUnsavedChanges?: (hasChanges: boolean) => void }) {
  const [kindId, setKindId] = useState<ParamKindId>("armsparam" as ParamKindId)
  const [currentPath, setCurrentPath] = useState("")
  const getSetting = useConfigStore((s) => s.getSetting)
  const kind = getParamKind(kindId)
  const pathKey = kind?.pathKey ?? "paramEditor.v2.fp.armsparam"

  const [command, setCommand] = useState<{
    path: string
    fileType: string
    parsed: ParsedCommandTable
  } | null>(null)
  const [chr, setChr] = useState<{ path: string; data: ChrSysParamFile } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [, startTransition] = useTransition()

  useEffect(() => {
    onUnsavedChanges?.(dirty)
  }, [dirty, onUnsavedChanges])

  useEffect(() => {
    void (async () => {
      const p = await getSetting<string>(pathKey)
      if (typeof p === "string" && p) {
        setCurrentPath(p)
      } else {
        setCurrentPath("")
      }
    })()
  }, [getSetting, pathKey])

  const tryChangeKind = useCallback(
    (next: string) => {
      if (dirty) {
        if (!window.confirm("Discard unsaved changes and switch type?")) return
      }
      setDirty(false)
      setCommand(null)
      setChr(null)
      setErr(null)
      setSelectedEntry(0)
      setKindId(next as ParamKindId)
    },
    [dirty]
  )

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim() || !kind) return
      setLoading(true)
      setErr(null)
      try {
        if (kind.mode === "chrsys") {
          const data = await invoke<ChrSysParamFile>("parse_chrsysparam_file", { path })
          setChr({ path, data })
          setCommand(null)
        } else {
          const fileType = resolveCommandFileTypeForPath(kind, path)
          const parsed = await invoke<ParsedCommandTable>("parse_command_table_file", { path, fileType })
          setCommand({ path, fileType, parsed })
          setChr(null)
        }
        setDirty(false)
        setSelectedEntry(0)
        toast.success("Loaded")
      } catch (e) {
        setErr(String(e))
        toast.error(String(e))
      } finally {
        setLoading(false)
      }
    },
    [kind]
  )

  const handleField = useCallback(
    (entryIndex: number, hash: number, fieldKind: number, v: number | string) => {
      if (!command) return
      startTransition(() => {
        setCommand((c) => {
          if (!c) return c
          const nextEntries = c.parsed.entries.map((e, i) =>
            i === entryIndex ? updateEntryField(e, hash, fieldKind, v) : e
          )
          return {
            ...c,
            parsed: { ...c.parsed, entries: nextEntries },
          }
        })
        setDirty(true)
      })
    },
    [command]
  )

  const save = useCallback(async () => {
    if (command) {
      setSaving(true)
      try {
        const payload = rebuildCommandTableForSave(command.parsed)
        await invoke("build_command_table_file", { tableJson: payload, outputPath: command.path })
        setDirty(false)
        toast.success("Saved")
      } catch (e) {
        toast.error(String(e))
      } finally {
        setSaving(false)
      }
      return
    }
    if (chr) {
      setSaving(true)
      try {
        await invoke("build_chrsysparam_file", { fileJson: chr.data, outputPath: chr.path })
        setDirty(false)
        toast.success("Saved")
      } catch (e) {
        toast.error(String(e))
      } finally {
        setSaving(false)
      }
    }
  }, [command, chr])

  const exportJson = useCallback(async () => {
    try {
      if (command) {
        const p = command.path + ".param_export.json"
        const json = new TextEncoder().encode(JSON.stringify(command.parsed, null, 2))
        await writeFile(p, json)
        toast.success(`Wrote ${p}`)
        return
      }
      if (chr) {
        const p = chr.path + ".param_export.json"
        const json = new TextEncoder().encode(JSON.stringify(chr.data, null, 2))
        await writeFile(p, json)
        toast.success(`Wrote ${p}`)
      }
    } catch (e) {
      toast.error(String(e))
    }
  }, [command, chr])

  const canSave = (command || chr) && dirty
  const hasData = Boolean(command || chr)
  const title = command
    ? FILE_TYPE_LABELS[command.fileType] ?? command.fileType
    : chr
      ? "Chr sys param"
      : ""

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-3 pb-2">
      <div className="border-b border-border/60 bg-muted/30 -mx-4 -mt-4 mb-0 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Param editor</h2>
        <p className="text-xs text-muted-foreground">
          Pick a file path (stored per type), load from disk via Rust, edit entry data, save.
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[min(100%,280px)]">
            <Label className="text-[10px] text-muted-foreground">Table type</Label>
            <Select value={kindId} onValueChange={tryChangeKind}>
              <SelectTrigger className="mt-0.5 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PARAM_KINDS.map((k) => (
                  <SelectItem key={k.id} value={k.id} className="text-xs">
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 max-w-2xl flex-1">
            <Label className="text-[10px] text-muted-foreground">File</Label>
            <FilePathInput
              className="mt-0.5 font-mono text-xs"
              storeKey={pathKey}
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              picker={{
                kind: "file",
                title: "Select param file",
                filters: [{ name: "Param", extensions: ["bin", "csyspm"] }],
              }}
              onPickedValue={(v) => {
                const p = Array.isArray(v) ? v[0] : v
                if (typeof p === "string" && p) {
                  setCurrentPath(p)
                  void loadFile(p)
                }
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8"
              disabled={!currentPath.trim() || loading}
              onClick={() => void loadFile(currentPath)}
            >
              <FileUp className="mr-1 h-3.5 w-3.5" />
              Load
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!hasData || loading}
              onClick={() => {
                if (command) void loadFile(command.path)
                if (chr) void loadFile(chr.path)
              }}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Reload
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={!canSave || saving}
              onClick={() => void save()}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!hasData}
              onClick={() => void exportJson()}
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export JSON
            </Button>
          </div>
        </div>
        {title && hasData && (
          <p className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{title}</span>
            {command && <span> · {command.path}</span>}
            {chr && <span> · {chr.path}</span>}
          </p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        <div className="min-h-0 flex-1">
          {command && (
            <CommandTableDataPanel
              parsed={command.parsed}
              selectedEntryIndex={selectedEntry}
              onSelectEntry={setSelectedEntry}
              onFieldChange={handleField}
            />
          )}
          {chr && (
            <ChrSysDataPanel
              data={chr.data}
              onChange={(d) => {
                setChr({ ...chr, data: d })
                setDirty(true)
              }}
            />
          )}
          {!hasData && !loading && (
            <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
              Choose a type, set a file path, then Load.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
