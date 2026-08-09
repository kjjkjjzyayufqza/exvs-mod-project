# EFXBN Live Author UI

Interactive real-time property authoring for `.efxbn` while the Test Editor
effect preview is running.

**Design mock (open in browser):**
`tmp/efxbn-editor-ui/efxbn-live-author.html`

---

## Design Read

**Reading this as:** redesign (preserve) of a dense EXVS2 modding tool surface
inside Test Editor Effect view, for reverse engineers / mod authors, with a
**cockpit / dark-tech** language, leaning toward existing **shadcn/ui + zinc
dark tokens** plus one **signal-amber** accent for live-edit state.

This is **product UI**, not a marketing page. Landing-page layout rules from
`design-taste-frontend` are intentionally **not** applied; anti-slop rules that
still apply: no AI-purple, no Inter-as-brand, one accent lock, real hierarchy,
full interactive states, WCAG contrast on controls.

### Dials

| Dial | Value | Reason |
| --- | ---: | --- |
| `DESIGN_VARIANCE` | 3 | Symmetric tool chrome; predictable inspector |
| `MOTION_INTENSITY` | 3 | Hover / tab transitions only; 3D scene owns motion |
| `VISUAL_DENSITY` | 8 | Cockpit density; mono numbers; hairline rows |

### Tokens (lock)

| Token | Value | Role |
| --- | --- | --- |
| Surface | zinc-950 / `#0c0e11` family | App + panels |
| Elevated | `#181c22` | Cards, inputs |
| Line | `#2a313b` | Separators |
| Text | `#e8ecf1` / dim `#8b95a5` | Primary / secondary |
| **Accent** | `#d4a15a` (signal amber) | Dirty, focused edit, primary write CTA |
| Live | `#5ecf9a` | Live-draft pulse (not the same as accent) |
| Particle green | viewport only | Never used for chrome |

**Rule:** amber = *you are editing / dirty*. Green = *preview / live stream*.
Particle tint in the 3D view must never fight the edit accent.

### Shape lock

- Radius scale: **5px** controls, **8px** panels/cards, **999px** pills only.
- Icons: project already uses **lucide-react** (keep; do not introduce Phosphor).

---

## Problem

Today `EfxbnPreviewInspector` is **read-only**:

- Block list + visibility/solo
- Control lane evaluated values at scrub progress
- Material slot dump

Authors who want to change `colorR/G/B/A` (or scale/speed) must hex-edit curve
keys offline and reload. There is no draft overlay into the preview sim.

---

## Goals

1. **Real-time:** drag R/G/B/A (and other control lanes) and see the 3D preview
   update on the next frame without writing disk.
2. **Honest model:** edits target the real binary layout
   (`controlReferences` → `curveKeys` / model-control region), not fake UI-only
   uniforms.
3. **Safe write:** draft → Apply (optional) → **Write EFXBN** with dirty tracking
   and Revert.
4. **Fits existing shell:** lives in the right resizable panel next to
   `SsbhModelPreviewViewport` (`EffectFolder3dPreview`).

Non-goals (v1):

- Full curve keyframe graph editor with multi-key drag (show graph + const
  edit first; multi-key later).
- Shader variant fidelity beyond current preview.
- Batch-edit across many efxbn files.

---

## Layout

```text
┌─ Test Editor topbar ─────────────────────────────────────────────┐
│ Effect pack · path · [Live draft] [3 unsaved] [Revert] [Write]   │
├─ Inventory ─┬─ Viewport stage ────────────────┬─ Live author ───┤
│ file list   │  3D canvas                      │ block tree      │
│ (existing)  │  HUD: block · RGBA · eval frame │ tabs:           │
│             │  transport scrub 0..100f        │  Color|Motion|  │
│             │                                 │  Emit|Material| │
│             │                                 │  Block          │
│             │                                 │ footer actions  │
└─────────────┴─────────────────────────────────┴─────────────────┘
```

### Changes vs current

| Area | Current | Proposed |
| --- | --- | --- |
| Right panel | `EfxbnPreviewInspector` read-only | **`EfxbnLiveAuthor`** (edit + inspect) |
| Tabs | Block / Controls / Material | **Color / Motion / Emit / Material / Block** |
| Top of preview | counts + diagnostics | + **dirty/live pills** on host chrome |
| Transport | play/scrub under preview | keep; author reads same `progress` |

Viewport stays king (~72% width). Author panel min ~320px, default ~360px.

---

## Information architecture (tabs)

### 1. Color (default when selecting a drawable block)

Primary job for the 18.efxbn class of files.

| Control | Maps to |
| --- | --- |
| RGB picker + R/G/B sliders | `colorR/G/B` control refs → curve key values |
| A slider (0..4) | `colorA` (allows HDR alpha for additive) |
| Constant / Curve mode | `selector` 1 vs >1 (curve multi-key = phase 2) |
| Link RGB | UI only; scales channels together |
| Key table | shows `lookupIndex` + live value |
| Mini graph | evaluated polyline vs progress; playhead = transport |

**Live formula reminder (callout, dismissible):**
`final = texel × (R,G,B,A) × brightness`

### 2. Motion

`scaleBaseX/Y/Z`, `speedBaseX/Y/Z`, `directionAccel`, `worldGravityAccel`,
`spreadX/Y` as sliders + numeric mono fields.

### 3. Emit

Scalar block fields (not curve lanes): life, interval, numEmit, delay,
spawn form type. Uses existing dual-value / numeric patterns.

### 4. Material

Per texture slot (`color0`, `color1`, `uv0`, `uv1`):

- Thumb + hash + local/external badge
- Address mode, UV pattern, distortion U/V
- Pick local `.nutexb` / clear slot (updates `colorTextureParameterIndex` +
  model-control hash when bound)

### 5. Block

Read-mostly identity: type, level, children, model/animation hashes, flags,
param indices. Flags may become bit toggles later.

---

## Data flow (real-time)

```text
                    ┌──────────────────────┐
  disk 18.efxbn ──► │ parse_efxbn_bytes    │
                    │ EfxbnSummary         │
                    └──────────┬───────────┘
                               │ clone
                               ▼
                    ┌──────────────────────┐
                    │ EfxbnDraftSession    │  React state / zustand slice
                    │ - summary (mutated)  │
                    │ - dirtyKeys[]        │
                    │ - sourceBytes hash   │
                    └──────────┬───────────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     buildPreviewPlan   simulateEfxbn*    Write path
     (from draft)       (controlValue)    serialize → disk
              │                │
              ▼                ▼
         viewport          particles use
         + inspector       draft curves
```

### Draft rules

1. Opening an efxbn creates a **draft clone** of the inventory summary for that
   file (or a dedicated `inspect_efxbn` payload with full control lookup).
2. Slider/input changes call `patchControlConstant(name, value)` which:
   - Requires `selector === 1` for v1 const edit
   - Writes `controlLookupEntries[lookupIndex].value = value`
   - Marks dirty: `blockIndex:name`
3. Preview plan and simulation always read the **draft**, never the disk cache,
   while the session is open.
4. **Write EFXBN** serializes draft → bytes (round-trip known fields) → overwrite
   file → reload inventory with selection preserved.
5. **Revert** discards draft and re-clones from last disk parse.

### Performance

- Do **not** re-parse the whole effect folder on each slider tick.
- Draft updates are O(1) float writes + plan identity bump via revision
  signature (content hash of dirty fields), so Three.js layers remount only
  when structure/texture binding changes, not on every color tick.
- Particle color attributes already update every frame from
  `controlValue(..., progress)`; keep that path.

---

## Component map (implementation)

```text
effect-folder-editor/
  EffectFolder3dPreview.tsx          # host: draft session + write/revert
  EfxbnLiveAuthor.tsx                # replaces pure inspector shell
  EfxbnBlockTree.tsx                 # extract from current inspector list
  EfxbnColorAuthor.tsx               # Color tab
  EfxbnControlLaneEditor.tsx         # shared slider+number+mode for a lane
  EfxbnCurveSparkline.tsx            # mini graph
  EfxbnMaterialAuthor.tsx            # Material tab
  EfxbnEmitAuthor.tsx
  EfxbnMotionAuthor.tsx
  efxbnDraftSession.ts               # pure draft ops + dirty set
  efxbnDraftSession.test.ts
  EfxbnPreviewInspector.tsx          # keep as read-only fallback OR fold in
```

Reuse:

- `@/components/ui/slider`, `input`, `tabs`, `button`, `badge`, `resizable`
- `DualValueProperty` (`mode="live"`) for hex/float advanced fields
- `evaluateEfxbnControl` for scrub-linked readout

Backend (phase write):

- Extend effect folder service with `write_efxbn_control_constants` or full
  rebuild from `EfxbnSummary` if a lossless writer already exists; otherwise
  surgical patch of curve key floats at known offsets (safer for v1).

---

## Interaction details

### Color tab

- Range R/G/B: **0..2** (corpus often uses >1 for bloom under additive).
- Range A: **0..4**.
- Number inputs accept the same; clamp on blur, not on every keystroke if
  intermediate strings are invalid.
- Color `<input type="color">` only drives 0..1 RGB; values >1 stay on sliders.
- Link RGB: when on, dragging G scales R/B by the same delta ratio from the
  drag start snapshot.
- Dirty pip on block row when any lane on that block is dirty.

### Keyboard

| Key | Action |
| --- | --- |
| `1..5` | Focus tabs Color..Block |
| `[` / `]` | Prev / next block |
| `H` | Toggle visibility of selected |
| `S` | Solo selected |
| `Ctrl+S` | Write EFXBN (confirm if multi-dirty) |
| `Esc` | Clear color picker popover / cancel in-field edit |

### States

| State | UI |
| --- | --- |
| Clean | No dirty pills; Write disabled |
| Live draft clean | Green "Live draft" only (preview from memory) |
| Dirty | Amber "N unsaved" + block dirty pips + Write enabled |
| External texture | Material badge `external` + warn if hash unresolved |
| Const-only lane | Curve mode disabled or "promote to curve" (phase 2) |
| Write error | Toast + keep draft |
| Loading write | Primary button spinner; sliders stay interactive |

---

## Serialization contract (v1 patch)

For constant lanes (`selector === 1`):

```text
file offset of value float =
  control_lookup_region_offset + lookupIndex * 8 + 4
```

(`key` at +0, `value` at +4; both f32 LE.)

Optional: also allow editing `key` only in curve mode later.

Surgical patch preserves all unknown block bytes. Preferred over full rewrite
until a proven lossless builder exists for every field.

---

## Implementation phases

### Phase A - Draft + Color (MVP)

1. `efxbnDraftSession` pure module + tests (const color patch, dirty, revert).
2. Wire draft into `buildEffectFolderPreviewPlan` / sim for focused efxbn.
3. `EfxbnColorAuthor` UI; replace Controls tab list for color lanes.
4. Surgical write command + confirm dialog.

### Phase B - Motion / Emit / Material scalars

5. Lane editor generalized for all 18 control refs.
6. Emit scalar fields.
7. Material address/distortion edits + local texture rebind.

### Phase C - Curves

8. Multi-key curve edit (add/remove keys, drag points, domain 0..100).
9. Promote constant → 2-key curve.

---

## Acceptance (MVP)

- Open `18.efxbn`, select Block 00.
- Drag G from 1.0 → 0.2; viewport tint updates within one frame.
- Scrub progress; const values stay flat (expected).
- Write file; re-open; values persist (curve keys 14-17).
- Revert before write restores 0.5 / 1.0 / 0.5 / 1.0.
- Block 01 independent dirty set for its own color indices 32-35.

---

## Open decisions (need product call only if blocking)

1. Auto-write on blur vs explicit Write only? **Default: explicit Write.**
2. Shared curve key dedup: if two lanes ever shared an index (they should not
   for consts in corpus), patch still goes by index.
3. Whether inventory list shows dirty badge on the efxbn row (recommended yes).

---

## Pre-flight (tool UI adapted)

- [x] Design read + dials declared
- [x] One accent lock (amber); live green separate
- [x] Shape radius system documented
- [x] Density cockpit-appropriate; no marketing hero patterns
- [x] Full states: clean / dirty / external / error / loading
- [x] Maps to real binary fields (not fake uniforms)
- [x] Mock is code-built for exact labels (`tmp/efxbn-editor-ui/efxbn-live-author.html`)
- [x] Implementation phases scoped

---

## Next step

If approved, implement **Phase A** against `EffectFolder3dPreview` + new
`efxbnDraftSession` with tests, using this mock as the visual source of truth
for the Color tab and chrome pills.
