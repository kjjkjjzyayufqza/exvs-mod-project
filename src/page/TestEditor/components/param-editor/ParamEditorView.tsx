import { useCallback, useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { writeFile } from "@tauri-apps/plugin-fs"
import { Download, FileUp, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FilePathInput } from "@/components/ui/filePathInput"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useConfigStore } from "@/store/configStore"
import { FILE_TYPE_LABELS } from "@/models/commandTable"
import { ChrSysDataPanel } from "./ChrSysDataPanel"
import type { ChrSysParamFile } from "./chrSysTypes"
import { PARAM_KINDS, type ParamKindId, resolveTypedFileTypeForPath, getParamKind } from "./paramKinds"
import { TypedParamDataPanel } from "./TypedParamDataPanel"
import type { TypedParamFile } from "./typedParamTypes"

export default function ParamEditorView({ onUnsavedChanges }: { onUnsavedChanges?: (hasChanges: boolean) => void }) {
  const [kindId, setKindId] = useState<ParamKindId>("armsparam" as ParamKindId)
  const [currentPath, setCurrentPath] = useState("")
  const getSetting = useConfigStore((s) => s.getSetting)
  const kind = getParamKind(kindId)
  const pathKey = kind?.pathKey ?? "paramEditor.v2.fp.armsparam"

  const [typed, setTyped] = useState<{
    path: string
    fileType: string
    data: TypedParamFile
  } | null>(null)
  const [chr, setChr] = useState<{ path: string; data: ChrSysParamFile } | null>(null)
  const [selectedEntry, setSelectedEntry] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

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
      setTyped(null)
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
          setTyped(null)
        } else {
          const fileType = resolveTypedFileTypeForPath(kind, path)
          const data = await invoke<TypedParamFile>("parse_typed_param_file", { path, paramType: fileType })
          setTyped({ path, fileType, data })
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

  const save = useCallback(async () => {
    if (typed) {
      setSaving(true)
      try {
        await invoke("build_typed_param_file", {
          dataJson: typed.data,
          outputPath: typed.path,
          paramType: typed.fileType,
        })
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
  }, [typed, chr])

  const exportJson = useCallback(async () => {
    try {
      if (typed) {
        const p = typed.path + ".param_export.json"
        const json = new TextEncoder().encode(JSON.stringify(typed.data, null, 2))
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
  }, [typed, chr])

  const canSave = (typed || chr) && dirty
  const hasData = Boolean(typed || chr)
  const title = typed
    ? FILE_TYPE_LABELS[typed.fileType] ?? typed.fileType
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
                filters: [{ name: "Param", extensions: ["bin", "csyspm", "vgsht2"] }],
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
                if (typed) void loadFile(typed.path)
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
            {typed && <span> · {typed.path}</span>}
            {chr && <span> · {chr.path}</span>}
          </p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        <div className="min-h-0 flex-1">
          {typed && (
            <TypedParamDataPanel
              fileType={typed.fileType}
              data={typed.data}
              selectedEntryIndex={selectedEntry}
              onSelectEntry={setSelectedEntry}
              onChange={(nextData) => {
                setTyped((prev) => (prev ? { ...prev, data: nextData } : prev))
                setDirty(true)
              }}
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
