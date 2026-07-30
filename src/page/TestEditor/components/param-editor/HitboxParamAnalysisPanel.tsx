import { useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { LoaderCircle } from "lucide-react"
import { FilePathInput } from "@/components/ui/filePathInput"
import {
  findReferencingEntries,
  resolveSingleReference,
} from "@/lib/gameAlgorithms/crossParamResolver"
import { InteractionMatrix } from "../param-editors/hitgroup-editor/InteractionMatrix"
import { SphereCoveragePanel } from "../param-editors/hitgroup-editor/SphereCoveragePanel"
import { EventChainPanel } from "../param-editors/interaction-editor/EventChainPanel"
import { HitEffectPanel } from "../param-editors/interaction-editor/HitEffectPanel"
import {
  CrossReferencePanel,
  ReverseReferencePanel,
} from "../param-editors/shared/CrossReferencePanel"
import { readTypedEntryId } from "./paramEntryUtils"
import type { TypedParamEntry, TypedParamFile } from "./typedParamTypes"

export type HitboxParamFileType = "hitgroupiddef" | "interactionid"

interface RelatedParamConfig {
  paramType: HitboxParamFileType
  label: string
  storeKey: string
}

const RELATED_PARAM_CONFIG: Record<HitboxParamFileType, RelatedParamConfig> = {
  hitgroupiddef: {
    paramType: "interactionid",
    label: "Interaction ID",
    storeKey: "paramEditor.v2.fp.interactionid",
  },
  interactionid: {
    paramType: "hitgroupiddef",
    label: "Hit Group ID Def",
    storeKey: "paramEditor.v2.fp.hitgroupiddef",
  },
}

export function isHitboxParamFileType(fileType: string): fileType is HitboxParamFileType {
  return fileType === "hitgroupiddef" || fileType === "interactionid"
}

interface HitboxParamAnalysisContentProps {
  fileType: HitboxParamFileType
  data: TypedParamFile
  selectedEntryIndex: number
  siblingData: TypedParamFile | null
}

function EmptyRelatedState({ children }: { children: string }) {
  return (
    <div className="rounded-md border border-dashed bg-background/40 px-3 py-4 text-center text-[11px] text-muted-foreground">
      {children}
    </div>
  )
}

export function HitboxParamAnalysisContent({
  fileType,
  data,
  selectedEntryIndex,
  siblingData,
}: HitboxParamAnalysisContentProps) {
  const [selectedHitgroupIndex, setSelectedHitgroupIndex] = useState<number | null>(null)
  const entry = data.entries[selectedEntryIndex] ?? null
  const entryId = entry ? readTypedEntryId(entry, selectedEntryIndex) : 0

  const forwardReference = useMemo(() => {
    if (fileType !== "hitgroupiddef" || !entry) return null
    return resolveSingleReference(
      entry,
      "hitgroupiddef",
      "interactionId",
      "interactionid",
      siblingData?.entries ?? [],
    )
  }, [entry, fileType, siblingData])

  const reverseHitgroups = useMemo(() => {
    if (fileType !== "interactionid" || !entry || !siblingData) return []
    return findReferencingEntries(siblingData.entries, "interactionId", entryId)
  }, [entry, entryId, fileType, siblingData])

  if (!entry) {
    return <EmptyRelatedState>Select an entry to inspect hitbox relationships.</EmptyRelatedState>
  }

  if (fileType === "hitgroupiddef") {
    const interactionId =
      typeof entry.interactionId === "number" ? entry.interactionId >>> 0 : 0
    const targetInteraction = forwardReference?.targetEntry

    return (
      <div className="space-y-3" data-testid="hitgroup-param-analysis">
        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)]">
          <InteractionMatrix entry={entry} />
          <SphereCoveragePanel entry={entry} />
        </div>

        <div className="grid gap-3 2xl:grid-cols-2">
          {interactionId === 0 || !forwardReference ? (
            <EmptyRelatedState>This row has no non-zero interaction foreign key.</EmptyRelatedState>
          ) : (
            <CrossReferencePanel
              references={[forwardReference]}
              loadedKinds={siblingData ? ["interactionid"] : []}
              navigableKinds={[]}
            />
          )}

          {targetInteraction ? (
            <div className="overflow-hidden rounded-md border bg-card">
              <div className="border-b bg-muted/20 px-3 py-2 text-[11px] font-medium">
                Referenced interaction effect
              </div>
              <HitEffectPanel entry={targetInteraction} hasHitVolume />
            </div>
          ) : (
            <EmptyRelatedState>
              {siblingData
                ? "The referenced interaction entry is missing from the loaded table."
                : "Load interactionid.bin to classify the referenced hit effect."}
            </EmptyRelatedState>
          )}
        </div>
      </div>
    )
  }

  const activeHitgroupIndex =
    selectedHitgroupIndex !== null &&
    reverseHitgroups.some(({ index }) => index === selectedHitgroupIndex)
      ? selectedHitgroupIndex
      : (reverseHitgroups[0]?.index ?? null)
  const selectedHitgroupEntry: TypedParamEntry | null =
    activeHitgroupIndex === null ? null : (siblingData?.entries[activeHitgroupIndex] ?? null)
  const hasHitVolume = siblingData ? reverseHitgroups.length > 0 : undefined
  const reverseReferences = reverseHitgroups.map(({ index, entry: hitgroupEntry }) => ({
    index,
    entryId: readTypedEntryId(hitgroupEntry, index),
  }))

  return (
    <div className="space-y-3" data-testid="interaction-param-analysis">
      <div className="grid overflow-hidden rounded-md border bg-card 2xl:grid-cols-2">
        <HitEffectPanel entry={entry} hasHitVolume={hasHitVolume} />
        <div className="min-h-64 border-t 2xl:border-l 2xl:border-t-0">
          <EventChainPanel entry={entry} />
        </div>
      </div>

      {siblingData ? (
        reverseReferences.length > 0 ? (
          <ReverseReferencePanel
            label="Hitgroup rows using this interaction"
            references={reverseReferences}
            onNavigateToEntry={setSelectedHitgroupIndex}
          />
        ) : (
          <EmptyRelatedState>No hitgroup rows reference this interaction.</EmptyRelatedState>
        )
      ) : (
        <EmptyRelatedState>
          Load hitgroupiddef.bin to resolve attack volumes and neutral follow-up rows.
        </EmptyRelatedState>
      )}

      {selectedHitgroupEntry ? (
        <div className="space-y-2">
          <div className="text-[11px] font-medium text-muted-foreground">
            Referencing hitgroup preview
          </div>
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.4fr)_minmax(240px,0.6fr)]">
            <InteractionMatrix entry={selectedHitgroupEntry} />
            <SphereCoveragePanel entry={selectedHitgroupEntry} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

interface HitboxParamAnalysisPanelProps {
  fileType: string
  data: TypedParamFile
  selectedEntryIndex: number
  workspaceDefaultPath?: string
}

function LoadedHitboxParamAnalysisPanel({
  fileType,
  data,
  selectedEntryIndex,
  workspaceDefaultPath,
}: Omit<HitboxParamAnalysisPanelProps, "fileType"> & { fileType: HitboxParamFileType }) {
  const relatedConfig = RELATED_PARAM_CONFIG[fileType]
  const [siblingPath, setSiblingPath] = useState("")
  const [siblingData, setSiblingData] = useState<TypedParamFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const path = siblingPath.trim()
    if (!path) {
      setSiblingData(null)
      setLoadError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setSiblingData(null)
    setLoadError(null)
    setLoading(true)

    void invoke<TypedParamFile>("parse_typed_param_file", {
      path,
      paramType: relatedConfig.paramType,
    })
      .then((result) => {
        if (!cancelled) setSiblingData(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(String(error))
          setSiblingData(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [relatedConfig.paramType, siblingPath])

  return (
    <section className="space-y-3" aria-label="Hitbox analysis">
      <div className="flex flex-col gap-2 2xl:flex-row 2xl:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label
            htmlFor={`hitbox-related-${relatedConfig.paramType}`}
            className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Related {relatedConfig.label} table
          </label>
          <FilePathInput
            key={relatedConfig.paramType}
            id={`hitbox-related-${relatedConfig.paramType}`}
            className="h-7 w-full font-mono text-[10px]"
            storeKey={relatedConfig.storeKey}
            value={siblingPath}
            onChange={(event) => setSiblingPath(event.target.value)}
            picker={{
              kind: "file",
              title: `Select ${relatedConfig.paramType} file`,
              filters: [{ name: "Param", extensions: ["bin"] }],
              defaultPath: workspaceDefaultPath,
            }}
          />
        </div>
        <div
          className="min-h-7 shrink-0 rounded-md border bg-background/70 px-2 py-1 text-[10px] text-muted-foreground"
          aria-live="polite"
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
              Loading related table…
            </span>
          ) : siblingData ? (
            <span className="text-emerald-600 dark:text-emerald-300">
              {siblingData.entries.length} related rows loaded
            </span>
          ) : loadError ? (
            <span className="text-destructive">Failed to load related table</span>
          ) : (
            "Optional — select the paired param file"
          )}
        </div>
      </div>

      {loadError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[10px] text-destructive">
          {loadError}
        </p>
      ) : null}

      <HitboxParamAnalysisContent
        fileType={fileType}
        data={data}
        selectedEntryIndex={selectedEntryIndex}
        siblingData={siblingData}
      />
    </section>
  )
}

export function HitboxParamAnalysisPanel(props: HitboxParamAnalysisPanelProps) {
  if (!isHitboxParamFileType(props.fileType)) return null
  return <LoadedHitboxParamAnalysisPanel {...props} fileType={props.fileType} />
}
