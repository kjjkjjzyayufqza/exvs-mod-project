import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface GraphicParam {
  key: string;
  value: string;
}

interface GraphicParamPanelProps {
  params: GraphicParam[];
  onChange: (index: number, value: string) => void;
}

export function GraphicParamPanel({ params, onChange }: GraphicParamPanelProps) {
  if (params.length === 0) {
    return (
      <div className="text-muted-foreground text-xs p-2">
        No graphic parameters loaded
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-xs">Graphic Parameters</CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-2">
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1">
            {params.map((p, i) => (
              <div key={p.key} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono w-[140px] truncate shrink-0">
                  {p.key}
                </span>
                <Input
                  className="h-6 text-xs font-mono flex-1"
                  value={p.value}
                  onChange={(e) => onChange(i, e.target.value)}
                />
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
