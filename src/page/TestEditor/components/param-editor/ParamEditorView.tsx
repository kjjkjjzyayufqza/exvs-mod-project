import { useCallback, useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { dirname, join } from "@tauri-apps/api/path"
import { exists, writeFile } from "@tauri-apps/plugin-fs"
import { Download, FileUp, RefreshCw, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FilePathInput } from "@/components/ui/filePathInput"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useConfigStore } from "@/store/configStore"
import { FILE_TYPE_LABELS } from "@/models/commandTable"
import { ChrSysDataPanel } from "./ChrSysDataPanel"
import type { ChrSysParamFile } from "./chrSysTypes"
import { PARAM_KINDS, type ParamKindId, resolveTypedFileTypeForPath, getParamKind } from "./paramKinds"
import { TypedParamDataPanel } from "./TypedParamDataPanel"
import type { TypedParamFile } from "./typedParamTypes"
import { isProjectileDepictionTableFileType } from "./projectileDepictionCopy"
import { sortTypedParamFileByUnsignedEntryId } from "./paramEntryUtils"
import { renameExtractPayloads } from "@/services/testEditorWorkspace/renameExtractPayloads"
import {
  CHARACTER_PARAM_PAYLOAD_NAMES,
  characterParamFileNameForKind,
} from "@/services/testEditorWorkspace/workspaceContentExtract"

type TypedKindSession = {
  path: string
  fileType: string
  data: TypedParamFile
}

type ChrKindSession = {
  path: string
  data: ChrSysParamFile
}

type KindSession = {
  typed: TypedKindSession | null
  chr: ChrKindSession | null
  selectedEntry: number
  dirty: boolean
  err: string | null
  loadSession: number
}

const EMPTY_KIND_SESSION: KindSession = {
  typed: null,
  chr: null,
  selectedEntry: 0,
  dirty: false,
  err: null,
  loadSession: 0,
}

interface ParamEditorViewProps {
  onUnsavedChanges?: (hasChanges: boolean) => void
  workspaceDefaultPath?: string
}

export default function ParamEditorView({ onUnsavedChanges, workspaceDefaultPath }: ParamEditorViewProps) {
  const [kindId, setKindId] = useState<ParamKindId>("armsparam" as ParamKindId)
  const [currentPath, setCurrentPath] = useState("")
  const getSetting = useConfigStore((s) => s.getSetting)
  const setSetting = useConfigStore((s) => s.setSetting)
  const kind = getParamKind(kindId)
  const pathKey = kind?.pathKey ?? "paramEditor.v2.fp.armsparam"

  const [sessions, setSessions] = useState<Partial<Record<ParamKindId, KindSession>>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isApplyingNames, setIsApplyingNames] = useState(false)

  const session = sessions[kindId] ?? EMPTY_KIND_SESSION
  const typed = session.typed
  const chr = session.chr
  const dirty = session.dirty
  const err = session.err
  const hasAnyUnsaved = useMemo(
    () => Object.values(sessions).some((item) => item?.dirty),
    [sessions],
  )

  const patchKindSession = useCallback(
    (id: ParamKindId, patch: Partial<KindSession> | ((prev: KindSession) => KindSession)) => {
      setSessions((prev) => {
        const current = prev[id] ?? EMPTY_KIND_SESSION
        const next = typeof patch === "function" ? patch(current) : { ...current, ...patch }
        return { ...prev, [id]: next }
      })
    },
    [],
  )

  useEffect(() => {
    onUnsavedChanges?.(hasAnyUnsaved)
  }, [hasAnyUnsaved, onUnsavedChanges])

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

  const tryChangeKind = useCallback((next: string) => {
    const nextKindId = next as ParamKindId
    if (nextKindId === kindId) return
    setKindId(nextKindId)
  }, [kindId])

  const loadFile = useCallback(
    async (path: string) => {
      if (!path.trim() || !kind) return
      const targetKindId = kindId
      setLoading(true)
      patchKindSession(targetKindId, { err: null })
      try {
        if (kind.mode === "chrsys") {
          const data = await invoke<ChrSysParamFile>("parse_chrsysparam_file", { path })
          patchKindSession(targetKindId, (prev) => ({
            ...prev,
            chr: { path, data },
            typed: null,
            dirty: false,
            selectedEntry: 0,
            err: null,
            loadSession: prev.loadSession + 1,
          }))
        } else {
          const fileType = resolveTypedFileTypeForPath(kind, path)
          const data = await invoke<TypedParamFile>("parse_typed_param_file", { path, paramType: fileType })
          patchKindSession(targetKindId, (prev) => ({
            ...prev,
            typed: { path, fileType, data },
            chr: null,
            dirty: false,
            selectedEntry: 0,
            err: null,
            loadSession: prev.loadSession + 1,
          }))
        }
        toast.success("Loaded")
      } catch (e) {
        patchKindSession(targetKindId, { err: String(e) })
        toast.error(String(e))
      } finally {
        setLoading(false)
      }
    },
    [kind, kindId, patchKindSession],
  )

  const save = useCallback(async () => {
    if (typed) {
      setSaving(true)
      try {
        const dataJson = isProjectileDepictionTableFileType(typed.fileType)
          ? sortTypedParamFileByUnsignedEntryId(typed.data)
          : typed.data
        if (dataJson !== typed.data) {
          patchKindSession(kindId, (prev) =>
            prev.typed ? { ...prev, typed: { ...prev.typed, data: dataJson } } : prev,
          )
        }
        await invoke("build_typed_param_file", {
          dataJson,
          outputPath: typed.path,
          paramType: typed.fileType,
        })
        patchKindSession(kindId, { dirty: false })
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
        patchKindSession(kindId, { dirty: false })
        toast.success("Saved")
      } catch (e) {
        toast.error(String(e))
      } finally {
        setSaving(false)
      }
    }
  }, [typed, chr, kindId, patchKindSession])

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

  const handleApplyNames = useCallback(async () => {
    const path = currentPath.trim()
    if (!path) {
      toast.error("Pick a param file first")
      return
    }
    setIsApplyingNames(true)
    try {
      const folderPath = await dirname(path)
      const result = await renameExtractPayloads({
        folderPath,
        names: CHARACTER_PARAM_PAYLOAD_NAMES,
      })
      const named = characterParamFileNameForKind(kindId)
      if (named) {
        const nextPath = await join(folderPath, named)
        setCurrentPath(nextPath)
        await setSetting(pathKey, nextPath)
        if (await exists(nextPath)) {
          await loadFile(nextPath)
        }
      }
      if (result.renamed.length > 0) {
        toast.success(`Renamed ${result.renamed.join(", ")}`)
      } else {
        toast.success("Param files already use catalog names")
      }
    } catch (error) {
      toast.error(String(error))
    } finally {
      setIsApplyingNames(false)
    }
  }, [currentPath, kindId, loadFile, pathKey, setSetting])

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col gap-4 pb-4">
      <div className="flex shrink-0 flex-col gap-3 border-b pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">Param Editor</h2>
            <p className="break-all text-[11px] text-muted-foreground" title={currentPath}>
              Pick a file path (stored per type), load from disk via Rust, edit entry data, save.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!currentPath.trim() || loading || isApplyingNames}
              onClick={() => void handleApplyNames()}
            >
              {isApplyingNames ? "Applying names…" : "Apply names"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!currentPath.trim() || loading}
              onClick={() => void loadFile(currentPath)}
            >
              <FileUp className="mr-2 h-4 w-4" />
              Load
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasData || loading}
              onClick={() => {
                if (typed) void loadFile(typed.path)
                if (chr) void loadFile(chr.path)
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saving}
              onClick={() => void save()}
            >
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasData}
              onClick={() => void exportJson()}
            >
              <Download className="mr-2 h-4 w-4" />
              Export JSON
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
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
                defaultPath: workspaceDefaultPath,
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
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {title && hasData && (
          <p className="text-[10px] text-muted-foreground">
            <span className="font-medium text-foreground">{title}</span>
            {typed && <span> · {typed.path}</span>}
            {chr && <span> · {chr.path}</span>}
            {hasAnyUnsaved && <span className="ml-2 font-medium text-amber-500">• Unsaved changes</span>}
          </p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
        <div className="relative min-h-0 flex-1">
          {PARAM_KINDS.map((kindRow) => {
            const kindSession = sessions[kindRow.id]
            if (!kindSession || (!kindSession.typed && !kindSession.chr)) return null
            const isActive = kindRow.id === kindId
            return (
              <div
                key={kindRow.id}
                className={cn("h-full min-h-0", isActive ? "relative" : "hidden")}
                aria-hidden={!isActive}
                {...(!isActive ? { inert: true } : {})}
              >
                {kindSession.typed ? (
                  <TypedParamDataPanel
                    key={`${kindRow.id}:${kindSession.loadSession}`}
                    fileType={kindSession.typed.fileType}
                    data={kindSession.typed.data}
                    selectedEntryIndex={kindSession.selectedEntry}
                    onSelectEntry={(index) => patchKindSession(kindRow.id, { selectedEntry: index })}
                    workspaceDefaultPath={workspaceDefaultPath}
                    sourceFilePath={kindSession.typed.path}
                    onChange={(nextData) =>
                      patchKindSession(kindRow.id, (prev) =>
                        prev.typed
                          ? { ...prev, typed: { ...prev.typed, data: nextData }, dirty: true }
                          : prev,
                      )
                    }
                  />
                ) : kindSession.chr ? (
                  <ChrSysDataPanel
                    data={kindSession.chr.data}
                    onChange={(nextData) =>
                      patchKindSession(kindRow.id, (prev) =>
                        prev.chr
                          ? { ...prev, chr: { ...prev.chr, data: nextData }, dirty: true }
                          : prev,
                      )
                    }
                  />
                ) : null}
              </div>
            )
          })}
          {!hasData && !loading && (
            <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/5 text-sm text-muted-foreground">
              <FileUp className="h-8 w-8 opacity-50" />
              <p>Choose a type, set a file path, then Load.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
