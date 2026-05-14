import { useState, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Sun } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
          <Sun className="h-4 w-4 opacity-40" />
        </div>
        <p className="text-xs">No graphic parameters</p>
        <p className="text-[10px] opacity-60">Load a stage to view lighting settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Sun className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">Graphic Parameters</span>
        <span className="text-[9px] text-muted-foreground ml-auto">{params.length}</span>
      </div>

      {params.length > 6 && (
        <Input
          placeholder="Filter parameters..."
          className="h-6 text-[10px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}

      <ScrollArea className="max-h-[400px]">
        <div className="space-y-0.5">
          {filteredParams.map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-2 px-1.5 py-1 rounded-sm hover:bg-muted/40 group"
            >
              <span className="text-[9px] text-muted-foreground font-mono w-[130px] truncate shrink-0 group-hover:text-foreground transition-colors">
                {p.key}
              </span>
              <Input
                className="h-5 text-[10px] font-mono flex-1 bg-background"
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
