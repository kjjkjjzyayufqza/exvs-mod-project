import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Move3D, RotateCw, Maximize } from "lucide-react";

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
      <div className="flex flex-col items-center justify-center text-muted-foreground p-6 gap-2">
        <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
          <Move3D className="h-4 w-4 opacity-40" />
        </div>
        <p className="text-xs">No object selected</p>
        <p className="text-[10px] opacity-60 text-center">
          Click a node in the hierarchy or viewport
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs font-semibold truncate">{selectedNodeLabel}</span>
        {selectedNodeRole && (
          <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
            {selectedNodeRole}
          </Badge>
        )}
      </div>

      {transform && (
        <div className="space-y-2">
          {/* Position */}
          <TransformSection
            icon={<Move3D className="h-3 w-3" />}
            label="Position"
            labels={["X", "Y", "Z"]}
            values={[transform.posX, transform.posY, transform.posZ]}
            fields={["posX", "posY", "posZ"]}
            onChange={onTransformChange}
            colors={["text-red-400", "text-green-400", "text-blue-400"]}
          />

          {/* Rotation */}
          <TransformSection
            icon={<RotateCw className="h-3 w-3" />}
            label="Rotation"
            labels={["X", "Y", "Z"]}
            values={[transform.rotX, transform.rotY, transform.rotZ]}
            fields={["rotX", "rotY", "rotZ"]}
            onChange={onTransformChange}
            colors={["text-red-400", "text-green-400", "text-blue-400"]}
          />

          {/* Scale */}
          <TransformSection
            icon={<Maximize className="h-3 w-3" />}
            label="Scale"
            labels={["X", "Y", "Z"]}
            values={[transform.scaleX, transform.scaleY, transform.scaleZ]}
            fields={["scaleX", "scaleY", "scaleZ"]}
            onChange={onTransformChange}
            colors={["text-red-400", "text-green-400", "text-blue-400"]}
          />
        </div>
      )}
    </div>
  );
}

function TransformSection({
  icon,
  label,
  labels,
  values,
  fields,
  onChange,
  colors,
}: {
  icon: React.ReactNode;
  label: string;
  labels: string[];
  values: number[];
  fields: (keyof TransformData)[];
  onChange: (field: keyof TransformData, value: number) => void;
  colors: string[];
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex items-center gap-1.5 mb-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {labels.map((lbl, i) => (
          <div key={lbl} className="space-y-0.5">
            <Label className={`text-[9px] font-bold ${colors[i]}`}>{lbl}</Label>
            <NumericInput
              value={values[i]}
              onCommit={(v) => onChange(fields[i], v)}
            />
          </div>
        ))}
      </div>
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
      className="h-6 text-[10px] font-mono px-1.5 bg-background"
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
