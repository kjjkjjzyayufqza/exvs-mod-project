import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
      <div className="text-muted-foreground text-xs p-2">
        No placement data loaded
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">
          Placement ({entries.length} entries)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-1">
            {entries.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "p-1.5 rounded-sm cursor-pointer border",
                  selectedIndex === i
                    ? "border-primary bg-accent"
                    : "border-transparent hover:bg-accent/50"
                )}
                onClick={() => onSelectEntry(i)}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Badge
                    variant={
                      entry.vdkType === "EFFECT" ? "destructive" : "secondary"
                    }
                    className="text-[9px] px-1 py-0"
                  >
                    {entry.vdkType}
                  </Badge>
                  {entry.objectNumber !== null && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      obj#{entry.objectNumber}
                    </span>
                  )}
                </div>
                {selectedIndex === i && (
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    <CompactField
                      label="PX"
                      value={entry.posX}
                      onChange={(v) => onEntryChange(i, "posX", v)}
                    />
                    <CompactField
                      label="PY"
                      value={entry.posY}
                      onChange={(v) => onEntryChange(i, "posY", v)}
                    />
                    <CompactField
                      label="PZ"
                      value={entry.posZ}
                      onChange={(v) => onEntryChange(i, "posZ", v)}
                    />
                    <CompactField
                      label="RX"
                      value={entry.rotX}
                      onChange={(v) => onEntryChange(i, "rotX", v)}
                    />
                    <CompactField
                      label="RY"
                      value={entry.rotY}
                      onChange={(v) => onEntryChange(i, "rotY", v)}
                    />
                    <CompactField
                      label="RZ"
                      value={entry.rotZ}
                      onChange={(v) => onEntryChange(i, "rotZ", v)}
                    />
                    <CompactField
                      label="SX"
                      value={entry.scaleX}
                      onChange={(v) => onEntryChange(i, "scaleX", v)}
                    />
                    <CompactField
                      label="SY"
                      value={entry.scaleY}
                      onChange={(v) => onEntryChange(i, "scaleY", v)}
                    />
                    <CompactField
                      label="SZ"
                      value={entry.scaleZ}
                      onChange={(v) => onEntryChange(i, "scaleZ", v)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
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
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        step="0.1"
        className="h-5 text-[10px] font-mono px-1"
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
