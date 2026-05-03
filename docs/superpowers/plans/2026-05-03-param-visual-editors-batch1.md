# Param Visual Editors Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 3 commercial-quality visual parameter editors (BulletParam, ArmsParam, SpeedParam) that replace the legacy plaintext form-based editing with domain-specific interactive UI reflecting actual EXVS2 game logic.

**Architecture:** Each editor follows the existing project pattern: a dedicated directory under `src/page/TestEditor/components/param-editors/`, a Zustand store with `recomputeState()` pattern for derived data, and domain-specific visualization (R3F 3D or SVG 2D). Shared components (EntryListPanel, PropertyGroup) are extracted into a `shared/` subdirectory. Each editor registers as a new tab in MainView.

**Tech Stack:** React 19, React Three Fiber 9.x, @react-three/drei, Zustand 5.x, Radix UI (shadcn), Tailwind CSS 4.x, Vitest, TypeScript 5.9

---

## File Structure

```
src/page/TestEditor/components/param-editors/
├── shared/
│   ├── EntryListPanel.tsx           — Filterable entry list with virtual scrolling
│   ├── PropertyGroup.tsx            — Collapsible property group card
│   ├── PropertyField.tsx            — Type-aware field editor (U32/I32/F32/Hash/Enum)
│   ├── EditorStatusBar.tsx          — Status bar with entry info and validation
│   ├── paramEditorStoreFactory.ts   — Zustand store factory for shared patterns
│   └── types.ts                     — Shared types for all editors
├── bullet-editor/
│   ├── BulletEditorView.tsx         — Main layout (entry list + 3D + properties)
│   ├── BulletEditorStore.ts         — Zustand store for bullet editor
│   ├── BulletPropertyPanel.tsx      — MoveType-aware property groups
│   ├── BulletTrajectoryCanvas.tsx   — Enhanced 3D viewport (reuses existing sim)
│   └── BulletDpsPanel.tsx           — DPS calculator
├── arms-editor/
│   ├── ArmsEditorView.tsx           — Main layout
│   ├── ArmsEditorStore.ts           — Zustand store
│   ├── WeaponSlotDiagram.tsx        — SVG weapon slot visualization
│   ├── ArmsPropertyPanel.tsx        — Slot-aware property groups
│   └── AmmoTimeline.tsx             — Ammo economy timeline bar
└── speed-editor/
    ├── SpeedEditorView.tsx          — Main layout
    ├── SpeedEditorStore.ts          — Zustand store
    ├── MovementRadiusCanvas.tsx     — Top-down movement range (R3F)
    ├── SpeedCurveGraph.tsx          — SVG speed/acceleration curves
    └── SpeedPropertyPanel.tsx       — Movement property groups
```

**Modified files:**
- `src/page/TestEditor/components/MainView.tsx` — Register 3 new tabs

---

## Task 1: Shared EntryListPanel Component

**Files:**
- Create: `src/page/TestEditor/components/param-editors/shared/types.ts`
- Create: `src/page/TestEditor/components/param-editors/shared/EntryListPanel.tsx`

- [ ] **Step 1: Create shared types**

```typescript
// src/page/TestEditor/components/param-editors/shared/types.ts
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes"

export interface EditorEntryRow {
  entry: TypedParamEntry
  index: number
  entryId: number
  label?: string
}

export interface PropertyGroupDef {
  id: string
  label: string
  fields: PropertyFieldDef[]
  visible?: (entry: TypedParamEntry) => boolean
}

export interface PropertyFieldDef {
  key: string
  label: string
  type: "u32" | "i32" | "f32" | "hash" | "enum" | "bool" | "vec3"
  enumOptions?: { value: number; label: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
  tooltip?: string
}

export interface ValidationMessage {
  field: string
  level: "error" | "warning" | "info"
  message: string
}
```

- [ ] **Step 2: Create EntryListPanel**

```typescript
// src/page/TestEditor/components/param-editors/shared/EntryListPanel.tsx
import { useMemo, useState, useTransition } from "react"
import { Search } from "lucide-react"
import { formatHash } from "@/models/commandTable"
import { filterTypedParamEntryRows, readTypedEntryId } from "../../param-editor/paramEntryUtils"
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"
import type { EditorEntryRow } from "./types"

interface EntryListPanelProps {
  entries: TypedParamEntry[]
  selectedIndex: number
  onSelect: (index: number) => void
  renderLabel?: (row: EditorEntryRow) => React.ReactNode
  className?: string
}

export function EntryListPanel({ entries, selectedIndex, onSelect, renderLabel, className }: EntryListPanelProps) {
  const [searchDraft, setSearchDraft] = useState("")
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()

  const filteredRows = useMemo(
    () => filterTypedParamEntryRows(entries, search),
    [entries, search],
  )

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-card shadow-sm ${className ?? ""}`}>
      <div className="space-y-2 border-b bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold">Entries</h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {search.trim() ? `${filteredRows.length} / ${entries.length}` : `${entries.length}`}
            {isPending ? " …" : ""}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={searchDraft}
            onChange={(e) => {
              const next = e.target.value
              setSearchDraft(next)
              startTransition(() => setSearch(next))
            }}
            placeholder="Search id / field / value…"
            className="h-4 w-full bg-transparent font-mono text-[10px] outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {filteredRows.length === 0 ? (
          <div className="flex h-28 items-center justify-center px-3 text-center text-xs text-muted-foreground">
            No entries match.
          </div>
        ) : (
          filteredRows.map(({ entry, index, entryId }) => (
            <button
              key={`${index}-${entryId}`}
              type="button"
              className={`flex w-full flex-col border-b border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50 ${
                selectedIndex === index
                  ? "bg-primary/10 border-l-2 border-l-primary"
                  : "border-l-2 border-l-transparent"
              }`}
              onClick={() => onSelect(index)}
            >
              <div className="flex items-center justify-between">
                <span className="truncate font-mono font-medium">
                  {renderLabel
                    ? renderLabel({ entry, index, entryId })
                    : formatHash(entryId)}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">#{index}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/page/TestEditor/components/param-editors/shared/
git commit -m "feat(param-editors): add shared EntryListPanel and types"
```

---

## Task 2: Shared PropertyGroup and PropertyField Components

**Files:**
- Create: `src/page/TestEditor/components/param-editors/shared/PropertyGroup.tsx`
- Create: `src/page/TestEditor/components/param-editors/shared/PropertyField.tsx`

- [ ] **Step 1: Create PropertyGroup**

```typescript
// src/page/TestEditor/components/param-editors/shared/PropertyGroup.tsx
import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"

interface PropertyGroupProps {
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}

export function PropertyGroup({ label, defaultOpen = true, children, className }: PropertyGroupProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-md border bg-card shadow-sm ${className ?? ""}`}>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold hover:bg-muted/30"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && <div className="space-y-1.5 p-3">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Create PropertyField**

```typescript
// src/page/TestEditor/components/param-editors/shared/PropertyField.tsx
import { useCallback, useState } from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { formatHash } from "@/models/commandTable"
import type { PropertyFieldDef } from "./types"

interface PropertyFieldProps {
  def: PropertyFieldDef
  value: number | string | boolean | null
  onChange: (key: string, value: number) => void
}

export function PropertyField({ def, value, onChange }: PropertyFieldProps) {
  const numValue = typeof value === "number" ? value : 0

  const handleNumberChange = useCallback(
    (raw: string) => {
      const parsed = def.type === "f32" ? parseFloat(raw) : parseInt(raw, 10)
      if (!Number.isFinite(parsed)) return
      onChange(def.key, parsed)
    },
    [def, onChange],
  )

  if (def.type === "enum" && def.enumOptions) {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="min-w-0 shrink-0 text-[11px] text-muted-foreground">{def.label}</label>
        <Select
          value={String(numValue)}
          onValueChange={(v) => onChange(def.key, parseInt(v, 10))}
        >
          <SelectTrigger className="h-7 w-40 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {def.enumOptions.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (def.type === "bool") {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-muted-foreground">{def.label}</label>
        <Checkbox
          checked={numValue !== 0}
          onCheckedChange={(checked) => onChange(def.key, checked ? 1 : 0)}
        />
      </div>
    )
  }

  if (def.type === "hash") {
    return (
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] text-muted-foreground">{def.label}</label>
        <span className="font-mono text-[11px]">{formatHash(numValue)}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <label className="min-w-0 shrink-0 text-[11px] text-muted-foreground">
        {def.label}
        {def.unit && <span className="ml-1 text-[9px] text-muted-foreground/60">({def.unit})</span>}
      </label>
      <Input
        type="number"
        className="h-7 w-28 text-right font-mono text-[11px]"
        value={def.type === "f32" ? numValue.toFixed(4) : numValue}
        step={def.step ?? (def.type === "f32" ? 0.01 : 1)}
        min={def.min}
        max={def.max}
        onChange={(e) => handleNumberChange(e.target.value)}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/page/TestEditor/components/param-editors/shared/PropertyGroup.tsx
git add src/page/TestEditor/components/param-editors/shared/PropertyField.tsx
git commit -m "feat(param-editors): add shared PropertyGroup and PropertyField"
```

---

## Task 3: Shared EditorStatusBar

**Files:**
- Create: `src/page/TestEditor/components/param-editors/shared/EditorStatusBar.tsx`

- [ ] **Step 1: Create EditorStatusBar**

```typescript
// src/page/TestEditor/components/param-editors/shared/EditorStatusBar.tsx
import { AlertTriangle, Info, XCircle } from "lucide-react"
import type { ValidationMessage } from "./types"

interface EditorStatusBarProps {
  entryCount: number
  selectedIndex: number
  modifiedCount: number
  validationMessages: ValidationMessage[]
  extra?: React.ReactNode
}

export function EditorStatusBar({
  entryCount,
  selectedIndex,
  modifiedCount,
  validationMessages,
  extra,
}: EditorStatusBarProps) {
  const errors = validationMessages.filter((m) => m.level === "error").length
  const warnings = validationMessages.filter((m) => m.level === "warning").length

  return (
    <div className="flex items-center gap-4 border-t bg-muted/30 px-4 py-1.5 text-[11px] text-muted-foreground">
      <span>Entry #{selectedIndex} of {entryCount}</span>
      {modifiedCount > 0 && (
        <span className="text-yellow-500">Modified: {modifiedCount} fields</span>
      )}
      {errors > 0 && (
        <span className="flex items-center gap-1 text-destructive">
          <XCircle className="h-3 w-3" /> {errors} error{errors > 1 ? "s" : ""}
        </span>
      )}
      {warnings > 0 && (
        <span className="flex items-center gap-1 text-yellow-500">
          <AlertTriangle className="h-3 w-3" /> {warnings} warning{warnings > 1 ? "s" : ""}
        </span>
      )}
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/shared/EditorStatusBar.tsx
git commit -m "feat(param-editors): add shared EditorStatusBar"
```

---

## Task 4: BulletEditor Store

**Files:**
- Create: `src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorStore.ts`

- [ ] **Step 1: Create bullet editor store**

```typescript
// src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorStore.ts
import { create } from "zustand"
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes"
import { readTypedEntryId } from "../../param-editor/paramEntryUtils"
import { simulateTrajectory, type TrajectoryResult } from "../../bullet-preview/TrajectorySimulator"
import type { BulletPreviewScenario } from "../../bullet-preview/bulletPreviewTypes"
import { DEFAULT_BULLET_PREVIEW_SCENARIO } from "../../bullet-preview/bulletPreviewTypes"
import type { ValidationMessage } from "../shared/types"

export interface BulletEditorState {
  data: TypedParamFile | null
  filePath: string
  selectedIndex: number
  dirty: boolean
  scenario: BulletPreviewScenario
  trajectory: TrajectoryResult | null
  validationMessages: ValidationMessage[]
  playbackFrame: number
  isPlaying: boolean
  playbackSpeed: number

  setData: (data: TypedParamFile, filePath: string) => void
  selectEntry: (index: number) => void
  updateField: (key: string, value: number) => void
  setScenario: (patch: Partial<BulletPreviewScenario>) => void
  setPlaybackFrame: (frame: number) => void
  togglePlayback: () => void
  setPlaybackSpeed: (speed: number) => void
  tick: (delta: number) => void
}

function validateBulletEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = []
  const speed = typeof entry.initialSpeed === "number" ? entry.initialSpeed : 0
  const turnRate = typeof entry.homingTurnRate === "number" ? entry.homingTurnRate : 0
  const lifetime = typeof entry.lifetime === "number" ? entry.lifetime : 0

  if (speed > 600) {
    messages.push({ field: "initialSpeed", level: "error", message: "Speed exceeds engine clamp (600)" })
  }
  if (turnRate > 0.1 && turnRate !== 0) {
    messages.push({ field: "homingTurnRate", level: "warning", message: "High turn rate may feel broken" })
  }
  if (lifetime < 0) {
    messages.push({ field: "lifetime", level: "info", message: "Negative = absolute duration mode" })
  }
  return messages
}

function recompute(data: TypedParamFile | null, index: number, scenario: BulletPreviewScenario) {
  if (!data || !data.entries[index]) {
    return { trajectory: null, validationMessages: [] }
  }
  const entry = data.entries[index]
  const trajectory = simulateTrajectory(entry, scenario)
  const validationMessages = validateBulletEntry(entry)
  return { trajectory, validationMessages }
}

export const useBulletEditorStore = create<BulletEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  scenario: { ...DEFAULT_BULLET_PREVIEW_SCENARIO },
  trajectory: null,
  validationMessages: [],
  playbackFrame: 0,
  isPlaying: false,
  playbackSpeed: 1,

  setData: (data, filePath) => {
    const { trajectory, validationMessages } = recompute(data, 0, get().scenario)
    set({ data, filePath, selectedIndex: 0, dirty: false, trajectory, validationMessages, playbackFrame: 0, isPlaying: false })
  },

  selectEntry: (index) => {
    const { data, scenario } = get()
    const { trajectory, validationMessages } = recompute(data, index, scenario)
    set({ selectedIndex: index, trajectory, validationMessages, playbackFrame: 0, isPlaying: false })
  },

  updateField: (key, value) => {
    const { data, selectedIndex, scenario } = get()
    if (!data) return
    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    )
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i))
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds }
    const { trajectory, validationMessages } = recompute(nextData, selectedIndex, scenario)
    set({ data: nextData, dirty: true, trajectory, validationMessages })
  },

  setScenario: (patch) => {
    const { data, selectedIndex, scenario } = get()
    const nextScenario = { ...scenario, ...patch }
    const { trajectory, validationMessages } = recompute(data, selectedIndex, nextScenario)
    set({ scenario: nextScenario, trajectory, validationMessages })
  },

  setPlaybackFrame: (frame) => set({ playbackFrame: frame }),

  togglePlayback: () => {
    const { isPlaying, trajectory, playbackFrame } = get()
    if (!isPlaying && trajectory && playbackFrame >= trajectory.totalFrames) {
      set({ playbackFrame: 0, isPlaying: true })
    } else {
      set({ isPlaying: !isPlaying })
    }
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  tick: (delta) => {
    const { isPlaying, playbackSpeed, playbackFrame, trajectory } = get()
    if (!isPlaying || !trajectory) return
    const nextFrame = playbackFrame + delta * 60 * playbackSpeed
    if (nextFrame >= trajectory.totalFrames) {
      set({ playbackFrame: trajectory.totalFrames, isPlaying: false })
    } else {
      set({ playbackFrame: nextFrame })
    }
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorStore.ts
git commit -m "feat(bullet-editor): add Zustand store with trajectory recomputation"
```

---

## Task 5: BulletPropertyPanel (MoveType-Aware)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/bullet-editor/BulletPropertyPanel.tsx`

- [ ] **Step 1: Create BulletPropertyPanel**

```typescript
// src/page/TestEditor/components/param-editors/bullet-editor/BulletPropertyPanel.tsx
import { useMemo } from "react"
import { PropertyGroup } from "../shared/PropertyGroup"
import { PropertyField } from "../shared/PropertyField"
import type { PropertyFieldDef } from "../shared/types"
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"

interface BulletPropertyPanelProps {
  entry: TypedParamEntry
  onFieldChange: (key: string, value: number) => void
}

const MOVE_TYPE_OPTIONS = [
  { value: 0, label: "Standard Missile" },
  { value: 1, label: "Throw Projectile" },
  { value: 2, label: "Funnel Flight" },
  { value: 3, label: "Funnel Approach" },
  { value: 4, label: "Anchor / Chain" },
  { value: 5, label: "Funnel Flysword" },
  { value: 6, label: "Attach Change" },
  { value: 7, label: "Funnel Throw" },
  { value: 255, label: "Generic Projectile" },
]

const MOVEMENT_FIELDS: PropertyFieldDef[] = [
  { key: "moveType", label: "Move Type", type: "enum", enumOptions: MOVE_TYPE_OPTIONS },
  { key: "initialSpeed", label: "Initial Speed", type: "f32", min: 0, max: 600, step: 0.1, unit: "m/f" },
  { key: "acceleration", label: "Acceleration", type: "f32", step: 0.01, unit: "m/f²" },
  { key: "maxSpeed", label: "Max Speed", type: "f32", min: 0, max: 600, step: 0.1, unit: "m/f" },
  { key: "gravityX", label: "Gravity X", type: "f32", step: 0.01 },
  { key: "gravityY", label: "Gravity Y", type: "f32", step: 0.01 },
  { key: "gravityZ", label: "Gravity Z", type: "f32", step: 0.01 },
]

const HOMING_FIELDS: PropertyFieldDef[] = [
  { key: "homingTurnRate", label: "Turn Rate", type: "f32", min: 0, max: 1, step: 0.001, unit: "rad/f" },
  { key: "homingStartFrame", label: "Start Frame", type: "u32", unit: "f" },
  { key: "homingEndFrame", label: "End Frame", type: "u32", unit: "f" },
  { key: "homingType", label: "Homing Type", type: "u32" },
]

const COLLISION_FIELDS: PropertyFieldDef[] = [
  { key: "hitboxWidth", label: "Hitbox Width", type: "f32", min: 0, step: 0.1, unit: "m" },
  { key: "hitboxHeight", label: "Hitbox Height", type: "f32", min: 0, step: 0.1, unit: "m" },
  { key: "hitboxDepth", label: "Hitbox Depth", type: "f32", min: 0, step: 0.1, unit: "m" },
  { key: "hitGroup", label: "Hit Group", type: "u32" },
  { key: "pierceFlag", label: "Pierce", type: "bool" },
]

const DAMAGE_FIELDS: PropertyFieldDef[] = [
  { key: "damage", label: "Damage", type: "u32" },
  { key: "damageType", label: "Damage Type", type: "u32" },
  { key: "downValue", label: "Down Value", type: "u32" },
  { key: "hitStunFrames", label: "Hit Stun", type: "u32", unit: "f" },
]

const LIFETIME_FIELDS: PropertyFieldDef[] = [
  { key: "lifetime", label: "Lifetime", type: "i32", unit: "f" },
  { key: "durationFrame", label: "Duration Frame", type: "i32", unit: "f" },
  { key: "maxRange", label: "Max Range", type: "f32", unit: "m" },
  { key: "effectiveRange", label: "Effective Range", type: "f32", unit: "m" },
  { key: "blastRadius", label: "Blast Radius", type: "f32", unit: "m" },
]

const EFFECT_FIELDS: PropertyFieldDef[] = [
  { key: "hitEffectHash", label: "Hit Effect", type: "hash" },
  { key: "soundEffectHash", label: "Sound Effect", type: "hash" },
  { key: "spawnEffectHash", label: "Spawn Effect", type: "hash" },
]

function shouldShowHoming(moveType: number): boolean {
  return moveType === 0 || moveType === 2 || moveType === 3 || moveType === 5
}

export function BulletPropertyPanel({ entry, onFieldChange }: BulletPropertyPanelProps) {
  const moveType = typeof entry.moveType === "number" ? entry.moveType : 255

  const renderGroup = (label: string, fields: PropertyFieldDef[], visible = true) => {
    if (!visible) return null
    return (
      <PropertyGroup label={label}>
        {fields.map((def) => (
          <PropertyField
            key={def.key}
            def={def}
            value={entry[def.key] ?? 0}
            onChange={onFieldChange}
          />
        ))}
      </PropertyGroup>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      {renderGroup("Movement", MOVEMENT_FIELDS)}
      {renderGroup("Homing", HOMING_FIELDS, shouldShowHoming(moveType))}
      {renderGroup("Collision", COLLISION_FIELDS)}
      {renderGroup("Damage", DAMAGE_FIELDS)}
      {renderGroup("Lifetime & Range", LIFETIME_FIELDS)}
      {renderGroup("Effects", EFFECT_FIELDS)}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/bullet-editor/BulletPropertyPanel.tsx
git commit -m "feat(bullet-editor): add MoveType-aware property panel"
```

---

## Task 6: BulletDpsPanel

**Files:**
- Create: `src/page/TestEditor/components/param-editors/bullet-editor/BulletDpsPanel.tsx`

- [ ] **Step 1: Create BulletDpsPanel**

```typescript
// src/page/TestEditor/components/param-editors/bullet-editor/BulletDpsPanel.tsx
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"
import type { TrajectoryResult } from "../../bullet-preview/TrajectorySimulator"

interface BulletDpsPanelProps {
  entry: TypedParamEntry
  trajectory: TrajectoryResult | null
}

function calcDps(entry: TypedParamEntry, trajectory: TrajectoryResult | null): {
  damage: number
  lifetime: number
  dps: number
  hitFrame: number
  travelTime: string
} {
  const damage = typeof entry.damage === "number" ? entry.damage : 0
  const lifetime = trajectory?.totalFrames ?? 60
  const hitFrame = trajectory?.hitFrame ?? lifetime
  const dps = lifetime > 0 ? (damage * 60) / lifetime : 0
  const travelTime = hitFrame > 0 ? `${(hitFrame / 60).toFixed(2)}s` : "—"
  return { damage, lifetime, dps, hitFrame, travelTime }
}

export function BulletDpsPanel({ entry, trajectory }: BulletDpsPanelProps) {
  const stats = calcDps(entry, trajectory)

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">Combat Stats</h4>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">Damage:</span>
        <span className="font-mono font-medium">{stats.damage}</span>
        <span className="text-muted-foreground">Lifetime:</span>
        <span className="font-mono">{stats.lifetime}f ({(stats.lifetime / 60).toFixed(2)}s)</span>
        <span className="text-muted-foreground">DPS (theoretical):</span>
        <span className="font-mono font-medium">{stats.dps.toFixed(1)}</span>
        <span className="text-muted-foreground">Hit Frame:</span>
        <span className="font-mono">{stats.hitFrame}f</span>
        <span className="text-muted-foreground">Travel Time:</span>
        <span className="font-mono">{stats.travelTime}</span>
        {trajectory && (
          <>
            <span className="text-muted-foreground">Max Range:</span>
            <span className="font-mono">{trajectory.maxRange.toFixed(1)}m</span>
            <span className="text-muted-foreground">Move Type:</span>
            <span className="font-mono">{trajectory.moveTypeLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/bullet-editor/BulletDpsPanel.tsx
git commit -m "feat(bullet-editor): add DPS calculator panel"
```

---

## Task 7: BulletTrajectoryCanvas (Enhanced 3D)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/bullet-editor/BulletTrajectoryCanvas.tsx`

- [ ] **Step 1: Create BulletTrajectoryCanvas**

This reuses the existing simulation infrastructure but embeds it in the new editor layout.

```typescript
// src/page/TestEditor/components/param-editors/bullet-editor/BulletTrajectoryCanvas.tsx
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, Grid, PerspectiveCamera, Line } from "@react-three/drei"
import { Suspense, useMemo } from "react"
import { useBulletEditorStore } from "./BulletEditorStore"
import type { TrajectoryResult } from "../../bullet-preview/TrajectorySimulator"
import * as THREE from "three"

function TrajectoryLine({ trajectory, currentFrame }: { trajectory: TrajectoryResult; currentFrame: number }) {
  const points = useMemo(() => {
    const pts: THREE.Vector3[] = []
    const frameCount = Math.min(Math.floor(currentFrame), trajectory.totalFrames)
    for (let i = 0; i <= frameCount; i++) {
      pts.push(new THREE.Vector3(
        trajectory.positions[i * 3],
        trajectory.positions[i * 3 + 1],
        trajectory.positions[i * 3 + 2],
      ))
    }
    return pts
  }, [trajectory, currentFrame])

  if (points.length < 2) return null

  return <Line points={points} color="#60a5fa" lineWidth={2} />
}

function PlayerUnit() {
  return (
    <group position={[0, 1.0, 0]}>
      <mesh>
        <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
        <meshStandardMaterial color="#3b82f6" transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

function EnemyUnit({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.0, 0]}>
        <capsuleGeometry args={[0.4, 1.2, 8, 16]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.7} />
      </mesh>
    </group>
  )
}

function HitboxMarker({ trajectory, currentFrame }: { trajectory: TrajectoryResult; currentFrame: number }) {
  const frame = Math.min(Math.floor(currentFrame), trajectory.totalFrames - 1)
  const x = trajectory.positions[frame * 3]
  const y = trajectory.positions[frame * 3 + 1]
  const z = trajectory.positions[frame * 3 + 2]
  const [w, h, d] = trajectory.hitboxSize

  if (w === 0 && h === 0 && d === 0) return null

  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[w || 0.5, h || 0.5, d || 0.5]} />
      <meshStandardMaterial color="#fbbf24" transparent opacity={0.3} wireframe />
    </mesh>
  )
}

function SimTicker() {
  useFrame((_, delta) => {
    useBulletEditorStore.getState().tick(delta)
  })
  return null
}

export function BulletTrajectoryCanvas() {
  const trajectory = useBulletEditorStore((s) => s.trajectory)
  const scenario = useBulletEditorStore((s) => s.scenario)
  const playbackFrame = useBulletEditorStore((s) => s.playbackFrame)

  const targetPos: [number, number, number] = [
    scenario.targetOffsetX ?? 0,
    scenario.targetHeight ?? 0,
    scenario.targetDistance ?? 30,
  ]

  return (
    <Canvas gl={{ antialias: true, alpha: false }} style={{ background: "#0f111a" }}>
      <PerspectiveCamera makeDefault position={[12, 9, -15]} fov={48} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        target={[0, 1, targetPos[2] * 0.4]}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={4}
        maxDistance={200}
      />
      <ambientLight intensity={0.38} />
      <directionalLight position={[12, 22, -8]} intensity={0.85} />
      <directionalLight position={[-8, 14, 18]} intensity={0.28} />
      <Grid
        args={[160, 160]}
        cellSize={5}
        cellThickness={0.35}
        cellColor="#334155"
        sectionSize={25}
        sectionThickness={0.85}
        sectionColor="#475569"
        fadeDistance={120}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />
      <Suspense fallback={null}>
        <SimTicker />
        <PlayerUnit />
        <EnemyUnit position={targetPos} />
        {trajectory && (
          <>
            <TrajectoryLine trajectory={trajectory} currentFrame={playbackFrame} />
            <HitboxMarker trajectory={trajectory} currentFrame={playbackFrame} />
          </>
        )}
      </Suspense>
    </Canvas>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/bullet-editor/BulletTrajectoryCanvas.tsx
git commit -m "feat(bullet-editor): add 3D trajectory canvas with player/enemy units"
```

---

## Task 8: BulletEditorView (Main Layout)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorView.tsx`

- [ ] **Step 1: Create BulletEditorView**

```typescript
// src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorView.tsx
import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Save, FolderOpen, Play, Pause, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntryListPanel } from "../shared/EntryListPanel"
import { EditorStatusBar } from "../shared/EditorStatusBar"
import { BulletPropertyPanel } from "./BulletPropertyPanel"
import { BulletTrajectoryCanvas } from "./BulletTrajectoryCanvas"
import { BulletDpsPanel } from "./BulletDpsPanel"
import { useBulletEditorStore } from "./BulletEditorStore"
import { MOVE_TYPE_LABELS } from "../../bullet-preview/TrajectorySimulator"
import { readTypedEntryId } from "../../param-editor/paramEntryUtils"
import { formatHash } from "@/models/commandTable"
import type { TypedParamFile } from "../../param-editor/typedParamTypes"
import type { EditorEntryRow } from "../shared/types"

interface BulletEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void
}

export function BulletEditorView({ onUnsavedChanges }: BulletEditorViewProps) {
  const [filePath, setFilePath] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const data = useBulletEditorStore((s) => s.data)
  const selectedIndex = useBulletEditorStore((s) => s.selectedIndex)
  const dirty = useBulletEditorStore((s) => s.dirty)
  const trajectory = useBulletEditorStore((s) => s.trajectory)
  const validationMessages = useBulletEditorStore((s) => s.validationMessages)
  const isPlaying = useBulletEditorStore((s) => s.isPlaying)

  const store = useBulletEditorStore

  useEffect(() => {
    onUnsavedChanges?.(dirty)
  }, [dirty, onUnsavedChanges])

  const loadFile = async () => {
    if (!filePath.trim()) return
    setLoading(true)
    try {
      const result = await invoke<string>("parse_typed_param_file", {
        path: filePath,
        paramType: "bulletparam",
      })
      const parsed: TypedParamFile = JSON.parse(result)
      store.getState().setData(parsed, filePath)
    } finally {
      setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!data || !filePath.trim()) return
    setSaving(true)
    try {
      await invoke("build_typed_param_file", {
        dataJson: JSON.stringify(data),
        outputPath: filePath,
        paramType: "bulletparam",
      })
      store.setState({ dirty: false })
    } finally {
      setSaving(false)
    }
  }

  const entry = data?.entries[selectedIndex] ?? null
  const moveType = entry && typeof entry.moveType === "number" ? entry.moveType : 255

  const renderEntryLabel = (row: EditorEntryRow) => {
    const mt = typeof row.entry.moveType === "number" ? row.entry.moveType : 255
    const label = MOVE_TYPE_LABELS[mt] ?? `Type ${mt}`
    return (
      <div className="flex flex-col">
        <span className="font-mono text-[10px]">{formatHash(row.entryId)}</span>
        <span className="text-[9px] text-muted-foreground">{label}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <Input
          className="h-7 w-80 font-mono text-[11px]"
          placeholder="bulletparam.bin path…"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
        />
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={loadFile} disabled={loading}>
          <FolderOpen className="h-3 w-3" />
          {loading ? "Loading…" : "Load"}
        </Button>
        <Button size="sm" variant="default" className="h-7 gap-1 text-[11px]" onClick={saveFile} disabled={!dirty || saving}>
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => store.getState().togglePlayback()}
            disabled={!trajectory}
          >
            {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0"
            onClick={() => store.getState().setPlaybackFrame(0)}
            disabled={!trajectory}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Left: Entry list */}
        <EntryListPanel
          entries={data?.entries ?? []}
          selectedIndex={selectedIndex}
          onSelect={(i) => store.getState().selectEntry(i)}
          renderLabel={renderEntryLabel}
        />

        {/* Center: 3D Viewport */}
        <div className="min-h-0 border-x">
          {data ? (
            <BulletTrajectoryCanvas />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Load a bulletparam.bin file to begin
            </div>
          )}
        </div>

        {/* Right: Properties */}
        <div className="flex min-h-0 flex-col overflow-hidden">
          {entry ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <BulletPropertyPanel
                  entry={entry}
                  onFieldChange={(key, value) => store.getState().updateField(key, value)}
                />
              </div>
              <div className="border-t p-2">
                <BulletDpsPanel entry={entry} trajectory={trajectory} />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No entry selected
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <EditorStatusBar
        entryCount={data?.entries.length ?? 0}
        selectedIndex={selectedIndex}
        modifiedCount={dirty ? 1 : 0}
        validationMessages={validationMessages}
        extra={trajectory && <span>MoveType: {trajectory.moveTypeLabel}</span>}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/bullet-editor/BulletEditorView.tsx
git commit -m "feat(bullet-editor): add main BulletEditorView layout"
```

---

## Task 9: ArmsEditor Store

**Files:**
- Create: `src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorStore.ts`

- [ ] **Step 1: Create ArmsEditorStore**

```typescript
// src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorStore.ts
import { create } from "zustand"
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes"
import { readTypedEntryId } from "../../param-editor/paramEntryUtils"
import type { ValidationMessage } from "../shared/types"

export type WeaponSlotId = "mainA" | "mainB" | "subA" | "subB" | "melee" | "special"

export interface WeaponSlotInfo {
  id: WeaponSlotId
  label: string
  fieldPrefix: string
  color: string
}

export const WEAPON_SLOTS: WeaponSlotInfo[] = [
  { id: "mainA", label: "Main Shot A", fieldPrefix: "mainA_", color: "#3b82f6" },
  { id: "mainB", label: "Main Shot B", fieldPrefix: "mainB_", color: "#60a5fa" },
  { id: "subA", label: "Sub Weapon A", fieldPrefix: "subA_", color: "#10b981" },
  { id: "subB", label: "Sub Weapon B", fieldPrefix: "subB_", color: "#34d399" },
  { id: "melee", label: "Melee", fieldPrefix: "melee_", color: "#ef4444" },
  { id: "special", label: "Special", fieldPrefix: "special_", color: "#f59e0b" },
]

export interface ArmsEditorState {
  data: TypedParamFile | null
  filePath: string
  selectedIndex: number
  selectedSlot: WeaponSlotId
  dirty: boolean
  validationMessages: ValidationMessage[]

  setData: (data: TypedParamFile, filePath: string) => void
  selectEntry: (index: number) => void
  selectSlot: (slot: WeaponSlotId) => void
  updateField: (key: string, value: number) => void
}

function validateArmsEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = []
  for (const slot of WEAPON_SLOTS) {
    const ammoKey = `${slot.fieldPrefix}maxAmmo`
    const ammo = typeof entry[ammoKey] === "number" ? entry[ammoKey] as number : -1
    if (ammo === 0) {
      messages.push({ field: ammoKey, level: "warning", message: `${slot.label}: maxAmmo is 0 (disabled?)` })
    }
  }
  return messages
}

export const useArmsEditorStore = create<ArmsEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  selectedSlot: "mainA",
  dirty: false,
  validationMessages: [],

  setData: (data, filePath) => {
    const entry = data.entries[0]
    const validationMessages = entry ? validateArmsEntry(entry) : []
    set({ data, filePath, selectedIndex: 0, selectedSlot: "mainA", dirty: false, validationMessages })
  },

  selectEntry: (index) => {
    const { data } = get()
    const entry = data?.entries[index]
    const validationMessages = entry ? validateArmsEntry(entry) : []
    set({ selectedIndex: index, validationMessages })
  },

  selectSlot: (slot) => set({ selectedSlot: slot }),

  updateField: (key, value) => {
    const { data, selectedIndex } = get()
    if (!data) return
    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    )
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i))
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds }
    const entry = nextEntries[selectedIndex]
    const validationMessages = entry ? validateArmsEntry(entry) : []
    set({ data: nextData, dirty: true, validationMessages })
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorStore.ts
git commit -m "feat(arms-editor): add Zustand store with weapon slot model"
```

---

## Task 10: WeaponSlotDiagram (SVG Visualization)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/arms-editor/WeaponSlotDiagram.tsx`

- [ ] **Step 1: Create WeaponSlotDiagram**

```typescript
// src/page/TestEditor/components/param-editors/arms-editor/WeaponSlotDiagram.tsx
import { WEAPON_SLOTS, type WeaponSlotId, type WeaponSlotInfo } from "./ArmsEditorStore"
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"

interface WeaponSlotDiagramProps {
  entry: TypedParamEntry
  selectedSlot: WeaponSlotId
  onSelectSlot: (slot: WeaponSlotId) => void
}

const SLOT_POSITIONS: Record<WeaponSlotId, { x: number; y: number; side: "left" | "right" }> = {
  mainA: { x: 45, y: 55, side: "left" },
  mainB: { x: 45, y: 85, side: "left" },
  subA: { x: 255, y: 55, side: "right" },
  subB: { x: 255, y: 85, side: "right" },
  melee: { x: 45, y: 115, side: "left" },
  special: { x: 255, y: 115, side: "right" },
}

function SlotMarker({
  slot,
  pos,
  entry,
  isSelected,
  onClick,
}: {
  slot: WeaponSlotInfo
  pos: { x: number; y: number; side: "left" | "right" }
  entry: TypedParamEntry
  isSelected: boolean
  onClick: () => void
}) {
  const ammoKey = `${slot.fieldPrefix}maxAmmo`
  const ammo = typeof entry[ammoKey] === "number" ? (entry[ammoKey] as number) : 0
  const hasData = ammo > 0

  return (
    <g
      className="cursor-pointer"
      onClick={onClick}
    >
      <rect
        x={pos.x}
        y={pos.y}
        width={100}
        height={22}
        rx={4}
        fill={isSelected ? slot.color : hasData ? `${slot.color}44` : "#1e293b"}
        stroke={isSelected ? slot.color : "#475569"}
        strokeWidth={isSelected ? 2 : 1}
      />
      <text
        x={pos.x + 50}
        y={pos.y + 14}
        textAnchor="middle"
        className="text-[9px] font-medium"
        fill={isSelected ? "#fff" : hasData ? "#e2e8f0" : "#64748b"}
      >
        {slot.label}
      </text>
      {hasData && (
        <text
          x={pos.x + 50}
          y={pos.y + 36}
          textAnchor="middle"
          className="text-[8px]"
          fill="#94a3b8"
        >
          Ammo: {ammo}
        </text>
      )}
    </g>
  )
}

export function WeaponSlotDiagram({ entry, selectedSlot, onSelectSlot }: WeaponSlotDiagramProps) {
  return (
    <div className="rounded-md border bg-[#0f172a] p-4 shadow-sm">
      <svg viewBox="0 0 400 170" className="w-full">
        {/* Unit body silhouette */}
        <rect x={155} y={40} width={90} height={100} rx={12} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
        <circle cx={200} cy={30} r={14} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
        <text x={200} y={34} textAnchor="middle" className="text-[9px]" fill="#64748b">UNIT</text>

        {/* Connector lines */}
        {WEAPON_SLOTS.map((slot) => {
          const pos = SLOT_POSITIONS[slot.id]
          const bodyX = pos.side === "left" ? 155 : 245
          const slotX = pos.side === "left" ? pos.x + 100 : pos.x
          return (
            <line
              key={slot.id}
              x1={slotX}
              y1={pos.y + 11}
              x2={bodyX}
              y2={pos.y + 11}
              stroke="#334155"
              strokeWidth={1}
              strokeDasharray="3,2"
            />
          )
        })}

        {/* Slot markers */}
        {WEAPON_SLOTS.map((slot) => (
          <SlotMarker
            key={slot.id}
            slot={slot}
            pos={SLOT_POSITIONS[slot.id]}
            entry={entry}
            isSelected={selectedSlot === slot.id}
            onClick={() => onSelectSlot(slot.id)}
          />
        ))}
      </svg>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/arms-editor/WeaponSlotDiagram.tsx
git commit -m "feat(arms-editor): add SVG weapon slot diagram"
```

---

## Task 11: ArmsPropertyPanel and AmmoTimeline

**Files:**
- Create: `src/page/TestEditor/components/param-editors/arms-editor/ArmsPropertyPanel.tsx`
- Create: `src/page/TestEditor/components/param-editors/arms-editor/AmmoTimeline.tsx`

- [ ] **Step 1: Create ArmsPropertyPanel**

```typescript
// src/page/TestEditor/components/param-editors/arms-editor/ArmsPropertyPanel.tsx
import { PropertyGroup } from "../shared/PropertyGroup"
import { PropertyField } from "../shared/PropertyField"
import type { PropertyFieldDef } from "../shared/types"
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"
import type { WeaponSlotId } from "./ArmsEditorStore"
import { WEAPON_SLOTS } from "./ArmsEditorStore"

interface ArmsPropertyPanelProps {
  entry: TypedParamEntry
  selectedSlot: WeaponSlotId
  onFieldChange: (key: string, value: number) => void
}

const RELOAD_TYPE_OPTIONS = [
  { value: 0, label: "All At Once" },
  { value: 1, label: "One By One" },
  { value: 2, label: "Continuous" },
]

function buildSlotFields(prefix: string): { ammo: PropertyFieldDef[]; timing: PropertyFieldDef[]; cost: PropertyFieldDef[] } {
  return {
    ammo: [
      { key: `${prefix}maxAmmo`, label: "Max Ammo", type: "u32", min: 0 },
      { key: `${prefix}reloadTime`, label: "Reload Time", type: "u32", unit: "f" },
      { key: `${prefix}reloadType`, label: "Reload Type", type: "enum", enumOptions: RELOAD_TYPE_OPTIONS },
      { key: `${prefix}ammoPerShot`, label: "Ammo Per Shot", type: "u32", min: 1 },
    ],
    timing: [
      { key: `${prefix}cooldownFrames`, label: "Cooldown", type: "u32", unit: "f" },
      { key: `${prefix}inputBuffer`, label: "Input Buffer", type: "u32", unit: "f" },
      { key: `${prefix}cancelWindow`, label: "Cancel Window", type: "u32", unit: "f" },
      { key: `${prefix}chainDelay`, label: "Chain Delay", type: "u32", unit: "f" },
    ],
    cost: [
      { key: `${prefix}boostCost`, label: "Boost Cost", type: "u32" },
      { key: `${prefix}overHeatPenalty`, label: "Overheat Penalty", type: "u32", unit: "f" },
      { key: `${prefix}bulletParamRef`, label: "Bullet Param Ref", type: "u32" },
      { key: `${prefix}actionHash`, label: "Action Hash", type: "hash" },
    ],
  }
}

export function ArmsPropertyPanel({ entry, selectedSlot, onFieldChange }: ArmsPropertyPanelProps) {
  const slotInfo = WEAPON_SLOTS.find((s) => s.id === selectedSlot)
  if (!slotInfo) return null

  const fields = buildSlotFields(slotInfo.fieldPrefix)

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="rounded-md border-l-4 bg-muted/20 px-3 py-2 text-xs font-semibold" style={{ borderLeftColor: slotInfo.color }}>
        {slotInfo.label}
      </div>
      <PropertyGroup label="Ammo & Reload">
        {fields.ammo.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
      <PropertyGroup label="Timing & Cooldown">
        {fields.timing.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
      <PropertyGroup label="Cost & References">
        {fields.cost.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
    </div>
  )
}
```

- [ ] **Step 2: Create AmmoTimeline**

```typescript
// src/page/TestEditor/components/param-editors/arms-editor/AmmoTimeline.tsx
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"
import type { WeaponSlotId } from "./ArmsEditorStore"
import { WEAPON_SLOTS } from "./ArmsEditorStore"

interface AmmoTimelineProps {
  entry: TypedParamEntry
  selectedSlot: WeaponSlotId
}

function getSlotValue(entry: TypedParamEntry, prefix: string, field: string): number {
  const val = entry[`${prefix}${field}`]
  return typeof val === "number" ? val : 0
}

export function AmmoTimeline({ entry, selectedSlot }: AmmoTimelineProps) {
  const slotInfo = WEAPON_SLOTS.find((s) => s.id === selectedSlot)
  if (!slotInfo) return null

  const prefix = slotInfo.fieldPrefix
  const maxAmmo = getSlotValue(entry, prefix, "maxAmmo")
  const reloadTime = getSlotValue(entry, prefix, "reloadTime")
  const cooldown = getSlotValue(entry, prefix, "cooldownFrames")
  const ammoPerShot = Math.max(getSlotValue(entry, prefix, "ammoPerShot"), 1)

  const shotCount = maxAmmo > 0 ? Math.floor(maxAmmo / ammoPerShot) : 0
  const totalFireTime = shotCount * cooldown
  const totalCycleTime = totalFireTime + reloadTime
  const dpsWindow = totalCycleTime > 0 ? (shotCount * 60) / totalCycleTime : 0

  if (maxAmmo === 0) {
    return (
      <div className="rounded-md border bg-card p-3 text-center text-[11px] text-muted-foreground">
        Slot disabled (0 ammo)
      </div>
    )
  }

  const fireWidth = totalCycleTime > 0 ? (totalFireTime / totalCycleTime) * 100 : 50
  const reloadWidth = 100 - fireWidth

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">Ammo Economy</h4>
      <div className="mb-2 flex h-5 w-full overflow-hidden rounded-full">
        <div
          className="flex items-center justify-center text-[9px] font-medium text-white"
          style={{ width: `${fireWidth}%`, backgroundColor: slotInfo.color }}
        >
          {shotCount} shots
        </div>
        <div
          className="flex items-center justify-center bg-slate-700 text-[9px] text-slate-300"
          style={{ width: `${reloadWidth}%` }}
        >
          Reload {reloadTime}f
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
        <span className="text-muted-foreground">Shots per mag:</span>
        <span className="font-mono">{shotCount}</span>
        <span className="text-muted-foreground">Fire cycle:</span>
        <span className="font-mono">{totalFireTime}f ({(totalFireTime / 60).toFixed(2)}s)</span>
        <span className="text-muted-foreground">Full cycle:</span>
        <span className="font-mono">{totalCycleTime}f ({(totalCycleTime / 60).toFixed(2)}s)</span>
        <span className="text-muted-foreground">Shots/sec (sustained):</span>
        <span className="font-mono">{dpsWindow.toFixed(1)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/page/TestEditor/components/param-editors/arms-editor/ArmsPropertyPanel.tsx
git add src/page/TestEditor/components/param-editors/arms-editor/AmmoTimeline.tsx
git commit -m "feat(arms-editor): add property panel and ammo timeline"
```

---

## Task 12: ArmsEditorView (Main Layout)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorView.tsx`

- [ ] **Step 1: Create ArmsEditorView**

```typescript
// src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorView.tsx
import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Save, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntryListPanel } from "../shared/EntryListPanel"
import { EditorStatusBar } from "../shared/EditorStatusBar"
import { WeaponSlotDiagram } from "./WeaponSlotDiagram"
import { ArmsPropertyPanel } from "./ArmsPropertyPanel"
import { AmmoTimeline } from "./AmmoTimeline"
import { useArmsEditorStore } from "./ArmsEditorStore"
import type { TypedParamFile } from "../../param-editor/typedParamTypes"

interface ArmsEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void
}

export function ArmsEditorView({ onUnsavedChanges }: ArmsEditorViewProps) {
  const [filePath, setFilePath] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const data = useArmsEditorStore((s) => s.data)
  const selectedIndex = useArmsEditorStore((s) => s.selectedIndex)
  const selectedSlot = useArmsEditorStore((s) => s.selectedSlot)
  const dirty = useArmsEditorStore((s) => s.dirty)
  const validationMessages = useArmsEditorStore((s) => s.validationMessages)

  const store = useArmsEditorStore

  useEffect(() => {
    onUnsavedChanges?.(dirty)
  }, [dirty, onUnsavedChanges])

  const loadFile = async () => {
    if (!filePath.trim()) return
    setLoading(true)
    try {
      const result = await invoke<string>("parse_typed_param_file", {
        path: filePath,
        paramType: "armsparam",
      })
      const parsed: TypedParamFile = JSON.parse(result)
      store.getState().setData(parsed, filePath)
    } finally {
      setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!data || !filePath.trim()) return
    setSaving(true)
    try {
      await invoke("build_typed_param_file", {
        dataJson: JSON.stringify(data),
        outputPath: filePath,
        paramType: "armsparam",
      })
      store.setState({ dirty: false })
    } finally {
      setSaving(false)
    }
  }

  const entry = data?.entries[selectedIndex] ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <Input
          className="h-7 w-80 font-mono text-[11px]"
          placeholder="armsparam.bin path…"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
        />
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={loadFile} disabled={loading}>
          <FolderOpen className="h-3 w-3" />
          {loading ? "Loading…" : "Load"}
        </Button>
        <Button size="sm" variant="default" className="h-7 gap-1 text-[11px]" onClick={saveFile} disabled={!dirty || saving}>
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Main content */}
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Left: Entry list */}
        <EntryListPanel
          entries={data?.entries ?? []}
          selectedIndex={selectedIndex}
          onSelect={(i) => store.getState().selectEntry(i)}
        />

        {/* Center: Weapon slot diagram + ammo timeline */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-x p-4">
          {entry ? (
            <>
              <WeaponSlotDiagram
                entry={entry}
                selectedSlot={selectedSlot}
                onSelectSlot={(slot) => store.getState().selectSlot(slot)}
              />
              <AmmoTimeline entry={entry} selectedSlot={selectedSlot} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Load an armsparam.bin file to begin
            </div>
          )}
        </div>

        {/* Right: Properties */}
        <div className="min-h-0 overflow-hidden">
          {entry ? (
            <ArmsPropertyPanel
              entry={entry}
              selectedSlot={selectedSlot}
              onFieldChange={(key, value) => store.getState().updateField(key, value)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No entry selected
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <EditorStatusBar
        entryCount={data?.entries.length ?? 0}
        selectedIndex={selectedIndex}
        modifiedCount={dirty ? 1 : 0}
        validationMessages={validationMessages}
        extra={<span>Slot: {selectedSlot}</span>}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/arms-editor/ArmsEditorView.tsx
git commit -m "feat(arms-editor): add main ArmsEditorView layout"
```

---

## Task 13: SpeedEditor Store

**Files:**
- Create: `src/page/TestEditor/components/param-editors/speed-editor/SpeedEditorStore.ts`

- [ ] **Step 1: Create SpeedEditorStore**

```typescript
// src/page/TestEditor/components/param-editors/speed-editor/SpeedEditorStore.ts
import { create } from "zustand"
import type { TypedParamEntry, TypedParamFile } from "../../param-editor/typedParamTypes"
import { readTypedEntryId } from "../../param-editor/paramEntryUtils"
import type { ValidationMessage } from "../shared/types"

export interface SpeedProfile {
  walkSpeed: number
  runSpeed: number
  boostSpeed: number
  dashSpeed: number
  airDashSpeed: number
  fallSpeed: number
  boostDrain: number
  boostRegen: number
  maxBoost: number
  stepDistance: number
  stepFrames: number
  walkRadius1s: number
  boostRadius1s: number
  dashRadius1s: number
  boostDuration: number
}

function extractSpeedProfile(entry: TypedParamEntry): SpeedProfile {
  const n = (key: string, fallback = 0) => {
    const v = entry[key]
    return typeof v === "number" ? v : fallback
  }

  const walkSpeed = n("walkSpeed")
  const runSpeed = n("runSpeed")
  const boostSpeed = n("boostSpeed")
  const dashSpeed = n("dashSpeed")
  const airDashSpeed = n("airDashSpeed")
  const fallSpeed = n("fallSpeed")
  const boostDrain = n("boostDrain")
  const boostRegen = n("boostRegen")
  const maxBoost = n("maxBoost", 100)
  const stepDistance = n("stepDistance")
  const stepFrames = n("stepFrames")

  return {
    walkSpeed,
    runSpeed,
    boostSpeed,
    dashSpeed,
    airDashSpeed,
    fallSpeed,
    boostDrain,
    boostRegen,
    maxBoost,
    stepDistance,
    stepFrames,
    walkRadius1s: walkSpeed * 60,
    boostRadius1s: boostSpeed * 60,
    dashRadius1s: dashSpeed * 60,
    boostDuration: boostDrain > 0 ? maxBoost / boostDrain : 0,
  }
}

function validateSpeedEntry(entry: TypedParamEntry): ValidationMessage[] {
  const messages: ValidationMessage[] = []
  const profile = extractSpeedProfile(entry)
  if (profile.boostSpeed > 10) {
    messages.push({ field: "boostSpeed", level: "warning", message: "Very high boost speed" })
  }
  if (profile.boostDuration < 1 && profile.boostDrain > 0) {
    messages.push({ field: "boostDrain", level: "warning", message: "Boost drains in < 1 second" })
  }
  return messages
}

export interface SpeedEditorState {
  data: TypedParamFile | null
  filePath: string
  selectedIndex: number
  dirty: boolean
  profile: SpeedProfile | null
  validationMessages: ValidationMessage[]

  setData: (data: TypedParamFile, filePath: string) => void
  selectEntry: (index: number) => void
  updateField: (key: string, value: number) => void
}

function recompute(data: TypedParamFile | null, index: number) {
  if (!data || !data.entries[index]) {
    return { profile: null, validationMessages: [] }
  }
  const entry = data.entries[index]
  return {
    profile: extractSpeedProfile(entry),
    validationMessages: validateSpeedEntry(entry),
  }
}

export const useSpeedEditorStore = create<SpeedEditorState>((set, get) => ({
  data: null,
  filePath: "",
  selectedIndex: 0,
  dirty: false,
  profile: null,
  validationMessages: [],

  setData: (data, filePath) => {
    const { profile, validationMessages } = recompute(data, 0)
    set({ data, filePath, selectedIndex: 0, dirty: false, profile, validationMessages })
  },

  selectEntry: (index) => {
    const { data } = get()
    const { profile, validationMessages } = recompute(data, index)
    set({ selectedIndex: index, profile, validationMessages })
  },

  updateField: (key, value) => {
    const { data, selectedIndex } = get()
    if (!data) return
    const nextEntries = data.entries.map((e, i) =>
      i === selectedIndex ? { ...e, [key]: value } : e,
    )
    const nextEntryIds = nextEntries.map((e, i) => readTypedEntryId(e, i))
    const nextData = { ...data, entries: nextEntries, entryIds: nextEntryIds }
    const { profile, validationMessages } = recompute(nextData, selectedIndex)
    set({ data: nextData, dirty: true, profile, validationMessages })
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/speed-editor/SpeedEditorStore.ts
git commit -m "feat(speed-editor): add Zustand store with speed profile extraction"
```

---

## Task 14: MovementRadiusCanvas (3D Top-Down View)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/speed-editor/MovementRadiusCanvas.tsx`

- [ ] **Step 1: Create MovementRadiusCanvas**

```typescript
// src/page/TestEditor/components/param-editors/speed-editor/MovementRadiusCanvas.tsx
import { Canvas } from "@react-three/fiber"
import { OrbitControls, PerspectiveCamera, Ring, Text } from "@react-three/drei"
import { Suspense } from "react"
import type { SpeedProfile } from "./SpeedEditorStore"

interface MovementRadiusCanvasProps {
  profile: SpeedProfile | null
}

function RadiusRing({ radius, color, label }: { radius: number; color: string; label: string }) {
  if (radius <= 0) return null
  const scale = radius / 10

  return (
    <group>
      <Ring args={[scale - 0.05, scale + 0.05, 64]} rotation={[-Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color={color} transparent opacity={0.8} />
      </Ring>
      <Text
        position={[scale + 0.3, 0.1, 0]}
        fontSize={0.25}
        color={color}
        anchorX="left"
      >
        {label} ({radius.toFixed(1)})
      </Text>
    </group>
  )
}

function UnitDot() {
  return (
    <mesh position={[0, 0.1, 0]}>
      <sphereGeometry args={[0.15, 16, 16]} />
      <meshStandardMaterial color="#60a5fa" emissive="#60a5fa" emissiveIntensity={0.5} />
    </mesh>
  )
}

function GridFloor() {
  return (
    <group>
      {Array.from({ length: 21 }, (_, i) => {
        const pos = (i - 10) * 1
        return (
          <group key={i}>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  array={new Float32Array([pos, 0, -10, pos, 0, 10])}
                  count={2}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#1e293b" />
            </line>
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  array={new Float32Array([-10, 0, pos, 10, 0, pos])}
                  count={2}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#1e293b" />
            </line>
          </group>
        )
      })}
    </group>
  )
}

export function MovementRadiusCanvas({ profile }: MovementRadiusCanvasProps) {
  return (
    <Canvas gl={{ antialias: true, alpha: false }} style={{ background: "#0a0f1a" }}>
      <PerspectiveCamera makeDefault position={[0, 14, 0.01]} fov={50} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI * 0.1}
        minPolarAngle={0}
        minDistance={5}
        maxDistance={40}
      />
      <ambientLight intensity={0.6} />
      <Suspense fallback={null}>
        <GridFloor />
        <UnitDot />
        {profile && (
          <>
            <RadiusRing radius={profile.walkRadius1s} color="#22c55e" label="Walk" />
            <RadiusRing radius={profile.boostRadius1s} color="#3b82f6" label="Boost" />
            <RadiusRing radius={profile.dashRadius1s} color="#f59e0b" label="Dash" />
          </>
        )}
      </Suspense>
    </Canvas>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/speed-editor/MovementRadiusCanvas.tsx
git commit -m "feat(speed-editor): add 3D movement radius visualization"
```

---

## Task 15: SpeedCurveGraph (SVG)

**Files:**
- Create: `src/page/TestEditor/components/param-editors/speed-editor/SpeedCurveGraph.tsx`

- [ ] **Step 1: Create SpeedCurveGraph**

```typescript
// src/page/TestEditor/components/param-editors/speed-editor/SpeedCurveGraph.tsx
import type { SpeedProfile } from "./SpeedEditorStore"

interface SpeedCurveGraphProps {
  profile: SpeedProfile | null
}

function buildBoostCurve(profile: SpeedProfile): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = []
  const totalFrames = 120
  let currentBoost = profile.maxBoost
  let currentSpeed = 0
  const accelRate = (profile.boostSpeed - profile.walkSpeed) / 10

  for (let f = 0; f <= totalFrames; f++) {
    if (currentBoost > 0) {
      currentSpeed = Math.min(currentSpeed + accelRate, profile.boostSpeed)
      currentBoost = Math.max(0, currentBoost - profile.boostDrain)
    } else {
      currentSpeed = Math.max(currentSpeed - accelRate * 2, profile.walkSpeed)
    }
    points.push({ x: f / totalFrames, y: currentSpeed })
  }
  return points
}

function polylineFromPoints(points: { x: number; y: number }[], width: number, height: number, maxY: number): string {
  return points
    .map((p) => `${(p.x * width).toFixed(1)},${(height - (p.y / maxY) * height).toFixed(1)}`)
    .join(" ")
}

export function SpeedCurveGraph({ profile }: SpeedCurveGraphProps) {
  if (!profile) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-card text-xs text-muted-foreground">
        No data
      </div>
    )
  }

  const W = 320
  const H = 140
  const maxY = Math.max(profile.dashSpeed, profile.boostSpeed, profile.walkSpeed, 1) * 1.2
  const boostCurve = buildBoostCurve(profile)

  const walkY = H - (profile.walkSpeed / maxY) * H
  const boostY = H - (profile.boostSpeed / maxY) * H
  const dashY = H - (profile.dashSpeed / maxY) * H

  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">Speed Curves</h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => (
          <line
            key={frac}
            x1={0} y1={H * frac} x2={W} y2={H * frac}
            stroke="#1e293b" strokeWidth={0.5}
          />
        ))}

        {/* Reference lines for speed levels */}
        <line x1={0} y1={walkY} x2={W} y2={walkY} stroke="#22c55e" strokeWidth={0.5} strokeDasharray="4,2" />
        <line x1={0} y1={boostY} x2={W} y2={boostY} stroke="#3b82f6" strokeWidth={0.5} strokeDasharray="4,2" />
        <line x1={0} y1={dashY} x2={W} y2={dashY} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="4,2" />

        {/* Boost acceleration curve */}
        <polyline
          points={polylineFromPoints(boostCurve, W, H, maxY)}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
        />

        {/* Labels */}
        <text x={W - 4} y={walkY - 3} textAnchor="end" className="text-[8px]" fill="#22c55e">
          Walk {profile.walkSpeed.toFixed(1)}
        </text>
        <text x={W - 4} y={boostY - 3} textAnchor="end" className="text-[8px]" fill="#3b82f6">
          Boost {profile.boostSpeed.toFixed(1)}
        </text>
        <text x={W - 4} y={dashY - 3} textAnchor="end" className="text-[8px]" fill="#f59e0b">
          Dash {profile.dashSpeed.toFixed(1)}
        </text>

        {/* Axes */}
        <line x1={0} y1={H} x2={W} y2={H} stroke="#475569" strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={H} stroke="#475569" strokeWidth={1} />
        <text x={W / 2} y={H - 2} textAnchor="middle" className="text-[7px]" fill="#64748b">Frames (0-120)</text>
      </svg>

      {/* Stats summary */}
      <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
        <div className="text-center">
          <div className="font-mono font-medium text-green-400">{profile.boostDuration.toFixed(1)}s</div>
          <div className="text-muted-foreground">Boost Duration</div>
        </div>
        <div className="text-center">
          <div className="font-mono font-medium text-blue-400">{profile.stepDistance.toFixed(1)}m</div>
          <div className="text-muted-foreground">Step Distance</div>
        </div>
        <div className="text-center">
          <div className="font-mono font-medium text-amber-400">{profile.stepFrames}f</div>
          <div className="text-muted-foreground">Step Frames</div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/page/TestEditor/components/param-editors/speed-editor/SpeedCurveGraph.tsx
git commit -m "feat(speed-editor): add SVG speed curve graph"
```

---

## Task 16: SpeedPropertyPanel and SpeedEditorView

**Files:**
- Create: `src/page/TestEditor/components/param-editors/speed-editor/SpeedPropertyPanel.tsx`
- Create: `src/page/TestEditor/components/param-editors/speed-editor/SpeedEditorView.tsx`

- [ ] **Step 1: Create SpeedPropertyPanel**

```typescript
// src/page/TestEditor/components/param-editors/speed-editor/SpeedPropertyPanel.tsx
import { PropertyGroup } from "../shared/PropertyGroup"
import { PropertyField } from "../shared/PropertyField"
import type { PropertyFieldDef } from "../shared/types"
import type { TypedParamEntry } from "../../param-editor/typedParamTypes"

interface SpeedPropertyPanelProps {
  entry: TypedParamEntry
  onFieldChange: (key: string, value: number) => void
}

const GROUND_FIELDS: PropertyFieldDef[] = [
  { key: "walkSpeed", label: "Walk Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "runSpeed", label: "Run Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "turnRate", label: "Turn Rate", type: "f32", min: 0, max: 1, step: 0.01, unit: "rad/f" },
  { key: "backSpeed", label: "Back Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "groundFriction", label: "Ground Friction", type: "f32", min: 0, max: 1, step: 0.01 },
]

const BOOST_FIELDS: PropertyFieldDef[] = [
  { key: "boostSpeed", label: "Boost Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "dashSpeed", label: "Dash Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "boostAccel", label: "Boost Accel", type: "f32", min: 0, step: 0.01, unit: "m/f²" },
  { key: "boostDrain", label: "Boost Drain", type: "f32", min: 0, step: 0.1, unit: "/f" },
  { key: "boostRegen", label: "Boost Regen", type: "f32", min: 0, step: 0.1, unit: "/f" },
  { key: "maxBoost", label: "Max Boost", type: "f32", min: 0, step: 1 },
]

const AIR_FIELDS: PropertyFieldDef[] = [
  { key: "fallSpeed", label: "Fall Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "jumpHeight", label: "Jump Height", type: "f32", min: 0, step: 0.1, unit: "m" },
  { key: "airDashSpeed", label: "Air Dash Speed", type: "f32", min: 0, step: 0.01, unit: "m/f" },
  { key: "fallAccel", label: "Fall Accel", type: "f32", min: 0, step: 0.01, unit: "m/f²" },
  { key: "airFriction", label: "Air Friction", type: "f32", min: 0, max: 1, step: 0.01 },
]

const STEP_FIELDS: PropertyFieldDef[] = [
  { key: "stepDistance", label: "Step Distance", type: "f32", min: 0, step: 0.1, unit: "m" },
  { key: "stepFrames", label: "Step Frames", type: "u32", unit: "f" },
  { key: "iFrameStart", label: "I-Frame Start", type: "u32", unit: "f" },
  { key: "iFrameEnd", label: "I-Frame End", type: "u32", unit: "f" },
]

const RECOVERY_FIELDS: PropertyFieldDef[] = [
  { key: "landLag", label: "Landing Lag", type: "u32", unit: "f" },
  { key: "knockdownRecovery", label: "Knockdown Recovery", type: "u32", unit: "f" },
  { key: "wallBounceFrames", label: "Wall Bounce", type: "u32", unit: "f" },
  { key: "momentumCap", label: "Momentum Cap", type: "f32", min: 0, step: 0.1 },
]

export function SpeedPropertyPanel({ entry, onFieldChange }: SpeedPropertyPanelProps) {
  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <PropertyGroup label="Ground Movement">
        {GROUND_FIELDS.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
      <PropertyGroup label="Boost / Dash">
        {BOOST_FIELDS.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
      <PropertyGroup label="Air / Fall">
        {AIR_FIELDS.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
      <PropertyGroup label="Step / Dodge">
        {STEP_FIELDS.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
      <PropertyGroup label="Recovery">
        {RECOVERY_FIELDS.map((def) => (
          <PropertyField key={def.key} def={def} value={entry[def.key] ?? 0} onChange={onFieldChange} />
        ))}
      </PropertyGroup>
    </div>
  )
}
```

- [ ] **Step 2: Create SpeedEditorView**

```typescript
// src/page/TestEditor/components/param-editors/speed-editor/SpeedEditorView.tsx
import { useEffect, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Save, FolderOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntryListPanel } from "../shared/EntryListPanel"
import { EditorStatusBar } from "../shared/EditorStatusBar"
import { MovementRadiusCanvas } from "./MovementRadiusCanvas"
import { SpeedCurveGraph } from "./SpeedCurveGraph"
import { SpeedPropertyPanel } from "./SpeedPropertyPanel"
import { useSpeedEditorStore } from "./SpeedEditorStore"
import type { TypedParamFile } from "../../param-editor/typedParamTypes"

interface SpeedEditorViewProps {
  onUnsavedChanges?: (dirty: boolean) => void
}

export function SpeedEditorView({ onUnsavedChanges }: SpeedEditorViewProps) {
  const [filePath, setFilePath] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const data = useSpeedEditorStore((s) => s.data)
  const selectedIndex = useSpeedEditorStore((s) => s.selectedIndex)
  const dirty = useSpeedEditorStore((s) => s.dirty)
  const profile = useSpeedEditorStore((s) => s.profile)
  const validationMessages = useSpeedEditorStore((s) => s.validationMessages)

  const store = useSpeedEditorStore

  useEffect(() => {
    onUnsavedChanges?.(dirty)
  }, [dirty, onUnsavedChanges])

  const loadFile = async () => {
    if (!filePath.trim()) return
    setLoading(true)
    try {
      const result = await invoke<string>("parse_typed_param_file", {
        path: filePath,
        paramType: "speedparam",
      })
      const parsed: TypedParamFile = JSON.parse(result)
      store.getState().setData(parsed, filePath)
    } finally {
      setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!data || !filePath.trim()) return
    setSaving(true)
    try {
      await invoke("build_typed_param_file", {
        dataJson: JSON.stringify(data),
        outputPath: filePath,
        paramType: "speedparam",
      })
      store.setState({ dirty: false })
    } finally {
      setSaving(false)
    }
  }

  const entry = data?.entries[selectedIndex] ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <Input
          className="h-7 w-80 font-mono text-[11px]"
          placeholder="speedparam.bin path…"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
        />
        <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={loadFile} disabled={loading}>
          <FolderOpen className="h-3 w-3" />
          {loading ? "Loading…" : "Load"}
        </Button>
        <Button size="sm" variant="default" className="h-7 gap-1 text-[11px]" onClick={saveFile} disabled={!dirty || saving}>
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>

      {/* Main content */}
      <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_320px]">
        {/* Left: Entry list */}
        <EntryListPanel
          entries={data?.entries ?? []}
          selectedIndex={selectedIndex}
          onSelect={(i) => store.getState().selectEntry(i)}
        />

        {/* Center: Visualizations */}
        <div className="flex min-h-0 flex-col border-x">
          <div className="min-h-0 flex-1">
            {profile ? (
              <MovementRadiusCanvas profile={profile} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Load a speedparam.bin file to begin
              </div>
            )}
          </div>
          <div className="border-t p-3">
            <SpeedCurveGraph profile={profile} />
          </div>
        </div>

        {/* Right: Properties */}
        <div className="min-h-0 overflow-hidden">
          {entry ? (
            <SpeedPropertyPanel
              entry={entry}
              onFieldChange={(key, value) => store.getState().updateField(key, value)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No entry selected
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <EditorStatusBar
        entryCount={data?.entries.length ?? 0}
        selectedIndex={selectedIndex}
        modifiedCount={dirty ? 1 : 0}
        validationMessages={validationMessages}
        extra={profile && (
          <span>Boost: {profile.boostDuration.toFixed(1)}s | Walk: {profile.walkSpeed.toFixed(2)} | Dash: {profile.dashSpeed.toFixed(2)}</span>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/page/TestEditor/components/param-editors/speed-editor/
git commit -m "feat(speed-editor): add SpeedPropertyPanel and SpeedEditorView"
```

---

## Task 17: Register New Editors as Tabs in MainView

**Files:**
- Modify: `src/page/TestEditor/components/MainView.tsx`

- [ ] **Step 1: Add imports to MainView.tsx**

At the top of `MainView.tsx`, add after the existing BulletPreviewViewport import:

```typescript
import { BulletEditorView } from "./param-editors/bullet-editor/BulletEditorView";
import { ArmsEditorView } from "./param-editors/arms-editor/ArmsEditorView";
import { SpeedEditorView } from "./param-editors/speed-editor/SpeedEditorView";
```

- [ ] **Step 2: Add new tabs to the tabs array**

Insert after the "Bullet 3D" tab entry (after line 175):

```typescript
  {
    name: "Bullet Editor",
    value: "bullet-editor",
    render: (props: MainViewProps) => <BulletEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Arms Editor",
    value: "arms-editor",
    render: (props: MainViewProps) => <ArmsEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
  {
    name: "Speed Editor",
    value: "speed-editor",
    render: (props: MainViewProps) => <SpeedEditorView onUnsavedChanges={props.onUnsavedChanges} />,
  },
```

- [ ] **Step 3: Update keep-mounted logic**

In the `shouldKeepMounted` condition (around line 611), extend it to include the new 3D tabs:

```typescript
const shouldKeepMounted = isActive || tab.value === "3d" || tab.value === "bullet-3d" || tab.value === "bullet-editor" || tab.value === "speed-editor" || Boolean(unsavedTabMap[tab.value]);
```

- [ ] **Step 4: Commit**

```bash
git add src/page/TestEditor/components/MainView.tsx
git commit -m "feat: register BulletEditor, ArmsEditor, SpeedEditor as MainView tabs"
```

---

## Task 18: TypeScript Compilation Check

- [ ] **Step 1: Run TypeScript compilation**

```bash
npx tsc --noEmit
```

Expected: No type errors. If errors appear, fix the import paths or type mismatches.

- [ ] **Step 2: Fix any compilation errors found**

Common issues to check:
- Import path aliases (`@/` resolves to `src/`)
- Missing exports (ensure all components use named exports)
- TypedParamEntry field access (fields may not exist on type — this is by design since entries are `Record<string, TypedFieldValue>`)

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript compilation errors in param editors"
```

---

## Task 19: Visual Smoke Test

- [ ] **Step 1: Verify build succeeds**

```bash
npm run build
```

Expected: Build completes without errors.

- [ ] **Step 2: Test in browser** (manual verification)

Open the app and verify:
1. Three new tabs appear: "Bullet Editor", "Arms Editor", "Speed Editor"
2. Each tab loads without crash
3. Loading a file populates the entry list
4. Selecting an entry shows properties
5. 3D canvases render (Bullet trajectory, Movement radius)
6. SVG visualizations render (Weapon slot diagram, Speed curves)

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final adjustments for param editor visual smoke test"
```
