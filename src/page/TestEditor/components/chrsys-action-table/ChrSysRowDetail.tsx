import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChrSysFieldInput } from "./ChrSysFieldInput"
import { ChrSysRowFlow } from "./ChrSysRowFlow"
import { ACTION_FIELD, cellOf, formatHex, groupEnterFunction, phaseFunction, toSigned } from "./chrSysModel"
import { CHRSYS_I18N_NAMESPACE } from "./chrSysLabels"
import type {
  ChrSysFieldSection,
  ChrSysFieldSpec,
  ChrSysMscLinks,
  ChrSysTableKey,
} from "./chrSysTypes"

const SECTION_ORDER: ChrSysFieldSection[] = [
  "identity",
  "inputCommand",
  "routing",
  "phaseHooks",
  "derivedChain",
  "motionTuning",
  "transition",
  "archetypeParams",
  "unused",
]

interface ChrSysRowDetailProps {
  rows: number[][]
  rowIndex: number
  tableKey: ChrSysTableKey
  specs: ChrSysFieldSpec[]
  links: ChrSysMscLinks | null
  onSetCell: (field: number, value: number) => void
  onSelectRow: (row: number) => void
}

/** The notation the editable input is not showing, so hex and decimal are both readable. */
function formatAlternate(value: number, format: ChrSysFieldSpec["format"]): string {
  const signed = toSigned(value)
  if (format === "signed") return formatHex(value)
  return signed < 0 ? `${value >>> 0} / ${signed}` : String(value >>> 0)
}

function fieldHint(
  field: number,
  value: number,
  links: ChrSysMscLinks | null,
  rows: number[][],
): string | null {
  if (!links) return null
  if (field === ACTION_FIELD.archetypeGroup) {
    const fn = groupEnterFunction(links, value)
    return fn ? `${links.groupResolverFunction} -> ${fn}` : `${links.groupResolverFunction} has no case`
  }
  if (field === ACTION_FIELD.phaseEnter || field === ACTION_FIELD.phaseTick || field === ACTION_FIELD.phaseExit) {
    if (value === 0) return null
    const fn = phaseFunction(links, value)
    return fn ? `${links.phaseResolverFunction} -> ${fn}` : `${links.phaseResolverFunction} has no case`
  }
  if (field >= ACTION_FIELD.derivedHashFirst && field < ACTION_FIELD.derivedHashFirst + 10 && value !== 0) {
    const target = rows.findIndex((row, index) => index > 0 && cellOf(row, ACTION_FIELD.actionHash) === value)
    return target < 0 ? "no row carries this hash" : `row ${target}`
  }
  const global = links.fieldGlobals.find((entry) => entry.field === field)
  if (!global) return null
  const readers = global.readerFunctions.slice(0, 3).join(", ")
  return `${global.global} read by ${readers}${global.readerFunctions.length > 3 ? ", ..." : ""}`
}

export function ChrSysRowDetail({
  rows,
  rowIndex,
  tableKey,
  specs,
  links,
  onSetCell,
  onSelectRow,
}: ChrSysRowDetailProps) {
  const { t } = useTranslation(CHRSYS_I18N_NAMESPACE)
  const [openSections, setOpenSections] = useState<ChrSysFieldSection[]>(SECTION_ORDER)
  const [showZeroParams, setShowZeroParams] = useState(true)
  const row = rows[rowIndex]

  const grouped = useMemo(() => {
    const map = new Map<ChrSysFieldSection, ChrSysFieldSpec[]>()
    for (const spec of specs) {
      const list = map.get(spec.section) ?? []
      list.push(spec)
      map.set(spec.section, list)
    }
    return map
  }, [specs])

  if (!row) {
    return <p className="p-4 text-xs text-muted-foreground">{t("detail.selectRow")}</p>
  }

  const toggle = (section: ChrSysFieldSection) =>
    setOpenSections((prev) =>
      prev.includes(section) ? prev.filter((entry) => entry !== section) : [...prev, section],
    )

  return (
    <div className="flex h-full min-h-0 flex-col">
      {tableKey === "actionTable" ? (
        <div className="shrink-0 border-b bg-muted/20 p-3">
          <ChrSysRowFlow rows={rows} rowIndex={rowIndex} links={links} onSelectRow={onSelectRow} />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6 pt-2">
        {SECTION_ORDER.map((section) => {
          const sectionSpecs = grouped.get(section)
          if (!sectionSpecs || sectionSpecs.length === 0) return null
          const open = openSections.includes(section)
          const filtered =
            section !== "archetypeParams" && section !== "unused"
              ? sectionSpecs
              : showZeroParams
                ? sectionSpecs
                : sectionSpecs.filter((spec) => cellOf(row, spec.field) !== 0)
          const visible = open ? filtered : []
          return (
            <section key={section} className="mt-3 first:mt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggle(section)}
                  className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium transition-colors duration-150 ease-out hover:bg-muted"
                >
                  <span className={cn("transition-transform duration-150 ease-out", open && "rotate-90")}>›</span>
                  {t(`sections.${section}`)}
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {filtered.length === sectionSpecs.length
                      ? sectionSpecs.length
                      : `${filtered.length}/${sectionSpecs.length}`}
                  </span>
                </button>
                {open && (section === "archetypeParams" || section === "unused") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => setShowZeroParams((prev) => !prev)}
                  >
                    {showZeroParams ? t("detail.hideZeroColumns") : t("detail.showZeroColumns")}
                  </Button>
                ) : null}
              </div>

              {open ? (
                <div className="mt-1 divide-y divide-border/40 rounded-md border">
                  {visible.map((spec) => {
                    const value = cellOf(row, spec.field)
                    const hint = tableKey === "actionTable" ? fieldHint(spec.field, value, links, rows) : null
                    return (
                      <div key={spec.key} className="grid grid-cols-[minmax(0,1fr)_10.5rem] items-center gap-2 px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[11px] font-medium" title={spec.description}>
                              {spec.label}
                            </span>
                            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                              0x{spec.field.toString(16).toUpperCase().padStart(2, "0")}
                            </span>
                            <Badge
                              variant="outline"
                              className="h-4 px-1 font-mono text-[9px] text-muted-foreground"
                              title={t("detail.evidenceTitle", { grade: spec.evidence })}
                            >
                              {spec.evidence}
                            </Badge>
                          </div>
                          <p className="truncate text-[10px] text-muted-foreground" title={spec.description}>
                            {hint ?? spec.key}
                          </p>
                        </div>
                        <div className="flex flex-col items-stretch gap-0.5">
                          <ChrSysFieldInput
                            value={value}
                            format={spec.format}
                            onCommit={(next) => onSetCell(spec.field, next)}
                          />
                          <span className="px-1 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
                            {formatAlternate(value, spec.format)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {visible.length === 0 ? (
                    <p className="px-2 py-2 text-[10px] text-muted-foreground">
                      {t("detail.allZero", { value: sectionSpecs.length })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          )
        })}

        {tableKey === "actionTable" ? (
          <p className="mt-4 text-[10px] text-muted-foreground">
            {t("detail.footnote", { hash: formatHex(cellOf(row, ACTION_FIELD.actionHash)) })}.
          </p>
        ) : null}
      </div>
    </div>
  )
}
