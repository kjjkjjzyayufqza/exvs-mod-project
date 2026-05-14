import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";

export interface PlacementRow {
  vdkType: string;
  objectNumber: number | null;
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rawFields: string[];
}

interface PlacementPanelProps {
  entries: PlacementRow[];
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
  onEntryChange: (
    index: number,
    field: keyof Pick<
      PlacementRow,
      | "posX"
      | "posY"
      | "posZ"
      | "rotX"
      | "rotY"
      | "rotZ"
      | "scaleX"
      | "scaleY"
      | "scaleZ"
    >,
    value: number
  ) => void;
}

export function PlacementPanel({
  entries,
  selectedIndex,
  onSelectEntry,
  onEntryChange,
}: PlacementPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
          <MapPin className="h-4 w-4 opacity-40" />
        </div>
        <p className="text-xs">No placement data</p>
        <p className="text-[10px] opacity-60">Load a stage to view placements</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Placement</span>
        <span className="text-[9px] text-muted-foreground ml-auto">
          {entries.length} entries
        </span>
      </div>

      <ScrollArea className="max-h-[500px]">
        <div className="space-y-0.5">
          {entries.map((entry, i) => (
            <PlacementEntry
              key={i}
              entry={entry}
              index={i}
              isSelected={selectedIndex === i}
              onSelect={onSelectEntry}
              onChange={onEntryChange}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function PlacementEntry({
  entry,
  index,
  isSelected,
  onSelect,
  onChange,
}: {
  entry: PlacementRow;
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  onChange: PlacementPanelProps["onEntryChange"];
}) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 rounded-md cursor-pointer border transition-colors",
        isSelected
          ? "border-primary/30 bg-primary/5"
          : "border-transparent hover:bg-muted/40"
      )}
      onClick={() => onSelect(index)}
    >
      <div className="flex items-center gap-1.5">
        <Badge
          variant={entry.vdkType === "EFFECT" ? "destructive" : "secondary"}
          className="text-[8px] px-1 py-0 h-3.5"
        >
          {entry.vdkType}
        </Badge>
        {entry.objectNumber !== null && (
          <span className="text-[9px] text-muted-foreground font-mono">
            obj#{entry.objectNumber}
          </span>
        )}
        <span className="text-[8px] text-muted-foreground/50 ml-auto font-mono">
          [{entry.posX.toFixed(0)}, {entry.posY.toFixed(0)}, {entry.posZ.toFixed(0)}]
        </span>
      </div>

      {isSelected && (
        <div className="mt-2 space-y-1.5">
          <FieldGroup
            label="Position"
            fields={[
              { label: "X", value: entry.posX, field: "posX" as const },
              { label: "Y", value: entry.posY, field: "posY" as const },
              { label: "Z", value: entry.posZ, field: "posZ" as const },
            ]}
            index={index}
            onChange={onChange}
          />
          <FieldGroup
            label="Rotation"
            fields={[
              { label: "X", value: entry.rotX, field: "rotX" as const },
              { label: "Y", value: entry.rotY, field: "rotY" as const },
              { label: "Z", value: entry.rotZ, field: "rotZ" as const },
            ]}
            index={index}
            onChange={onChange}
          />
          <FieldGroup
            label="Scale"
            fields={[
              { label: "X", value: entry.scaleX, field: "scaleX" as const },
              { label: "Y", value: entry.scaleY, field: "scaleY" as const },
              { label: "Z", value: entry.scaleZ, field: "scaleZ" as const },
            ]}
            index={index}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  );
}

function FieldGroup({
  label,
  fields,
  index,
  onChange,
}: {
  label: string;
  fields: Array<{
    label: string;
    value: number;
    field: keyof Pick<PlacementRow, "posX" | "posY" | "posZ" | "rotX" | "rotY" | "rotZ" | "scaleX" | "scaleY" | "scaleZ">;
  }>;
  index: number;
  onChange: PlacementPanelProps["onEntryChange"];
}) {
  return (
    <div>
      <span className="text-[8px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <div className="grid grid-cols-3 gap-1 mt-0.5">
        {fields.map((f) => (
          <CompactField
            key={f.field}
            label={f.label}
            value={f.value}
            onChange={(v) => onChange(index, f.field, v)}
          />
        ))}
      </div>
    </div>
  );
}

function CompactField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(value.toFixed(2));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(value.toFixed(2));
    }
  }, [value]);

  return (
    <div className="space-y-0">
      <span className="text-[8px] text-muted-foreground/70">{label}</span>
      <Input
        type="number"
        step="0.1"
        className="h-5 text-[9px] font-mono px-1 bg-background"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
          const v = parseFloat(text);
          if (!isNaN(v)) {
            onChange(v);
          }
          setText((isNaN(v) ? value : v).toFixed(2));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}
