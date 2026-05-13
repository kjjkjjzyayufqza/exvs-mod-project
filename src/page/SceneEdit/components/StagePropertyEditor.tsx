import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface TransformData {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

interface StagePropertyEditorProps {
  selectedNodeId: string | null;
  selectedNodeLabel: string | null;
  selectedNodeRole: string | null;
  transform: TransformData | null;
  onTransformChange: (field: keyof TransformData, value: number) => void;
}

export function StagePropertyEditor({
  selectedNodeId,
  selectedNodeLabel,
  selectedNodeRole,
  transform,
  onTransformChange,
}: StagePropertyEditorProps) {
  if (!selectedNodeId) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground text-sm p-4 gap-1.5 py-8">
        <span>No object selected</span>
        <span className="text-xs opacity-60">
          Click a node in the hierarchy or viewport
        </span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-3">
        <Card>
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {selectedNodeLabel}
              {selectedNodeRole && (
                <Badge variant="outline" className="text-xs">
                  {selectedNodeRole}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
        </Card>

        {transform && (
          <>
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground">
                  Position
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2 space-y-1.5">
                <VectorRow
                  labels={["X", "Y", "Z"]}
                  values={[transform.posX, transform.posY, transform.posZ]}
                  fields={["posX", "posY", "posZ"]}
                  onChange={onTransformChange}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground">
                  Rotation
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2 space-y-1.5">
                <VectorRow
                  labels={["X", "Y", "Z"]}
                  values={[transform.rotX, transform.rotY, transform.rotZ]}
                  fields={["rotX", "rotY", "rotZ"]}
                  onChange={onTransformChange}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs text-muted-foreground">
                  Scale
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-2 space-y-1.5">
                <VectorRow
                  labels={["X", "Y", "Z"]}
                  values={[
                    transform.scaleX,
                    transform.scaleY,
                    transform.scaleZ,
                  ]}
                  fields={["scaleX", "scaleY", "scaleZ"]}
                  onChange={onTransformChange}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ScrollArea>
  );
}

function VectorRow({
  labels,
  values,
  fields,
  onChange,
}: {
  labels: string[];
  values: number[];
  fields: (keyof TransformData)[];
  onChange: (field: keyof TransformData, value: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {labels.map((label, i) => (
        <div key={label} className="space-y-0.5">
          <Label className="text-[10px] text-muted-foreground">{label}</Label>
          <NumericInput
            value={values[i]}
            onCommit={(v) => onChange(fields[i], v)}
          />
        </div>
      ))}
    </div>
  );
}

function NumericInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(value.toFixed(3));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(value.toFixed(3));
    }
  }, [value]);

  return (
    <Input
      type="number"
      step="0.1"
      className="h-7 text-xs font-mono"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const v = parseFloat(text);
        if (!isNaN(v)) {
          onCommit(v);
        }
        setText((isNaN(v) ? value : v).toFixed(3));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
