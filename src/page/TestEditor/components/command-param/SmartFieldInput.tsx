import { useCallback, useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ParamFieldMeta } from "@/models/paramFieldRegistry"
import type { CommandFieldValue } from "@/models/commandTable"
import { getFieldDisplayValue, formatHash } from "@/models/commandTable"

interface SmartFieldInputProps {
  field: CommandFieldValue
  meta: ParamFieldMeta | undefined
  onChange: (value: number | string) => void
}

export default function SmartFieldInput({ field, meta, onChange }: SmartFieldInputProps) {
  const displayValue = getFieldDisplayValue(field)
  const inputType = meta?.inputType ?? inferInputType(field.kind)

  switch (inputType) {
    case "bool":
      return (
        <BoolInput
          value={Number(displayValue)}
          onChange={onChange}
        />
      )
    case "frames":
      return (
        <FramesInput
          value={Number(displayValue)}
          min={meta?.min}
          max={meta?.max}
          onChange={onChange}
        />
      )
    case "float":
      return (
        <FloatInput
          value={Number(displayValue)}
          min={meta?.min}
          max={meta?.max}
          step={meta?.step ?? 0.01}
          onChange={onChange}
        />
      )
    case "int":
      return (
        <IntInput
          value={Number(displayValue)}
          min={meta?.min}
          max={meta?.max}
          onChange={onChange}
        />
      )
    case "hash":
      return (
        <HashInput
          value={Number(displayValue)}
          onChange={onChange}
        />
      )
    case "enum":
      return (
        <EnumInput
          value={Number(displayValue)}
          enumValues={meta?.enumValues ?? {}}
          onChange={onChange}
        />
      )
    case "string":
      return (
        <Input
          value={String(displayValue)}
          onChange={e => onChange(e.target.value)}
          className="h-7 text-xs flex-1"
        />
      )
    default:
      return (
        <IntInput
          value={Number(displayValue)}
          onChange={onChange}
        />
      )
  }
}

function inferInputType(kind: number): string {
  switch (kind) {
    case 1: return "hash"
    case 2: return "int"
    case 5: return "float"
    case 7: return "string"
    default: return "int"
  }
}

function BoolInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <Switch
        checked={value !== 0}
        onCheckedChange={checked => onChange(checked ? 1 : 0)}
      />
      <span className="text-xs text-muted-foreground font-mono">
        {value !== 0 ? "ON (1)" : "OFF (0)"}
      </span>
    </div>
  )
}

function FramesInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  const seconds = (value / 60).toFixed(2)
  return (
    <div className="flex items-center gap-2 flex-1">
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const v = parseInt(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-7 text-xs font-mono w-24"
      />
      <span className="text-[10px] text-muted-foreground shrink-0">
        {value}f = {seconds}s
      </span>
    </div>
  )
}

function FloatInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  step: number
  onChange: (v: number) => void
}) {
  const isNormalized = min !== undefined && max !== undefined && min >= 0 && max <= 1
  return (
    <div className="flex items-center gap-2 flex-1">
      <Input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-7 text-xs font-mono w-28"
      />
      {isNormalized && (
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="flex-1 h-1.5 accent-primary cursor-pointer"
        />
      )}
      {min !== undefined && max !== undefined && !isNormalized && (
        <span className="text-[10px] text-muted-foreground shrink-0">
          [{min}..{max}]
        </span>
      )}
    </div>
  )
}

function IntInput({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={e => {
          const v = parseInt(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-7 text-xs font-mono w-28"
      />
      {min !== undefined && max !== undefined && (
        <span className="text-[10px] text-muted-foreground shrink-0">
          [{min}..{max}]
        </span>
      )}
    </div>
  )
}

function HashInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editText, setEditText] = useState<string | null>(null)
  const hexStr = formatHash(value)

  const handleBlur = useCallback(() => {
    if (editText !== null) {
      const cleaned = editText.replace(/^0x/i, "")
      const parsed = parseInt(cleaned, 16)
      if (Number.isFinite(parsed)) onChange(parsed >>> 0)
      setEditText(null)
    }
  }, [editText, onChange])

  return (
    <Input
      value={editText ?? hexStr}
      onFocus={() => setEditText(hexStr)}
      onChange={e => setEditText(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === "Enter") handleBlur() }}
      className="h-7 text-xs font-mono flex-1"
    />
  )
}

function EnumInput({
  value,
  enumValues,
  onChange,
}: {
  value: number
  enumValues: Record<number, string>
  onChange: (v: number) => void
}) {
  const entries = useMemo(() => Object.entries(enumValues), [enumValues])
  if (entries.length === 0) {
    return <IntInput value={value} onChange={onChange} />
  }
  return (
    <Select value={String(value)} onValueChange={v => onChange(parseInt(v))}>
      <SelectTrigger className="h-7 text-xs flex-1">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {entries.map(([k, label]) => (
          <SelectItem key={k} value={k} className="text-xs">
            {label} ({k})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
