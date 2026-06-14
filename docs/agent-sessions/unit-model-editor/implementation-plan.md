# Unit Model Editor — Dynamic Folder Pipeline: Full Implementation Plan

> **Status:** DESIGN COMPLETE, NO CODE WRITTEN. Grilled & agreed 2026-06-14.
> **Audience:** any engineer/AI implementing this cold. This doc is self-contained —
> it restates the FHM2D format facts, exact types, algorithms, file-by-file changes,
> tests, and edge cases. Companion: `dynamic-folder-pipeline-plan.md` (decision log).
> **Complexity:** LARGE. Build the trunk (Phases 1–3) before any edit features.
>
> **Hard rules (from repo CLAUDE.md):** English code/comments only; no TODO/placeholder/
> partial code; **no fallback — throw on illegal/missing/unsupported input**; when you
> change a Tauri command also update its TS service; mirror existing patterns; files
> < 800 lines, functions < 50 lines; immutability by default.

---

## 0. How to use this document

Implement phases in order. Each phase has: goal, exact files (CREATE/UPDATE), function
signatures, algorithm, and a **validation command that must pass before moving on**.
Do not start edit features (Phases 4–5) until the roundtrip gate (Phase 1) and extract
(Phase 2) are green. Real samples are on disk (see §2) — use them in tests, path-gated.

---

## 1. Background & glossary

- **FHM2D** — EXVS container archive. A header + a meta block (file-type table, folder
  map, structure tree) + concatenated (often zstd) file payloads addressed by `fileIndex`.
- **unit model** — a *character* FHM2D package: the 3D models (body + weapons) plus
  per-model skeleton/material/mesh, a shared texture set, helper-bone tables, ragdoll
  physics, weapon HUD icons, and control bins. **`Magic = 10`.** Architecturally unlike a
  **stage map** (which has `info/`, `base/`, `sky`, placement.csv, `Magic = -843925575`).
- **`_structure.json`** — the human-editable manifest beside an extracted folder. Two layers:
  - **`SubFileData`** — flat, **deduped physical file pool**.
  - **`SubFileStructure`** — the **tree** the game reads; `Item`s reference the pool by
    `fileIndex`. The same nutexb `fileIndex` appears in many tree locations (sharing).
- **texture container** — a tree `Folder` (no physical folder needed) listing the nutexb
  a given numatb references; **synthesized from the numatb's texture-param paths**.
- **dedup pool** — each unique nutexb stored once on disk; tree references share it.

---

## 2. Reference samples (on disk)

| Path | What |
|---|---|
| `E:\XB\解包\com\file\0xABE08869\` | Flat rename-apply output (101 files in one dir) |
| `E:\XB\解包\com\file\0xABE08869_structure.json` | Authoritative manifest: `Magic=10`, `Fhm2dTotalCount=94`, `UnkCount=4`, 94 `SubFileData`, 341 `SubFileStructure` |
| `E:\XB\extract_tools\0xABE08869\` | External tool's meta layout (numeric names, physically-duplicated nutexb) — the *shape* reference, NOT the desired naming/dedup |
| `E:\XB\解包\com\file\0xAF73362C` (+ `_structure.json`) | Sample the **current** validator was written against (may differ: 2 containers/unk5=1) |

`0xABE08869` pool composition (94): 24 numatb, 21 nutexb, 12 bin, 8 nuhlpb, 8 numdlb,
8 numshb, 8 nusktb, 2 hkt, 2 rgdprm, 1 nudnbb. (8 models. The flat folder shows extra
`.jnttbl`/`.shl`/`.json` because rename-apply reinterprets `.bin`→`.jnttbl`/`.shl` and
writes `.numshb.json` sidecars — those are NOT in the 94-file pool.)

---

## 3. Exact data structures (do not redefine — reuse)

### 3.1 Rust (`src-tauri/src/format/fhm2d.rs`)
```rust
pub struct InMemoryFhm2dFile { pub file_index: i32, pub file_type: String, pub file_url: String, pub data: Vec<u8> }
pub struct InMemoryFhm2dExtraction {
    pub source_name: String, pub format: Option<Fhm2dFormat>, pub naming_error: Option<String>,
    pub files: Vec<InMemoryFhm2dFile>, pub sub_file_structure: Vec<SubFileStructureEntry>,
    pub meta_header: u32, pub unk_count: u32,
}
pub enum Fhm2dFormat { Character, Effect /* model subset+nutexb */, AllNutexb, StageList, CharacterParam, CharacterCost, Msc, Motion, Sound }

// tag = "type", fields camelCase. Missing fields default (empty string / 0).
pub enum SubFileStructureEntry {
    Folder { unk1: String, folder_count: i32, unk2: String, unk2_1: i32, unk3: i32, unk4: i32, unk5: i32, unk6: i32 },
    Item   { unk1: String, file_index: i32, unk2: String, unk2_1: i32, unk3: i32, unk4: i32, original_file_index: i32, display_name: Option<String> /* "Name" */ },
    EndMark { end_mark_count: i32 },
}
```
- `extract_fhm2d_to_memory_impl(bytes: &[u8], source_name: &str, format: Option<&str>) -> Result<InMemoryFhm2dExtraction, String>` — parse + decode + (optionally) name.
- `extract_fhm2d_to_folder_impl(...)` — extract to a numeric/flat folder + structure.json.

### 3.2 `_structure.json` JSON shape (camelCase)
```jsonc
{
  "Magic": 10, "Fhm2dTotalCount": 94, "UnkCount": 4,
  "SubFileData": [ { "index": 0, "fileType": ".nutexb", "fileIndex": 0,
                     "fileUrl": ".\\textures\\barispecular00_cubemap.nutexb",
                     "fileBaseName": "barispecular00_cubemap" }, ... ],
  "SubFileStructure": [ { "type":"Folder", "unk1":"00000000", "folderCount":9, "unk2":"00000000",
                          "unk2_1":0, "unk3":0, "unk4":0, "unk5":0, "unk6":0 },
                        { "type":"Item", "unk1":"00000000", "fileIndex":78, "unk2":"00000000",
                          "unk2_1":0, "unk3":0, "unk4":0, "originalFileIndex":78,
                          "Name":"characterid_021destny_002injust_001" },
                        { "type":"EndMark", "endMarkCount":1 }, ... ]
}
```
Repack (`fhm2d_pack::repack_fhm2d_from_structure(structure_json_path, output_path, atomic_write)`)
reads `SubFileData` (resolves each `fileUrl` relative to the JSON dir) + `SubFileStructure`.
`fileUrl` decouples physical layout from tree — **moving files only changes `fileUrl`**.

---

## 4. Verified canonical grammar (`0xABE08869`)

`Magic=10`. Root `Folder(folderCount=9, unk3=0, unk5=0, unk2="00000000")`, 9 direct children:

| # | child | tree node |
|---|---|---|
| 1 | characterid_*.bin | `Item unk2="00000000" unk3=0` (root-level) |
| 2 | shell_*.shl | `Item unk2="00000000" unk3=0` (`.bin` reinterpreted → `.shl`) |
| 3 | **models** | `Folder(count=N, unk3=0, unk5=0)` → N model groups |
| 4 | **ragdoll / 布娃娃** | `Folder(count=2, unk3=0, unk5=0)` → 2 subfolders, each `Folder(count=2)` of {hkt, rgdprm} items |
| 5 | **weapon_icon** | `Folder(count=6, unk3=0, unk5=0)` → 6 icon-nutexb items |
| 6 | **nuhlpb** | `Folder(count=N, unk3=0, unk5=0)` → N items, **order-significant (sample is reversed: fi 75,74,73,72,71,70,69,76)** |
| 7 | **nudnbb** | `Folder(count=1, unk3=0, unk5=0)` → 1 item |
| 8 | effect_project_*.bin | `Item` (root-level) |
| 9 | vernier_table_*.bin | `Item` (root-level) |

Each **model group** `Folder(folderCount=K, unk3=0, unk5=0)` interleaves, in order:
```
Item .nusktb                       unk2="10000000" unk3=0
Folder texture-container           unk3=32  unk5=V    →  Item .nutexb (×refs, unk2="00000000" unk3=0)  +  EndMark
Item .numatb                       unk2="21000000" unk3=V          // __maya__
Folder texture-container           unk3=32  unk5=V'
Item .numatb                       unk2="21000000" unk3=V'         // m001__nust__ (if present)
Item .numshb                       unk2="30000000" unk3=0
Item .numdlb                       unk2="40000000" unk3=0
Item .jnttbl(.bin)                 unk2="50000000" unk3=0
Folder texture-container           unk3=32  unk5=V''
Item .numatb                       unk2="21000000" unk3=V''        // __nust__
EndMark
```
**Observed invariant:** a texture container's `unk5` equals its paired numatb's `unk3`
(material-variant index; sample: maya→1, m001nust→1, nust→2). `folderCount` counts direct
children only (not EndMarks, not grandchildren). Item/Folder also carry `unk1`, `unk2_1`,
`unk4`, `unk6` — copy from source on the unchanged path; default to `"00000000"`/`0` for
new entries.

### 4.1 ⚠️ Validator vs real sample discrepancy (MUST resolve in Phase 1)
The existing `unit_model_validate.rs` was written against `0xAF73362C` and asserts
**"exactly 2 texture container folders"** (`:623`) and **`unk5=1`** (`:810`). But
`0xABE08869` has **3 containers per model** and **`unk5 ∈ {1,2}`**. So the validator will
*reject* `0xABE08869` today. Phase 1 must (a) confirm the true grammar from multiple
samples, and (b) **generalize the validator** to: "≥1 container, each paired with the
following numatb, `unk5 == paired numatb.unk3`, `unk3=32`" instead of the hard 2/unk5=1.
Keep `0xAF73362C` passing.

---

## 5. Agreed decisions (authoritative — see decision log for rationale)

1. Scope = **model-level + texture-level** dynamic.
2. **Physical layout** (tree always canonical; decoupled via `fileUrl`):
   ```
   <root>/
   ├ <model_name>/        per model: .numdlb .numshb .nusktb .numatb(×2~3) .jnttbl .nuhlpb
   ├ textures/            ALL model nutexb, deduped + renamed
   ├ weapon_icon/         6 icon nutexb, SEPARATE group
   ├ ragdoll/             hkt + rgdprm (2 pairs)
   ├ nudnbb/
   └ characterid_*.bin  shell_*.shl  vernier_table_*.bin  effect_project_*.bin
   ```
   (`nuhlpb` may physically live inside each model folder; the **tree** still groups them.)
3. Entry = **raw `.fhm2d` extraction pipeline**.
4. **"动态 numatb"** = synthesize texture containers from each numatb's current refs +
   validation gate. **Never rewrite numatb binaries.** Texture replace = overwrite same-name.
5. **Add model = DAE/FBX → SSBH import** (reuse scene pipeline; it emits numatb maya+nust).
6. New-model nuhlpb = **auto empty 88-byte table**; shl = **validate-only** (block on count
   mismatch, never auto-edit the 0x20-byte shader-binding entries).
7. UI = extend **UnitModelEdit** with a structured **Model Manager** (reuse scene DAE +
   texture modals); not the generic free-form tree editor.
8. Fidelity = **logical/content roundtrip** + game-valid. ⚠️ **REVISED after probe
   (2026-06-14): byte-identical is INFEASIBLE.** The production repack
   (`repack_fhm2d_from_structure`) recompresses payloads with zstd params that differ from
   the game originals — verified: `0xABE08869` source 17,681,692 B → repacked 17,767,421 B
   (+85 KB ≈ +0.5%, first diff at header offset 16). The repacked file is still the app's
   normal repack output and game-valid. **Gate = content equality:** extract→repack→
   re-extract yields **identical decoded payloads + identical `SubFileStructure`**. (If true
   byte-parity is ever required, the pack pipeline would need to store & re-emit original
   compressed payload blocks instead of recompressing — out of scope here.)

---

## 6. Naming derivation spec

Reuse stage helpers in `fhm2d_stage.rs` (extract to a shared module if cleaner):
- `parse_stage_numdlb_modl_info(numdlb_bytes) -> { model_name, mesh_file_name, skeleton_file_name, material_file_names[] }` (`:748`).
- model folder + `.numdlb` ← `model_name`; `.numshb` ← `mesh_file_name`; `.nusktb` ←
  `skeleton_file_name`; `.numatb` ← `material_file_names` (maya first, nust derived) via
  `rename_numatb_with_maya_nust` (`:901`).
- nutexb names ← numatb texture-param paths (`parse_numatb_texture_refs_by_role` `:4930`).
- `.bin` content sniffing → real ext (cf. `fhm2d_named_tree.rs`): `SDKV@0x0C`→`.hkt`;
  `SHLL`→`.shl`; jnttbl heuristic→`.jnttbl`; ragdoll params→`.rgdprm`; else keep `.bin`.
- nuhlpb 1:1 with models (name = `model_name`); weapon_icon names from their nutexb;
  control bins keep semantic names (`characterid_*`, `shell_*`, `vernier_table_*`,
  `effect_project_*`).
- **Collisions:** if two models yield the same `model_name`, suffix `_2`, `_3`… and warn.

---

## 7. Algorithms (pseudocode)

### 7.1 Dedup pool builder
```
build_pool(files):                 # files: InMemoryFhm2dFile[] (already named)
  pool = []; index_of = {}         # key → pool index (= new fileIndex)
  for f in stable_order(files):    # stable_order = preserve source fileIndex order (fidelity)
     key = dedup_key(f)            # nutexb: content hash OR canonical name; others: fileIndex
     if key not in index_of:
        index_of[key] = len(pool); pool.append(f)
  return pool, index_of
```
For the **unchanged roundtrip path**, `stable_order` and `dedup_key` must reproduce the
source pool exactly (same order, same dedup). Use source `fileIndex` order; nutexb dedup
by identity already present in source pool (source pool is already deduped, so 1:1).

### 7.2 Canonical tree builder (THE core — `build_canonical_structure`)
```
input: named files + per-model grouping + pool/index_of + numatb→refs map + original order hints
output: SubFileStructureEntry[]  (root folder + children + EndMarks)

emit Folder(root, folderCount=9, unk3=0, unk5=0)
emit Item(characterid bin)
emit Item(shell .shl)
emit Folder(models, folderCount = model_count)
for model in models (preserve source order):
   emit Folder(group, unk3=0, unk5=0, folderCount = count_direct_children(model))
   emit Item(nusktb, unk2="10000000")
   for variant in model.numatb_variants (preserve source order: maya, [m001nust], …, nust):
      refs = numatb_refs[variant]                 # texture basenames the numatb references
      emit Folder(container, unk3=32, unk5=variant.unk3)
      for tex in refs (preserve source container order):
         emit Item(nutexb, fileIndex=index_of[tex], unk2="00000000")
      emit EndMark
      emit Item(numatb variant, unk2="21000000", unk3=variant.unk3)
      # NOTE: real layout interleaves numshb/numdlb/jnttbl between variants — match §4 order exactly
   emit Item(numshb, unk2="30000000")
   emit Item(numdlb, unk2="40000000")
   emit Item(jnttbl, unk2="50000000")
   emit EndMark
emit ragdoll Folder(count=2): for pair: Folder(count=2){ Item(hkt), Item(rgdprm) } EndMark ; EndMark
emit weapon_icon Folder(count=6): Item(icon nutexb)×6 ; EndMark
emit nuhlpb Folder(count=N): Item(nuhlpb)×N in PRESERVED (source) order ; EndMark
emit nudnbb Folder(count=1): Item(nudnbb) ; EndMark
emit Item(effect_project bin); emit Item(vernier_table bin)
emit EndMark (root)
recompute every folderCount = number of direct children (Items + Folders, NOT EndMarks)
```
**Critical for byte-roundtrip:** the exact interleave order in §4 (containers/numatb/numshb/
numdlb/jnttbl), the reversed nuhlpb order, and all `unk*` fields must equal the source. On
the unchanged path, prefer **carrying source entries through verbatim** keyed by fileIndex,
only re-deriving order for *edited* models.

### 7.3 Texture-container synthesis (the "动态 numatb")
```
numatb_refs(numatb_path):
   matl = MatlData::read(numatb_path)              # ssbh_data
   refs = []
   for entry in matl.entries:
      for t in entry.textures + entry.textures2:
         name = basename(t.data); ensure .nutexb; lowercase
         if name not in refs: refs.append(name)    # preserve first-seen order
   return refs
```
Container Items = refs mapped to pool fileIndices. Must satisfy
`validate_numatb_container_pairing` (every ref present in the paired container).

### 7.4 Extract pipeline (`extract_unit_model_fhm2d_to_folder`)
```
1. ext = extract_fhm2d_to_memory_impl(bytes, name, Some("fhm2d_character"))
2. name all files (§6); reinterpret .bin types
3. pool, index_of = build_pool(ext.files)
4. lay out on disk:
     textures/<nutexb name>            (model nutexb, deduped)
     weapon_icon/<nutexb name>
     <model_name>/<model files + nuhlpb>
     ragdoll/<pair>/<hkt|rgdprm>
     nudnbb/<file>
     <root>/<control bins + shl>
   write each pool file once; set fileUrl relative to structure.json dir (".\\…")
5. structure = build_canonical_structure(...)   # §7.2, carrying source order
6. write <root>_structure.json { Magic:ext.meta_header(=10), Fhm2dTotalCount:len(pool),
                                  UnkCount:ext.unk_count, SubFileData:pool, SubFileStructure:structure }
```

### 7.5 Texture ops (pool + refcount aware; rebuild structure)
- **add**: copy nutexb into `textures/`; add `SubFileData` entry; **rebuild SubFileStructure**
  (currently `unit_model_textures.rs:66` skips this — fix). New texture is *unused* until a
  numatb references its name (decision 4).
- **replace**: overwrite the same-name nutexb file (numatb path unchanged; no structure change).
- **remove**: blocked if `can_remove == false` (referenced by any numatb/structure — existing
  `:274` logic); else delete file + drop pool entry + reindex + rebuild structure.

### 7.6 Model ops
- **add**: run DAE→SSBH+numatb import (reuse `scene_session_commands` / `ssbh_dae_cmd`:
  `build_session_numatb_artifacts`, `variant_numatb_paths` → maya+nust) → write
  `models/<model_name>/` → generate empty 88-byte nuhlpb (`ssbh_write_nuhlpb` with empty
  constraints) → dedup new textures into pool → re-run `build_canonical_structure`. shl
  count now < model count → surfaces as validation error (user edits shl).
- **replace**: swap a model's SSBH set in place; re-synthesize that model's containers;
  GC newly-orphaned pool textures.
- **remove**: delete `models/<name>/` + its nuhlpb; GC pool textures whose refcount hits 0;
  rebuild structure; shl count mismatch → validation error.
- **count sync**: nuhlpb folder count == model count is enforced by rebuild; shl is
  validate-only (decision 6).

---

## 8. Backend surface (Rust)

| File | Action | Contents |
|---|---|---|
| `format/unit_model_structure.rs` | CREATE | `build_canonical_structure`, pool builder, container synthesis, `regenerate_unit_model_structure_json(model_root, structure_json_path) -> Result<(), String>` |
| `format/unit_model_extract.rs` | CREATE | `extract_unit_model_fhm2d_to_folder_impl(src, out) -> Result<ExtractResult, String>` (reuses fhm2d_stage naming helpers) |
| `format/unit_model_models.rs` | CREATE | `add_unit_model_model`, `replace_unit_model_model`, `remove_unit_model_model` (+ nuhlpb gen, pool GC, count sync) |
| `format/unit_model_textures.rs` | UPDATE | make add/remove rebuild `SubFileStructure` via `unit_model_structure`; pool-aware |
| `format/unit_model_validate.rs` | UPDATE | generalize container/unk5 rules (§4.1); keep `0xAF73362C` green |
| `format/fhm2d_stage.rs` | UPDATE (maybe) | expose `parse_stage_numdlb_modl_info`, `rename_numatb_with_maya_nust`, `parse_numatb_texture_refs_by_role` as `pub(crate)` if not already, or move to a shared `ssbh_naming` module |
| `format/mod.rs` | UPDATE | register new modules |
| `stage_commands.rs` | UPDATE | add commands: `extract_unit_model_fhm2d_to_folder`, `regenerate_unit_model_structure`, `add_unit_model_model`, `replace_unit_model_model`, `remove_unit_model_model` (with `emit_extract_step`-style progress for extract) |
| `lib.rs` | UPDATE | register the above in `tauri::generate_handler![]` |
| `bin/unit_model_roundtrip_check.rs` | CREATE | extract→regenerate→repack byte-compare harness (mirror `bin/stage_texture_roundtrip_check.rs`) |

**Command signature conventions** (mirror existing unit cmds in `stage_commands.rs:909+`):
```rust
#[tauri::command]
pub async fn regenerate_unit_model_structure(model_root: String, structure_json_path: Option<String>)
    -> Result<(), String> { tauri::async_runtime::spawn_blocking(move || { ... }).await.map_err(...)? }
```
camelCase args over IPC; `Result<T, String>`; `format!` error context; no fallback.

---

## 9. Frontend surface (TS / React)

| File | Action | Contents |
|---|---|---|
| `UnitModelEdit/utils/unitModelExtractService.ts` | CREATE | `extractUnitModelToFolder(src, out)` → invoke |
| `UnitModelEdit/utils/unitModelModelService.ts` | CREATE | `addModelFromDae(...)`, `replaceModel(...)`, `removeModel(...)`, `regenerateStructure(...)` |
| `UnitModelEdit/utils/unitModelRepackService.ts` | UPDATE | regenerate-before-validate; keep `repack_fhm2d` (`inferUnitModel*Path` already correct) |
| `UnitModelEdit/utils/unitModelTextureService.ts` | UPDATE | folder/dedup semantics; refresh after structure rebuild |
| `UnitModelEdit/components/UnitModelModelManagerPanel.tsx` | CREATE | model list + add(DAE)/replace/remove/reorder; reuse `SceneEdit/components/dae-import/*` dialog |
| `UnitModelEdit/components/UnitModelTexturePanel.tsx` | UPDATE | dedup/refcount-aware list; reuse scene texture add/replace/preview |
| `UnitModelEdit/components/UnitModelToolsPanel.tsx` | UPDATE | "Extract from .fhm2d" + "Validate & Repack" entry points |
| `UnitModelEdit/components/UnitModelStructureTreeView.tsx` | CREATE | **left-side tree view** of the whole `_structure.json` + folder structure (Scene-Editor parity, see §9.1) |
| `UnitModelEdit/utils/unitModelStructureTree.ts` | CREATE | parse `_structure.json` → renderable tree model (folders/items/refs); pure + unit-tested |
| `src/components/CopyInfoToAiButton.tsx` | CREATE | **reusable "Copy info to AI" button** (see §9.2); dropped into many panels |
| `UnitModelEdit/page.tsx` | UPDATE | mount tree view (left) + Model Manager; wire extract/validate/repack; invalidate validation cache on edit |

Invalidate cached validation/repack result after any edit (pattern already in
`unit-model-editor/todo.md`). All edits → `regenerateStructure` → re-`validate` → enable repack.

### 9.1 Left-side structure tree view (required)
Mirror Scene Editor's structure viewer (`SceneEdit/components/ExvsStructureViewer.tsx`,
`StructureInspectorPanel.tsx`; tree component reuse from `SceneEdit/components/StageHierarchyTree.tsx`
or `TestEditor/components/RepackFolderStructureView.tsx` for the visuals — read-only here, NOT the
editable repack tree). Renders the canonical tree: root → models/<model>/{nusktb, container→numatb,
numshb, numdlb, jnttbl} / textures / weapon_icon / ragdoll / nuhlpb / nudnbb / control bins. Each
node shows `fileIndex`, type, unk tags, and (for nutexb container items) the shared-pool target.
Selecting a node cross-highlights the matching Model Manager / Texture panel entry. The tree is fed
by `unitModelStructureTree.ts` parsing the live `_structure.json` (re-read after every regenerate).
**Apply the `design-taste-frontend` skill** for the panel layout/visual design (it is a primary
surface, not a default shadcn tree).

### 9.2 "Copy info to AI" buttons (required, pervasive)
A reusable `CopyInfoToAiButton` placed on many surfaces (structure tree node/root, each model row,
texture row, validation panel, repack result). It serializes the relevant context to a structured,
LLM-friendly payload (JSON + short prose header) and writes to clipboard. Extend the existing
"Copy AI review payload" pattern (`formatUnitModelReviewPayload` in `unitModelRepackService.ts:132`
+ `unitModelAiReviewPayload.ts`) into a shared builder so every button reuses the same payload
shape: `{ kind, scope, activeModelRoot, selection, structureJson|subset, validation, textureInventory,
parsedAssets, notes }`. Buttons accept a `buildPayload()` thunk so each host supplies only its slice.

---

## 10. Phase plan with validation gates

> Validation note: full `npx tsc --noEmit` and `pnpm build` are **blocked by pre-existing
> SceneEdit type errors** (see memory `project_startup_optimization`). Validate with
> **targeted** `cargo test --lib <module>` and `npx vitest run <file>`.

### Phase 1 — Canonical regenerator + validator generalization + roundtrip gate (HIGH)
- CREATE `format/unit_model_structure.rs`; UPDATE `unit_model_validate.rs` (§4.1);
  CREATE `bin/unit_model_roundtrip_check.rs`; UPDATE `format/mod.rs`.
- **Validate:**
  ```bash
  cargo test --lib unit_model_structure
  cargo test --lib unit_model_validate          # 0xAF73362C still green; 0xABE08869 now green
  cargo run --bin unit_model_roundtrip_check -- "E:\\XB\\解包\\com\\file\\0xABE08869"
  # regenerated _structure.json == original (semantic); repack .fhm2d == source bytes
  ```

### Phase 2 — Extract pipeline (HIGH)
- CREATE `format/unit_model_extract.rs`; command + `lib.rs`; `unitModelExtractService.ts`.
- **Validate:** `cargo test --lib unit_model_extract`; extract `0xABE08869` → layout matches
  §5; regenerate→repack still byte-identical to source.

### Phase 3 — Validate + repack flow (LOW)
- UPDATE `unitModelRepackService.ts` (regenerate→validate→repack); cache invalidation.
- **Validate:** `npx vitest run src/page/UnitModelEdit/utils/unitModelRepackService.test.ts`.

### Phase 4 — Texture ops, folder/dedup/refcount aware (MEDIUM)
- UPDATE `unit_model_textures.rs` (rebuild structure; close `:66` gap) + texture service.
- **Validate:** `cargo test --lib unit_model_textures` (add-then-referenced, remove-blocked,
  replace-overwrites, structure rebuilt).

### Phase 5 — Model ops add/replace/remove + count sync (HIGH)
- CREATE `format/unit_model_models.rs` + commands + `unitModelModelService.ts`.
- **Validate:** `cargo test --lib unit_model_models` (add bumps nuhlpb count + synthesizes
  containers + empty nuhlpb; remove GCs orphan textures; shl mismatch surfaces in validator).

### Phase 6 — Frontend Model Manager (MEDIUM)
- CREATE `UnitModelModelManagerPanel.tsx`; UPDATE `page.tsx`, panels.
- **Validate:** `npx vitest run src/page/UnitModelEdit/`.

### Phase 7 — Verification & docs (LOW)
- Full roundtrip + edited-validity matrix; update `todo.md`/`process.md`.

---

## 11. Test plan (exact)

| Test | Location | Asserts |
|---|---|---|
| canonical shape | `unit_model_structure.rs#[cfg(test)]` | root count=9; model interleave order; unk tags per §4; container unk5 == numatb unk3 |
| container synthesis | same | each numatb's refs map to pool fileIndices; container precedes numatb |
| dedup pool | same | unique nutexb once; stable order = source |
| roundtrip (gated) | `bin/unit_model_roundtrip_check.rs` + test | `0xABE08869` extract→regenerate→repack == source bytes |
| validator generalization | `unit_model_validate.rs` | `0xAF73362C` green; `0xABE08869` green; bad container/unk → error |
| texture ops | `unit_model_textures.rs` | add/replace/remove + structure rebuilt + refcount gate |
| model ops | `unit_model_models.rs` | add/remove/replace + counts + GC |
| repack service | `unitModelRepackService.test.ts` (vitest) | regenerate-before-validate; block on invalid |

Real-sample tests must be **path-gated** (skip if sample absent), like existing
`unit_model_textures.rs:489`.

---

## 12. Open implementation details (decide during build, with defaults)

1. **Container `unk5` / numatb `unk3` mapping** — default: `unk5 := paired numatb.unk3`.
   Confirm across samples; the maya/m001nust→1, nust→2 pattern suggests a variant index.
2. **Multiple numatb per model** ordering & interleave — match §4 exactly; carry source
   order on unchanged path.
3. **nuhlpb tree order** — reversed in sample; on unchanged path carry source order; for
   added models append in model order (verify game tolerance).
4. **Orphaned-texture GC** on remove/replace — refcount across all numatb refs; delete pool
   entry + file when 0; warn, never delete outside `<root>` (existing safety `:459`).
5. **Model-name collisions** — suffix `_2`/`_3` + warn.
6. **`Magic`/`UnkCount`** — carry from source (`meta_header`, `unk_count`); unit model `Magic=10`.
7. **Reorder models** — lower priority; shl entry order is validate-only so reorder may
   surface a shl mismatch the user resolves manually.
8. **DAE-import numatb profile** — reuse `resolve_session_numatb_profiles`; expose in the
   DAE dialog.

---

## 13. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Byte-roundtrip fails (order/unk/dedup) | HIGH | Phase 1 first; carry source entries verbatim on unchanged path; dedicated roundtrip bin |
| Validator too strict for real packages (§4.1) | HIGH (known) | Generalize in Phase 1; keep both samples green |
| Container synthesis ≠ validator | MED | Build directly against `validate_numatb_container_pairing` |
| DAE-imported model material can't be inferred | MED | Reuse scene numatb profiles; surface in dialog |
| shl count drift after add/remove | MED (by design) | validate-only gate blocks repack; manual shl edit |
| Full tsc/build blocked by SceneEdit | KNOWN | Targeted `cargo test --lib` + `vitest run <file>` |
| `nuhlpb` physical vs tree placement confusion | LOW | tree groups regardless of disk; `fileUrl` decouples |

---

## 14. Reused function index (file:line)

- `fhm2d.rs`: `extract_fhm2d_to_memory_impl:334`, `extract_fhm2d_to_folder_impl:317`,
  `SubFileStructureEntry:93`, `InMemoryFhm2dExtraction:33`.
- `fhm2d_pack.rs`: `repack_fhm2d_from_structure:42`, `RepackResult:35`.
- `fhm2d_stage.rs`: `parse_stage_numdlb_modl_info:748`, `rename_model_subfolder_files:826`,
  `rename_numatb_with_maya_nust:901`, `consolidate_textures_by_numatb_refs:1365`,
  `parse_numatb_texture_refs_by_role:4930`, `stage_apply_rename_impl:1815`.
- `unit_model_validate.rs`: `validate_unit_model_for_repack:122`,
  `validate_numatb_container_pairing:839`, `validate_texture_container:784`,
  `read_shl_model_count:1080`.
- `unit_model_textures.rs`: `add_unit_model_nutexb:66` (gap), `remove:114`, `build_inventory:224`,
  `collect_numatb_references:309`.
- `ssbh_dae_cmd.rs`: `ssbh_write_nuhlpb:621`, `ssbh_template_write_numatb:661`,
  `build_session_numatb_artifacts:143`, `variant_numatb_paths:126`.
- `scene_session_commands.rs`: DAE import / SSBH artifacts `:1423`, `resolve_session_numatb_profiles:1639`.
- TS: `sceneStageStructure.ts:180 buildStageStructureJsonFromFiles` (analog), `unitModelRepackService.ts`.
- Roundtrip harness pattern: `bin/stage_texture_roundtrip_check.rs`.
- Command registration: `lib.rs:137-151`.
