import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

export interface GraphicParam {
  key: string;
  value: string;
}

interface GraphicParamPanelProps {
  params: GraphicParam[];
  onChange: (index: number, value: string) => void;
}

export function GraphicParamPanel({ params, onChange }: GraphicParamPanelProps) {
  const [filter, setFilter] = useState("");

  const filteredParams = useMemo(() => {
    if (!filter) return params.map((p, i) => ({ ...p, originalIndex: i }));
    const lower = filter.toLowerCase();
    return params
      .map((p, i) => ({ ...p, originalIndex: i }))
      .filter((p) => p.key.toLowerCase().includes(lower));
  }, [params, filter]);

  if (params.length === 0) {
    return (
      <div className="py-2 text-center text-[10px] text-muted-foreground">
        No parameters
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {params.length > 6 && (
        <Input
          placeholder="Filter..."
          className="h-5 text-[10px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <ScrollArea className="max-h-[400px]">
        <div className="space-y-0">
          {filteredParams.map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-2 px-1 py-0.5 rounded-sm hover:bg-muted/40 group"
            >
              <span className="text-[9px] text-muted-foreground font-mono w-[120px] truncate shrink-0 group-hover:text-foreground transition-colors">
                {p.key}
              </span>
              <Input
                className="h-5 text-[10px] font-mono flex-1 bg-background/60"
                value={p.value}
                onChange={(e) => onChange(p.originalIndex, e.target.value)}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
