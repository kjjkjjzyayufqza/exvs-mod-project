import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { ParsedEntry, CommandFieldValue } from "@/models/commandTable"
import { formatHash } from "@/models/commandTable"
import { getFieldMeta, getFieldGroups, type ParamFieldMeta } from "@/models/paramFieldRegistry"
import SmartFieldInput from "./SmartFieldInput"

interface TypedFieldEditorPanelProps {
  entry: ParsedEntry | null
  fileType: string
  entryIndex: number
  searchQuery: string
  onSearchChange: (q: string) => void
  onFieldChange: (entryIndex: number, hash: number, kind: number, value: number | string) => void
  changedHashes?: Set<number>
  header: { entrySize: number }
}

interface GroupedField {
  field: CommandFieldValue
  meta: ParamFieldMeta | undefined
}

export default function TypedFieldEditorPanel({
  entry,
  fileType,
  entryIndex,
  searchQuery,
  onSearchChange,
  onFieldChange,
  changedHashes,
  header,
}: TypedFieldEditorPanelProps) {
  if (!entry) {
    return (
      <Card className="flex-1">
        <CardContent className="flex items-center justify-center h-full text-muted-foreground text-sm">
          Select an entry to edit
        </CardContent>
      </Card>
    )
  }

  const groups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const knownGroups = getFieldGroups(fileType)
    const groupMap = new Map<string, GroupedField[]>()

    for (const groupName of knownGroups) {
      groupMap.set(groupName, [])
    }

    const unknownFields: GroupedField[] = []

    for (const field of entry.fields) {
      const meta = getFieldMeta(fileType, field.hash)
      const grouped: GroupedField = { field, meta }

      if (q) {
        const matchesName = meta?.name.toLowerCase().includes(q)
        const matchesGroup = meta?.group.toLowerCase().includes(q)
        const matchesHash = formatHash(field.hash).toLowerCase().includes(q)
        if (!matchesName && !matchesGroup && !matchesHash) continue
      }

      if (meta) {
        const arr = groupMap.get(meta.group)
        if (arr) {
          arr.push(grouped)
        } else {
          groupMap.set(meta.group, [grouped])
        }
      } else {
        unknownFields.push(grouped)
      }
    }

    const result: { name: string; fields: GroupedField[] }[] = []
    for (const [name, fields] of groupMap) {
      if (fields.length > 0) {
        result.push({ name, fields })
      }
    }
    if (unknownFields.length > 0) {
      result.push({ name: "Raw / Unknown", fields: unknownFields })
    }

    return result
  }, [entry, fileType, searchQuery])

  return (
    <Card className="flex-1 flex flex-col min-w-0">
      <CardHeader className="p-2 pb-1 shrink-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs font-medium">
            Entry {formatHash(entry.entryId)} — {entry.fields.length} fields
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            size={header.entrySize}B
          </Badge>
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <Search className="w-3 h-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Search by name or hash..."
              className="h-6 w-44 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
        <div className="p-1">
          {groups.map(group => (
            <FieldGroup
              key={group.name}
              name={group.name}
              fields={group.fields}
              entryIndex={entryIndex}
              onFieldChange={onFieldChange}
              changedHashes={changedHashes}
            />
          ))}
          {groups.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
              No fields match the search
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FieldGroup({
  name,
  fields,
  entryIndex,
  onFieldChange,
  changedHashes,
}: {
  name: string
  fields: GroupedField[]
  entryIndex: number
  onFieldChange: (entryIndex: number, hash: number, kind: number, value: number | string) => void
  changedHashes?: Set<number>
}) {
  const [open, setOpen] = useState(true)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-1">
      <CollapsibleTrigger className="flex items-center gap-1.5 w-full px-2 py-1 rounded-sm hover:bg-accent/50 transition-colors">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="text-xs font-semibold">{name}</span>
        <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-1">
          {fields.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-2 border-l border-border/50 pl-2">
          {fields.map(({ field, meta }) => (
            <FieldRow
              key={field.hash}
              field={field}
              meta={meta}
              entryIndex={entryIndex}
              onFieldChange={onFieldChange}
              isChanged={changedHashes?.has(field.hash) ?? false}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function FieldRow({
  field,
  meta,
  entryIndex,
  onFieldChange,
  isChanged,
}: {
  field: CommandFieldValue
  meta: ParamFieldMeta | undefined
  entryIndex: number
  onFieldChange: (entryIndex: number, hash: number, kind: number, value: number | string) => void
  isChanged: boolean
}) {
  const label = meta?.name ?? formatHash(field.hash)
  const hashStr = formatHash(field.hash)

  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1 px-1 rounded-sm hover:bg-muted/30 group min-h-[32px]",
        isChanged && "border-l-2 border-yellow-500 pl-2"
      )}
    >
      <div className="w-[180px] shrink-0 flex flex-col">
        <span className="text-xs font-medium truncate" title={label}>
          {label}
        </span>
        <span className="text-[9px] text-muted-foreground font-mono">
          {hashStr} +0x{field.offset.toString(16).toUpperCase().padStart(3, "0")}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <SmartFieldInput
          field={field}
          meta={meta}
          onChange={val => onFieldChange(entryIndex, field.hash, field.kind, val)}
        />
      </div>
    </div>
  )
}
