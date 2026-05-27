import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Box,
  Cloud,
  Sparkles,
  Package,
  Plus,
  Layers,
  LayoutGrid,
  List,
} from "lucide-react";
import type { PlacementRow } from "../../types/placement";
import { PLACEMENT_VDK_TYPES, type PlacementVdkType } from "../../utils/placementFieldCatalog";
import { PlacementModuleCard } from "./PlacementModuleCard";
import { PlacementObjectNumberMap } from "./PlacementObjectNumberMap";
import { PROP_PANEL } from "../propertyPanelStyles";

interface PlacementVisualizerPanelProps {
  entries: PlacementRow[];
  placementHeader: string[];
  subModels: Array<{ folderName: string; objectIndex: number }>;
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
  onAddTyped: (vdkType: string) => void;
}

type ViewMode = "cards" | "map";
type TypeFilter = PlacementVdkType | "ALL";

const TYPE_ICONS: Record<PlacementVdkType, typeof Box> = {
  OBJECT: Box,
  SKY: Cloud,
  EFFECT: Sparkles,
  PROP: Package,
};

const TYPE_COUNTS_COLORS: Record<PlacementVdkType, string> = {
  OBJECT: "text-emerald-400",
  SKY: "text-sky-400",
  EFFECT: "text-amber-400",
  PROP: "text-violet-400",
};

export function PlacementVisualizerPanel({
  entries,
  placementHeader,
  subModels,
  selectedIndex,
  onSelectEntry,
  onAddTyped,
}: PlacementVisualizerPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [search, setSearch] = useState("");

  // Type counts for the summary strip
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { OBJECT: 0, SKY: 0, EFFECT: 0, PROP: 0 };
    for (const e of entries) {
      const t = e.vdkType.toUpperCase();
      if (t in counts) counts[t]++;
    }
    return counts;
  }, [entries]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const lower = search.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => {
        if (typeFilter !== "ALL" && entry.vdkType.toUpperCase() !== typeFilter) return false;
        if (!lower) return true;
        const modelName =
          entry.objectNumber !== null
            ? subModels.find((s) => s.objectIndex === entry.objectNumber)?.folderName ?? ""
            : "";
        return `${entry.vdkType} ${entry.objectNumber ?? ""} ${modelName} ${entry.posX} ${entry.posY} ${entry.posZ}`
          .toLowerCase()
          .includes(lower);
      });
  }, [entries, typeFilter, search, subModels]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", PROP_PANEL)}>
      {/* ─── Header: Summary Strip ─── */}
      <div className="flex items-center gap-1 rounded-md border border-border/30 bg-muted/10 px-2 py-1.5">
        <Layers className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-[10px] font-semibold text-muted-foreground">
          {entries.length} placements
        </span>
        <div className="ml-auto flex items-center gap-2">
          {PLACEMENT_VDK_TYPES.map((type) => {
            const count = typeCounts[type] ?? 0;
            if (count === 0) return null;
            const Icon = TYPE_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                className={cn(
                  "flex items-center gap-0.5 rounded-sm px-1 py-0.5 transition-colors",
                  typeFilter === type
                    ? "bg-primary/20 ring-1 ring-primary/40"
                    : "hover:bg-muted/40",
                )}
                onClick={() => setTypeFilter(typeFilter === type ? "ALL" : type)}
              >
                <Icon className={cn("h-3 w-3", TYPE_COUNTS_COLORS[type])} />
                <span className="text-[9px] font-mono text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── Toolbar ─── */}
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]">
              <Plus className="mr-1 h-3 w-3" />
              Add
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-36">
            {PLACEMENT_VDK_TYPES.map((type) => {
              const Icon = TYPE_ICONS[type];
              return (
                <DropdownMenuItem key={type} onClick={() => onAddTyped(type)}>
                  <Icon className="mr-2 h-3.5 w-3.5" />
                  {type}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          className="h-7 min-w-0 flex-1 text-[10px] px-2"
          placeholder="Search placements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex items-center rounded-md border border-border/30">
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-l-md transition-colors",
              viewMode === "cards" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/40",
            )}
            onClick={() => setViewMode("cards")}
            title="Card View"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-r-md transition-colors",
              viewMode === "map" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted/40",
            )}
            onClick={() => setViewMode("map")}
            title="Object Number Map"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Content ─── */}
      {viewMode === "cards" ? (
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-0.5">
          {filteredEntries.length === 0 ? (
            <div className="py-8 text-center text-[10px] text-muted-foreground/60">
              {entries.length === 0 ? "No placement data" : "No matching placements"}
            </div>
          ) : (
            filteredEntries.map(({ entry, index }) => (
              <PlacementModuleCard
                key={index}
                entry={entry}
                index={index}
                placementHeader={placementHeader}
                subModels={subModels}
                selected={selectedIndex === index}
                onSelect={onSelectEntry}
              />
            ))
          )}
        </div>
      ) : (
        <PlacementObjectNumberMap
          entries={entries}
          subModels={subModels}
          selectedIndex={selectedIndex}
          onSelectEntry={onSelectEntry}
        />
      )}
    </div>
  );
}
