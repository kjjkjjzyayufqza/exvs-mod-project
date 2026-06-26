import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { formatHash } from "@/models/commandTable"
import type { TypedParamEntryEditorMeta } from "./paramEntryUtils"

function EntryBadge({
  label,
  title,
  className,
}: {
  label: string
  title?: string
  className: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        className,
      )}
    >
      {label}
    </span>
  )
}

export function ParamEntryListBadges({ meta }: { meta: TypedParamEntryEditorMeta | undefined }) {
  if (!meta) return null

  const badges: ReactNode[] = []

  if (meta.origin === "copied") {
    const sourceLabel =
      meta.sourceEntryId !== undefined ? formatHash(meta.sourceEntryId) : meta.sourceIndex !== undefined ? `#${meta.sourceIndex}` : "source"
    badges.push(
      <EntryBadge
        key="copy"
        label="Copy"
        title={`Cloned from ${sourceLabel}`}
        className="border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300"
      />,
    )
  } else if (meta.origin === "blank") {
    badges.push(
      <EntryBadge
        key="new"
        label="New"
        title="Blank row added in this session"
        className="border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      />,
    )
  }

  if (meta.isDirty) {
    badges.push(
      <EntryBadge
        key="edited"
        label="Edited"
        title="Field values changed since load or creation"
        className="border-amber-500/35 bg-amber-500/12 text-amber-800 dark:text-amber-300"
      />,
    )
  }

  if (badges.length === 0) return null

  return <div className="flex flex-wrap items-center gap-1">{badges}</div>
}

export function paramEntryRowAccentClass(meta: TypedParamEntryEditorMeta | undefined, isSelected: boolean): string {
  if (isSelected) return "border-l-primary bg-primary/10"
  if (!meta) return "border-l-transparent"
  if (meta.origin === "copied") return "border-l-sky-500/70 bg-sky-500/[0.06]"
  if (meta.origin === "blank") return "border-l-emerald-500/70 bg-emerald-500/[0.06]"
  if (meta.isDirty) return "border-l-amber-500/70 bg-amber-500/[0.05]"
  return "border-l-transparent"
}
