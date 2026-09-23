import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, ClipboardCopy, CircleSlash, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { WorkspacePathRow } from "./workspacePathRows";

export type LoadedPathsPanelProps = {
  rows: WorkspacePathRow[];
  /**
   * Probe result per row id. A row missing from this map has not been probed
   * yet, which is shown as such rather than guessed at.
   */
  presence: Record<string, boolean>;
};

/**
 * Every path the editor resolved, with whether it is actually there.
 *
 * The checker's own status line only ever says whether a route is blocked;
 * when the real problem is that the editor is pointed at the wrong workspace,
 * an old dplcache, or a mod folder the game does not load, nothing in the UI
 * used to say so. These rows are the debug surface for exactly that, and every
 * one of them copies with a click so it can be pasted into a report.
 */
export function LoadedPathsPanel({ rows, presence }: LoadedPathsPanelProps) {
  const { t } = useTranslation("test-triad-route");

  const missing = useMemo(
    () => rows.filter((row) => row.path.length === 0 || presence[row.id] === false),
    [rows, presence],
  );

  const copy = useCallback(
    async (label: string, value: string) => {
      if (!value) return;
      try {
        await writeText(value);
        toast.success(t("paths.copied", { name: label }));
      } catch (error) {
        toast.error(t("paths.copyFailed", { message: String(error) }));
      }
    },
    [t],
  );

  const copyAll = useCallback(() => {
    const report = rows
      .map((row) => {
        const state = row.path.length === 0 ? "unset" : presence[row.id] === false ? "missing" : "ok";
        const name = row.packLabel ?? t(`paths.row.${row.kind}`);
        const hash = row.hash ? ` ${row.hash}` : "";
        return `[${state}] ${name}${hash}: ${row.path || "-"}`;
      })
      .join("\n");
    void copy(t("paths.title"), report);
  }, [rows, presence, copy, t]);

  return (
    <section className="flex flex-col gap-1.5 rounded-md border border-dashed p-2.5">
      <header className="flex items-center gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("paths.title")}
        </h4>
        {missing.length > 0 ? (
          <span className="rounded bg-amber-500/10 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {t("paths.missingCount", { count: missing.length })}
          </span>
        ) : null}
        <button
          type="button"
          onClick={copyAll}
          className={cn(
            "ml-auto inline-flex min-h-7 items-center gap-1 rounded border px-1.5 text-[10px]",
            "text-muted-foreground transition-[background-color,color] duration-150 ease-out",
            "hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ClipboardCopy className="size-3" />
          {t("paths.copyAll")}
        </button>
      </header>

      <div className="flex flex-col">
        {rows.map((row) => (
          <PathRow
            key={row.id}
            row={row}
            present={row.path.length === 0 ? null : presence[row.id] ?? null}
            onCopy={copy}
          />
        ))}
      </div>
    </section>
  );
}

function PathRow({
  row,
  present,
  onCopy,
}: {
  row: WorkspacePathRow;
  /** `null` when the path is unset or has not been probed. */
  present: boolean | null;
  onCopy: (label: string, value: string) => Promise<void>;
}) {
  const { t } = useTranslation("test-triad-route");
  const name = row.packLabel ?? t(`paths.row.${row.kind}`);
  const isUnset = row.path.length === 0;

  return (
    <button
      type="button"
      disabled={isUnset}
      onClick={() => void onCopy(name, row.path)}
      title={isUnset ? undefined : t("paths.clickToCopy", { path: row.path })}
      className={cn(
        "group flex min-h-7 min-w-0 items-center gap-2 rounded px-1 text-left",
        "transition-[background-color] duration-150 ease-out",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-default disabled:hover:bg-transparent",
      )}
    >
      <StateIcon present={present} required={row.required} />
      <span className="w-40 shrink-0 truncate text-[11px]">{name}</span>
      {row.hash ? (
        <span className="w-24 shrink-0 font-mono text-[10px] text-muted-foreground">
          {row.hash}
        </span>
      ) : null}
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-mono text-[10px]",
          isUnset ? "italic text-muted-foreground" : "text-muted-foreground",
        )}
      >
        {isUnset ? t("paths.unset") : row.path}
      </span>
      {isUnset ? null : (
        <ClipboardCopy className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

function StateIcon({ present, required }: { present: boolean | null; required: boolean }) {
  if (present === true) {
    return <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />;
  }
  if (present === false) {
    return (
      <X
        className={cn(
          "size-3.5 shrink-0",
          required ? "text-destructive" : "text-muted-foreground",
        )}
      />
    );
  }
  return <CircleSlash className="size-3.5 shrink-0 text-muted-foreground/60" />;
}
