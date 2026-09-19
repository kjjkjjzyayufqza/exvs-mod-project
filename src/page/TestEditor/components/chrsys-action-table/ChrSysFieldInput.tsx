import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatCell, parseCellInput } from "./chrSysModel"
import type { ChrSysValueFormat } from "./chrSysTypes"

interface ChrSysFieldInputProps {
  value: number
  format: ChrSysValueFormat
  disabled?: boolean
  onCommit: (value: number) => void
}

/** Commits on Enter or blur; rejects anything that is not decimal or `0x` hex. */
export function ChrSysFieldInput({ value, format, disabled, onCommit }: ChrSysFieldInputProps) {
  const [text, setText] = useState(() => formatCell(value, format))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) setText(formatCell(value, format))
  }, [value, format, dirty])

  const parsed = parseCellInput(text)
  const invalid = dirty && parsed === null

  const commit = () => {
    if (parsed === null) {
      setText(formatCell(value, format))
      setDirty(false)
      return
    }
    setDirty(false)
    if (parsed !== value) onCommit(parsed)
    else setText(formatCell(value, format))
  }

  return (
    <Input
      value={text}
      disabled={disabled}
      spellCheck={false}
      onChange={(event) => {
        setText(event.target.value)
        setDirty(true)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur()
        } else if (event.key === "Escape") {
          setText(formatCell(value, format))
          setDirty(false)
        }
      }}
      className={cn(
        "h-7 w-full font-mono text-[11px] tabular-nums shadow-none transition-colors duration-150 ease-out",
        invalid && "border-destructive focus-visible:ring-destructive/40",
      )}
      aria-invalid={invalid}
    />
  )
}
