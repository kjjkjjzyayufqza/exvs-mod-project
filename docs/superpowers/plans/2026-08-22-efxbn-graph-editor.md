# EFXBN 18-Channel Graph Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, saveable Graph Editor for all 18 EFXBN control channels, including manual key insertion, multi-key editing, selection, pan, zoom, numeric precision editing, undo/redo, live playhead scrubbing, and whole-file persistence.

**Architecture:** Keep `EfxbnDocument` as the only authored state and keep the existing `write_effect_efxbn_file` backend as the only disk writer. Add pure curve math and interaction modules, render the graph with native SVG, keep pointer-drag state outside React render state, then commit each completed gesture as one atomic document command. Mount the editor as a resizable bottom panel under the existing viewport and inspector.

**Tech Stack:** React 19, TypeScript 6, native SVG, Tailwind CSS 4, existing shadcn/Radix primitives, existing `react-resizable-panels`, Vitest, Testing Library, Tauri v2, Rust EFXBN writer.

---

## Locked product decisions

- Scope: all 18 controls in `EFXBN_CONTROL_NAMES`, not RGBA only.
- Editing mode: manual keyframes only. No automatic key insertion mode.
- Interpolation: linear segments with clamped values before the first key and after the last key. EFXBN stores no tangent handles, so the UI must not show Bezier handles.
- Constant semantics: `selector == 1` remains a normal editable value. Inserting another key promotes it to a curve.
- Animated semantics: `selector > 1` is editable in the graph. The selector remains the key count.
- Time display: frame number is primary. Native EFXBN progress `0-100` is always visible in the precision inspector and is the stored value.
- Time conversion: `frame = progress * frameCount / 100`. Saving converts the displayed frame back to progress.
- Precise values: the selected key inspector always exposes raw progress and raw value inputs.
- Graph rendering: native SVG. Do not add a charting library.
- Dragging: graph geometry moves continuously. `EfxbnDocument` and the 3D preview update once on pointer release, producing one undo entry.
- Playhead scrubbing: continuous and non-authoring. Scrubbing never inserts a key.
- Save: reuse `prepareEfxbnDocumentForWrite` and `writeEffectEfxbnFile`. No byte patcher and no second save path.
- Source safety: tests may read `E:/XB`, but must only write to a temporary copy.

## Non-goals

- Bezier, Hermite, stepped, or user-selectable interpolation.
- Curve modifiers, generators, easing presets, or non-destructive animation layers.
- Editing derived `runtime` fields.
- Editing multiple EFXBN blocks in one graph view.
- Editing shared-pack resources.
- Replacing the existing Rust parser or whole-file writer.
- Persisting graph viewport state to disk in the first release.

## User-facing layout

```text
+----------------+--------------------------------+------------------+
| Block tree     |  3D viewport                   | Properties       |
|                |                                |                  |
|                |                                |                  |
+----------------+--------------------------------+------------------+
| Graph channels |  SVG curves and playhead       | Selected key     |
| visibility     |  pan / zoom / box selection    | Frame / % / value|
+----------------+--------------------------------+------------------+
| Existing playback transport: play, reset, scrub, speed, progress   |
+--------------------------------------------------------------------+
```

The graph panel is vertically resizable and collapsible. It opens when a curve diamond is used or when the user expands it directly. The existing playback transport remains the only transport; the graph reads and updates the same `effectProgress` state.

## Channel organization

| Group | Controls |
|---|---|
| Spawn form | `spawnForm0`, `spawnForm1`, `spawnForm2`, `spawnForm3` |
| Spread | `spreadX`, `spreadY` |
| Velocity | `speedBaseX`, `speedBaseY`, `speedBaseZ` |
| Scale | `scaleBaseX`, `scaleBaseY`, `scaleBaseZ` |
| Color | `colorR`, `colorG`, `colorB`, `colorA` |
| Forces | `worldGravityAccel`, `directionAccel` |

Every channel row has a visibility toggle, channel name, key count, current evaluated value, and manual key diamond. Color is not the only identifier: selected rows also use weight, background, and an explicit selected state.

## Interaction contract

### Selection

- Click a key: replace selection.
- Shift-click a key: toggle it in selection.
- Drag empty canvas: box-select keys.
- Shift-drag empty canvas: add box results to selection.
- Escape: clear selection.
- Clicking a channel row focuses that channel without changing authored data.

### Manual key diamond

- If the focused curve already has a key at the playhead, select that key.
- Otherwise, evaluate the current linear curve at the playhead and insert a key with that value.
- Inserting a point on an existing linear segment must not change the evaluated shape.
- For a one-key constant, insertion creates a second key with the same value.
- A filled diamond means a key exists at the playhead. It does not delete the key.

### Key editing

- Drag selected keys horizontally to retime them.
- Drag selected keys vertically to change values.
- Hold Shift during drag for fine value movement.
- Hold Ctrl during horizontal drag to disable frame snapping temporarily.
- Delete or Backspace removes selected keys, except the last key of any channel.
- Arrow Left/Right moves selected keys by one displayed frame.
- Arrow Up/Down changes values by the precision inspector step.
- Numeric inputs commit on blur or Enter and reject non-finite values.
- Duplicate progress values in one channel are refused before document commit.

### View navigation

- Mouse wheel zooms around the pointer.
- Shift-wheel pans horizontally.
- Middle-button drag pans.
- `F` frames the selected keys.
- `Home` frames every visible curve.
- Absolute mode uses one shared value axis.
- Normalize mode maps each visible curve to `0-1` for shape comparison only. Stored values and numeric inputs remain raw.

### Preview and save feedback

- Playhead scrubbing updates the 3D preview continuously.
- Key dragging updates the graph continuously and the 3D preview on pointer release.
- Dirty keys use the existing amber dirty treatment.
- Save confirmation retains the existing change list and key-count summary.
- Writer validation errors remain blocking and do not alter the file.

## Data flow

```text
disk .efxbn
  -> Rust parse
  -> EfxbnSummary
  -> EfxbnDocument
  -> Graph local gesture draft
  -> replaceEfxbnCurves, one commit per gesture
  -> derived runtime refresh
  -> preview plan and lookup ref refresh
  -> prepareEfxbnDocumentForWrite
  -> normalize and recompact key table
  -> existing atomic Rust writer
  -> parse written file
  -> acceptEfxbnDocumentWrite
```

## File responsibility map

### Create

- `src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.ts`
  - Linear evaluation, frame/progress conversion, range fitting, coordinate transforms, key-at-playhead lookup, and sampled-key insertion.
- `src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.test.ts`
  - Pure math and boundary coverage.
- `src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.ts`
  - Pure selection, drag, snapping, box-selection, and replacement-building logic.
- `src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.test.ts`
  - Gesture semantics without DOM coordinate ambiguity.
- `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphCanvas.tsx`
  - Accessible SVG rendering and pointer/keyboard event translation.
- `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.tsx`
  - Channel list, toolbar, precision inspector, document commands, and canvas composition.
- `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx`
  - Component-level manual key, selection, disabled, and accessibility behavior.

### Modify

- `src/page/TestEditor/components/effect-folder-editor/efxbnDocument.ts:450-550`
  - Add atomic multi-curve replacement and route existing single-key commands through it.
- `src/page/TestEditor/components/effect-folder-editor/efxbnDocument.test.ts:234-310`
  - Add atomic edit, duplicate rejection, history, and selector transition tests.
- `src/page/TestEditor/components/effect-folder-editor/EffectFolder3dPreview.tsx:288-317,641-699`
  - Own graph focus/open state, mount nested vertical resizable panels, and synchronize progress.
- `src/page/TestEditor/components/effect-folder-editor/EfxbnPreviewInspector.tsx:70-95,410-453`
  - Pass graph focus and playhead context into compact property rows and color authoring.
- `src/page/TestEditor/components/effect-folder-editor/EfxbnBlockEditor.tsx:301-448,709-774`
  - Replace the expanded duplicate key table with compact value/key affordances that focus the graph.
- `src/page/TestEditor/components/effect-folder-editor/EfxbnColorAuthor.tsx:19-29,49-66,128-463`
  - Edit constants or an existing key at the playhead; offer explicit manual insertion between keys.
- `src-tauri/tests/effect_folder_real_data_test.rs:1077-1172`
  - Prove a multi-key value edit survives the existing atomic writer on a temporary copy.
- `docs/superpowers/plans/2026-08-21-efxbn-real-editing-architecture.md`
  - Mark the Graph Editor phase complete only after implementation verification.

## Error rules

- Reject an empty curve.
- Reject non-finite progress or value.
- Reject duplicate progress within one control.
- Reject a curve name outside `EFXBN_CONTROL_NAMES`.
- Reject key deletion that would leave a control with zero keys.
- Reject a save when curve ranges overlap, tree invariants fail, or counts disagree.
- Preserve out-of-window source keys. Show them outside the normal playback band instead of clamping or deleting them.
- If `frameCount <= 0`, display progress as the primary unit and disable frame conversion controls.
- Freeze authoring while `writing` is true. Scrubbing may remain available because it does not change the document.

---

### Task 1: Add EFXBN curve math and view transforms

**Files:**
- Create: `src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.ts`
- Create: `src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.test.ts`

- [ ] **Step 1: Write failing conversion and evaluation tests**

```ts
import { describe, expect, it } from "vitest";
import {
  evaluateEfxbnCurve,
  findEfxbnKeyAtProgress,
  frameToEfxbnProgress,
  insertSampledEfxbnKey,
  progressToEfxbnFrame,
} from "./efxbnCurveMath";

describe("EFXBN curve time conversion", () => {
  it("round-trips frame and native progress", () => {
    expect(progressToEfxbnFrame(20, 250)).toBe(50);
    expect(frameToEfxbnProgress(50, 250)).toBe(20);
  });

  it("returns null when a frame window cannot be derived", () => {
    expect(progressToEfxbnFrame(20, 0)).toBeNull();
    expect(frameToEfxbnProgress(50, 0)).toBeNull();
  });
});

describe("EFXBN linear evaluation", () => {
  const keys = [
    { key: 0, value: 1 },
    { key: 100, value: 3 },
  ];

  it("clamps before and after the authored range", () => {
    expect(evaluateEfxbnCurve(keys, -10)).toBe(1);
    expect(evaluateEfxbnCurve(keys, 120)).toBe(3);
  });

  it("linearly interpolates between keys", () => {
    expect(evaluateEfxbnCurve(keys, 25)).toBe(1.5);
  });

  it("inserts a sampled key without changing the curve shape", () => {
    const next = insertSampledEfxbnKey(keys, 25);
    expect(next).toEqual([
      { key: 0, value: 1 },
      { key: 25, value: 1.5 },
      { key: 100, value: 3 },
    ]);
    expect(evaluateEfxbnCurve(next, 60)).toBe(evaluateEfxbnCurve(keys, 60));
  });

  it("finds a key using a small progress tolerance", () => {
    expect(findEfxbnKeyAtProgress(keys, 100.000001)).toBe(1);
    expect(findEfxbnKeyAtProgress(keys, 50)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.test.ts
```

Expected: FAIL because `efxbnCurveMath.ts` does not exist.

- [ ] **Step 3: Implement time conversion and linear evaluation**

```ts
import type { EfxbnCurveKey } from "./efxbnDocument";

const KEY_EPSILON = 1e-5;

export function progressToEfxbnFrame(progress: number, frameCount: number): number | null {
  if (!Number.isFinite(progress) || !Number.isFinite(frameCount) || frameCount <= 0) return null;
  return (progress * frameCount) / 100;
}

export function frameToEfxbnProgress(frame: number, frameCount: number): number | null {
  if (!Number.isFinite(frame) || !Number.isFinite(frameCount) || frameCount <= 0) return null;
  return (frame * 100) / frameCount;
}

export function evaluateEfxbnCurve(
  keys: readonly EfxbnCurveKey[],
  progress: number,
): number {
  if (keys.length === 0) throw new Error("EFXBN curve must contain at least one key");
  if (!Number.isFinite(progress)) throw new Error(`EFXBN progress is not finite: ${progress}`);
  if (keys.length === 1) return keys[0]!.value;
  const ordered = [...keys].sort((left, right) => left.key - right.key);
  if (progress <= ordered[0]!.key) return ordered[0]!.value;
  if (progress >= ordered.at(-1)!.key) return ordered.at(-1)!.value;
  for (let index = 1; index < ordered.length; index += 1) {
    const right = ordered[index]!;
    if (progress > right.key) continue;
    const left = ordered[index - 1]!;
    const span = right.key - left.key;
    if (Math.abs(span) <= KEY_EPSILON) {
      throw new Error(`EFXBN curve contains duplicate progress ${right.key}`);
    }
    const amount = (progress - left.key) / span;
    return left.value + (right.value - left.value) * amount;
  }
  return ordered.at(-1)!.value;
}

export function findEfxbnKeyAtProgress(
  keys: readonly EfxbnCurveKey[],
  progress: number,
): number | null {
  const index = keys.findIndex((entry) => Math.abs(entry.key - progress) <= KEY_EPSILON);
  return index >= 0 ? index : null;
}

export function insertSampledEfxbnKey(
  keys: readonly EfxbnCurveKey[],
  progress: number,
): EfxbnCurveKey[] {
  if (findEfxbnKeyAtProgress(keys, progress) !== null) return [...keys];
  const value = evaluateEfxbnCurve(keys, progress);
  return [...keys, { key: progress, value }].sort((left, right) => left.key - right.key);
}
```

- [ ] **Step 4: Add graph range and coordinate tests**

Add tests for:

```ts
it("pads a flat value range so a constant remains visible", () => {
  expect(fitEfxbnValueRange([[{ key: 0, value: 2 }]])).toEqual({ min: 1, max: 3 });
});

it("maps data coordinates to SVG and back", () => {
  const view = { progressMin: 0, progressMax: 100, valueMin: -2, valueMax: 2 };
  const pixel = efxbnDataToPixel({ key: 25, value: 1 }, view, 800, 400);
  expect(efxbnPixelToData(pixel, view, 800, 400)).toEqual({ key: 25, value: 1 });
});
```

Implement `fitEfxbnValueRange`, `efxbnDataToPixel`, and `efxbnPixelToData` in the same module. Use an 8 percent padding for non-flat ranges and a symmetric `max(1, abs(value) * 0.5)` padding for flat ranges.

- [ ] **Step 5: Run the focused test**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the math layer**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.ts src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.test.ts
git commit -m "feat: add efxbn curve graph math"
```

---

### Task 2: Add one-transaction multi-curve document commands

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnDocument.ts:450-550`
- Modify: `src/page/TestEditor/components/effect-folder-editor/efxbnDocument.test.ts:234-310`

- [ ] **Step 1: Write failing atomic replacement tests**

Add imports for `replaceEfxbnCurves`, then add:

```ts
it("replaces several curves in one undo entry", () => {
  const document = makeDocument(1);
  const next = replaceEfxbnCurves(
    document,
    0,
    [
      { controlName: "colorR", keys: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }] },
      { controlName: "colorA", keys: [{ key: 0, value: 0 }, { key: 20, value: 0.75 }, { key: 100, value: 0 }] },
    ],
    "Edit 5 graph keys",
  );

  expect(readEfxbnCurve(next.summary, 0, "colorR").keys).toHaveLength(2);
  expect(readEfxbnCurve(next.summary, 0, "colorA").keys).toHaveLength(3);
  expect(next.past).toHaveLength(1);
  expect(undoEfxbn(next).summary).toEqual(document.summary);
});

it("refuses duplicate progress before changing the document", () => {
  const document = makeDocument(1);
  expect(() =>
    replaceEfxbnCurves(
      document,
      0,
      [{ controlName: "colorR", keys: [{ key: 25, value: 1 }, { key: 25, value: 2 }] }],
      "Invalid graph edit",
    ),
  ).toThrow(/duplicate progress/);
  expect(document.past).toHaveLength(0);
});

it("refuses an empty replacement", () => {
  expect(() =>
    replaceEfxbnCurves(
      makeDocument(1),
      0,
      [{ controlName: "colorR", keys: [] }],
      "Invalid graph edit",
    ),
  ).toThrow(/at least one key/);
});
```

- [ ] **Step 2: Run the existing document test and confirm the missing export failure**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnDocument.test.ts
```

Expected: FAIL because `replaceEfxbnCurves` is not exported.

- [ ] **Step 3: Implement validated atomic curve replacement**

Add beside the existing curve commands:

```ts
export type EfxbnCurveReplacement = {
  controlName: EfxbnControlName;
  keys: readonly EfxbnCurveKey[];
};

function validatedCurveKeys(
  controlName: EfxbnControlName,
  keys: readonly EfxbnCurveKey[],
): EfxbnCurveKey[] {
  if (keys.length === 0) {
    throw new Error(`EFXBN curve ${controlName} must keep at least one key`);
  }
  const ordered = keys.map((entry) => {
    if (!Number.isFinite(entry.key) || !Number.isFinite(entry.value)) {
      throw new Error(
        `EFXBN curve ${controlName} rejects a non-finite key (${entry.key}, ${entry.value})`,
      );
    }
    return { key: entry.key, value: entry.value };
  }).sort((left, right) => left.key - right.key);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1]!.key === ordered[index]!.key) {
      throw new Error(`EFXBN curve ${controlName} has duplicate progress ${ordered[index]!.key}`);
    }
  }
  return ordered;
}

export function replaceEfxbnCurves(
  document: EfxbnDocument,
  blockIndex: number,
  replacements: readonly EfxbnCurveReplacement[],
  label: string,
): EfxbnDocument {
  requireBlock(document.summary, blockIndex);
  if (replacements.length === 0) return document;
  const names = new Set<EfxbnControlName>();
  let next = document.summary;
  for (const replacement of replacements) {
    if (names.has(replacement.controlName)) {
      throw new Error(`EFXBN graph edit replaces ${replacement.controlName} more than once`);
    }
    names.add(replacement.controlName);
    next = replaceCurveKeys(
      next,
      blockIndex,
      replacement.controlName,
      validatedCurveKeys(replacement.controlName, replacement.keys),
    );
  }
  return commit(document, next, label.trim() || "Edit EFXBN curves");
}
```

Also narrow `EfxbnCurve.name`, `readEfxbnCurve`, `setEfxbnCurveKey`, `insertEfxbnCurveKey`, and `deleteEfxbnCurveKey` from `string` to `EfxbnControlName`. Their current callers already originate from `EFXBN_CONTROL_NAMES` or string literals, so this makes invalid graph lanes a compile-time error without changing runtime behavior.

- [ ] **Step 4: Route existing set, insert, and delete commands through the atomic primitive**

Keep their public signatures stable. Replace each final `replaceCurveKeys` plus `commit` pair with one `replaceEfxbnCurves` call. This leaves current callers and tests intact while enforcing one validation path.

- [ ] **Step 5: Run the focused document test**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnDocument.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the document transaction**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/efxbnDocument.ts src/page/TestEditor/components/effect-folder-editor/efxbnDocument.test.ts
git commit -m "feat: add atomic efxbn curve edits"
```

---

### Task 3: Build pure graph selection and drag logic

**Files:**
- Create: `src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.ts`
- Create: `src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.test.ts`

- [ ] **Step 1: Write failing selection, snapping, and multi-curve drag tests**

```ts
import { describe, expect, it } from "vitest";
import {
  boxSelectEfxbnKeys,
  moveEfxbnSelectedKeys,
  toggleEfxbnKeySelection,
  type EfxbnGraphKeyRef,
} from "./efxbnGraphInteraction";

describe("EFXBN graph selection", () => {
  const red: EfxbnGraphKeyRef = { controlName: "colorR", sourceKey: 0 };
  const green: EfxbnGraphKeyRef = { controlName: "colorG", sourceKey: 20 };

  it("replaces or toggles selection", () => {
    expect(toggleEfxbnKeySelection([], red, false)).toEqual([red]);
    expect(toggleEfxbnKeySelection([red], green, true)).toEqual([red, green]);
    expect(toggleEfxbnKeySelection([red, green], red, true)).toEqual([green]);
  });

  it("box-selects visible key coordinates", () => {
    const result = boxSelectEfxbnKeys(
      [
        { ref: red, x: 20, y: 20 },
        { ref: green, x: 90, y: 90 },
      ],
      { left: 0, top: 0, right: 50, bottom: 50 },
    );
    expect(result).toEqual([red]);
  });
});

describe("EFXBN graph dragging", () => {
  it("moves selected keys across channels and snaps to frames", () => {
    const replacements = moveEfxbnSelectedKeys({
      curves: {
        colorR: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }],
        colorG: [{ key: 0, value: 1.75 }, { key: 100, value: 1.25 }],
      },
      selected: [
        { controlName: "colorR", sourceKey: 100 },
        { controlName: "colorG", sourceKey: 100 },
      ],
      deltaProgress: -9.8,
      deltaValue: 0.25,
      frameCount: 100,
      snapToFrame: true,
    });
    expect(replacements).toEqual([
      { controlName: "colorR", keys: [{ key: 0, value: 1 }, { key: 90, value: 0.75 }] },
      { controlName: "colorG", keys: [{ key: 0, value: 1.75 }, { key: 90, value: 1.5 }] },
    ]);
  });

  it("refuses a drag that collides with an unselected key", () => {
    expect(() => moveEfxbnSelectedKeys({
      curves: { colorR: [{ key: 0, value: 1 }, { key: 50, value: 2 }] },
      selected: [{ controlName: "colorR", sourceKey: 50 }],
      deltaProgress: -50,
      deltaValue: 0,
      frameCount: 100,
      snapToFrame: true,
    })).toThrow(/duplicate progress/);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.test.ts
```

Expected: FAIL because the interaction module does not exist.

- [ ] **Step 3: Implement stable key references and pure gesture transforms**

Use the source progress as the gesture-stable identity because duplicate progress is already forbidden per channel:

```ts
import type { EfxbnControlName, EfxbnCurveKey, EfxbnCurveReplacement } from "./efxbnDocument";
import { frameToEfxbnProgress, progressToEfxbnFrame } from "./efxbnCurveMath";

export type EfxbnGraphKeyRef = {
  controlName: EfxbnControlName;
  sourceKey: number;
};

export type EfxbnGraphKeyPixel = {
  ref: EfxbnGraphKeyRef;
  x: number;
  y: number;
};

export type EfxbnGraphBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function sameRef(left: EfxbnGraphKeyRef, right: EfxbnGraphKeyRef): boolean {
  return left.controlName === right.controlName && left.sourceKey === right.sourceKey;
}

export function toggleEfxbnKeySelection(
  current: readonly EfxbnGraphKeyRef[],
  next: EfxbnGraphKeyRef,
  additive: boolean,
): EfxbnGraphKeyRef[] {
  if (!additive) return [next];
  return current.some((entry) => sameRef(entry, next))
    ? current.filter((entry) => !sameRef(entry, next))
    : [...current, next];
}

export function boxSelectEfxbnKeys(
  keys: readonly EfxbnGraphKeyPixel[],
  box: EfxbnGraphBox,
): EfxbnGraphKeyRef[] {
  return keys
    .filter((entry) => entry.x >= box.left && entry.x <= box.right && entry.y >= box.top && entry.y <= box.bottom)
    .map((entry) => entry.ref);
}

function snappedProgress(progress: number, frameCount: number): number {
  const frame = progressToEfxbnFrame(progress, frameCount);
  if (frame === null) return progress;
  return frameToEfxbnProgress(Math.round(frame), frameCount) ?? progress;
}

export function moveEfxbnSelectedKeys(input: {
  curves: Partial<Record<EfxbnControlName, readonly EfxbnCurveKey[]>>;
  selected: readonly EfxbnGraphKeyRef[];
  deltaProgress: number;
  deltaValue: number;
  frameCount: number;
  snapToFrame: boolean;
}): EfxbnCurveReplacement[] {
  const selectedByCurve = new Map<EfxbnControlName, Set<number>>();
  for (const entry of input.selected) {
    const keys = selectedByCurve.get(entry.controlName) ?? new Set<number>();
    keys.add(entry.sourceKey);
    selectedByCurve.set(entry.controlName, keys);
  }
  return [...selectedByCurve].map(([controlName, selectedKeys]) => {
    const source = input.curves[controlName];
    if (!source) throw new Error(`EFXBN graph has no visible curve ${controlName}`);
    const keys = source.map((entry) => {
      if (!selectedKeys.has(entry.key)) return { ...entry };
      const moved = entry.key + input.deltaProgress;
      return {
        key: input.snapToFrame ? snappedProgress(moved, input.frameCount) : moved,
        value: entry.value + input.deltaValue,
      };
    }).sort((left, right) => left.key - right.key);
    for (let index = 1; index < keys.length; index += 1) {
      if (keys[index - 1]!.key === keys[index]!.key) {
        throw new Error(`EFXBN curve ${controlName} has duplicate progress ${keys[index]!.key}`);
      }
    }
    return { controlName, keys };
  });
}
```

- [ ] **Step 4: Run the focused interaction test**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the interaction model**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.ts src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.test.ts
git commit -m "feat: add efxbn graph interactions"
```

---

### Task 4: Render an accessible SVG graph canvas

**Files:**
- Create: `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphCanvas.tsx`
- Create: `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx`

- [ ] **Step 1: Write the failing canvas accessibility test**

Start the component test with an explicit environment:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EfxbnGraphCanvas } from "./EfxbnGraphCanvas";

describe("EfxbnGraphCanvas", () => {
  it("renders named linear curves, accessible keys, and a playhead", () => {
    render(
      <EfxbnGraphCanvas
        width={800}
        height={260}
        curves={[
          {
            name: "colorR",
            visible: true,
            color: "#F87171",
            keys: [{ key: 0, value: 1 }, { key: 100, value: 0.5 }],
          },
        ]}
        view={{ progressMin: 0, progressMax: 100, valueMin: 0, valueMax: 2 }}
        progress={20}
        frameCount={100}
        selection={[]}
        disabled={false}
        onSelectionChange={vi.fn()}
        onPreviewDrag={vi.fn()}
        onCommitDrag={vi.fn()}
        onProgressChange={vi.fn()}
        onViewChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("application", { name: "EFXBN curve graph" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "colorR key at frame 0, value 1" })).toBeInTheDocument();
    expect(screen.getByTestId("efxbn-playhead")).toHaveAttribute("data-progress", "20");
  });
});
```

- [ ] **Step 2: Run the component test and confirm the missing-component failure**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: FAIL because `EfxbnGraphCanvas.tsx` does not exist.

- [ ] **Step 3: Implement the canvas public contract and SVG layers**

The component must render these layers in order:

1. Background and plot clip path.
2. Major and minor grid lines.
3. Zero line when visible.
4. One polyline plus clamped horizontal extensions per visible curve.
5. Key diamonds as `<button>` semantics via focusable SVG groups with `role="button"`.
6. Selection rectangle.
7. Playhead line and scrub target.
8. Axis labels.

Use this public interface:

```tsx
import type { EfxbnControlName, EfxbnCurveKey } from "./efxbnDocument";
import type { EfxbnGraphKeyRef } from "./efxbnGraphInteraction";

export type EfxbnGraphCurveView = {
  name: EfxbnControlName;
  visible: boolean;
  color: string;
  keys: readonly EfxbnCurveKey[];
};

export type EfxbnGraphView = {
  progressMin: number;
  progressMax: number;
  valueMin: number;
  valueMax: number;
};

export type EfxbnGraphCanvasProps = {
  width: number;
  height: number;
  curves: readonly EfxbnGraphCurveView[];
  view: EfxbnGraphView;
  progress: number;
  frameCount: number;
  selection: readonly EfxbnGraphKeyRef[];
  disabled: boolean;
  onSelectionChange: (selection: readonly EfxbnGraphKeyRef[]) => void;
  onPreviewDrag: (deltaProgress: number, deltaValue: number) => void;
  onCommitDrag: (deltaProgress: number, deltaValue: number, snapToFrame: boolean) => void;
  onProgressChange: (progress: number) => void;
  onViewChange: (view: EfxbnGraphView) => void;
};
```

Use `ResizeObserver` in the parent editor and pass measured pixel size down. Do not read layout from every pointer event.

- [ ] **Step 4: Implement pointer performance rules**

- Store the active gesture, starting coordinates, selected SVG elements, and pending deltas in refs.
- During pointer move, update a temporary SVG overlay group transform directly.
- Schedule at most one DOM transform write per animation frame.
- Do not call `setState` from pointer move.
- On pointer release, remove the temporary transform and call `onCommitDrag` once.
- On cancellation, remove the temporary transform and do not change the document.
- Always call `setPointerCapture` on gesture start and release it on completion.

- [ ] **Step 5: Add keyboard and reduced-motion behavior**

- Focused key nodes respond to Enter, Space, Delete, Backspace, Escape, and arrow keys.
- Selection and playhead changes are instant. No decorative animation is added.
- Focus rings use the existing app focus token and remain visible in dark mode.
- Key hit targets are at least 20 by 20 CSS pixels even when the diamond glyph is smaller.

- [ ] **Step 6: Run the focused component test**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the canvas**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/EfxbnGraphCanvas.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
git commit -m "feat: render efxbn graph canvas"
```

---

### Task 5: Compose the full 18-channel Graph Editor

**Files:**
- Create: `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.tsx`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx`

- [ ] **Step 1: Add failing manual-key and disabled-state tests**

Use `makeEfxbnEffectBlock` and a local summary fixture matching `efxbnDocument.test.ts`. Cover:

```tsx
it("lists all 18 channels and inserts a sampled key at the playhead", async () => {
  const user = userEvent.setup();
  const onDocumentChange = vi.fn();
  renderGraphEditor({ progress: 25, onDocumentChange });
  expect(screen.getAllByRole("checkbox", { name: /show .* curve/i })).toHaveLength(18);
  await user.click(screen.getByRole("button", { name: "Insert key for colorR at frame 25" }));
  const next = onDocumentChange.mock.calls[0]![0];
  expect(readEfxbnCurve(next.summary, 0, "colorR").keys).toEqual([
    { key: 0, value: 1 },
    { key: 25, value: 1 },
  ]);
});

it("freezes authoring during a write but still allows scrubbing", async () => {
  renderGraphEditor({ writing: true });
  expect(screen.getByRole("button", { name: /insert key for colorR/i })).toBeDisabled();
  expect(screen.getByRole("slider", { name: "EFXBN progress" })).toBeEnabled();
});
```

- [ ] **Step 2: Run the test and confirm the missing-editor failure**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: FAIL because `EfxbnGraphEditor` does not exist.

- [ ] **Step 3: Implement the editor interface**

```tsx
export type EfxbnGraphEditorProps = {
  document: EfxbnDocument;
  blockIndex: number;
  progress: number;
  frameCount: number;
  writing?: boolean;
  focusedControlName: EfxbnControlName;
  onFocusedControlNameChange: (name: EfxbnControlName) => void;
  onProgressChange: (progress: number) => void;
  onDocumentChange: (next: EfxbnDocument) => void;
  onError: (message: string) => void;
};
```

The editor owns only presentation state:

```ts
const [visibleControls, setVisibleControls] = useState<ReadonlySet<EfxbnControlName>>(
  () => new Set(EFXBN_CONTROL_NAMES),
);
const [selection, setSelection] = useState<readonly EfxbnGraphKeyRef[]>([]);
const [normalizeView, setNormalizeView] = useState(false);
const [view, setView] = useState<EfxbnGraphView>(() => initialEfxbnGraphView(curves));
```

Authored keys always come from `document.summary`. A block switch clears selection and refits the graph but retains channel visibility.

- [ ] **Step 4: Implement manual insertion**

Use this exact flow:

```ts
const insertFocusedKey = () => {
  try {
    const curve = readEfxbnCurve(document.summary, blockIndex, focusedControlName);
    const existingIndex = findEfxbnKeyAtProgress(curve.keys, progress);
    if (existingIndex !== null) {
      setSelection([{ controlName: focusedControlName, sourceKey: curve.keys[existingIndex]!.key }]);
      return;
    }
    const keys = insertSampledEfxbnKey(curve.keys, progress);
    const next = replaceEfxbnCurves(
      document,
      blockIndex,
      [{ controlName: focusedControlName, keys }],
      `${focusedControlName} + key @ ${progress}`,
    );
    onDocumentChange(next);
    setSelection([{ controlName: focusedControlName, sourceKey: progress }]);
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
};
```

- [ ] **Step 5: Implement drag commit, deletion, and numeric precision editing**

- `onPreviewDrag` updates only local overlay geometry.
- `onCommitDrag` calls `moveEfxbnSelectedKeys`, then `replaceEfxbnCurves` once.
- Delete groups selected refs by channel, removes matching source progress, verifies one key remains, then commits all affected channels once.
- Frame input converts through `frameToEfxbnProgress`.
- Progress input writes raw key progress.
- Value input writes raw value.
- After a commit, remap selection to the newly committed progress values.

- [ ] **Step 6: Implement toolbar and precision layout**

Use one compact toolbar with these controls:

- Insert key diamond.
- Delete selected keys.
- Frame selection.
- Frame visible curves.
- Absolute/Normalize view toggle.
- Read-only current playhead frame and progress.

Use existing Lucide icons because the project already depends on one icon family. Do not add another icon package.

The right precision pane contains labeled inputs in this order:

1. Channel.
2. Frame.
3. Progress percent.
4. Value.
5. Selected-key count.

When more than one key is selected, show blank mixed-value inputs until all selected values match. A committed numeric value applies to every selected key in one document transaction.

- [ ] **Step 7: Run the focused editor test**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the editor shell**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
git commit -m "feat: add efxbn graph editor"
```

---

### Task 6: Integrate the graph into the preview workspace

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/EffectFolder3dPreview.tsx:288-317,641-699`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnPreviewInspector.tsx:70-95,410-453`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx`

- [ ] **Step 1: Add a failing integration harness test**

Add a small harness around the graph and inspector integration that verifies:

- Selecting `colorA` from a property row changes the graph focus.
- Changing parent `effectProgress` moves the graph playhead.
- Scrubbing the graph calls the same `onProgressChange` callback as the existing transport.
- Switching the selected block clears stale key selection.

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: FAIL until the parent props are wired.

- [ ] **Step 2: Add parent-owned graph focus state**

In `EffectFolder3dPreview`:

```tsx
const [graphControlName, setGraphControlName] = useState<EfxbnControlName>("colorR");

useEffect(() => {
  setGraphControlName("colorR");
}, [selectedEffectIndex, efxbnPath]);
```

Do not put key selection in the parent. Selection belongs to the graph and resets from its `blockIndex` effect.

- [ ] **Step 3: Nest the existing horizontal workspace inside a vertical panel group**

Replace the current single horizontal group with:

```tsx
<ResizablePanelGroup orientation="vertical" className="min-h-0">
  <ResizablePanel defaultSize={68} minSize={35} className="min-h-0">
    <ResizablePanelGroup orientation="horizontal" className="min-h-0">
      <ResizablePanel defaultSize={72} minSize={50} className="min-h-0 p-1">
        {viewportContent}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={28} minSize={22} className="min-h-0">
        {inspectorContent}
      </ResizablePanel>
    </ResizablePanelGroup>
  </ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel
    defaultSize={32}
    minSize={20}
    collapsible
    collapsedSize={6}
    className="min-h-0"
  >
    {document && selectedEffectIndex !== null ? (
      <EfxbnGraphEditor
        document={document}
        blockIndex={selectedEffectIndex}
        progress={effectProgress}
        frameCount={frameCount}
        writing={writing}
        focusedControlName={graphControlName}
        onFocusedControlNameChange={setGraphControlName}
        onProgressChange={handleEffectProgressChange}
        onDocumentChange={handleDocumentChange}
        onError={handleEditorError}
      />
    ) : (
      <p className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
        Select a block to edit its curves.
      </p>
    )}
  </ResizablePanel>
</ResizablePanelGroup>
```

Extract `viewportContent` and `inspectorContent` as local JSX variables before the return. Do not create components that capture the entire parent state.

- [ ] **Step 4: Pass graph focus callbacks through the inspector**

Add to `EfxbnPreviewInspectorProps`:

```ts
focusedControlName?: EfxbnControlName;
onFocusedControlNameChange?: (name: EfxbnControlName) => void;
```

Forward them only to editable property and color surfaces. Read-only Block, Controls, and Material tabs remain unchanged.

- [ ] **Step 5: Keep the existing playback transport as the only transport**

Do not duplicate play, pause, reset, speed, or progress sliders inside the graph. The graph toolbar shows the current playhead values and supports direct canvas scrubbing, while the existing footer remains responsible for playback.

- [ ] **Step 6: Run the focused integration harness**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit workspace integration**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/EffectFolder3dPreview.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnPreviewInspector.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
git commit -m "feat: integrate efxbn graph workspace"
```

---

### Task 7: Unify property and color editing with manual-key semantics

**Files:**
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnBlockEditor.tsx:301-448,709-774`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnColorAuthor.tsx:19-29,49-66,128-463`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnPreviewInspector.tsx:410-453`
- Modify: `src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx`

- [ ] **Step 1: Add failing property and color behavior tests**

Cover the original Block 01 case:

```tsx
it("edits an animated color channel when the playhead is on one of its keys", async () => {
  const document = makeDocumentWithColorSelectors([2, 2, 1, 3]);
  renderColorAuthor({ document, progress: 100 });
  expect(screen.getByRole("spinbutton", { name: "R channel" })).toBeEnabled();
  expect(screen.getByRole("spinbutton", { name: "G channel" })).toBeEnabled();
  expect(screen.getByRole("spinbutton", { name: "B channel" })).toBeEnabled();
  expect(screen.getByRole("spinbutton", { name: "A channel" })).toBeEnabled();
});

it("requires an explicit key insertion between animated keys", () => {
  const document = makeDocumentWithColorSelectors([2, 2, 1, 3]);
  renderColorAuthor({ document, progress: 50 });
  expect(screen.getByRole("spinbutton", { name: "R channel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Insert R key at frame 50" })).toBeEnabled();
});
```

- [ ] **Step 2: Run the focused component test and confirm current locking behavior fails the new expectation**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: FAIL because animated color lanes are currently always view-only.

- [ ] **Step 3: Replace the expanded property key table with compact graph affordances**

For each control row:

- Keep direct numeric editing for a one-key constant.
- Show evaluated value plus key count for animated controls.
- Render a hollow or filled diamond based on `findEfxbnKeyAtProgress(curve.keys, progress)`.
- Clicking the diamond inserts or selects a key, then calls `onFocusedControlNameChange(curve.name)`.
- Clicking the channel label focuses the graph without modifying the document.
- Remove the inline expanded key list because the graph and precision pane now own multi-key editing.

Add these props to `EfxbnBlockEditorProps`:

```ts
progress: number;
focusedControlName: EfxbnControlName;
onFocusedControlNameChange: (name: EfxbnControlName) => void;
```

- [ ] **Step 4: Make color lanes editable at an existing playhead key**

Replace constant-only edit detection with:

```ts
function editableColorKeyIndex(
  document: EfxbnDocument,
  blockIndex: number,
  name: EfxbnColorControlName,
  progress: number,
): number | null {
  const curve = readEfxbnCurve(document.summary, blockIndex, name);
  if (curve.keys.length === 1) return 0;
  return findEfxbnKeyAtProgress(curve.keys, progress);
}
```

The slider edits the returned key index. If the result is null, the slider remains disabled and a channel-specific key diamond is enabled. This removes the false impression that selector values above one cannot be edited.

- [ ] **Step 5: Make linked RGB edits atomic**

Remove the parent `onPatchColor` callback that sequentially calls `setEfxbnCurveKey`. Give `EfxbnColorAuthor` the existing `onDocumentChange` and `onError` callbacks. Build replacements for all linked channels and call `replaceEfxbnCurves` once, producing one history entry.

If one linked RGB channel lacks a key at the playhead, the linked slider remains disabled. Show one `Insert RGB keys` action that samples and inserts keys into the missing channels in one transaction.

- [ ] **Step 6: Use functional, explicit visible copy**

Use these messages:

- Between keys: `Insert a key at the playhead to edit this animated channel.`
- Existing key: `Editing key at frame {frame}.`
- Constant: `Constant channel.`
- Drag commit note: `The 3D preview updates when the drag ends.`

Do not use decorative labels, glow effects, or animation. Keep the existing dark app theme, radius scale, typography, and amber dirty state.

- [ ] **Step 7: Run the focused component test**

Run:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit unified authoring behavior**

```powershell
git add src/page/TestEditor/components/effect-folder-editor/EfxbnBlockEditor.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnColorAuthor.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnPreviewInspector.tsx src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx
git commit -m "feat: unify efxbn manual key editing"
```

---

### Task 8: Prove selector greater than one survives disk save

**Files:**
- Modify: `src-tauri/tests/effect_folder_real_data_test.rs:1077-1172`
- Modify: `docs/superpowers/plans/2026-08-21-efxbn-real-editing-architecture.md`

- [ ] **Step 1: Add a focused real-file writer test for a multi-key control**

Add a test that:

1. Finds the first real EFXBN containing a control reference with `selector > 1`.
2. Copies that file into `tempfile::tempdir()`.
3. Parses the temporary copy.
4. Changes the value of the second owned lookup entry without changing key count.
5. Writes through `write_efxbn_file`.
6. Parses the result from disk.
7. Asserts selector, lookup index, first key, edited second key, and every unrelated lookup entry.
8. Asserts the original source hash is unchanged.

Add this helper beside `first_real_efxbn`:

```rust
fn first_real_multikey_efxbn() -> Option<std::path::PathBuf> {
    let mut paths = Vec::new();
    for root in [r"E:\XB\mod\006effect", r"E:\XB\解包"] {
        collect_efxbn_paths(Path::new(root), &mut paths);
    }
    paths.sort();
    paths.into_iter().find(|path| {
        let path_text = path.to_string_lossy();
        app_lib::format::effect_folder::parse_efxbn_file(&path_text)
            .map(|summary| {
                summary.effects.iter().any(|effect| {
                    effect
                        .control_references
                        .iter()
                        .any(|reference| reference.selector > 1)
                })
            })
            .unwrap_or(false)
    })
}
```

Add the complete test:

```rust
#[test]
fn write_efxbn_file_round_trips_a_multikey_curve_edit() {
    let Some(source) = first_real_multikey_efxbn() else {
        eprintln!("SKIP: no real multi-key .efxbn fixture is available");
        return;
    };
    let original = fs::read(&source).expect("read the corpus sample");

    let temp = tempfile::tempdir().expect("create temporary target");
    let root = temp.path().join("effect_root");
    fs::create_dir_all(&root).expect("create effect root");
    let target = root.join("multikey.efxbn");
    fs::write(&target, &original).expect("stage the sample");

    let target_text = target.to_string_lossy().to_string();
    let mut summary = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("parse the staged sample");
    let before = summary.clone();
    let (effect_index, reference_index, selector, lookup_index) = summary
        .effects
        .iter()
        .enumerate()
        .find_map(|(effect_index, effect)| {
            effect
                .control_references
                .iter()
                .enumerate()
                .find(|(_, reference)| reference.selector > 1)
                .map(|(reference_index, reference)| {
                    (
                        effect_index,
                        reference_index,
                        reference.selector,
                        reference.lookup_index,
                    )
                })
        })
        .expect("fixture contains a multi-key control");
    let edited_index = lookup_index as usize + 1;
    let original_key = summary.control_lookup_entries[edited_index].key;
    let original_value = summary.control_lookup_entries[edited_index].value;
    let edited_value = if original_value == 37.25 { 38.25 } else { 37.25 };
    summary.control_lookup_entries[edited_index].value = edited_value;
    summary.control_lookup_entries[edited_index].value_f32_bits = edited_value.to_bits();

    app_lib::format::effect_folder::write_efxbn_file(
        &root.to_string_lossy(),
        &target_text,
        &summary,
    )
    .expect("write the multi-key edit");

    let reparsed = app_lib::format::effect_folder::parse_efxbn_file(&target_text)
        .expect("re-parse the multi-key edit");
    let reference = &reparsed.effects[effect_index].control_references[reference_index];
    assert_eq!(reference.selector, selector);
    assert_eq!(reference.lookup_index, lookup_index);
    assert_eq!(reparsed.control_lookup_entries[edited_index].key, original_key);
    assert_eq!(reparsed.control_lookup_entries[edited_index].value, edited_value);
    assert_eq!(
        reparsed.control_lookup_entries[edited_index].value_f32_bits,
        edited_value.to_bits()
    );
    for (index, entry) in reparsed.control_lookup_entries.iter().enumerate() {
        if index == edited_index {
            continue;
        }
        assert_eq!(entry.key_f32_bits, before.control_lookup_entries[index].key_f32_bits);
        assert_eq!(entry.value_f32_bits, before.control_lookup_entries[index].value_f32_bits);
    }
    assert_eq!(
        fs::read(&source).expect("re-read the corpus sample"),
        original,
        "the source game or mod tree must remain untouched"
    );
}
```

- [ ] **Step 2: Run the new test and confirm it passes against the existing writer**

Run from `src-tauri/`:

```powershell
cargo test --test effect_folder_real_data_test write_efxbn_file_round_trips_a_multikey_curve_edit -- --exact
```

Expected: PASS. If it fails, fix only the writer defect exposed by this test. Do not add another write path.

- [ ] **Step 3: Update the architecture status**

In `docs/superpowers/plans/2026-08-21-efxbn-real-editing-architecture.md`, record:

- 18-channel Graph Editor implemented.
- Manual key insertion and deletion implemented.
- Selector greater than one edits persist through whole-file write.
- Graph displays native linear interpolation only.
- Auto Key, Bezier handles, and multi-block editing remain outside scope.

- [ ] **Step 4: Commit save proof and documentation**

```powershell
git add src-tauri/tests/effect_folder_real_data_test.rs docs/superpowers/plans/2026-08-21-efxbn-real-editing-architecture.md
git commit -m "test: prove multikey efxbn graph saves"
```

---

## Final semantic gate

Run exactly one final command after all tasks are complete:

```powershell
npx vitest run src/page/TestEditor/components/effect-folder-editor/efxbnCurveMath.test.ts src/page/TestEditor/components/effect-folder-editor/efxbnGraphInteraction.test.ts src/page/TestEditor/components/effect-folder-editor/EfxbnGraphEditor.test.tsx src/page/TestEditor/components/effect-folder-editor/efxbnDocument.test.ts
```

Expected: all listed test files pass. The Rust real-file save proof already ran as Task 8's exact test and must not be rerun unchanged.

## Manual acceptance script

Use a copied workspace, not the original `E:/XB` tree:

1. Open `30.efxbn` and select Block 01.
2. Confirm R shows two keys at native progress 0 and 100.
3. Confirm G shows two keys at native progress 0 and 100.
4. Confirm B shows one constant key.
5. Confirm A shows three keys at native progress 0, 20, and 100.
6. Drag the second R key and verify the graph moves during drag.
7. Release and verify the 3D preview updates once.
8. Insert a B key at progress 50 and verify selector changes from one to two.
9. Undo and redo the insertion.
10. Save, reload the file, and confirm all key counts, progress values, and values survive.
11. Confirm the source file under `E:/XB` is unchanged.

## Completion criteria

- All 18 controls can be focused, shown, hidden, and edited.
- Selector values above one are editable and saveable.
- One-key constants remain simple numeric properties.
- Manual diamond insertion is the only key creation path.
- Dragging a selection creates one undo entry.
- Duplicate times and empty curves are refused before commit.
- Graph interpolation matches the native linear evaluator.
- Frame display and native progress remain reversible.
- The graph and existing transport share one playhead.
- No new dependency is added.
- No second disk writer is introduced.
- Multi-key edits survive write and reparse on a temporary real file.
- Original game and mod trees remain untouched by automated tests.
