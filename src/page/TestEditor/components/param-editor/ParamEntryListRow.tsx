import type { CSSProperties } from "react"
import { Copy, Star } from "lucide-react"
import { writeText } from "@tauri-apps/plugin-clipboard-manager"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { formatHash } from "@/models/commandTable"
import { cn } from "@/lib/utils"
import type { TypedParamEntryEditorMeta } from "./paramEntryUtils"
import { ParamEntryListBadges, paramEntryRowAccentClass } from "./ParamEntryListBadges"

async function copyEntryId(entryId: number) {
  const value = formatHash(entryId)
  try {
    await writeText(value)
    toast.success(`${value} copied`)
  } catch {
    toast.error("Failed to copy entry id")
  }
}

export function ParamEntryListRow({
  entryIndex,
  entryId,
  actionLabel,
  resourceLabel,
  meta,
  isSelected,
  isHighlighted,
  onSelect,
  onToggleHighlight,
  measureRef,
  dataIndex,
  style,
}: {
  entryIndex: number
  entryId: number
  actionLabel?: string | null
  resourceLabel?: string | null
  meta: TypedParamEntryEditorMeta | undefined
  isSelected: boolean
  isHighlighted: boolean
  onSelect: () => void
  onToggleHighlight: () => void
  measureRef?: (element: HTMLDivElement | null) => void
  dataIndex: number
  style: CSSProperties
}) {
  const hasLabels = Boolean(actionLabel || resourceLabel)

  return (
    <div
      ref={measureRef}
      data-index={dataIndex}
      className={cn(
        "absolute left-0 top-0 flex w-full gap-1.5 overflow-hidden border-b border-border/40 px-2.5 py-2 text-left text-xs transition-[background-color,border-color,box-shadow] duration-200",
        "border-l-[3px]",
        isSelected
          ? "border-l-primary bg-primary/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]"
          : isHighlighted
            ? "border-l-amber-400/80 bg-amber-500/[0.08]"
            : paramEntryRowAccentClass(meta, false),
        !isSelected && "hover:bg-muted/45",
      )}
      style={style}
    >
      <button
        type="button"
        className="min-w-0 flex-1 space-y-1 overflow-hidden rounded-sm px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={onSelect}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 truncate font-mono text-[11px] font-semibold tabular-nums tracking-tight">
            {formatHash(entryId)}
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">#{entryIndex}</span>
        </div>
        {hasLabels ? (
          <div className="min-w-0 space-y-0.5 overflow-hidden">
            {actionLabel ? (
              <div
                className="min-w-0 truncate font-mono text-[10px] leading-snug text-muted-foreground"
                title={actionLabel}
              >
                {actionLabel}
              </div>
            ) : null}
            {resourceLabel ? (
              <div
                className="min-w-0 truncate font-mono text-[10px] leading-snug text-muted-foreground/85"
                title={resourceLabel}
              >
                {resourceLabel}
              </div>
            ) : null}
          </div>
        ) : null}
        <ParamEntryListBadges meta={meta} />
      </button>

      <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-muted-foreground transition-[background-color,transform,color] duration-200 hover:bg-muted/60 hover:text-foreground active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/30"
          title={`Copy ${formatHash(entryId)}`}
          aria-label={`Copy entry id ${formatHash(entryId)}`}
          onClick={(event) => {
            event.stopPropagation()
            void copyEntryId(entryId)
          }}
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={cn(
            "h-6 w-6 text-muted-foreground transition-[background-color,transform,color] duration-200 hover:bg-muted/60 hover:text-amber-600 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary/30 dark:hover:text-amber-300",
            isHighlighted && "text-amber-600 dark:text-amber-300",
          )}
          title={isHighlighted ? "Remove highlight" : "Highlight entry"}
          aria-label={isHighlighted ? "Remove highlight" : "Highlight entry"}
          aria-pressed={isHighlighted}
          onClick={(event) => {
            event.stopPropagation()
            onToggleHighlight()
          }}
        >
          <Star className={cn("h-3 w-3", isHighlighted && "fill-current")} />
        </Button>
      </div>
    </div>
  )
}
