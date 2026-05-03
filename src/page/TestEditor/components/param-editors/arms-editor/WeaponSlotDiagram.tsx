import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface WeaponSlotDiagramProps {
  entry: TypedParamEntry;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

interface StatBar {
  label: string;
  value: number;
  max: number;
  color: string;
}

export function WeaponSlotDiagram({ entry }: WeaponSlotDiagramProps) {
  const stats: StatBar[] = [
    { label: "Damage", value: num(entry, "damage"), max: 500, color: "#ef4444" },
    { label: "Ammo", value: num(entry, "ammoCount"), max: 20, color: "#3b82f6" },
    { label: "Reload", value: num(entry, "reloadTimeTotal"), max: 600, color: "#22c55e" },
    { label: "Startup", value: num(entry, "startupFrame"), max: 60, color: "#f59e0b" },
    { label: "Active", value: num(entry, "activeFrame"), max: 120, color: "#8b5cf6" },
    { label: "Recovery", value: num(entry, "recoveryFrame"), max: 60, color: "#ec4899" },
  ];

  return (
    <div className="rounded-md border bg-card p-4 shadow-sm">
      <h4 className="mb-3 text-[11px] font-semibold text-muted-foreground">
        Weapon Stats
      </h4>
      <div className="space-y-2">
        {stats.map((s) => {
          const pct = s.max > 0 ? Math.min((s.value / s.max) * 100, 100) : 0;
          return (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
                {s.label}
              </span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: s.color }}
                />
              </div>
              <span className="w-12 font-mono text-[10px]">{s.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
