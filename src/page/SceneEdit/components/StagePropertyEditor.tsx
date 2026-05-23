import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import {
  PROP_AXIS_GRID,
  PROP_INPUT,
  PROP_LABEL,
  PROP_PANEL,
} from "./propertyPanelStyles";

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
  transform: TransformData;
  onTransformChange: (field: keyof TransformData, value: number) => void;
}

export function StagePropertyEditor({
  transform,
  onTransformChange,
}: StagePropertyEditorProps) {
  return (
    <div className={`space-y-2 ${PROP_PANEL}`}>
      <TransformRow
        label="Position"
        values={[transform.posX, transform.posY, transform.posZ]}
        fields={["posX", "posY", "posZ"]}
        onChange={onTransformChange}
      />
      <TransformRow
        label="Rotation"
        values={[transform.rotX, transform.rotY, transform.rotZ]}
        fields={["rotX", "rotY", "rotZ"]}
        onChange={onTransformChange}
      />
      <TransformRow
        label="Scale"
        values={[transform.scaleX, transform.scaleY, transform.scaleZ]}
        fields={["scaleX", "scaleY", "scaleZ"]}
        onChange={onTransformChange}
      />
    </div>
  );
}

function TransformRow({
  label,
  values,
  fields,
  onChange,
}: {
  label: string;
  values: [number, number, number];
  fields: (keyof TransformData)[];
  onChange: (field: keyof TransformData, value: number) => void;
}) {
  const axisColors = ["text-red-400", "text-green-400", "text-blue-400"];
  const axisLabels = ["X", "Y", "Z"];

  return (
    <div className="min-w-0">
      <div className={`${PROP_LABEL} mb-1`}>{label}</div>
      <div className={PROP_AXIS_GRID}>
        {axisLabels.map((axis, i) => (
          <div key={axis} className="flex min-w-0 items-center gap-1">
            <span
              className={`w-3 shrink-0 text-center text-[10px] font-bold ${axisColors[i]}`}
            >
              {axis}
            </span>
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
    if (!focusedRef.current) setText(value.toFixed(3));
  }, [value]);

  return (
    <Input
      type="number"
      step="0.1"
      className={PROP_INPUT}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onBlur={() => {
        focusedRef.current = false;
        const v = parseFloat(text);
        if (!isNaN(v)) onCommit(v);
        setText((isNaN(v) ? value : v).toFixed(3));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
