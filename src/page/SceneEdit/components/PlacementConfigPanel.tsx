import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PlacementRow } from "../types/placement";
import { extractVdkConfig, type VdkConfigEntry } from "../utils/extractPlacementVdkConfig";
import { PROP_PANEL, PROP_ROW } from "./propertyPanelStyles";

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
    <div className={`space-y-0.5 ${PROP_PANEL}`}>
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
    <div className={cn(PROP_ROW, "rounded-sm px-1 py-0.5 hover:bg-muted/30")}>
      <span
        className={cn(
          "min-w-0 truncate text-[11px] font-mono",
          isHighlight ? "font-medium text-foreground" : "text-muted-foreground",
        )}
        title={config.key}
      >
        {config.key}
      </span>
      <span className="min-w-0 truncate text-right text-[11px] font-mono tabular-nums" title={config.value}>
        {config.value}
      </span>
    </div>
  );
}
