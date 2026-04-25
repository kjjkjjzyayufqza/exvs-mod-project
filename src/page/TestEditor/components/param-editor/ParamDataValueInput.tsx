import { Input } from "@/components/ui/input"
import type { CommandFieldValue } from "@/models/commandTable"
import { getFieldDisplayValue } from "@/models/commandTable"

export function ParamDataValueInput({
  field,
  onChange,
}: {
  field: CommandFieldValue
  onChange: (val: number | string) => void
}) {
  const displayValue = getFieldDisplayValue(field)

  if (field.kind === 7) {
    return (
      <Input
        value={String(displayValue)}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs flex-1 font-mono"
        placeholder="string"
      />
    )
  }

  if (field.kind === 5) {
    return (
      <Input
        type="number"
        step="0.0001"
        value={Number(displayValue)}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-7 text-xs flex-1 font-mono"
      />
    )
  }

  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <Input
        type="number"
        value={Number(displayValue)}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-7 text-xs flex-1 font-mono"
      />
      <span className="text-[9px] text-muted-foreground font-mono shrink-0 tabular-nums">{field.valueHex}</span>
    </div>
  )
}
