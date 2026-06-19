import type { TypedParamEntry } from "../../param-editor/typedParamTypes";

interface AmmoTimelineProps {
  entry: TypedParamEntry;
}

function num(entry: TypedParamEntry, key: string): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

const RAW_RELOAD_FIELDS = [
  ["0x04A2CFD6", "reloadStartFrame"],
  ["0x103171AE", "reloadTimeTotal"],
  ["0xA502BCF2", "reloadPerShotFrame"],
  ["0xA635CFC2", "reloadLockFrame"],
  ["0xEDC16AE3", "ammoReloadWaitFrame"],
  ["0x67364138", "cooldownFrame"],
] as const;

export function AmmoTimeline({ entry }: AmmoTimelineProps) {
  const ammoCount = num(entry, "ammoCount");
  const reloadType = num(entry, "reloadType");

  // AI decision (2026-06-19): show raw values only. RX-78-2 proves type 2
  // uses 0xA502BCF2=180 while the previous UI incorrectly showed 40f.
  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
        Raw Reload Fields
      </h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
        <span className="text-muted-foreground">0x4961274C</span>
        <span className="font-mono">{ammoCount}</span>
        <span className="text-muted-foreground">0x11DEE0C8</span>
        <span className="font-mono">Type {reloadType}</span>
        {RAW_RELOAD_FIELDS.map(([hash, key]) => (
          <span key={hash} className="contents">
            <span className="text-muted-foreground">{hash}</span>
            <span className="font-mono">{num(entry, key)}f</span>
          </span>
        ))}
      </div>
    </div>
  );
}
