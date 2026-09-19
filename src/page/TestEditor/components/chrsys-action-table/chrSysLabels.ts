import type { TFunction } from "i18next"
import { describeInput, formsOf } from "./chrSysModel"

export const CHRSYS_I18N_NAMESPACE = "test-chrsys-action-table"

export interface ChrSysRenderedInput {
  command: string
  lever: string
  /** EXVS-style one liner, e.g. `N特格` in zh-CN or `N Special melee` in en-US. */
  summary: string
}

export function renderInputLabel(t: TFunction, row: readonly number[]): ChrSysRenderedInput {
  const label = describeInput(row)
  const base = t(`command.${label.command.key}`, label.command.params ?? {})
  const command = label.tier > 0 ? t("command.tier", { command: base, tier: label.tier + 1 }) : base
  const lever = t(`lever.${label.lever.key}`, label.lever.params ?? {})
  const summary =
    label.kind === "input"
      ? t("row.summaryInput", { lever, command })
      : t("row.summaryOther", { command, lever })
  return { command, lever, summary }
}

export function renderForms(t: TFunction, row: readonly number[]): string {
  const forms = formsOf(row)
  return forms.length === 0 ? t("row.formsAll") : t("row.forms", { forms: forms.join("/") })
}
