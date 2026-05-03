import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface AmmoTimelineProps {
  entry: TypedParamEntry;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

const RELOAD_TYPE_LABELS: Record<number, string> = {
  0: "All At Once",
  1: "One By One",
  2: "Continuous",
};

export function AmmoTimeline({ entry }: AmmoTimelineProps) {
  const ammoCount = num(entry, "ammoCount");
  const reloadTimeTotal = num(entry, "reloadTimeTotal");
  const firingInterval = Math.max(num(entry, "firingIntervalFrame"), 1);
  const reloadType = num(entry, "reloadType");

  const totalFireTime = ammoCount * firingInterval;
  const totalCycleTime = totalFireTime + reloadTimeTotal;
  const shotsPerSec =
    totalCycleTime > 0 ? (ammoCount * 60) / totalCycleTime : 0;

  if (ammoCount === 0) {
    return (
      <div className="rounded-md border bg-card p-3 text-center text-[11px] text-muted-foreground">
        No ammo data (ammoCount = 0)
      </div>
    );
  }

  const fireWidth =
    totalCycleTime > 0 ? (totalFireTime / totalCycleTime) * 100 : 50;
  const reloadWidth = 100 - fireWidth;

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Reload Cycle
      </h4>
      <div className="mb-2 flex h-5 w-full overflow-hidden rounded-full">
        <div
          className="flex items-center justify-center bg-blue-500 text-[9px] font-medium text-white"
          style={{ width: `${fireWidth}%` }}
        >
          {ammoCount} shots
        </div>
        <div
          className="flex items-center justify-center bg-slate-700 text-[9px] text-slate-300"
          style={{ width: `${reloadWidth}%` }}
        >
          Reload {reloadTimeTotal}f
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
        <span className="text-muted-foreground">Ammo count:</span>
        <span className="font-mono">{ammoCount}</span>
        <span className="text-muted-foreground">Fire interval:</span>
        <span className="font-mono">{firingInterval}f</span>
        <span className="text-muted-foreground">Fire cycle:</span>
        <span className="font-mono">
          {totalFireTime}f ({(totalFireTime / 60).toFixed(2)}s)
        </span>
        <span className="text-muted-foreground">Full cycle:</span>
        <span className="font-mono">
          {totalCycleTime}f ({(totalCycleTime / 60).toFixed(2)}s)
        </span>
        <span className="text-muted-foreground">Shots/sec (sustained):</span>
        <span className="font-mono">{shotsPerSec.toFixed(1)}</span>
        <span className="text-muted-foreground">Reload type:</span>
        <span className="font-mono">
          {RELOAD_TYPE_LABELS[reloadType] ?? `Type ${reloadType}`}
        </span>
      </div>
    </div>
  );
}
