import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Box, Sparkles, Cloud } from "lucide-react";
import type { PlacementRow } from "../types/placement";

interface PlacementCsvEditorPanelProps {
  entries: PlacementRow[];
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
  onFieldChange: (index: number, fieldIndex: number, value: string) => void;
  onAddFieldPair: (index: number) => void;
  onRemoveFieldPair: (index: number, fieldIndex: number) => void;
  onAddTyped: (vdkType: string) => void;
  onDeleteRow: (index: number) => void;
}

const KNOWN_VDK_TYPES = [
  { type: "OBJECT", label: "Object", icon: Box },
  { type: "EFFECT", label: "Effect", icon: Sparkles },
  { type: "SKY", label: "Sky", icon: Cloud },
] as const;

const TRANSFORM_KEYS = new Set([
  "VDK_POSITION_X",
  "VDK_POSITION_Y",
  "VDK_POSITION_Z",
  "VDK_ROTATION_X",
  "VDK_ROTATION_Y",
  "VDK_ROTATION_Z",
  "VDK_SCALE_X",
  "VDK_SCALE_Y",
  "VDK_SCALE_Z",
]);

export function PlacementCsvEditorPanel({
  entries,
  selectedIndex,
  onSelectEntry,
  onFieldChange,
  onAddFieldPair,
  onRemoveFieldPair,
  onAddTyped,
  onDeleteRow,
}: PlacementCsvEditorPanelProps) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => {
        if (!lower) return true;
        return `${index} ${entry.vdkType} ${entry.objectNumber ?? ""} ${entry.rawFields.join(" ")}`.toLowerCase().includes(lower);
      });
  }, [entries, filter]);

  if (entries.length === 0) {
    return (
      <div data-testid="placement-csv-editor-panel" className="flex min-h-0 flex-col gap-2">
        <AddTypedButton onAddTyped={onAddTyped} />
        <div className="py-2 text-center text-[10px] text-muted-foreground">No placement data</div>
      </div>
    );
  }

  return (
    <div data-testid="placement-csv-editor-panel" className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <AddTypedButton onAddTyped={onAddTyped} />
      </div>
      <Input
        className="h-6 text-[10px]"
        placeholder="Filter placement rows..."
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="space-y-1">
        {rows.map(({ entry, index }) => (
          <PlacementRowItem
            key={index}
            entry={entry}
            index={index}
            selected={selectedIndex === index}
            onSelectEntry={onSelectEntry}
            onFieldChange={onFieldChange}
            onAddFieldPair={onAddFieldPair}
            onRemoveFieldPair={onRemoveFieldPair}
            onDeleteRow={onDeleteRow}
          />
        ))}
      </div>
    </div>
  );
}

function AddTypedButton({ onAddTyped }: { onAddTyped: (vdkType: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]">
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {KNOWN_VDK_TYPES.map(({ type, label, icon: Icon }) => (
          <DropdownMenuItem key={type} onClick={() => onAddTyped(type)}>
            <Icon className="mr-2 h-3.5 w-3.5" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlacementRowItem({
  entry,
  index,
  selected,
  onSelectEntry,
  onFieldChange,
  onAddFieldPair,
  onRemoveFieldPair,
  onDeleteRow,
}: {
  entry: PlacementRow;
  index: number;
  selected: boolean;
  onSelectEntry: (index: number) => void;
  onFieldChange: (index: number, fieldIndex: number, value: string) => void;
  onAddFieldPair: (index: number) => void;
  onRemoveFieldPair: (index: number, fieldIndex: number) => void;
  onDeleteRow: (index: number) => void;
}) {
  return (
    <div className={cn("rounded-sm border px-1.5 py-1", selected ? "border-primary/50 bg-primary/5" : "border-border/50")}>
      <button type="button" className="flex w-full items-center gap-1.5 text-left" onClick={() => onSelectEntry(index)}>
        <Badge variant={entry.vdkType === "EFFECT" ? "destructive" : entry.vdkType === "SKY" ? "outline" : "secondary"} className="h-4 px-1 text-[8px]">
          {entry.vdkType || "ROW"}
        </Badge>
        <span className="text-[9px] font-mono text-muted-foreground">#{index}</span>
        {entry.objectNumber !== null && <span className="text-[9px] font-mono">obj {entry.objectNumber}</span>}
      </button>
      {selected && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onAddFieldPair(index)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Field
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 ml-auto text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteRow(index)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {entry.rawFields.map((field, fieldIndex) => {
            if (fieldIndex % 2 !== 0) return null;
            const valueIndex = fieldIndex + 1;
            const value = entry.rawFields[valueIndex] ?? "";
            const numericValue = Number.parseFloat(value);
            const numeric = Number.isFinite(numericValue);
            const key = field.trim().toUpperCase();
            const sliderRange = key.includes("ROTATION")
              ? { min: -360, max: 360, step: 0.1 }
              : key.includes("SCALE")
                ? { min: 0, max: 4, step: 0.01 }
                : key.includes("POSITION")
                  ? { min: -10000, max: 10000, step: 0.1 }
                  : null;
            return (
              <div key={`${fieldIndex}-${field}`} className="space-y-1 rounded-sm bg-muted/20 px-1 py-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-28 shrink-0 truncate text-[9px] font-mono", TRANSFORM_KEYS.has(key) ? "text-foreground" : "text-muted-foreground")} title={field}>
                    {field}
                  </span>
                  <Input
                    className="h-6 min-w-0 flex-1 text-[10px] font-mono"
                    value={value}
                    onChange={(event) => onFieldChange(index, valueIndex, event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveFieldPair(index, fieldIndex)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {numeric && sliderRange && (
                  <Slider
                    value={[numericValue]}
                    min={sliderRange.min}
                    max={sliderRange.max}
                    step={sliderRange.step}
                    onValueChange={(values) => {
                      onFieldChange(index, valueIndex, String(values[0] ?? numericValue));
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
