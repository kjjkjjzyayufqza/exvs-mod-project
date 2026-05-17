import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PlacementRow } from "../types/placement";
import { extractVdkConfig, type VdkConfigEntry } from "../utils/extractPlacementVdkConfig";

interface PlacementConfigPanelProps {
  entry: PlacementRow;
  placementHeader: string[];
}

export function PlacementConfigPanel({ entry, placementHeader }: PlacementConfigPanelProps) {
  const configs = useMemo(
    () => extractVdkConfig(entry, placementHeader),
    [entry, placementHeader],
  );

  if (configs.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground py-1">
        No additional config fields
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {configs.map((c, i) => (
        <ConfigRow key={`${i}-${c.key}`} config={c} />
      ))}
    </div>
  );
}

function ConfigRow({ config }: { config: VdkConfigEntry }) {
  const isHighlight = config.key.toUpperCase() === "VDK_INITIAL_SPAWN" ||
    config.key.toUpperCase() === "VDK_PROGRAMID";

  return (
    <div className="flex items-center justify-between gap-2 px-1 py-0.5 rounded-sm hover:bg-muted/30">
      <span
        className={cn(
          "text-[9px] font-mono truncate",
          isHighlight ? "text-foreground font-medium" : "text-muted-foreground",
        )}
      >
        {config.key}
      </span>
      <span className="text-[9px] font-mono text-right shrink-0 tabular-nums">
        {config.value}
      </span>
    </div>
  );
}
