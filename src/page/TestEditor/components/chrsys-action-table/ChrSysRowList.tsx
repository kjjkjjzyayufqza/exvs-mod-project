import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import { cn } from "@/lib/utils"
import { ACTION_FIELD, cellOf, formatHex, isInputSelectable, toSigned } from "./chrSysModel"
import { CHRSYS_I18N_NAMESPACE, renderForms, renderInputLabel } from "./chrSysLabels"
import type { ChrSysIssue, ChrSysTableKey } from "./chrSysTypes"

const ROW_HEIGHT = 46
const TEXT_DRAG_PX = 4

interface ChrSysRowListProps {
  rows: number[][]
  /** Absolute row indices to render, in order (the filter result). */
  visibleIndices: number[]
  tableKey: ChrSysTableKey
  selectedRow: number
  onSelectRow: (row: number) => void
  issues: ChrSysIssue[]
}

export function rowSummary(
  t: TFunction,
  row: number[],
  tableKey: ChrSysTableKey,
): { primary: string; secondary: string } {
  if (tableKey === "actionTable") {
    const hash = cellOf(row, ACTION_FIELD.actionHash)
    return {
      primary: hash === 0 ? t("row.noActionHash") : formatHex(hash),
      secondary: `${renderInputLabel(t, row).summary} · ${renderForms(t, row)}`,
    }
  }
  const source = cellOf(row, 0x01)
  return {
    primary: source === 0 ? t("row.empty") : formatHex(source),
    secondary: t("row.transitionSummary", {
      mode: toSigned(cellOf(row, 0x06)),
      state: toSigned(cellOf(row, 0x02)),
    }),
  }
}

function isTextHighlightClick(event: ReactMouseEvent<HTMLElement>): boolean {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return false
  if (!selection.toString()) return false
  const node = selection.anchorNode
  return Boolean(node && event.currentTarget.contains(node))
}

export function ChrSysRowList({
  rows,
  visibleIndices,
  tableKey,
  selectedRow,
  onSelectRow,
  issues,
}: ChrSysRowListProps) {
  const { t } = useTranslation(CHRSYS_I18N_NAMESPACE)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null)
  const getViewport = useCallback(() => viewportRef.current, [])
  const virtualizer = useVirtualizer({
    count: visibleIndices.length,
    getScrollElement: getViewport,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const table = tableKey === "actionTable" ? "action" : "transition"
  const worstLevel = (rowIndex: number): "error" | "warning" | null => {
    const forRow = issues.filter((issue) => issue.table === table && issue.row === rowIndex)
    if (forRow.some((issue) => issue.level === "error")) return "error"
    return forRow.length > 0 ? "warning" : null
  }

  const activateRow = (rowIndex: number, event: ReactMouseEvent<HTMLElement>) => {
    const origin = pointerOrigin.current
    const dragged =
      origin !== null &&
      Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > TEXT_DRAG_PX
    if (dragged || isTextHighlightClick(event)) return
    onSelectRow(rowIndex)
  }

  return (
    <div
      ref={viewportRef}
      role="listbox"
      aria-label={tableKey === "actionTable" ? t("toolbar.actions") : t("toolbar.transitions")}
      aria-activedescendant={`chrsys-row-${tableKey}-${selectedRow}`}
      className="h-full min-h-0 cursor-text overflow-y-auto overscroll-contain select-text selection:bg-primary/25 selection:text-foreground"
    >
      <div className="relative w-full select-text" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const rowIndex = visibleIndices[item.index]
          const row = rows[rowIndex]
          if (!row) return null
          const level = worstLevel(rowIndex)
          const selected = rowIndex === selectedRow
          const { primary, secondary } = rowSummary(t, row, tableKey)
          const derived = tableKey === "actionTable" && !isInputSelectable(row)
          return (
            <div
              key={rowIndex}
              id={`chrsys-row-${tableKey}-${rowIndex}`}
              role="option"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onPointerDown={(event) => {
                pointerOrigin.current = { x: event.clientX, y: event.clientY }
              }}
              onClick={(event) => activateRow(rowIndex, event)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                event.preventDefault()
                onSelectRow(rowIndex)
              }}
              style={{ height: item.size, transform: `translateY(${item.start}px)` }}
              className={cn(
                "absolute left-0 top-0 flex w-full cursor-text items-center gap-2 border-b border-l-2 border-border/40 px-2.5 text-left outline-none select-text",
                "transition-[background-color,border-color] duration-150 ease-out",
                "focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                selected
                  ? "border-l-primary bg-muted/70 text-foreground"
                  : "border-l-transparent hover:bg-muted/45",
              )}
            >
              <span className="w-7 shrink-0 select-text font-mono text-[11px] tabular-nums text-muted-foreground">
                {rowIndex}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] whitespace-nowrap select-text [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {primary}
                  </span>
                  {level ? (
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        level === "error" ? "bg-destructive" : "bg-amber-500",
                      )}
                      aria-label={level}
                    />
                  ) : null}
                </span>
                <span className="block overflow-x-auto text-[10px] leading-tight whitespace-nowrap text-muted-foreground select-text [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {secondary}
                </span>
              </span>
              {derived ? (
                <span className="shrink-0 rounded-sm border px-1 text-[9px] text-muted-foreground select-text">
                  {t("row.derivedBadge")}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
