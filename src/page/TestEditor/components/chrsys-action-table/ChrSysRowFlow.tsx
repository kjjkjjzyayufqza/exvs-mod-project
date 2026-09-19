import { ArrowRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
  ACTION_FIELD,
  cellOf,
  derivedLinks,
  formatHex,
  groupEnterFunction,
  incomingDerivedRows,
  phaseFunction,
  toSigned,
} from "./chrSysModel"
import { CHRSYS_I18N_NAMESPACE, renderForms, renderInputLabel } from "./chrSysLabels"
import type { ChrSysMscLinks } from "./chrSysTypes"

interface ChrSysRowFlowProps {
  rows: number[][]
  rowIndex: number
  links: ChrSysMscLinks | null
  onSelectRow: (row: number) => void
}

function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[8.5rem] flex-1 rounded-md border bg-background px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="mt-1 space-y-0.5 text-[11px] leading-snug">{children}</div>
    </div>
  )
}

function Arrow() {
  return <ArrowRight className="mt-6 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
}

function RowLink({ row, onSelectRow, label }: { row: number; onSelectRow: (row: number) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onSelectRow(row)}
      className="rounded-sm px-1 font-mono tabular-nums text-foreground underline decoration-dotted underline-offset-2 transition-colors duration-150 ease-out hover:bg-accent hover:text-accent-foreground"
    >
      {label}
    </button>
  )
}

/** The engine path for one action row, in reading order: input -> row -> script -> follow-ups. */
export function ChrSysRowFlow({ rows, rowIndex, links, onSelectRow }: ChrSysRowFlowProps) {
  const { t } = useTranslation(CHRSYS_I18N_NAMESPACE)
  const row = rows[rowIndex]
  if (!row) return null
  const input = renderInputLabel(t, row)
  const group = cellOf(row, ACTION_FIELD.archetypeGroup)
  const enter = groupEnterFunction(links, group)
  const hooks: Array<[string, number]> = [
    ["enter", ACTION_FIELD.phaseEnter],
    ["tick", ACTION_FIELD.phaseTick],
    ["exit", ACTION_FIELD.phaseExit],
  ]
  const derived = derivedLinks(rows, rowIndex)
  const incoming = incomingDerivedRows(rows, rowIndex)
  const armsSlot = toSigned(cellOf(row, ACTION_FIELD.armsSlot))
  const transitionFirst = toSigned(cellOf(row, ACTION_FIELD.transitionFirst))
  const transitionLast = toSigned(cellOf(row, ACTION_FIELD.transitionLast))

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      <Step title={t("flow.input")}>
        <p>{input.summary}</p>
        <p className="text-muted-foreground">{renderForms(t, row)}</p>
        <p className="font-mono text-[10px] text-muted-foreground">
          commandType {toSigned(cellOf(row, ACTION_FIELD.commandType))} · leverMask{" "}
          {formatHex(cellOf(row, ACTION_FIELD.leverMask))}
        </p>
      </Step>
      <Arrow />
      <Step title={t("flow.row", { row: rowIndex })}>
        <p className="font-mono tabular-nums">{formatHex(cellOf(row, ACTION_FIELD.actionHash))}</p>
        <p className="text-muted-foreground">
          {t("flow.group", { group: group.toString(16).toUpperCase() })}
          {armsSlot !== 5 ? ` · ${t("flow.slot", { slot: armsSlot })}` : null}
        </p>
        {incoming.length > 0 ? (
          <p className="text-muted-foreground">
            {t("flow.from")}{" "}
            {incoming.map((source) => (
              <RowLink key={source} row={source} onSelectRow={onSelectRow} label={`#${source}`} />
            ))}
          </p>
        ) : null}
      </Step>
      <Arrow />
      <Step title={t("flow.handlers")}>
        <p className={cn("font-mono", enter ? "text-foreground" : "text-muted-foreground")}>
          {enter ?? t("flow.noGroupEnter")}
        </p>
        {hooks.map(([label, field]) => {
          const key = cellOf(row, field)
          const fn = phaseFunction(links, key)
          return (
            <p key={label} className="text-muted-foreground">
              {t(`flow.${label}`)}: <span className="font-mono">{key === 0 ? "-" : (fn ?? formatHex(key))}</span>
            </p>
          )
        })}
      </Step>
      <Arrow />
      <Step title={t("flow.followUps")}>
        {derived.length === 0 ? (
          <p className="text-muted-foreground">{t("flow.none")}</p>
        ) : (
          derived.map((link) => (
            <p key={link.slot} className="text-muted-foreground">
              {link.targetRow === null ? (
                <span className="font-mono text-destructive">{formatHex(link.hash)}</span>
              ) : (
                <RowLink row={link.targetRow} onSelectRow={onSelectRow} label={`#${link.targetRow}`} />
              )}
              <span className="ml-1 font-mono tabular-nums">{t("flow.frames", { value: link.delay })}</span>
            </p>
          ))
        )}
        {transitionFirst >= 0 ? (
          <p className="text-muted-foreground">
            {t("flow.transitions", { first: transitionFirst, last: transitionLast })}
          </p>
        ) : null}
      </Step>
    </div>
  )
}
