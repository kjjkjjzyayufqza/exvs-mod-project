# EFXBN Real Editing — Architecture and Plan

Written 2026-08-21. Supersedes nothing; the preview-fidelity plan
(`2026-08-16-efxbn-preview-fidelity-continuation.md`) stays the authority on *rendering*. This
document is the authority on *editing*: turning a read-mostly preview into a tool that can change
a shipped effect's models, textures, curves, render state and block topology, and write it back.

The reference point is **Blender**, because Blender already solved the exact problem this format
poses — a tree of parameterised nodes whose properties are either plain values or animation
curves, referencing shared data-blocks, edited in a viewport with an undo stack.

---

## 0. How to use this document

1. §1 is the finding that makes the whole project small. Read it before estimating anything.
2. §2 is corpus evidence for *which* fields deserve an editor. Do not add a field row that §2 says
   is constant across all 7,269 shipped blocks.
3. §3 maps Blender concepts onto EFXBN concepts. Use it to name things; a shared vocabulary with
   Blender is worth more than a novel one.
4. §5 is the phase order. Each phase is independently shippable and independently useful.
5. Obey the working rules in §1 of the preview-fidelity plan — they apply unchanged, especially
   rule 1 (never ship a guess), rule 3 (measure before ranking) and rule 8 (verify the offset).

---

## 1. The finding: the write path is already complete

**`build_efxbn_bytes` (`src-tauri/src/format/effect_folder.rs:1149`) already serialises an entire
EFXBN container from a typed `EfxbnSummary`, and it is proven byte-identical on real corpus data by
`build_efxbn_bytes_round_trips_a_real_corpus_sample`
(`src-tauri/tests/effect_folder_real_data_test.rs:689`).**

It writes the magic, `versionOrFlags`, `fileSize`, `effectCount`, `curveKeyCount` and
`modelControlCount` from the summary, then lays out all three regions by their own lengths. So it
already supports:

- resizing the block list (add / delete / reorder blocks),
- resizing the curve key table (insert / delete keyframes),
- resizing the model-control table,

with no changes at all. Every one of the 880 block bytes is covered by a typed field, including
`pad01`, the two `*_NotUse` slots and `reserveArea[31]`, so a parsed-then-rebuilt file is identical
only because the parser genuinely reads everything.

**And it has no caller.** The single write path exposed to the UI is
`patch_effect_efxbn_control_constants`, which pokes four bytes per curve key
(`effect_folder.rs:1092`). That is why the editor can only change colours.

> **Therefore this is a plumbing and UX project, not a format project.** The expensive half —
> a complete, verified, byte-faithful serialiser — was already paid for. What is missing is a
> command that calls it, a document model in front of it, and an interface worth using.

This reframing should be checked, not trusted: re-read `build_efxbn_bytes` and re-run the
round-trip test before building on it.

---

## 2. What is actually authored (corpus evidence)

Measured 2026-08-21 over `E:/XB/mod/006effect`: **679 files, 7,269 blocks, 130,842 control
references**. The scanners live in the session scratchpad, not the repo; the recipe is §3 of the
preview-fidelity plan.

### 2.1 A third of the block is dead weight

Treating the 880-byte block as 220 `u32` lanes and counting distinct values per lane:

| distinct values in a lane | lanes | what it means for the editor |
| --- | --- | --- |
| 1 (constant corpus-wide) | **70** | no row. 54 of these are constantly zero |
| 2–4 | 31 | dropdown / checkbox |
| 5–32 | 81 | dropdown or stepper |
| 33–256 | 18 | numeric field |
| 257+ | 20 | numeric field or curve |

**70 of 220 lanes never vary across every shipped block.** They are still written back verbatim —
correctness demands it — but they must not consume screen space. This removes a third of the field
surface on evidence rather than taste.

### 2.2 The real authoring surface is the curves, by an order of magnitude

The most-varied lanes in the entire block, by distinct value count:

| offset | distinct | non-zero | field |
| --- | --- | --- | --- |
| `0x0C4` | **1147** | 100.0% | `colorG` curve lookupIndex |
| `0x0B4` | 1145 | 100.0% | `scaleBaseZ` curve lookupIndex |
| `0x0AC` | 1141 | 100.0% | `scaleBaseY` curve lookupIndex |
| `0x0CC` | 1139 | 100.0% | `colorB` curve lookupIndex |
| `0x0D4` | 1137 | 100.0% | `colorA` curve lookupIndex |
| `0x0BC` | 1131 | 100.0% | `colorR` curve lookupIndex |
| `0x1D0` | 1130 | 97.6% | `worldGravityAccel` curve lookupIndex |
| `0x1D8` | 1128 | 100.0% | `directionAccel` curve lookupIndex |
| … 10 more curve lanes … | 1113–1125 | 93–100% | the rest of the 18 |
| `0x040` | 444 | 90.6% | `actionFlags` |
| `0x140` | 295 | 32.2% | `nudHandle` (model binding) |
| `0x0F0` | 135 | 99.9% | `sizeBase.x` |
| `0x158` | 85 | 100.0% | `uvTexParam[0]` |
| `0x150` | 84 | 91.1% | `colorTexParam[0]` |

The eighteen curve lanes are each **2.5× more varied than the most-authored scalar field**. Whatever
else the editor does, if curve editing is bad the editor is bad.

Note the lane scan independently confirmed there are **18** control references, not 16: the two
extra are `worldGravityAccel` (`0x1CC`) and `directionAccel` (`0x1D4`), outside the contiguous
`0x58`–`0xD0` run.

### 2.3 90.7% of curves are a single key — which is exactly Blender's model

`selector` is the **key count** and `lookupIndex` is the **first key index**; the parser validates
`lookupIndex + selector <= curveKeyCount` (`effect_folder.rs:1055`).

| keys per curve | references | share |
| --- | --- | --- |
| **1 (constant)** | **118,623** | **90.7%** |
| 2 | 7,774 | 5.9% |
| 3 | 2,844 | 2.2% |
| 4 | 562 | 0.4% |
| 5 | 392 | 0.3% |
| 6–12 | 517 | 0.4% |

Curve key table size: min 18, **median 139**, max 2,910 keys — small enough that rebuilding the
whole file on every save costs nothing.

This is Blender's property model exactly: a property is a plain value until you keyframe it, and
then it becomes an F-Curve. EFXBN encodes the same distinction in one integer. **The UI should make
`selector == 1` look and behave like an ordinary number field, and promote to a curve widget only
when the user asks** — the same affordance Blender gives with the keyframe diamond.

### 2.4 No curve is shared, anywhere

**0 of 130,842 control references point at a key range that any other reference in the same file
also uses.** Every curve owns its keys exclusively.

Consequences, all good:

- No aliasing. Editing one block's curve can never silently change another's.
- No users-count UI, unlike Blender data-blocks.
- Inserting or deleting a key is a **local** edit: only the ranges that start after it shift, and
  the file rebuild renumbers them mechanically.

This is the single fact that makes keyframe editing tractable. It is also the fact most likely to
be wrong for some file outside `006effect`, so the writer must **assert** exclusivity rather than
assume it (§4.4).

---

## 3. The Blender mapping

| Blender | EFXBN | Status |
| --- | --- | --- |
| **Outliner** — scene tree, select / rename / reparent | block tree from `level` + `childIndexSize` + `childIndexArray[8]` | tree exists in the inspector; no reparenting |
| **Properties editor** — tabbed, context-sensitive | per-block field tabs (emission / shape / motion / material / render state) | partially exists; read-only apart from colour |
| **Keyframe diamond** on a property | `selector == 1` vs `selector > 1` | not surfaced |
| **Graph Editor** — F-Curves, key handles, interpolation | the 18 control references into the key table | not built |
| **Dope Sheet** — all keys of a selection on one timeline | all 18 curves of a block, or of the whole file | not built |
| **Data-blocks with users** — mesh, material, image | model by `nudHandle`, textures by `colorTexParam` / `uvTexParam` into the model-control and texture-parameter tables | resolution exists (incl. the shared pack); rebinding does not |
| **Viewport gizmos** — move / rotate / scale the selected object | `positionOffset`, `rotationBase`, emitter `spawnFormLength` | render exists; no manipulation |
| **Undo stack** (`Ctrl+Z`), non-destructive edits | — | draft session has revert-all only |
| **Append / Link from another .blend** | import a block, curve or model from another `.efxbn` | file-level import exists; block-level does not |

Two Blender concepts deliberately **not** adopted:

- **Data-block users for curves.** §2.4 proves curves are never shared. A users-count would be a UI
  for a state that does not occur.
- **Modifiers / non-destructive stack.** EFXBN has no such layer. Inventing one would mean the tool
  edits something the game cannot read.

---

## 4. Architecture

### 4.1 One document, one writer

```
disk .efxbn
   │  parse_efxbn_bytes            (exists)
   ▼
EfxbnSummary  ──►  EfxbnDocument  ──►  edit commands  ──►  EfxbnDocument'
   ▲                (typed, immutable, undo stack)              │
   │                                                            │
   └────────────  build_efxbn_bytes  ◄────── normalise ◄────────┘
                       (exists)              (§4.4)
```

Rules:

1. **The document is the only mutable state.** No more byte patching. `patch_efxbn_control_constants`
   stays only until §5 E2 lands, then it is deleted — two write paths that can disagree is exactly
   the half-implementation trap the 2026-08-16 reflection is about.
2. **Every edit is a named command** producing a new document. That gives undo, redo, a dirty-lane
   ledger and a human-readable change list for the save dialog for free.
3. **The document is `EfxbnSummary` plus editing metadata**, not a parallel model. A second model
   would drift from the parser, and the parser is the only thing that knows all 145 fields.

### 4.2 Authored vs runtime, again

`runtime` (`sub_140146590` normalisation) is **derived, never edited**. The editor writes authored
fields; the preview reads `runtime`. After every command the document recomputes `runtime` from the
authored fields so the preview updates without a disk round-trip.

This is the single most likely source of a silent bug in the whole project: an editor that writes to
`runtime` produces a file that looks right in the preview and wrong in the game. Make
`EfxbnRuntimeNormalization` structurally read-only in the document type.

### 4.3 Resource binding

A block references resources three ways, all indirect:

- `nudHandle` (`0x140`) → model hash → a model folder, resolvable in this pack **or in
  `000common_001`** (57.8% of model references resolve only there).
- `colorTextureParameterIndex[2]` (`0x150`) → texture-parameter table → texture hash → `.nutexb`.
- `uvTextureParameterIndex[2]` (`0x158`) → same, for the UV-offset map.

Rebinding therefore has two layers, and the editor must not confuse them:

| layer | operation | already exists |
| --- | --- | --- |
| file | import a model folder / texture into the pack, change its hash | `import_effect_folder_model`, `import_effect_folder_file`, `update_effect_folder_item_hash` |
| block | point a block at a different model / texture | **missing** |

The block layer is what "真实编辑贴图和模型" means. A picker listing every resolvable model and
texture — pack-local and shared-pack, with the existing resolution panel's provenance labels — that
writes `nudHandle` or the texture-parameter index. Binding a resource that lives only in
`000common_001` is legal and common; binding one that resolves nowhere must be refused, not warned
about, because the game draws a flat proxy quad and the user will read that as a preview bug.

### 4.4 Normalisation on save

Before `build_efxbn_bytes`, the document is normalised and validated:

1. **Recompact the key table.** Walk blocks in order, emit each curve's keys contiguously, rewrite
   `lookupIndex`, set `selector` to the key count, set `curveKeyCount`. This makes insert/delete
   trivial and removes any orphaned keys an edit left behind.
2. **Assert curve exclusivity** (§2.4). If two references ever end up sharing a range, that is a
   bug in a command, and it must fail loudly at save rather than produce a file where editing one
   block changes another.
3. **Assert tree consistency**: `childIndexSize` matches the non-`-1` entries of `childIndexArray`,
   every child index is in range, `level` equals parent depth + 1, no cycles.
4. **Assert counts**: the three header counts equal the three array lengths (the writer already
   checks this; the document should fail earlier, with a better message).
5. **Byte-identical guard**: a document with no commands applied must rebuild to the original bytes.
   This is a test, and it is the cheapest possible protection against a parser gap.

No step in this list may "fix up" bad input silently. Throw.

### 4.5 Where the UI lives

Reuse the existing three-pane shell rather than inventing a window manager:

```
┌──────────────┬───────────────────────────┬──────────────────┐
│ Block tree   │  3D viewport              │  Properties      │
│ (Outliner)   │  + gizmos                 │  (tabs)          │
│              ├───────────────────────────┤                  │
│              │  Dope sheet / Graph editor │                  │
└──────────────┴───────────────────────────┴──────────────────┘
```

The bottom strip replaces today's single progress slider: a timeline that shows the playback window
(already derived per effect by `resolveEfxbnPreviewFrameCount`) with the selected block's keys on
it. Collapsed by default, because 90.7% of curves have nothing to show.

---

## 5. Phases

Each phase ships on its own. Do not start a phase before the previous one's verification passes.

### E1 — Whole-file write command · **DONE 2026-08-21**

`write_efxbn_file(effect_root, path, summary)` in `effect_folder.rs`, exposed as the
`write_effect_efxbn_file` command and wrapped by `writeEffectEfxbnFile` in
`effectFolderService.ts`. Every type reachable from `EfxbnSummary` gained `Deserialize` so the
document can cross the command boundary in both directions.

Three refusals, all tested:

| condition | behaviour |
| --- | --- |
| target resolves outside `effect_root` (canonicalized both sides) | refuse, file untouched |
| target does not exist | refuse; this command edits, it does not create |
| target is not a `.efxbn` | refuse |

The bytes are staged in a sibling `*.efxbn-write-tmp` and renamed into place, so a failure
part-way leaves the original intact rather than truncated, and the written bytes are re-parsed
before returning so the caller refreshes from disk rather than from what it believed it wrote.

Four tests added (`cargo test --test effect_folder_real_data_test`: 14 → **18 passed**):
byte-identical no-op round trip, targeted-diff after editing `lifeTimeBase` (asserting *only*
`0x18 + 0x2C` changed), and the two refusals. All run against a copy in a tempdir and assert the
game tree is untouched.

**Still not wired to any UI** — that is E2. Nothing in the app can call it yet, which is
deliberate: a write path with no document model behind it would just be a second way to corrupt a
file.

### E2 — Document model, commands and undo

- `efxbnDocument.ts`: `EfxbnDocument = { summary, path, dirtyLanes, history }`.
- Commands: `setBlockField`, `setCurveKey`, `insertCurveKey`, `deleteCurveKey`, `setBlockModel`,
  `setBlockTexture`, `addBlock`, `deleteBlock`, `reparentBlock`.
- `undo` / `redo`, and a change list rendered in the save dialog.
- Retire `efxbnDraftSession.ts` and `patch_effect_efxbn_control_constants` in the same change, so
  there is never a window with two write paths.
- Tests: every command round-trips through normalise + build + parse unchanged except for the field
  it targets. This is the property that catches everything else.

### E3 — Property editor over the evidence-ranked field surface

- Field metadata table: offset, label, widget, and the §2.1 activity class.
- Constant-varying lanes (70) render in a collapsed "unchanging in every shipped file" section, not
  hidden — hiding them would make the tool lie about what the format contains.
- `actionFlags` (444 distinct values, 90.6% of blocks) gets a named checkbox matrix, not a hex box.
  Every bit needs a derived name or it stays a numbered bit — no invented names.
- Enum lanes get dropdowns whose entries come from the decoded tables that already exist
  (`EFXBN_BLEND_STATE_LABELS`, `EFXBN_CULLING_TYPE_LABELS`, spawn form types, element types).

### E4 — Curve editing (Dope Sheet, then Graph Editor)

- Keyframe affordance on every one of the 18 controls: constant ⇄ animated.
- Dope sheet first: keys as diamonds on the derived playback window, drag to retime, delete.
  Retiming is already possible byte-wise (the key's `time` is the first 4 bytes of the pair and
  nothing today writes it).
- Graph editor second: value curves with the engine's own interpolation.
- **Unresolved and must stay unresolved until derived:** the interpolation the runtime applies
  between keys, and the 16-column `floatKeyTableTexture` quantisation (P6 of the fidelity plan). A
  graph editor that draws a different curve from the one the game evaluates is worse than no graph
  editor. Ship the dope sheet, which does not depend on interpolation, first.

### E5 — Resource rebinding

- Model picker over `EffectFolderInventory` models ∪ shared-pack models, writing `nudHandle`.
- Texture pickers for colour and UV-offset maps, writing through the texture-parameter table.
- Live preview: the existing plan rebuild already reacts to a changed summary.
- Refuse a binding that resolves in neither the pack nor `000common_001`.

### E6 — Topology editing

- Add / delete / duplicate a block; reparent by drag in the tree.
- The invariants in §4.4 step 3 are the whole difficulty. `childIndexArray` is 8 wide, so a block
  cannot take a ninth child — the tree view must enforce it rather than fail at save.
- Deleting a block renumbers every index that points past it, in every other block.

### E7 — Viewport manipulation

- Translate gizmo on `positionOffset`, rotate on `rotationBase`, scale on `spawnFormLength`.
- The gizmo infrastructure already exists in `SceneEdit` (`ViewportSelectionController`,
  three-mesh-bvh acceleration) and is reusable.

---

## 6. Traps

**T1 — Two write paths.** The constant patcher and the document writer must never both exist in a
shipped build. Delete the patcher in the same commit that lands E2.

**T2 — Editing `runtime`.** See §4.2. Structurally prevent it.

**T3 — The shared pack is not writable.** `000common_001` is shared by every effect pack. An edit
that "fixes" a shared model changes every effect in the game. Resource *binding* may point into it;
resource *editing* must refuse it until there is an explicit, separately confirmed flow.

**T4 — `E:\XB` is read-only.** Every test copies into a tempdir and asserts the game tree is
untouched afterwards. This is not negotiable and it has already caught mistakes.

**T5 — A parser gap becomes data loss the moment the writer is exposed.** Today an unparsed field
is a display gap. After E1 it is a field zeroed on save. The byte-identical guard (§4.4 step 5) is
what stands between the two. It already runs wide: `build_efxbn_bytes_round_trips_a_real_corpus_sample`
strides **240 files** across the whole tree, not one. Keep it that way — a narrow round-trip test
here is worth almost nothing.

**T6 — "The preview shows it, so it is right."** The preview matches the *decoded shader logic*, not
the game. It is not a validation oracle for an edit. Editing amplifies this: a wrong preview plus a
writable file produces confidently wrong content.

**T7 — Do not model what the format does not have.** No modifier stack, no non-destructive layers,
no curve sharing UI. Every one of those would be a Blender habit imported into a format that cannot
express it.

---

## 7. Verification protocol

Additions to §6 of the preview-fidelity plan:

```bash
# from src-tauri/
cargo test --test effect_folder_real_data_test     # 14 passed before E1; each phase adds tests
```

Every phase must additionally prove:

1. **Round-trip**: parse → document → normalise → build → parse gives an equal summary.
2. **Byte-identical for a no-op**: an untouched document rebuilds to the original bytes.
3. **Targeted diff**: after one command, exactly the intended lanes differ from the original bytes.
   Diffing bytes rather than comparing structs is what catches a field the parser silently drops.
4. `E:\XB` unmodified.

---

## 8. What is unknown, and blocks specific work

- **Curve interpolation between keys.** Blocks the Graph Editor (E4 second half), not the dope
  sheet. Needs `efxKineticParticle*3rd` re-read or IDA.
- **`actionFlags` bit names.** 444 distinct values are authored; only a handful of bits are derived
  (`0x1` loop, `0x10` uniform size, `0x800_0000` and `0x80_0000` from the normaliser). Unnamed bits
  stay numbered.
- **`reserveArea[31]`** is carried verbatim and is zero in every shipped file. If a non-zero example
  ever appears, it must be understood before that file is written back.
- **Whether curve exclusivity (§2.4) holds outside `006effect`.** Asserted at save rather than
  assumed, so a violation surfaces as a refused save rather than corrupted output.
