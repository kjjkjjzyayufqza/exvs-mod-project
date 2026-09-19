import { useCallback, useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog"
import { Copy, Download, Link2, Trash2, Upload } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { ChrSysIssueList } from "./ChrSysIssueList"
import { ChrSysRowDetail } from "./ChrSysRowDetail"
import { ChrSysRowList } from "./ChrSysRowList"
import {
  ACTION_FIELD,
  appendClonedRow,
  cellOf,
  deleteRow,
  formatHex,
  isChrSysParamFile,
  setCell,
} from "./chrSysModel"
import { CHRSYS_I18N_NAMESPACE, renderInputLabel } from "./chrSysLabels"
import type {
  ChrSysIssue,
  ChrSysMscLinks,
  ChrSysParamFile,
  ChrSysSchema,
  ChrSysTableKey,
} from "./chrSysTypes"

const VALIDATION_DEBOUNCE_MS = 250

interface ChrSysActionTableEditorProps {
  data: ChrSysParamFile
  onChange: (next: ChrSysParamFile) => void
  /** MSC script folder to resolve group/phase hooks against (the unit's 0.c / 2.c). */
  mscScriptDir?: string | null
  sourcePath?: string | null
}

export function ChrSysActionTableEditor({
  data,
  onChange,
  mscScriptDir,
  sourcePath,
}: ChrSysActionTableEditorProps) {
  const { t } = useTranslation(CHRSYS_I18N_NAMESPACE)
  const [tableKey, setTableKey] = useState<ChrSysTableKey>("actionTable")
  const [selectedRow, setSelectedRow] = useState(1)
  const [query, setQuery] = useState("")
  const [schema, setSchema] = useState<ChrSysSchema | null>(null)
  const [links, setLinks] = useState<ChrSysMscLinks | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [issues, setIssues] = useState<ChrSysIssue[]>([])

  const table = data[tableKey]
  const actionColumns = data.actionTable.columns
  const transitionColumns = data.transitionTable.columns

  useEffect(() => {
    let cancelled = false
    void invoke<ChrSysSchema>("get_chrsysparam_schema", { actionColumns, transitionColumns })
      .then((next) => {
        if (!cancelled) setSchema(next)
      })
      .catch((error) => toast.error(String(error)))
    return () => {
      cancelled = true
    }
  }, [actionColumns, transitionColumns])

  const linkScripts = useCallback(async (dir: string) => {
    try {
      const next = await invoke<ChrSysMscLinks>("resolve_chrsysparam_msc_links", { scriptDir: dir })
      setLinks(next)
      setLinkError(null)
    } catch (error) {
      setLinks(null)
      setLinkError(String(error))
    }
  }, [])

  useEffect(() => {
    if (!mscScriptDir) {
      setLinks(null)
      setLinkError(null)
      return
    }
    void linkScripts(mscScriptDir)
  }, [mscScriptDir, linkScripts])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void invoke<ChrSysIssue[]>("validate_chrsysparam_data", { fileJson: data, linksJson: links })
        .then((next) => {
          if (!cancelled) setIssues(next)
        })
        .catch((error) => toast.error(String(error)))
    }, VALIDATION_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [data, links])

  const specs = useMemo(
    () => (tableKey === "actionTable" ? (schema?.action ?? []) : (schema?.transition ?? [])),
    [schema, tableKey],
  )

  const visibleIndices = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = table.rows.map((_, index) => index)
    if (!needle) return all
    return all.filter((index) => {
      if (String(index) === needle) return true
      const row = table.rows[index]
      const hash = formatHex(cellOf(row, ACTION_FIELD.actionHash)).toLowerCase()
      return hash.includes(needle) || renderInputLabel(t, row).summary.toLowerCase().includes(needle)
    })
  }, [table.rows, query, t])

  const errorCount = issues.filter((issue) => issue.level === "error").length
  const warningCount = issues.length - errorCount

  const applyCell = (field: number, value: number) => {
    onChange(setCell(data, tableKey, selectedRow, field, value))
  }

  const handleClone = () => {
    try {
      const next = appendClonedRow(data, tableKey, selectedRow)
      onChange(next)
      setSelectedRow(next[tableKey].rows.length - 1)
      toast.success(t("toast.cloned", { from: selectedRow, to: next[tableKey].rows.length - 1 }))
    } catch (error) {
      toast.error(String(error))
    }
  }

  const handleDelete = () => {
    try {
      onChange(deleteRow(data, tableKey, selectedRow))
      setSelectedRow((prev) => Math.max(1, prev - 1))
      toast.success(t("toast.deleted", { row: selectedRow }))
    } catch (error) {
      toast.error(String(error))
    }
  }

  const handleExport = async () => {
    const target = await saveDialog({
      title: t("toast.exportTitle"),
      defaultPath: sourcePath ? `${sourcePath}.document.json` : "chrsysparam.document.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!target) return
    try {
      await invoke("export_chrsysparam_document", { fileJson: data, outputPath: target })
      toast.success(t("toast.wrote", { path: target }))
    } catch (error) {
      toast.error(String(error))
    }
  }

  const handleImport = async () => {
    const picked = await openDialog({
      title: t("toast.importTitle"),
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    const path = Array.isArray(picked) ? picked[0] : picked
    if (typeof path !== "string" || !path) return
    try {
      const next = await invoke<unknown>("import_chrsysparam_document", { path })
      if (!isChrSysParamFile(next)) {
        throw new Error(t("toast.unexpectedShape", { command: "import_chrsysparam_document", path }))
      }
      onChange(next)
      setSelectedRow(1)
      toast.success(t("toast.imported"))
    } catch (error) {
      toast.error(String(error))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/20 px-2.5 py-2">
        <Tabs
          value={tableKey}
          onValueChange={(value) => {
            const next = value as ChrSysTableKey
            setTableKey(next)
            setSelectedRow(Math.min(1, data[next].rows.length - 1))
          }}
        >
          <TabsList className="h-7">
            <TabsTrigger value="actionTable" className="h-6 px-2 text-[11px]">
              {t("toolbar.actions")} <span className="ml-1 font-mono tabular-nums">{data.actionTable.rows.length}</span>
            </TabsTrigger>
            <TabsTrigger value="transitionTable" className="h-6 px-2 text-[11px]">
              {t("toolbar.transitions")}{" "}
              <span className="ml-1 font-mono tabular-nums">{data.transitionTable.rows.length}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Badge variant="outline" className="h-6 font-mono text-[10px] tabular-nums">
          {t("toolbar.unit", { id: data.unitId })}
        </Badge>

        <span
          className={cn(
            "flex h-6 items-center gap-1 rounded-md border px-2 text-[10px]",
            links ? "text-foreground" : "text-muted-foreground",
          )}
          title={linkError ?? links?.scriptDir ?? t("toolbar.scriptLinkedNone")}
        >
          <Link2 className="size-3" aria-hidden />
          {links
            ? t("toolbar.scriptLinked", {
                fn: links.registrationFunction,
                hooks: links.phaseCallbacks.length,
              })
            : t("toolbar.scriptLinkedNone")}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={handleClone}>
            <Copy className="mr-1 size-3" />
            {t("toolbar.cloneRow")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
            onClick={handleDelete}
            disabled={selectedRow <= 0}
          >
            <Trash2 className="mr-1 size-3" />
            {t("toolbar.deleteRow")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void handleImport()}>
            <Upload className="mr-1 size-3" />
            {t("toolbar.importJson")}
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => void handleExport()}>
            <Download className="mr-1 size-3" />
            {t("toolbar.exportJson")}
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="shrink-0 p-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("toolbar.filterPlaceholder")}
              className="h-7 text-[11px]"
            />
          </div>
          <div className="min-h-0 flex-1">
            <ChrSysRowList
              rows={table.rows}
              visibleIndices={visibleIndices}
              tableKey={tableKey}
              selectedRow={selectedRow}
              onSelectRow={setSelectedRow}
              issues={issues}
            />
          </div>
        </div>

        <div className="min-h-0">
          <ChrSysRowDetail
            rows={table.rows}
            rowIndex={selectedRow}
            tableKey={tableKey}
            specs={specs}
            links={links}
            onSetCell={applyCell}
            onSelectRow={setSelectedRow}
          />
        </div>
      </div>

      <div className="shrink-0 border-t">
        <div className="flex items-center gap-2 bg-muted/20 px-3 py-1.5 text-[11px]">
          <span className="font-medium">{t("issues.title")}</span>
          <span className="font-mono tabular-nums text-destructive">{t("issues.errors", { value: errorCount })}</span>
          <span className="font-mono tabular-nums text-amber-600 dark:text-amber-500">
            {t("issues.warnings", { value: warningCount })}
          </span>
          {linkError ? <span className="truncate text-muted-foreground">{linkError}</span> : null}
        </div>
        <ChrSysIssueList
          issues={issues}
          onSelect={(issueTable, row) => {
            setTableKey(issueTable)
            setSelectedRow(row)
          }}
        />
      </div>
    </div>
  )
}
