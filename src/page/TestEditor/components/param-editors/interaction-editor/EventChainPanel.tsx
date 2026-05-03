import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface EventChainPanelProps {
  entry: TypedParamEntry | null;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

interface StatDisplay {
  label: string;
  value: number;
  max: number;
  color: string;
}

export function EventChainPanel({ entry }: EventChainPanelProps) {
  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an entry to view combat stats
      </div>
    );
  }

  const stats: StatDisplay[] = [
    { label: "Damage", value: num(entry, "damage"), max: 500, color: "#ef4444" },
    { label: "Knockback Force", value: num(entry, "knockbackForce"), max: 200, color: "#f59e0b" },
    { label: "Stun Value", value: num(entry, "stunValue"), max: 100, color: "#8b5cf6" },
    { label: "Down Value", value: num(entry, "downValue"), max: 100, color: "#3b82f6" },
    { label: "Hit Level", value: num(entry, "hitLevel"), max: 10, color: "#22c55e" },
  ];

  const maxBarW = 260;

  return (
    <div className="flex h-full flex-col items-center justify-center p-6">
      <h4 className="mb-4 text-[12px] font-semibold text-muted-foreground">
        Combat Stats
      </h4>
      <div className="w-full max-w-[400px] space-y-3">
        {stats.map((stat) => {
          const pct = stat.max > 0 ? Math.min(stat.value / stat.max, 1) : 0;
          return (
            <div key={stat.label}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{stat.label}</span>
                <span className="font-mono font-medium">{stat.value}</span>
              </div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct * 100}%`,
                    maxWidth: maxBarW,
                    backgroundColor: stat.color,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 text-center text-[10px]">
        <div>
          <div className="font-mono font-medium text-red-400">
            {num(entry, "stunFrame")}f
          </div>
          <div className="text-muted-foreground">Stun Frame</div>
        </div>
        <div>
          <div className="font-mono font-medium text-amber-400">
            {num(entry, "hitstopFrame")}f
          </div>
          <div className="text-muted-foreground">Hitstop</div>
        </div>
        <div>
          <div className="font-mono font-medium text-blue-400">
            {num(entry, "untechableFrame")}f
          </div>
          <div className="text-muted-foreground">Untechable</div>
        </div>
      </div>
    </div>
  );
}
