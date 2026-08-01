import type { TypedParamEntry } from "../../param-editor/typedParamTypes";
import {
  BULLET_TYPE_LABELS,
  RELOAD_TYPE_LABELS,
  type ReloadType,
} from "@/lib/gameAlgorithms/reloadSystem";
import {
  formatHashU32,
  getArmsFlagChips,
  buildArmsOverviewStats,
  numField,
} from "./armsFieldModel";

interface WeaponSlotDiagramProps {
  entry: TypedParamEntry;
}

export function WeaponSlotDiagram({ entry }: WeaponSlotDiagramProps) {
  const stats = buildArmsOverviewStats(entry);
  const flags = getArmsFlagChips(entry);
  const entryId =
    typeof entry.entryId === "number" ? (entry.entryId as number) : 0;
  const reloadType = numField(entry, "reloadType");
  const bulletType = numField(entry, "bulletType");
  const reloadLabel =
    RELOAD_TYPE_LABELS[reloadType as ReloadType] ?? `Type ${reloadType}`;
  const bulletLabel = BULLET_TYPE_LABELS[bulletType] ?? `Type ${bulletType}`;

  return (
    <section className="rounded-lg border border-border/60 bg-card/80 p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset]">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
            Arms overview
          </h4>
          <p className="font-mono text-[12px] font-semibold tabular-nums tracking-tight">
            {formatHashU32(entryId)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
            reload {reloadLabel}
          </span>
          <span className="rounded border border-border/50 bg-muted/30 px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground">
            bullet {bulletLabel}
          </span>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {flags.map((flag) => (
          <span
            key={flag.key}
            className={
              flag.active
                ? "rounded-md border border-primary/35 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-foreground"
                : "rounded-md border border-border/40 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground/70"
            }
          >
            {flag.label}
          </span>
        ))}
      </div>

      <div className="space-y-2.5">
        {stats.map((stat) => {
          const pct =
            stat.max > 0 ? Math.min((stat.value / stat.max) * 100, 100) : 0;
          return (
            <div key={stat.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2">
              <span className="text-right text-[10px] text-muted-foreground">
                {stat.label}
              </span>
              <div className="h-2 overflow-hidden rounded-sm bg-muted/60">
                <div
                  className="h-full rounded-sm bg-primary/75 transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="truncate text-right font-mono text-[10px] tabular-nums text-foreground/90">
                {stat.display}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
