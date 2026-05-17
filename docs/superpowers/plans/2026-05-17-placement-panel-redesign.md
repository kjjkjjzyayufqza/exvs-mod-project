# Placement Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the draft/apply workflow from the placement panel, make all edits immediate with undo/redo, and add a typed "Add" flow for new scene objects.

**Architecture:** Remove `placementDraftEntries` from `page.tsx`. The single source of truth becomes `placementEntries` — all edits write directly to it and record undo/redo commands. The `PlacementCsvEditorPanel` is redesigned: no Apply/Draft buttons, changes are immediate, and a new type-selector popover lets users add Object/Effect/Sky entries with default fields.

**Tech Stack:** React, TypeScript, Zustand, Radix UI (DropdownMenu), Vitest, react-testing-library

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/page/SceneEdit/utils/sceneCsvEditors.ts` | Modify | Add `createPlacementRowForType()` factory; keep existing helpers |
| `src/page/SceneEdit/utils/sceneCsvEditors.test.ts` | Modify | Add tests for `createPlacementRowForType()` |
| `src/page/SceneEdit/components/PlacementCsvEditorPanel.tsx` | Rewrite | Remove draft/apply props, add type selector, immediate-edit callbacks |
| `src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx` | Modify | Update `PlacementCsvEditorPanel` test to match new props |
| `src/page/SceneEdit/page.tsx` | Modify | Remove all draft state/callbacks, wire new panel props |

---

### Task 1: Add `createPlacementRowForType` Factory

**Files:**
- Modify: `src/page/SceneEdit/utils/sceneCsvEditors.ts`
- Modify: `src/page/SceneEdit/utils/sceneCsvEditors.test.ts`

- [ ] **Step 1: Write the failing tests**

In `sceneCsvEditors.test.ts`, add a new describe block at the end of the file:

```typescript
import {
  addGraphicParam,
  applyGraphicParamSelection,
  createPlacementRowForType,
  deleteGraphicParamAt,
  replacePlacementRawField,
  updateGraphicParamValue,
} from "./sceneCsvEditors";

// ... existing tests ...

describe("createPlacementRowForType", () => {
  test("creates an OBJECT row with transform and objectNumber fields", () => {
    const row = createPlacementRowForType("OBJECT");
    expect(row.vdkType).toBe("OBJECT");
    expect(row.objectNumber).toBeNull();
    expect(row.posX).toBe(0);
    expect(row.scaleX).toBe(1);
    expect(row.rawFields).toContain("VDK_TYPE");
    expect(row.rawFields).toContain("OBJECT");
    expect(row.rawFields).toContain("VDK_OBJECTNUMBER");
  });

  test("creates an EFFECT row without objectNumber field", () => {
    const row = createPlacementRowForType("EFFECT");
    expect(row.vdkType).toBe("EFFECT");
    expect(row.objectNumber).toBeNull();
    expect(row.rawFields).toContain("EFFECT");
    expect(row.rawFields).not.toContain("VDK_OBJECTNUMBER");
  });

  test("creates a SKY row without objectNumber field", () => {
    const row = createPlacementRowForType("SKY");
    expect(row.vdkType).toBe("SKY");
    expect(row.rawFields).toContain("SKY");
    expect(row.rawFields).not.toContain("VDK_OBJECTNUMBER");
  });

  test("defaults to OBJECT for unknown type", () => {
    const row = createPlacementRowForType("UNKNOWN");
    expect(row.vdkType).toBe("UNKNOWN");
    expect(row.rawFields[1]).toBe("UNKNOWN");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/page/SceneEdit/utils/sceneCsvEditors.test.ts`
Expected: FAIL — `createPlacementRowForType` is not exported

- [ ] **Step 3: Implement `createPlacementRowForType`**

In `sceneCsvEditors.ts`, add before the `assertValidIndex` function:

```typescript
const BASE_TRANSFORM_FIELDS = [
  "VDK_POSITION_X", "0",
  "VDK_POSITION_Y", "0",
  "VDK_POSITION_Z", "0",
  "VDK_ROTATION_X", "0",
  "VDK_ROTATION_Y", "0",
  "VDK_ROTATION_Z", "0",
  "VDK_SCALE_X", "1",
  "VDK_SCALE_Y", "1",
  "VDK_SCALE_Z", "1",
];

export function createPlacementRowForType(vdkType: string): PlacementRow {
  const upper = vdkType.toUpperCase();
  const rawFields = upper === "OBJECT"
    ? ["VDK_TYPE", upper, "VDK_OBJECTNUMBER", "", "VDK_PROGRAMID", "0", ...BASE_TRANSFORM_FIELDS]
    : ["VDK_TYPE", upper, ...BASE_TRANSFORM_FIELDS];

  return {
    vdkType: upper,
    objectNumber: null,
    posX: 0,
    posY: 0,
    posZ: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    rawFields,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/page/SceneEdit/utils/sceneCsvEditors.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
git add src/page/SceneEdit/utils/sceneCsvEditors.ts src/page/SceneEdit/utils/sceneCsvEditors.test.ts
git commit -m "feat(scene): add createPlacementRowForType factory for typed placement creation"
```

---

### Task 2: Redesign PlacementCsvEditorPanel — Remove Draft/Apply, Add Type Selector

**Files:**
- Rewrite: `src/page/SceneEdit/components/PlacementCsvEditorPanel.tsx`

- [ ] **Step 1: Rewrite the component with new props interface**

Replace the entire file content. The new interface removes `appliedEntries`, `onApplyRow`, `onApplyAll`, `onDraftRowChange`, renames to direct-edit callbacks, and adds `onAddTyped`:

```tsx
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Box, Sparkles, Cloud } from "lucide-react";
import type { PlacementRow } from "../types/placement";

interface PlacementCsvEditorPanelProps {
  entries: PlacementRow[];
  selectedIndex: number | null;
  onSelectEntry: (index: number) => void;
  onFieldChange: (index: number, fieldIndex: number, value: string) => void;
  onAddFieldPair: (index: number) => void;
  onRemoveFieldPair: (index: number, fieldIndex: number) => void;
  onAddTyped: (vdkType: string) => void;
  onDeleteRow: (index: number) => void;
}

const KNOWN_VDK_TYPES = [
  { type: "OBJECT", label: "Object", icon: Box },
  { type: "EFFECT", label: "Effect", icon: Sparkles },
  { type: "SKY", label: "Sky", icon: Cloud },
] as const;

const TRANSFORM_KEYS = new Set([
  "VDK_POSITION_X",
  "VDK_POSITION_Y",
  "VDK_POSITION_Z",
  "VDK_ROTATION_X",
  "VDK_ROTATION_Y",
  "VDK_ROTATION_Z",
  "VDK_SCALE_X",
  "VDK_SCALE_Y",
  "VDK_SCALE_Z",
]);

export function PlacementCsvEditorPanel({
  entries,
  selectedIndex,
  onSelectEntry,
  onFieldChange,
  onAddFieldPair,
  onRemoveFieldPair,
  onAddTyped,
  onDeleteRow,
}: PlacementCsvEditorPanelProps) {
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => {
    const lower = filter.trim().toLowerCase();
    return entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => {
        if (!lower) return true;
        return `${index} ${entry.vdkType} ${entry.objectNumber ?? ""} ${entry.rawFields.join(" ")}`.toLowerCase().includes(lower);
      });
  }, [entries, filter]);

  if (entries.length === 0) {
    return (
      <div data-testid="placement-csv-editor-panel" className="flex min-h-0 flex-col gap-2">
        <AddTypedButton onAddTyped={onAddTyped} />
        <div className="py-2 text-center text-[10px] text-muted-foreground">No placement data</div>
      </div>
    );
  }

  return (
    <div data-testid="placement-csv-editor-panel" className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <AddTypedButton onAddTyped={onAddTyped} />
      </div>
      <Input
        className="h-6 text-[10px]"
        placeholder="Filter placement rows..."
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="space-y-1">
        {rows.map(({ entry, index }) => (
          <PlacementRowItem
            key={index}
            entry={entry}
            index={index}
            selected={selectedIndex === index}
            onSelectEntry={onSelectEntry}
            onFieldChange={onFieldChange}
            onAddFieldPair={onAddFieldPair}
            onRemoveFieldPair={onRemoveFieldPair}
            onDeleteRow={onDeleteRow}
          />
        ))}
      </div>
    </div>
  );
}

function AddTypedButton({ onAddTyped }: { onAddTyped: (vdkType: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]">
          <Plus className="h-3 w-3 mr-1" />
          Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {KNOWN_VDK_TYPES.map(({ type, label, icon: Icon }) => (
          <DropdownMenuItem key={type} onClick={() => onAddTyped(type)}>
            <Icon className="mr-2 h-3.5 w-3.5" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlacementRowItem({
  entry,
  index,
  selected,
  onSelectEntry,
  onFieldChange,
  onAddFieldPair,
  onRemoveFieldPair,
  onDeleteRow,
}: {
  entry: PlacementRow;
  index: number;
  selected: boolean;
  onSelectEntry: (index: number) => void;
  onFieldChange: (index: number, fieldIndex: number, value: string) => void;
  onAddFieldPair: (index: number) => void;
  onRemoveFieldPair: (index: number, fieldIndex: number) => void;
  onDeleteRow: (index: number) => void;
}) {
  return (
    <div className={cn("rounded-sm border px-1.5 py-1", selected ? "border-primary/50 bg-primary/5" : "border-border/50")}>
      <button type="button" className="flex w-full items-center gap-1.5 text-left" onClick={() => onSelectEntry(index)}>
        <Badge variant={entry.vdkType === "EFFECT" ? "destructive" : entry.vdkType === "SKY" ? "outline" : "secondary"} className="h-4 px-1 text-[8px]">
          {entry.vdkType || "ROW"}
        </Badge>
        <span className="text-[9px] font-mono text-muted-foreground">#{index}</span>
        {entry.objectNumber !== null && <span className="text-[9px] font-mono">obj {entry.objectNumber}</span>}
      </button>
      {selected && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => onAddFieldPair(index)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Field
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 ml-auto text-muted-foreground hover:text-destructive"
              onClick={() => onDeleteRow(index)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {entry.rawFields.map((field, fieldIndex) => {
            if (fieldIndex % 2 !== 0) return null;
            const valueIndex = fieldIndex + 1;
            const value = entry.rawFields[valueIndex] ?? "";
            const numericValue = Number.parseFloat(value);
            const numeric = Number.isFinite(numericValue);
            const key = field.trim().toUpperCase();
            const sliderRange = key.includes("ROTATION")
              ? { min: -360, max: 360, step: 0.1 }
              : key.includes("SCALE")
                ? { min: 0, max: 4, step: 0.01 }
                : key.includes("POSITION")
                  ? { min: -10000, max: 10000, step: 0.1 }
                  : null;
            return (
              <div key={`${fieldIndex}-${field}`} className="space-y-1 rounded-sm bg-muted/20 px-1 py-1">
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-28 shrink-0 truncate text-[9px] font-mono", TRANSFORM_KEYS.has(key) ? "text-foreground" : "text-muted-foreground")} title={field}>
                    {field}
                  </span>
                  <Input
                    className="h-6 min-w-0 flex-1 text-[10px] font-mono"
                    value={value}
                    onChange={(event) => onFieldChange(index, valueIndex, event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveFieldPair(index, fieldIndex)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {numeric && sliderRange && (
                  <Slider
                    value={[numericValue]}
                    min={sliderRange.min}
                    max={sliderRange.max}
                    step={sliderRange.step}
                    onValueChange={(values) => {
                      onFieldChange(index, valueIndex, String(values[0] ?? numericValue));
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (panel only)**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: May show errors in `page.tsx` and `SceneCsvEditorPanels.test.tsx` (they still pass old props) — that's expected, we fix those in Task 3 and Task 4.

- [ ] **Step 3: Commit**

```
git add src/page/SceneEdit/components/PlacementCsvEditorPanel.tsx
git commit -m "feat(scene): redesign PlacementCsvEditorPanel with immediate editing and type selector"
```

---

### Task 3: Update Panel Test to Match New Props

**Files:**
- Modify: `src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx`

- [ ] **Step 1: Update the PlacementCsvEditorPanel test**

Replace the second `it(...)` block (the one testing the placement panel, starting at line 45) with:

```tsx
  it("renders full placement key-value fields inside a flexible panel", () => {
    const row: PlacementRow = {
      vdkType: "EFFECT",
      objectNumber: 7,
      posX: 10,
      posY: 20,
      posZ: 30,
      rotX: 0,
      rotY: 90,
      rotZ: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      rawFields: [
        "VDK_TYPE",
        "EFFECT",
        "VDK_POSITION_X",
        "10",
        "VDK_LENS_FLARE_ENABLE",
        "TRUE",
      ],
    };

    render(
      <PlacementCsvEditorPanel
        entries={[row]}
        selectedIndex={0}
        onSelectEntry={vi.fn()}
        onFieldChange={vi.fn()}
        onAddFieldPair={vi.fn()}
        onRemoveFieldPair={vi.fn()}
        onAddTyped={vi.fn()}
        onDeleteRow={vi.fn()}
      />,
    );

    expect(screen.getByText("VDK_LENS_FLARE_ENABLE")).toBeInTheDocument();
    expect(screen.getByDisplayValue("TRUE")).toBeInTheDocument();
    expect(screen.getByTestId("placement-csv-editor-panel")).toHaveClass("flex", "min-h-0");
  });
```

- [ ] **Step 2: Run the panel tests**

Run: `npx vitest run src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```
git add src/page/SceneEdit/components/SceneCsvEditorPanels.test.tsx
git commit -m "test(scene): update PlacementCsvEditorPanel test for new immediate-edit props"
```

---

### Task 4: Remove Draft Layer from page.tsx and Wire New Callbacks

**Files:**
- Modify: `src/page/SceneEdit/page.tsx`

This is the largest task. It removes all draft state/callbacks and wires the new `PlacementCsvEditorPanel` props.

- [ ] **Step 1: Remove draft state declarations**

In `page.tsx`, find and delete these lines:

```typescript
const [placementDraftEntries, setPlacementDraftEntries] = useState<PlacementRow[]>([]);
```

- [ ] **Step 2: Remove all `setPlacementDraftEntries` calls**

Search for every occurrence of `setPlacementDraftEntries` in `page.tsx` and remove the call (or the entire statement if it's a standalone line). There are occurrences in:

1. `applyBundle` callback (~line 642): remove `setPlacementDraftEntries(orderedPlacements.map(...))` 
2. `resetState` callback (~line 678): remove `setPlacementDraftEntries([])`
3. `handleDuplicateSelected` callback — two occurrences in undo/redo and the main body (~lines 542, 559, 575): remove all `setPlacementDraftEntries` calls
4. `handlePlacementChange` callback (~line 936-939): remove `setPlacementDraftEntries` block
5. `commitPlacementGizmo` callback (~lines 980-984): remove `setPlacementDraftEntries` block
6. `handleDeleteSelected` callback (~lines 1538, 1547, 1553): remove all `setPlacementDraftEntries` calls
7. `handlePasteAsNew` callback (~lines 1383, 1395, 1409): remove all `setPlacementDraftEntries` calls

- [ ] **Step 3: Remove draft-only callbacks**

Delete these entire `useCallback` blocks from `page.tsx`:
- `handlePlacementDraftRowChange`
- `handleAddPlacementDraftRow`
- `handleDeletePlacementDraftRow`
- `handleApplyPlacementDraftRow`
- `handleApplyAllPlacementDraftRows`

- [ ] **Step 4: Update `handleSave` to use `placementEntries`**

Find the `handleSave` callback. Replace the reference to `placementDraftEntries` with `placementEntries`:

Change:
```typescript
if (placementHeader.length > 0 && placementDraftEntries.length > 0) {
  const headerLine = placementHeader.join(",");
  const dataLines = placementDraftEntries.map((e) => e.rawFields.join(","));
```
to:
```typescript
if (placementHeader.length > 0 && placementEntries.length > 0) {
  const headerLine = placementHeader.join(",");
  const dataLines = placementEntries.map((e) => e.rawFields.join(","));
```

And change:
```typescript
} else if (placementDraftEntries.length > 0) {
  const placementCsv = placementDraftEntries.map((e) => e.rawFields.join(",")).join("\n");
```
to:
```typescript
} else if (placementEntries.length > 0) {
  const placementCsv = placementEntries.map((e) => e.rawFields.join(",")).join("\n");
```

Update the `handleSave` dependency array: remove `placementDraftEntries`, ensure `placementEntries` is present.

- [ ] **Step 5: Add new callbacks for the redesigned panel**

Add these three new callbacks in `page.tsx` (near the existing placement handler callbacks):

```typescript
const handlePlacementFieldChange = useCallback(
  (index: number, fieldIndex: number, value: string) => {
    const previous = placementEntries[index];
    if (!previous) return;
    const rawFields = [...previous.rawFields];
    rawFields[fieldIndex] = value;
    const nextEntry: PlacementRow = { ...previous, rawFields };
    setPlacementEntries((prev) => {
      const next = [...prev];
      next[index] = nextEntry;
      return next;
    });
    setHasUnsavedChanges(true);
    useSceneEditorStore.getState().recordCommand({
      type: "edit-placement-field",
      description: "Edit placement field",
      undo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = previous;
          return next;
        });
        setHasUnsavedChanges(true);
      },
      redo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = nextEntry;
          return next;
        });
        setHasUnsavedChanges(true);
      },
    });
  },
  [placementEntries],
);

const handleAddPlacementFieldPair = useCallback(
  (index: number) => {
    const previous = placementEntries[index];
    if (!previous) return;
    const rawFields = [...previous.rawFields, "VDK_NEW_FIELD", "0"];
    const nextEntry: PlacementRow = { ...previous, rawFields };
    setPlacementEntries((prev) => {
      const next = [...prev];
      next[index] = nextEntry;
      return next;
    });
    setHasUnsavedChanges(true);
    useSceneEditorStore.getState().recordCommand({
      type: "add-placement-field",
      description: "Add placement field pair",
      undo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = previous;
          return next;
        });
        setHasUnsavedChanges(true);
      },
      redo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = nextEntry;
          return next;
        });
        setHasUnsavedChanges(true);
      },
    });
  },
  [placementEntries],
);

const handleRemovePlacementFieldPair = useCallback(
  (index: number, fieldIndex: number) => {
    const previous = placementEntries[index];
    if (!previous) return;
    const valueIndex = fieldIndex + 1;
    const rawFields = previous.rawFields.filter((_, i) => i !== fieldIndex && i !== valueIndex);
    const nextEntry: PlacementRow = { ...previous, rawFields };
    setPlacementEntries((prev) => {
      const next = [...prev];
      next[index] = nextEntry;
      return next;
    });
    setHasUnsavedChanges(true);
    useSceneEditorStore.getState().recordCommand({
      type: "remove-placement-field",
      description: "Remove placement field pair",
      undo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = previous;
          return next;
        });
        setHasUnsavedChanges(true);
      },
      redo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next[index] = nextEntry;
          return next;
        });
        setHasUnsavedChanges(true);
      },
    });
  },
  [placementEntries],
);
```

- [ ] **Step 6: Add `handleAddTypedPlacement` callback**

Add this callback (requires importing `createPlacementRowForType` from `./utils/sceneCsvEditors`):

```typescript
import {
  // ... existing imports ...
  createPlacementRowForType,
} from "./utils/sceneCsvEditors";

// ... in component body:

const handleAddTypedPlacement = useCallback(
  (vdkType: string) => {
    const newRow = createPlacementRowForType(vdkType);
    const insertAt = selectedPlacementIdx !== null ? selectedPlacementIdx + 1 : placementEntries.length;
    setPlacementEntries((prev) => {
      const next = [...prev];
      next.splice(insertAt, 0, newRow);
      return next;
    });
    setSelectedPlacementIdxRaw(insertAt);
    const insertedNodeId = resolveNodeIdForPlacementIndex(insertAt, [...placementEntries.slice(0, insertAt), newRow, ...placementEntries.slice(insertAt)], subModels);
    setSelectedNodeIdRaw(insertedNodeId);
    if (insertedNodeId) useSceneEditorStore.getState().select(insertedNodeId);
    setHasUnsavedChanges(true);
    useSceneEditorStore.getState().recordCommand({
      type: "add-typed-placement",
      description: `Add ${vdkType} placement`,
      undo: () => {
        setPlacementEntries((prev) => prev.filter((_, i) => i !== insertAt));
        handleClearSelection();
        setHasUnsavedChanges(true);
      },
      redo: () => {
        setPlacementEntries((prev) => {
          const next = [...prev];
          next.splice(insertAt, 0, newRow);
          return next;
        });
        setSelectedPlacementIdxRaw(insertAt);
        setHasUnsavedChanges(true);
      },
    });
  },
  [handleClearSelection, placementEntries, selectedPlacementIdx, subModels],
);
```

- [ ] **Step 7: Update the PlacementCsvEditorPanel JSX in the render**

Find the `<PlacementCsvEditorPanel` JSX in the render (inside `TabsContent value="placement"`). Replace it:

From:
```tsx
<PlacementCsvEditorPanel
  draftEntries={placementDraftEntries}
  appliedEntries={placementEntries}
  selectedIndex={selectedPlacementIdx}
  onSelectEntry={handleSelectPlacement}
  onDraftRowChange={handlePlacementDraftRowChange}
  onAddRow={handleAddPlacementDraftRow}
  onDeleteRow={handleDeletePlacementDraftRow}
  onApplyRow={handleApplyPlacementDraftRow}
  onApplyAll={handleApplyAllPlacementDraftRows}
/>
```

To:
```tsx
<PlacementCsvEditorPanel
  entries={placementEntries}
  selectedIndex={selectedPlacementIdx}
  onSelectEntry={handleSelectPlacement}
  onFieldChange={handlePlacementFieldChange}
  onAddFieldPair={handleAddPlacementFieldPair}
  onRemoveFieldPair={handleRemovePlacementFieldPair}
  onAddTyped={handleAddTypedPlacement}
  onDeleteRow={handleDeleteSelected}
/>
```

- [ ] **Step 8: Update the Placement MayaSection badge**

Find the MayaSection wrapping the PlacementCsvEditorPanel. Change the badge from `${placementEntries.length}/${placementDraftEntries.length}` to just show the count:

From:
```tsx
<MayaSection title="Placement Draft" badge={`${placementEntries.length}/${placementDraftEntries.length}`} defaultOpen>
```

To:
```tsx
<MayaSection title="Placement" badge={placementEntries.length || undefined} defaultOpen>
```

- [ ] **Step 9: Clean up unused imports**

Remove `addPlacementRow`, `replacePlacementRow`, and `deletePlacementRowAt` from the import of `./utils/sceneCsvEditors` if they are no longer used anywhere in `page.tsx`. Keep `applyGraphicParamSelection`, `addGraphicParam`, `deleteGraphicParamAt`, `updateGraphicParamKey`, `updateGraphicParamValue`, and add `createPlacementRowForType`.

- [ ] **Step 10: Run TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 11: Run all SceneEdit tests**

Run: `npx vitest run src/page/SceneEdit/`
Expected: All tests PASS

- [ ] **Step 12: Commit**

```
git add src/page/SceneEdit/page.tsx
git commit -m "feat(scene): eliminate draft layer, wire immediate placement editing with undo/redo"
```

---

### Task 5: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript compilation**

Run: `npx tsc --noEmit --pretty`
Expected: No errors

- [ ] **Step 2: Run all project tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Verify no remaining references to draft**

Search for any leftover `placementDraftEntries` or `draftEntries` references:

Run: `grep -r "placementDraftEntries\|draftEntries\|onApplyRow\|onApplyAll\|handleApplyPlacement\|handlePlacementDraftRow\|handleAddPlacementDraftRow\|handleDeletePlacementDraftRow" src/page/SceneEdit/`
Expected: No matches

- [ ] **Step 4: Verify build**

Run: `npx vite build`
Expected: Build succeeds
