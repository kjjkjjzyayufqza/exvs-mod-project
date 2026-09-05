import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FilePathInput } from "@/components/ui/filePathInput"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatHash } from "@/models/commandTable"
import {
  copyEffectFolderSelection,
  inferEffectFolderStructurePath,
  inspectEffectFolder,
  type EffectFolderCopyResult,
  type EffectFolderInventory,
} from "@/services/effectFolder/effectFolderService"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import {
  buildEffectFolderCopyPlan,
  toEffectFolderSelections,
} from "../effect-folder-editor/effectFolderEditorUtils"
import { readTypedEntryId } from "./paramEntryUtils"
import {
  createDefaultEfxbnPolicies,
  findProjectileDepictionEntryIndex,
  inventoryToEffectListItems,
  listProjectileDepictionHashRows,
  mergeProjectileDepictionEntry,
  pathsReferToSameFile,
  resolveProjectileDepictionHashes,
  selectedEffectItemsFromResolutions,
  sourceResolveBlocksCopy,
  toEffectFolderCopyEfxbnPolicies,
  validateEfxbnCopyPolicies,
  previewEfxbnOutputPaths,
  type EfxbnCopyAction,
  type EfxbnCopyPolicyDraft,
  type ProjectileDepictionHashResolution,
} from "./projectileDepictionCopy"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"

type WizardPhase = "source" | "destination" | "depiction" | "result"

type DepictionWriteMode = "skipped" | "append" | "replace"

type ProjectileDepictionCopyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: TypedParamFile
  selectedEntryIndex: number
  sourceFilePath?: string
  workspaceDefaultPath?: string
  onApplyToCurrentFile: (next: TypedParamFile) => void
}

const FOLDER_PICKER = {
  kind: "folder" as const,
  title: "",
}

const BIN_PICKER = {
  kind: "file" as const,
  title: "",
  filters: [{ name: "Projectile depiction", extensions: ["bin"] }],
}

function statusClass(status: ProjectileDepictionHashResolution["status"]): string {
  switch (status) {
    case "resolved":
      return "text-emerald-700 dark:text-emerald-400"
    case "error":
      return "text-destructive"
    case "warning":
      return "text-amber-700 dark:text-amber-400"
    case "info":
      return "text-muted-foreground"
    case "empty":
      return "text-muted-foreground"
  }
}

export function ProjectileDepictionCopyDialog({
  open,
  onOpenChange,
  data,
  selectedEntryIndex,
  sourceFilePath,
  workspaceDefaultPath,
  onApplyToCurrentFile,
}: ProjectileDepictionCopyDialogProps) {
  const { t } = useTranslation("test-projectile-copy")
  const entry = data.entries[selectedEntryIndex] ?? null
  const entryId = entry ? readTypedEntryId(entry, selectedEntryIndex) : 0
  const hashRows = useMemo(() => (entry ? listProjectileDepictionHashRows(entry) : []), [entry])

  const [phase, setPhase] = useState<WizardPhase>("source")
  const [sourceRoot, setSourceRoot] = useState("")
  const [destRoot, setDestRoot] = useState("")
  const [depictionPath, setDepictionPath] = useState("")
  const [sourceInventory, setSourceInventory] = useState<EffectFolderInventory | null>(null)
  const [destInventory, setDestInventory] = useState<EffectFolderInventory | null>(null)
  const [resolutions, setResolutions] = useState<ProjectileDepictionHashResolution[] | null>(null)
  const [policies, setPolicies] = useState<EfxbnCopyPolicyDraft[]>([])
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [destError, setDestError] = useState<string | null>(null)
  const [depictionError, setDepictionError] = useState<string | null>(null)
  const [scanningSource, setScanningSource] = useState(false)
  const [scanningDest, setScanningDest] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copyResult, setCopyResult] = useState<EffectFolderCopyResult | null>(null)
  const [depictionWrite, setDepictionWrite] = useState<DepictionWriteMode | null>(null)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const requestIdRef = useRef(0)
  const ioActive = scanningSource || scanningDest || busy

  const beginRequest = useCallback(() => {
    requestIdRef.current += 1
    return requestIdRef.current
  }, [])

  const reset = useCallback(() => {
    requestIdRef.current += 1
    setPhase("source")
    setSourceRoot("")
    setDestRoot("")
    setDepictionPath("")
    setSourceInventory(null)
    setDestInventory(null)
    setResolutions(null)
    setPolicies([])
    setSourceError(null)
    setDestError(null)
    setDepictionError(null)
    setCopyResult(null)
    setDepictionWrite(null)
    setReplaceConfirmed(false)
    setScanningSource(false)
    setScanningDest(false)
    setBusy(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && (scanningSource || scanningDest || busy)) return
      onOpenChange(nextOpen)
    },
    [busy, onOpenChange, scanningDest, scanningSource],
  )

  const selectedItems = useMemo(
    () => (resolutions ? selectedEffectItemsFromResolutions(resolutions) : []),
    [resolutions],
  )
  const allItems = useMemo(
    () => (sourceInventory ? inventoryToEffectListItems(sourceInventory) : []),
    [sourceInventory],
  )
  const plan = useMemo(
    () => buildEffectFolderCopyPlan({ selectedItems, allItems }),
    [allItems, selectedItems],
  )
  const policyErrors = useMemo(
    () => (destInventory ? validateEfxbnCopyPolicies(policies, destInventory) : []),
    [destInventory, policies],
  )
  const policiesValid = policyErrors.length === 0 || policyErrors.every((item) => item.ok)
  const outputPreviews = useMemo(
    () => (destInventory ? previewEfxbnOutputPaths(policies, destInventory) : []),
    [destInventory, policies],
  )

  const scanSource = useCallback(async () => {
    const trimmed = sourceRoot.trim()
    if (!trimmed) {
      setSourceError(t("errors.sourceFolder"))
      return
    }
    const requestId = beginRequest()
    setScanningSource(true)
    setSourceError(null)
    try {
      const structureJsonPath = inferEffectFolderStructurePath(trimmed)
      const inventory = await inspectEffectFolder(trimmed, structureJsonPath)
      if (requestId !== requestIdRef.current) return
      if (!entry) {
        setSourceError(t("errors.noEntry"))
        return
      }
      const nextResolutions = resolveProjectileDepictionHashes(entry, inventory)
      setSourceInventory(inventory)
      setResolutions(nextResolutions)
      setPolicies(createDefaultEfxbnPolicies(selectedEffectItemsFromResolutions(nextResolutions)))
      if (sourceResolveBlocksCopy(nextResolutions)) {
        setSourceError(t("errors.missingHashes"))
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setSourceInventory(null)
      setResolutions(null)
      setPolicies([])
      setSourceError(error instanceof Error ? error.message : String(error))
    } finally {
      if (requestId === requestIdRef.current) setScanningSource(false)
    }
  }, [beginRequest, entry, sourceRoot])

  const scanDest = useCallback(async () => {
    const trimmed = destRoot.trim()
    if (!trimmed) {
      setDestError(t("errors.destinationFolder"))
      return
    }
    const requestId = beginRequest()
    setScanningDest(true)
    setDestError(null)
    try {
      const structureJsonPath = inferEffectFolderStructurePath(trimmed)
      const inventory = await inspectEffectFolder(trimmed, structureJsonPath)
      if (requestId !== requestIdRef.current) return
      setDestInventory(inventory)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setDestInventory(null)
      setDestError(error instanceof Error ? error.message : String(error))
    } finally {
      if (requestId === requestIdRef.current) setScanningDest(false)
    }
  }, [beginRequest, destRoot])

  const allHashesEmpty = hashRows.every((row) => row.empty)
  const canLeaveSource =
    allHashesEmpty || (resolutions !== null && !sourceResolveBlocksCopy(resolutions))

  const goToDestination = useCallback(() => {
    if (!canLeaveSource) return
    if (allHashesEmpty || selectedItems.length === 0) {
      setPhase("depiction")
      return
    }
    setPhase("destination")
  }, [allHashesEmpty, canLeaveSource, selectedItems.length])

  const runEffectCopy = useCallback(async () => {
    if (!sourceInventory || !destInventory || !policiesValid) return
    if (selectedItems.length === 0) {
      setPhase("depiction")
      return
    }
    const requestId = beginRequest()
    setBusy(true)
    setDestError(null)
    try {
      const destStructureJsonPath = inferEffectFolderStructurePath(destRoot.trim())
      const result = await copyEffectFolderSelection({
        sourceEffectRoot: sourceInventory.effectRoot,
        sourceStructureJsonPath: sourceInventory.structureJsonPath,
        destinationEffectRoot: destInventory.effectRoot,
        destinationStructureJsonPath: destStructureJsonPath,
        selections: toEffectFolderSelections(selectedItems),
        policies: toEffectFolderCopyEfxbnPolicies(policies),
      })
      if (requestId !== requestIdRef.current) return
      setCopyResult(result)
      toast.success(t("success.copiedFiles", { count: result.copiedFiles.length }))
      setPhase("depiction")
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setDestError(error instanceof Error ? error.message : String(error))
    } finally {
      if (requestId === requestIdRef.current) setBusy(false)
    }
  }, [beginRequest, destInventory, destRoot, policies, policiesValid, selectedItems, sourceInventory])

  const skipDepiction = useCallback(() => {
    setDepictionWrite("skipped")
    setPhase("result")
  }, [])

  const writeDepiction = useCallback(async () => {
    if (!entry) return
    const trimmed = depictionPath.trim()
    if (!trimmed) {
      setDepictionError(t("errors.targetTable"))
      return
    }
    const requestId = beginRequest()
    setBusy(true)
    setDepictionError(null)
    try {
      if (sourceFilePath && pathsReferToSameFile(trimmed, sourceFilePath)) {
        const existingIndex = findProjectileDepictionEntryIndex(data, entryId)
        if (existingIndex >= 0 && existingIndex !== selectedEntryIndex) {
          if (!replaceConfirmed) {
            setDepictionError(
              t("errors.currentExists", { hash: formatHash(entryId) }),
            )
            return
          }
          onApplyToCurrentFile(mergeProjectileDepictionEntry(data, entry, "replace"))
          setDepictionWrite("replace")
          toast.success(t("success.replacedCurrent"))
        } else if (existingIndex === selectedEntryIndex) {
          setDepictionError(t("errors.sameEntry"))
          return
        } else {
          onApplyToCurrentFile(mergeProjectileDepictionEntry(data, entry, "append"))
          setDepictionWrite("append")
          toast.success(t("success.appendedCurrent"))
        }
        setPhase("result")
        return
      }

      const target = await invoke<TypedParamFile>("parse_typed_param_file", {
        path: trimmed,
        paramType: "projectile_depiction_table",
      })
      if (requestId !== requestIdRef.current) return
      const existingIndex = findProjectileDepictionEntryIndex(target, entryId)
      if (existingIndex >= 0 && !replaceConfirmed) {
        setDepictionError(
          t("errors.targetExists", { hash: formatHash(entryId) }),
        )
        return
      }
      const mode = existingIndex >= 0 ? "replace" : "append"
      const next = mergeProjectileDepictionEntry(target, entry, mode)
      await invoke("build_typed_param_file", {
        dataJson: next,
        outputPath: trimmed,
        paramType: "projectile_depiction_table",
      })
      setDepictionWrite(mode)
      setPhase("result")
      toast.success(mode === "replace" ? t("success.replacedDisk") : t("success.appendedDisk"))
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setDepictionError(error instanceof Error ? error.message : String(error))
    } finally {
      if (requestId === requestIdRef.current) setBusy(false)
    }
  }, [
    beginRequest,
    data,
    depictionPath,
    entry,
    entryId,
    onApplyToCurrentFile,
    replaceConfirmed,
    selectedEntryIndex,
    sourceFilePath,
  ])

  const updatePolicy = (fileIndex: number, patch: Partial<EfxbnCopyPolicyDraft>) => {
    setPolicies((prev) => prev.map((policy) => (policy.fileIndex === fileIndex ? { ...policy, ...patch } : policy)))
  }

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,820px)] w-[min(96vw,820px)] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-5 pb-3 pt-5 text-left">
          <DialogTitle className="pr-8 text-base">{t("title")}</DialogTitle>
          <DialogDescription className="text-[11px]">
            {t("description", { hash: formatHash(entryId) })}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[min(62vh,600px)]">
          <div className="space-y-4 px-5 py-4">
            {phase === "source" ? (
              <>
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold">{t("sections.entryHashes")}</h3>
                  <div className="overflow-hidden rounded-md border">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5 font-medium">{t("columns.field")}</th>
                          <th className="px-2 py-1.5 font-medium">{t("columns.hash")}</th>
                          <th className="px-2 py-1.5 font-medium">{t("columns.leBytes")}</th>
                          <th className="px-2 py-1.5 font-medium">{t("columns.status")}</th>
                          <th className="px-2 py-1.5 font-medium">{t("columns.path")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hashRows.map((row) => {
                          const resolved = resolutions?.find((item) => item.key === row.key) ?? null
                          const sourcePath = resolved?.efxbn?.path || resolved?.model?.files[0]?.path || resolved?.texture?.path || ""
                          return (
                            <tr key={row.key} className="border-t align-top">
                              <td className="px-2 py-1.5 font-mono">{row.key}</td>
                              <td className="px-2 py-1.5 font-mono tabular-nums">
                                {row.hex}
                                <div className="text-[10px] text-muted-foreground">{row.unsigned}</div>
                              </td>
                              <td className="px-2 py-1.5 font-mono tabular-nums">{row.leBytes}</td>
                              <td className={cn("px-2 py-1.5", resolved && statusClass(resolved.status))}>
                                {resolved ? resolved.message : row.empty ? t("states.empty") : t("states.scanSource")}
                              </td>
                              <td className="max-w-[18rem] px-2 py-1.5 font-mono text-[10px] break-all text-muted-foreground">
                                {sourcePath || "—"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-1.5 rounded-lg border bg-muted/15 p-3">
                  <Label htmlFor="projectile-copy-source-folder" className="text-[11px]">
                    {t("labels.sourceFolder")}
                  </Label>
                  <FilePathInput
                    id="projectile-copy-source-folder"
                    value={sourceRoot}
                    onChange={(event) => {
                      setSourceRoot(event.target.value)
                      setSourceError(null)
                      setSourceInventory(null)
                      setResolutions(null)
                      setPolicies([])
                    }}
                    placeholder="E:\\XB\\mod\\006effect\\014gndm00_016jagdac_001"
                    className="font-mono text-xs"
                    storeKey="paramEditor.v2.fp.projectileCopy.sourceEffect"
                    picker={{ ...FOLDER_PICKER, title: t("picker.sourceFolder"), defaultPath: workspaceDefaultPath }}
                    disabled={ioActive}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t("help.sourceScan")}
                  </p>
                  <Button type="button" size="sm" onClick={() => void scanSource()} disabled={ioActive}>
                    {scanningSource ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("actions.scanSource")}
                  </Button>
                </section>
                {sourceError ? (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
                    {sourceError}
                  </div>
                ) : null}
              </>
            ) : null}

            {phase === "destination" ? (
              <>
                <section className="space-y-1.5 rounded-lg border bg-muted/15 p-3">
                  <Label htmlFor="projectile-copy-dest-folder" className="text-[11px]">
                    {t("labels.destinationFolder")}
                  </Label>
                  <FilePathInput
                    id="projectile-copy-dest-folder"
                    value={destRoot}
                    onChange={(event) => {
                      setDestRoot(event.target.value)
                      setDestInventory(null)
                      setDestError(null)
                    }}
                    placeholder="E:\\workspace\\006effect\\0xDEST"
                    className="font-mono text-xs"
                    storeKey="paramEditor.v2.fp.projectileCopy.destEffect"
                    picker={{ ...FOLDER_PICKER, title: t("picker.destinationFolder"), defaultPath: workspaceDefaultPath }}
                    disabled={ioActive}
                  />
                  <Button type="button" size="sm" onClick={() => void scanDest()} disabled={ioActive}>
                    {scanningDest ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t("actions.scanDestination")}
                  </Button>
                </section>

                {plan.warnings.length > 0 ? (
                  <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                    <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
                      {plan.warnings.map((warning, warningIndex) => (
                        <li key={`${warningIndex}-${warning}`}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold">{t("sections.efxbnPolicy")}</h3>
                  {policies.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">{t("states.noEfxbn")}</p>
                  ) : (
                    <div className="space-y-2">
                      {policies.map((policy) => {
                        const error = policyErrors.find((item) => item.fileIndex === policy.fileIndex)
                        const preview = outputPreviews.find((item) => item.fileIndex === policy.fileIndex)
                        return (
                          <div key={policy.fileIndex} className="space-y-2 rounded-md border p-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px]">{policy.sourceName}</span>
                              <Badge variant="outline" className="h-5 text-[10px]">
                                {formatHash(policy.hashUnsigned)}
                              </Badge>
                            </div>
                            <div className="grid gap-2 md:grid-cols-[1fr_160px]">
                              <Input
                                value={policy.destName}
                                onChange={(event) => updatePolicy(policy.fileIndex, { destName: event.target.value })}
                                className="h-8 font-mono text-[11px]"
                                disabled={ioActive || policy.action !== "copy"}
                                aria-label={t("aria.destinationName", { name: policy.sourceName })}
                              />
                              <select
                                className="h-8 rounded-md border bg-background px-2 text-[11px]"
                                value={policy.action}
                                aria-label={t("aria.copyAction", { name: policy.sourceName })}
                                disabled={ioActive}
                                onChange={(event) =>
                                  updatePolicy(policy.fileIndex, { action: event.target.value as EfxbnCopyAction })
                                }
                              >
                                <option value="copy">{t("actions.copyNew")}</option>
                                <option value="overwrite">{t("actions.overwrite")}</option>
                                <option value="keep">{t("actions.keepExisting")}</option>
                              </select>
                            </div>
                            <div className="space-y-1 break-all font-mono text-[10px] text-muted-foreground">
                              <div>{t("labels.source")}: {policy.sourcePath || "—"}</div>
                              <div>{t("labels.output")}: {preview?.outputPath || t("states.scanDestinationOutput")}</div>
                            </div>
                            {error && !error.ok ? (
                              <p className="text-[11px] text-destructive">{error.error}</p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
                {outputPreviews.length > 0 ? (
                  <section className="space-y-1.5">
                    <h3 className="text-xs font-semibold">{t("sections.finalPaths")}</h3>
                    <ul className="space-y-1 rounded-md border bg-muted/20 p-2 font-mono text-[10px]">
                      {outputPreviews.map((preview) => (
                        <li key={`dest-out-${preview.fileIndex}`} className="break-all">
                          {preview.outputPath}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {destError ? (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
                    {destError}
                  </div>
                ) : null}
              </>
            ) : null}

            {phase === "depiction" ? (
              <section className="space-y-3">
                <p className="text-xs">
                  {t("depiction.question", { hash: formatHash(entryId) })}
                </p>
                <Label htmlFor="projectile-copy-depiction-bin" className="text-[11px]">
                  {t("labels.targetTable")}
                </Label>
                <FilePathInput
                  id="projectile-copy-depiction-bin"
                  value={depictionPath}
                  onChange={(event) => {
                    setDepictionPath(event.target.value)
                    setDepictionError(null)
                    setReplaceConfirmed(false)
                  }}
                  placeholder="E:\\XB\\mod\\006effect\\...\\projectile_depiction_table.bin"
                  className="font-mono text-xs"
                  storeKey="paramEditor.v2.fp.projectileCopy.destDepiction"
                  picker={{ ...BIN_PICKER, title: t("picker.targetTable"), defaultPath: workspaceDefaultPath ?? sourceFilePath }}
                  disabled={ioActive}
                />
                <label className="flex items-center gap-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={replaceConfirmed}
                    disabled={ioActive}
                    onChange={(event) => setReplaceConfirmed(event.target.checked)}
                  />
                  {t("labels.replaceExisting", { hash: formatHash(entryId) })}
                </label>
                {depictionError ? (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                  >
                    {depictionError}
                  </div>
                ) : null}
              </section>
            ) : null}

            {phase === "result" ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div className="space-y-1 text-[11px]">
                    <p className="font-medium">{t("result.finished")}</p>
                    <p>
                      {t("result.effectCopy")}: {copyResult ? t("result.copyCounts", { copied: copyResult.copiedFiles.length, skipped: copyResult.skipped.length }) : t("states.notRun")}
                    </p>
                    {copyResult?.destinationStructureJsonPath ? (
                      <p className="break-all font-mono text-[10px] text-muted-foreground">
                        {copyResult.destinationStructureJsonPath}
                      </p>
                    ) : null}
                    <p>{t("result.depictionRow")}: {depictionWrite ?? t("states.unknown")}</p>
                    {depictionPath.trim() ? (
                      <p className="break-all font-mono text-[10px] text-muted-foreground">{depictionPath.trim()}</p>
                    ) : null}
                  </div>
                </div>
                {outputPreviews.length > 0 ? (
                  <section className="space-y-1.5">
                    <h4 className="text-[11px] font-medium">{t("sections.plannedPaths")}</h4>
                    <ul className="max-h-40 space-y-1 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px]">
                      {outputPreviews.map((preview) => (
                        <li key={`plan-${preview.fileIndex}`} className="break-all">
                          {preview.outputPath}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {copyResult?.copiedFiles.length ? (
                  <section className="space-y-1.5">
                    <h4 className="text-[11px] font-medium">{t("sections.copiedFiles")}</h4>
                    <ul className="max-h-40 space-y-1 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px]">
                      {copyResult.copiedFiles.map((path) => (
                        <li key={path} className="break-all">
                          {path}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:justify-between">
          <div className="mr-auto text-[11px] text-muted-foreground">
            {phase === "destination" ? `${plan.summary.transferFileCount} planned file(s)` : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={ioActive}>
              {phase === "result" ? t("actions.close") : t("actions.cancel")}
            </Button>
            {phase === "source" ? (
              <Button
                type="button"
                onClick={goToDestination}
                disabled={!canLeaveSource || scanningSource}
              >
                {t("actions.next")}
              </Button>
            ) : null}
            {phase === "destination" ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setPhase("source")} disabled={busy}>
                  {t("actions.back")}
                </Button>
                <Button
                  type="button"
                  onClick={() => void runEffectCopy()}
                  disabled={busy || !destInventory || !policiesValid}
                >
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                  {t("actions.copyEffectFiles")}
                </Button>
              </>
            ) : null}
            {phase === "depiction" ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPhase(selectedItems.length > 0 ? "destination" : "source")}
                  disabled={busy}
                >
                  {t("actions.back")}
                </Button>
                <Button type="button" variant="secondary" onClick={skipDepiction} disabled={busy}>
                  {t("actions.skipTable")}
                </Button>
                <Button type="button" onClick={() => void writeDepiction()} disabled={busy}>
                  {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("actions.writeRow")}
                </Button>
              </>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
