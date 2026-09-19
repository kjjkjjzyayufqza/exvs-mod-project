import { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { exists } from "@tauri-apps/plugin-fs"
import { FileSearch, Loader2, RefreshCw, Save } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ChrSysActionTableEditor } from "../chrsys-action-table/ChrSysActionTableEditor"
import { CHRSYS_I18N_NAMESPACE } from "../chrsys-action-table/chrSysLabels"
import { isChrSysParamFile } from "../chrsys-action-table/chrSysModel"
import { resolveChrSysParamCandidates } from "../chrsys-action-table/chrSysParamPath"
import type { ChrSysParamFile } from "../chrsys-action-table/chrSysTypes"

interface ChrSysActionTablePanelProps {
  /** Unit MSC folder currently open in the workspace (holds 0.c / 2.c / 2.txt). */
  mscFolderPath: string
  paramRouteRoot?: string | null
  /** The panel stays mounted to keep unsaved rows, but only reads the file while visible. */
  active: boolean
  onUnsavedChanges?: (dirty: boolean) => void
}

export function ChrSysActionTablePanel({
  mscFolderPath,
  paramRouteRoot,
  active,
  onUnsavedChanges,
}: ChrSysActionTablePanelProps) {
  const { t } = useTranslation(CHRSYS_I18N_NAMESPACE)
  const [path, setPath] = useState<string | null>(null)
  const [data, setData] = useState<ChrSysParamFile | null>(null)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Folder the auto-resolver already ran for, so a manual pick is never overwritten. */
  const autoResolvedFor = useRef<string | null>(null)

  useEffect(() => {
    onUnsavedChanges?.(dirty)
  }, [dirty, onUnsavedChanges])

  const load = useCallback(
    async (target: string) => {
      setLoading(true)
      try {
        const parsed = await invoke<unknown>("parse_chrsysparam_file", { path: target })
        if (!isChrSysParamFile(parsed)) {
          throw new Error(
            t("toast.unexpectedShape", { command: "parse_chrsysparam_file", path: target }),
          )
        }
        setData(parsed)
        setPath(target)
        setDirty(false)
        setError(null)
      } catch (loadError) {
        setData(null)
        setError(String(loadError))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (!active) return
    const folderKey = `${mscFolderPath}|${paramRouteRoot ?? ""}`
    if (autoResolvedFor.current === folderKey) return
    autoResolvedFor.current = folderKey

    const candidates = resolveChrSysParamCandidates(mscFolderPath, paramRouteRoot)
    if (candidates.length === 0) {
      setData(null)
      setPath(null)
      setError(t("panel.notUnitRoute"))
      return
    }
    void (async () => {
      for (const candidate of candidates) {
        if (await exists(candidate)) {
          await load(candidate)
          return
        }
      }
      setData(null)
      setPath(null)
      setError(t("panel.notFound", { paths: candidates.join("\n") }))
    })()
  }, [active, mscFolderPath, paramRouteRoot, load, t])

  const pickFile = async () => {
    const picked = await openDialog({
      title: t("panel.pickTitle"),
      filters: [{ name: "ChrSysParam", extensions: ["csyspm"] }],
    })
    const target = Array.isArray(picked) ? picked[0] : picked
    if (typeof target === "string" && target) await load(target)
  }

  const save = async () => {
    if (!data || !path) return
    setSaving(true)
    try {
      await invoke("build_chrsysparam_file", { fileJson: data, outputPath: path })
      setDirty(false)
      toast.success(t("panel.saved"))
    } catch (saveError) {
      toast.error(String(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 break-all font-mono text-[11px] text-muted-foreground" title={path ?? ""}>
          {path ?? t("panel.unresolved")}
        </p>
        {dirty ? <span className="text-[11px] font-medium text-amber-500">{t("panel.unsaved")}</span> : null}
        <Button type="button" size="sm" variant="outline" onClick={() => void pickFile()} disabled={loading}>
          <FileSearch className="mr-2 size-4" />
          {t("panel.pickFile")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => path && void load(path)}
          disabled={!path || loading}
        >
          {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
          {t("panel.reload")}
        </Button>
        <Button type="button" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
          <Save className="mr-2 size-4" />
          {saving ? t("panel.saving") : t("panel.save")}
        </Button>
      </div>

      {error ? (
        <p className="shrink-0 whitespace-pre-line text-xs text-destructive">{error}</p>
      ) : null}

      <div className="min-h-0 flex-1">
        {data ? (
          <ChrSysActionTableEditor
            data={data}
            onChange={(next) => {
              setData(next)
              setDirty(true)
            }}
            mscScriptDir={mscFolderPath}
            sourcePath={path}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            {loading ? t("panel.loading") : t("panel.notLoaded")}
          </div>
        )}
      </div>
    </div>
  )
}
