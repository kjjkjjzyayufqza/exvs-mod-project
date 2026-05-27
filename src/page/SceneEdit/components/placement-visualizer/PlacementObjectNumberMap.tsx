import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Box, Cloud, Sparkles, Package, ArrowRight } from "lucide-react";
import type { PlacementRow } from "../../types/placement";
import type { PlacementVdkType } from "../../utils/placementFieldCatalog";

interface PlacementObjectNumberMapProps {
  entries: PlacementRow[];
  subModels: Array<{ folderName: string; objectIndex: number }>;
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
}

const TYPE_COLORS: Record<PlacementVdkType, string> = {
  OBJECT: "border-emerald-500/50 bg-emerald-950/30 text-emerald-300",
  SKY: "border-sky-500/50 bg-sky-950/30 text-sky-300",
  EFFECT: "border-amber-500/50 bg-amber-950/30 text-amber-300",
  PROP: "border-violet-500/50 bg-violet-950/30 text-violet-300",
};

const TYPE_ICONS: Record<PlacementVdkType, typeof Box> = {
  OBJECT: Box,
  SKY: Cloud,
  EFFECT: Sparkles,
  PROP: Package,
};

interface ObjectSlot {
  objectIndex: number;
  folderName: string;
  placements: Array<{ entry: PlacementRow; rowIndex: number }>;
}

export function PlacementObjectNumberMap({
  entries,
  subModels,
  selectedIndex,
  onSelectEntry,
}: PlacementObjectNumberMapProps) {
  // Build a mapping: objectIndex -> subModel + all placement rows referencing it
  const slots = useMemo(() => {
    const slotMap = new Map<number, ObjectSlot>();

    // Initialize slots from subModels
    for (const sm of subModels) {
      slotMap.set(sm.objectIndex, {
        objectIndex: sm.objectIndex,
        folderName: sm.folderName,
        placements: [],
      });
    }

    // Assign placements to slots
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.objectNumber === null) continue;
      const slot = slotMap.get(entry.objectNumber);
      if (slot) {
        slot.placements.push({ entry, rowIndex: i });
      } else {
        // Orphan placement — no matching model
        slotMap.set(entry.objectNumber, {
          objectIndex: entry.objectNumber,
          folderName: `[unknown #${entry.objectNumber}]`,
          placements: [{ entry, rowIndex: i }],
        });
      }
    }

    return Array.from(slotMap.values()).sort((a, b) => a.objectIndex - b.objectIndex);
  }, [entries, subModels]);

  // Placements without object numbers (effects, etc.)
  const unlinked = useMemo(
    () =>
      entries
        .map((entry, rowIndex) => ({ entry, rowIndex }))
        .filter(({ entry }) => entry.objectNumber === null),
    [entries],
  );

  return (
    <div className="flex-1 space-y-2 overflow-y-auto pr-0.5">
      {/* Object Number Slot Map */}
      <div className="space-y-1">
        <div className="px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Object Number → Model Mapping
        </div>
        {slots.map((slot) => (
          <ObjectSlotRow
            key={slot.objectIndex}
            slot={slot}
            selectedIndex={selectedIndex}
            onSelectEntry={onSelectEntry}
          />
        ))}
      </div>

      {/* Unlinked placements */}
      {unlinked.length > 0 && (
        <div className="space-y-1 border-t border-border/20 pt-2">
          <div className="px-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">
            Unlinked (no object number)
          </div>
          {unlinked.map(({ entry, rowIndex }) => {
            const vdkType = (entry.vdkType?.toUpperCase() ?? "EFFECT") as PlacementVdkType;
            const Icon = TYPE_ICONS[vdkType] ?? Sparkles;
            return (
              <button
                key={rowIndex}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm border px-2 py-1 text-left transition-colors",
                  selectedIndex === rowIndex
                    ? "border-primary/50 bg-primary/10"
                    : "border-border/30 hover:bg-muted/20",
                )}
                onClick={() => onSelectEntry(rowIndex)}
              >
                <Icon className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-[9px] font-mono text-muted-foreground">#{rowIndex}</span>
                <span className="text-[10px] text-foreground/70">{entry.vdkType}</span>
                <span className="ml-auto text-[8px] font-mono text-muted-foreground/50">
                  ({entry.posX.toFixed(0)}, {entry.posY.toFixed(0)}, {entry.posZ.toFixed(0)})
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ObjectSlotRow({
  slot,
  selectedIndex,
  onSelectEntry,
}: {
  slot: ObjectSlot;
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
}) {
  const hasSelection = slot.placements.some((p) => p.rowIndex === selectedIndex);

  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        hasSelection ? "border-primary/40 bg-primary/5" : "border-border/20 bg-muted/5",
      )}
    >
      {/* Slot header */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/10">
        <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-muted/40 text-[10px] font-bold font-mono text-foreground/80">
          {slot.objectIndex}
        </div>
        <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
        <span className="text-[10px] font-mono text-foreground/70 truncate">
          {slot.folderName}
        </span>
        <span className="ml-auto text-[8px] font-mono text-muted-foreground/50">
          {slot.placements.length} ref{slot.placements.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Referenced placements */}
      {slot.placements.length > 0 && (
        <div className="space-y-0.5 p-1">
          {slot.placements.map(({ entry, rowIndex }) => {
            const vdkType = (entry.vdkType?.toUpperCase() ?? "OBJECT") as PlacementVdkType;
            const colors = TYPE_COLORS[vdkType] ?? TYPE_COLORS.OBJECT;
            return (
              <button
                key={rowIndex}
                type="button"
                className={cn(
                  "flex w-full items-center gap-1.5 rounded-sm border px-1.5 py-1 text-left text-[9px] transition-colors",
                  selectedIndex === rowIndex
                    ? "border-primary/50 bg-primary/15"
                    : cn("hover:bg-muted/20", colors),
                )}
                onClick={() => onSelectEntry(rowIndex)}
              >
                <span className="font-mono text-muted-foreground/60">row#{rowIndex}</span>
                <span className="font-semibold">{vdkType}</span>
                <span className="ml-auto font-mono text-muted-foreground/50 tabular-nums">
                  pos({entry.posX.toFixed(0)},{entry.posY.toFixed(0)},{entry.posZ.toFixed(0)})
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
