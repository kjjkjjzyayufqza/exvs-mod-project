import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Upload } from "lucide-react";
import type { PlacementRow } from "./PlacementPanel";

interface PlacementCsvEditorPanelProps {
  draftEntries: PlacementRow[];
  appliedEntries: PlacementRow[];
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
  onDraftRowChange: (index: number, row: PlacementRow) => void;
  onAddRow: () => void;
  onDeleteRow: (index: number) => void;
  onApplyRow: (index: number) => void;
  onApplyAll: () => void;
}

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
  draftEntries,
  appliedEntries,
  selectedIndex,
  onSelectEntry,
  onDraftRowChange,
  onAddRow,
  onDeleteRow,
  onApplyRow,
  onApplyAll,
}: PlacementCsvEditorPanelProps) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    return draftEntries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => {
        if (!lower) return true;
        return `${index} ${entry.vdkType} ${entry.objectNumber ?? ""} ${entry.rawFields.join(" ")}`.toLowerCase().includes(lower);
      });
  }, [draftEntries, filter]);

  if (draftEntries.length === 0) {
    return (
      <div className="space-y-2">
        <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={onAddRow}>
          <Plus className="h-3 w-3 mr-1" />
          Add row
        </Button>
        <div className="py-2 text-center text-[10px] text-muted-foreground">No placement data</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={onApplyAll}>
          <Upload className="h-3 w-3 mr-1" />
          Apply all
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-6 w-6 p-0 ml-auto" onClick={onAddRow}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      <Input
        className="h-6 text-[10px]"
        placeholder="Filter placement rows..."
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <ScrollArea className="max-h-[620px]">
        <div className="space-y-1">
          {rows.map(({ entry, index }) => (
            <PlacementDraftRow
              key={index}
              entry={entry}
              appliedEntry={appliedEntries[index] ?? null}
              index={index}
              selected={selectedIndex === index}
              onSelectEntry={onSelectEntry}
              onDraftRowChange={onDraftRowChange}
              onDeleteRow={onDeleteRow}
              onApplyRow={onApplyRow}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function PlacementDraftRow({
  entry,
  appliedEntry,
  index,
  selected,
  onSelectEntry,
  onDraftRowChange,
  onDeleteRow,
  onApplyRow,
}: {
  entry: PlacementRow;
  appliedEntry: PlacementRow | null;
  index: number;
  selected: boolean;
  onSelectEntry: (index: number) => void;
  onDraftRowChange: (index: number, row: PlacementRow) => void;
  onDeleteRow: (index: number) => void;
  onApplyRow: (index: number) => void;
}) {
  const dirty = JSON.stringify(entry.rawFields) !== JSON.stringify(appliedEntry?.rawFields ?? null);
  return (
    <div className={cn("rounded-sm border px-1.5 py-1", selected ? "border-primary/50 bg-primary/5" : "border-border/50")}>
      <button type="button" className="flex w-full items-center gap-1.5 text-left" onClick={() => onSelectEntry(index)}>
        <Badge variant={entry.vdkType === "EFFECT" ? "destructive" : "secondary"} className="h-4 px-1 text-[8px]">
          {entry.vdkType || "ROW"}
        </Badge>
        <span className="text-[9px] font-mono text-muted-foreground">#{index}</span>
        {entry.objectNumber !== null && <span className="text-[9px] font-mono">obj {entry.objectNumber}</span>}
        {dirty && <span className="ml-auto text-[8px] text-primary">draft</span>}
      </button>
      {selected && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => onApplyRow(index)}>
              <Upload className="h-3 w-3 mr-1" />
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onDraftRowChange(index, { ...entry, rawFields: [...entry.rawFields, "VDK_NEW_FIELD", "0"] })}
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
                    onChange={(event) => {
                      const rawFields = [...entry.rawFields];
                      rawFields[valueIndex] = event.target.value;
                      onDraftRowChange(index, { ...entry, rawFields });
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const rawFields = entry.rawFields.filter((_, i) => i !== fieldIndex && i !== valueIndex);
                      onDraftRowChange(index, { ...entry, rawFields });
                    }}
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
                      const rawFields = [...entry.rawFields];
                      rawFields[valueIndex] = String(values[0] ?? numericValue);
                      onDraftRowChange(index, { ...entry, rawFields });
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
