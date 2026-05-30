import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Box, Sparkles, Cloud, Package, RotateCcw } from "lucide-react";
import type { PlacementRow } from "../types/placement";
import { PLACEMENT_VDK_TYPES, type PlacementVdkType } from "../utils/placementFieldCatalog";
import { listPlacementFields } from "../utils/placementFieldModel";
import { PlacementFieldEditor } from "./PlacementFieldEditor";
import { VirtualizedList } from "./VirtualizedList";
import { PROP_BTN, PROP_BTN_ICON, PROP_INPUT, PROP_PANEL } from "./propertyPanelStyles";

const PLACEMENT_ROW_HEIGHT = 28;

interface PlacementCsvEditorPanelProps {
  entries: PlacementRow[];
  initialEntries: PlacementRow[] | null;
  placementHeader: string[];
  selectedIndex: number | null;
  subModels: Array<{ folderName: string; objectIndex: number }>;
  onSelectEntry: (index: number) => void;
  onFieldPreview: (index: number, fieldIndex: number, value: string) => void;
  onFieldCommit: (index: number, fieldIndex: number, value: string) => void;
  onAddField: (index: number, key: string, value: string) => void;
  onRemoveFieldPair: (index: number, fieldIndex: number) => void;
  onAddTyped: (vdkType: string) => void;
  onDeleteRow: (index: number) => void;
  onResetRow: (index: number) => void;
  onResetField: (index: number, fieldIndex: number) => void;
}

const VDK_TYPE_ICONS: Record<PlacementVdkType, typeof Box> = {
  OBJECT: Box,
  EFFECT: Sparkles,
  SKY: Cloud,
  PROP: Package,
};

const VDK_TYPE_LABELS: Record<PlacementVdkType, string> = {
  OBJECT: "Object",
  EFFECT: "Effect",
  SKY: "Sky",
  PROP: "Prop",
};

export function PlacementCsvEditorPanel({
  entries,
  initialEntries,
  placementHeader,
  selectedIndex,
  subModels,
  onSelectEntry,
  onFieldPreview,
  onFieldCommit,
  onAddField,
  onRemoveFieldPair,
  onAddTyped,
  onDeleteRow,
  onResetRow,
  onResetField,
}: PlacementCsvEditorPanelProps) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => {
        if (!lower) return true;
        const summary = listPlacementFields(entry, placementHeader)
          .map((field) => `${field.key} ${field.value}`)
          .join(" ");
        return `${index} ${entry.vdkType} ${entry.objectNumber ?? ""} ${summary}`
          .toLowerCase()
          .includes(lower);
      });
  }, [entries, filter, placementHeader]);

  const selectedEntry = selectedIndex !== null ? entries[selectedIndex] : null;
  const selectedInitial = selectedIndex !== null ? initialEntries?.[selectedIndex] ?? null : null;

  if (entries.length === 0) {
    return (
      <div data-testid="placement-csv-editor-panel" className="flex min-h-0 flex-col gap-2">
        <AddTypedButton onAddTyped={onAddTyped} />
        <div className="py-2 text-center text-[10px] text-muted-foreground">No placement data</div>
      </div>
    );
  }

  return (
    <div data-testid="placement-csv-editor-panel" className={`flex min-h-0 flex-col gap-2 ${PROP_PANEL}`}>
      <div className="flex items-center gap-1">
        <AddTypedButton onAddTyped={onAddTyped} />
      </div>
      <Input
        className={PROP_INPUT}
        placeholder="Filter rows by type, index, or field..."
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />

      <VirtualizedList
        items={rows}
        rowHeight={PLACEMENT_ROW_HEIGHT}
        getItemKey={(row) => row.index}
        className="max-h-40 overflow-y-auto border border-border/40 rounded-sm p-1"
        emptyState={
          <div className="py-2 text-center text-[10px] text-muted-foreground">
            No rows match the filter
          </div>
        }
        renderRow={({ entry, index }) => (
          <PlacementRowChip
            entry={entry}
            initialEntry={initialEntries?.[index] ?? null}
            index={index}
            selected={selectedIndex === index}
            onSelectEntry={onSelectEntry}
          />
        )}
      />

      {selectedEntry && selectedIndex !== null && (
        <div className="min-w-0 space-y-1.5 border-t border-border/30 pt-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Row #{selectedIndex}
            </span>
            {selectedInitial &&
              JSON.stringify(selectedEntry.rawFields) !== JSON.stringify(selectedInitial.rawFields) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className={`${PROP_BTN_ICON} text-muted-foreground hover:text-foreground`}
                      onClick={() => onResetRow(selectedIndex)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px]">
                    Reset row to loaded state
                  </TooltipContent>
                </Tooltip>
              )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={`${PROP_BTN_ICON} ml-auto text-muted-foreground hover:text-destructive`}
              onClick={() => onDeleteRow(selectedIndex)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <PlacementFieldEditor
            entry={selectedEntry}
            initialEntry={selectedInitial}
            placementHeader={placementHeader}
            subModels={subModels}
            onFieldPreview={(fieldIndex, value) => onFieldPreview(selectedIndex, fieldIndex, value)}
            onFieldCommit={(fieldIndex, value) => onFieldCommit(selectedIndex, fieldIndex, value)}
            onAddField={(key, value) => onAddField(selectedIndex, key, value)}
            onRemoveField={(keyIndex) => onRemoveFieldPair(selectedIndex, keyIndex)}
            onResetField={(fieldIndex) => onResetField(selectedIndex, fieldIndex)}
          />
        </div>
      )}
    </div>
  );
}

function AddTypedButton({ onAddTyped }: { onAddTyped: (vdkType: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className={PROP_BTN}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add row
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {PLACEMENT_VDK_TYPES.map((type) => {
          const Icon = VDK_TYPE_ICONS[type];
          return (
            <DropdownMenuItem key={type} onClick={() => onAddTyped(type)}>
              <Icon className="mr-2 h-3.5 w-3.5" />
              {VDK_TYPE_LABELS[type]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlacementRowChip({
  entry,
  initialEntry,
  index,
  selected,
  onSelectEntry,
}: {
  entry: PlacementRow;
  initialEntry: PlacementRow | null;
  index: number;
  selected: boolean;
  onSelectEntry: (index: number) => void;
}) {
  const rowModified =
    initialEntry !== null &&
    JSON.stringify(entry.rawFields) !== JSON.stringify(initialEntry.rawFields);
  const isNewRow = initialEntry === null;
  const nameField = getPlacementDisplayName(entry);
  const vdkKey = (entry.vdkType?.toUpperCase() ?? "") as PlacementVdkType;
  const Icon = VDK_TYPE_ICONS[vdkKey] ?? Box;
  const label = VDK_TYPE_LABELS[vdkKey] ?? entry.vdkType ?? "Row";

  return (
    <button
      type="button"
      className={cn(
        "flex h-full w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-sm border px-1.5 py-1 text-left transition-colors",
        selected ? "border-primary/50 bg-primary/10" : "border-border/40 hover:bg-muted/20",
        isNewRow && "border-l-2 border-l-green-500/60",
        rowModified && !isNewRow && "border-l-2 border-l-yellow-500/60",
      )}
      onClick={() => onSelectEntry(index)}
    >
      <Icon className={cn(
        "h-3.5 w-3.5 shrink-0",
        vdkKey === "EFFECT" ? "text-amber-400" :
        vdkKey === "SKY" ? "text-sky-400" :
        vdkKey === "PROP" ? "text-purple-400" :
        "text-muted-foreground",
      )} />
      <span className="shrink-0 text-[10px] font-mono text-muted-foreground">#{index}</span>
      <span className="min-w-0 truncate text-[10px] text-foreground/80" title={nameField ?? label}>
        {nameField ?? (entry.objectNumber !== null ? `${label} #${entry.objectNumber}` : label)}
      </span>
      {entry.objectNumber !== null && !nameField && entry.vdkType.toUpperCase() !== "OBJECT" && (
        <span className="shrink-0 text-[9px] font-mono text-muted-foreground/60">
          ({entry.posX.toFixed(0)}, {entry.posY.toFixed(0)}, {entry.posZ.toFixed(0)})
        </span>
      )}
    </button>
  );
}

function getPlacementDisplayName(entry: PlacementRow): string | null {
  for (let i = 0; i + 1 < entry.rawFields.length; i += 2) {
    if (entry.rawFields[i].trim().toUpperCase() === "VDK_PLACEMENT_NAME") {
      const value = entry.rawFields[i + 1]?.trim();
      return value ? value : null;
    }
  }
  return null;
}
