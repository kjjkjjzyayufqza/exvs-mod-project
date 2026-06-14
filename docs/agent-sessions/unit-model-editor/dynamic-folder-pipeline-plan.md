# Unit Model Editor — Dynamic Folder Pipeline (Scene-Editor Parity)

> Status: DESIGN (grilled & agreed 2026-06-14). Big feature. No code written yet.
> Goal: bring the Scene Editor's dynamic folder-based extract / edit / regroup /
> repack-with-validation workflow to **unit-model** FHM2D packages, which have a
> *completely different* architecture from stage maps (no `info`/`base`; instead
> one folder per model, a shared texture pool, a grouped `nuhlpb` set with one
> per model, and outermost independent control bins).

## Reference data (real samples)

- `E:\XB\解包\com\file\0xABE08869` — **flat** rename-apply output (101 files, all
  in one dir) + sibling `0xABE08869_structure.json`. This is what today's
  Unit Model Editor opens.
- `E:\XB\extract_tools\0xABE08869` — external tool's **meta folder-structured**
  extract. Numeric-named, and it **physically duplicates** every model's nutexb
  into every texture-container subfolder. We want close to this hierarchy but
  **renamed** and with **nutexb deduped/grouped**.

## Two-layer struct_json model (shared with stage)

- `SubFileData` = flat **physical file pool** (deduped). Entry:
  `{index, fileType, fileIndex, fileUrl, fileBaseName}`. Each nutexb stored once.
- `SubFileStructure` = **tree**: `Folder{folderCount,unk3,unk5,unk2}` +
  `Item{fileIndex→pool, unk2, unk3, Name}` + `EndMark`. `folderCount` counts
  direct children only (not EndMarks, not grandchildren).
- Stage's `buildStageStructureJsonFromFiles` rebuilds the tree from the on-disk
  folder layout. **Unit model can NOT do a naive disk-mirror** — its tree shape
  is rigid (see grammar) and texture containers are synthesized from numatb, not
  from physical folders.
- Repack: generic `repack_fhm2d` (unit model already reuses it).
- Stage FHM2D `Magic = -843925575`; **unit-model `Magic = 10`**.

## Verified unit-model canonical grammar (from `0xABE08869_structure.json`)

Root `Folder(count=9, unk3=0, unk5=0)` → 9 direct children:

1. `Item` characterid_*.bin   (control bin)
2. `Item` shell_*.shl         (`.bin` reinterpreted → `.shl`)
3. **models** `Folder(count=N)` → N model groups
4. **ragdoll / 布娃娃** `Folder` → hkt+rgdprm pairs (each pair a subfolder; the
   `.bin` files content-sniff to `.hkt` / `.rgdprm`)
5. **weapon_icon** `Folder` → weapon-icon nutexb (own group, NOT merged into the
   model texture pool)
6. **nuhlpb** `Folder(count=N)` → N nuhlpb, **grouped & order-significant**
   (sample order is reversed: `75,74,73,72,71,70,69,76` — must be preserved for
   byte-roundtrip)
7. **nudnbb** `Folder(count=1)`
8. `Item` effect_project_*.bin
9. `Item` vernier_table_*.bin

Each **model group** `Folder(count=K, unk3=0, unk5=0)` interleaves:
- `Item .nusktb`  `unk2=10000000`
- `Folder` texture-container `unk3=32, unk5=1` (or `unk5=2`) → `Item`s that are
  fileIndex references into the **shared nutexb pool** + `EndMark`
- `Item .numatb`  `unk2=21000000` (`unk3=1` allowed) — `__maya__`
- (repeat container + numatb for `__nust__`, `m001__nust__`, …)
- `Item .numshb`  `unk2=30000000`
- `Item .numdlb`  `unk2=40000000`
- `Item .jnttbl`  `unk2=50000000`  (NOTE: in this sample the jnttbl slot is a
  per-model `.bin` reinterpreted)
- `EndMark`

**Validator contract** (`unit_model_validate.rs`) the regenerator must satisfy:
- nuhlpb count == model-group count.
- exactly 1 `shell_*.shl`; `SHLL` header model count (`u32 @ 0x0c`) == model count;
  shl carries a **0x20-byte per-model entry** (`min_len = 0x10 + count*0x20`).
- each texture container is immediately followed by its paired `.numatb`; every
  texture the numatb references (via `MatlData` texture-param paths) **must be an
  Item in that container** (by basename, case-insensitive).
- per-type unk2 tags as above; texture containers `unk3=32`; numatb item `unk3=1`
  allowed.

## Naming derivation (the "重新命名")

Reuse stage's numdlb-MODL-driven naming (`parse_stage_numdlb_modl_info`):
- `model_name` → model folder + `.numdlb`
- `mesh_file_name` → `.numshb`; `skeleton_file_name` → `.nusktb`
- `material_file_names` (maya first, nust derived) → `.numatb`
- nutexb names from numatb texture-param paths
Plus unit-specific naming for weapon_icon nutexb, nuhlpb (1:1 with models),
nudnbb, ragdoll hkt/rgdprm, control bins, and content-based `.bin`→`.jnttbl`/
`.shl`/`.hkt`/`.rgdprm` reinterpretation (cf. `fhm2d_named_tree.rs`).

## Agreed design decisions (grilled 2026-06-14)

1. **Scope** = full **model-level + texture-level** dynamic (not texture-only).
2. **Physical layout** (tree is always canonical regardless; this is editing
   convenience, decoupled via `fileUrl`):
   ```
   <root>/
   ├ <model_name>/        one folder per model: numdlb/numshb/nusktb/numatb(×2~3)/jnttbl/nuhlpb
   ├ textures/            ALL model nutexb, deduped + renamed (texture containers = tree-only refs)
   ├ weapon_icon/         the 6 icon nutexb, SEPARATE group (canonical 0/2)
   ├ ragdoll/             hkt + rgdprm pairs
   ├ nuhlpb/              (tree groups these; physical copy may live with model — fileUrl decouples)
   ├ nudnbb/
   └ characterid_*.bin  shell_*.shl  vernier_table_*.bin  effect_project_*.bin
   ```
   weapon_icon stays its own group (NOT merged into `textures/`).
3. **Entry flow** = raw `.fhm2d` extraction pipeline (extract + numdlb/numatb
   rename + dedup-group → folder layout + write `_structure.json`). Mirrors
   stage's `extract_stage_fhm2d_to_folder` + `stage_apply_rename`.
4. **"动态 repack numatb"** = on repack, **synthesize each texture container from
   that numatb's current texture references** (map → shared-pool fileIndices) +
   run the validation gate. **Never rewrite numatb binaries.** Texture replace =
   overwrite same-name nutexb (numatb path unchanged).
5. **Add-model source** = **DAE/FBX → SSBH import**, reusing the Scene Editor
   pipeline (`scene_session_commands` / `ssbh_dae_cmd`) which already emits
   numdlb/numshb/nusktb **and** numatb (`build_session_numatb_artifacts`,
   `variant_numatb_paths` → maya+nust). Integration then: dedup textures into the
   pool, synthesize containers, write `models/<name>/`, sync counts.
6. **Companion files on add/remove**: nuhlpb → auto **default empty 88-byte**
   table (`ssbh_write_nuhlpb`); shl → **validate-only** (block on count mismatch,
   never auto-edit the 0x20 shader-binding entries — user edits shl manually).
7. **UI** = extend the existing **UnitModelEdit** page with a structured **Model
   Manager** panel (list / add-via-DAE / replace / remove / reorder), reuse
   Scene Editor's DAE import dialog + texture add/replace/preview modals; upgrade
   the texture panel to folder/dedup-aware; new unit-model canonical
   structure-regeneration service. (NOT the generic free-form
   `RepackFolderStructureView` tree — it doesn't enforce the rigid grammar.)
8. **Fidelity** = **unchanged extract→repack must byte-match** the original
   `.fhm2d` (roundtrip test gate, e.g. `0xABE08869`); **edited** packages only
   need to be game-valid (pass validator + load). Regenerator must therefore
   preserve original entry ordering (incl. reversed nuhlpb order), dedup order,
   and all unk fields for the unchanged path.

## Pipelines to build

- **A. Extract** `extract_unit_model_fhm2d_to_folder`: in-memory extract →
  numdlb/numatb-driven rename + `.bin` reinterpretation → dedup nutexb into
  `textures/` (+ keep weapon_icon separate) → lay out folder structure → write
  canonical `_structure.json`.
- **B. Canonical regenerator** (disk → struct_json): build `SubFileData` pool
  (deduped, stable order) + `SubFileStructure` canonical tree (synthesize
  texture containers from each numatb's refs; emit grouped nuhlpb in preserved
  order; per-type unk tags). Run before every validate/repack.
- **C. Texture ops** (dedup + ref-count aware): add → pool (used only once a
  numatb references the name); replace → overwrite same-name content; remove →
  blocked if any numatb references it (`can_remove` already exists).
- **D. Model ops**: add (DAE import → SSBH+numatb → empty nuhlpb → integrate +
  count sync); replace (swap a model's SSBH set, re-synthesize containers);
  remove (delete folder + dedup-GC orphaned pool textures + decrement counts;
  shl mismatch → validation error, manual fix).
- **E. Validate + repack**: regenerate struct_json → `validate_unit_model_for_repack`
  gate (block on fail, esp. shl count) → `repack_fhm2d` (atomic). Roundtrip test.

## Existing surface to reuse / extend

- Rust: `fhm2d_stage.rs` (numdlb naming helpers, `consolidate_textures_by_numatb_refs`,
  `parse_numatb_texture_refs_by_role`), `unit_model_textures.rs` (inventory +
  add/remove — make folder/dedup-aware + rebuild SubFileStructure), `unit_model_validate.rs`
  (gate, already encodes grammar), `ssbh_dae_cmd.rs` (numatb + nuhlpb writers),
  `scene_session_commands.rs` (DAE import orchestration), `numatb_format.rs`
  (required-texture-path rules), `repack_fhm2d`.
- TS: `unitModelRepackService.ts`, `UnitModelEdit/*`, Scene Editor DAE import
  dialog + texture modals (`SceneTexturePool`, texture add/replace/preview).

## Verification

- Rust unit tests for the canonical regenerator (grammar shape, unk tags,
  container↔numatb synthesis) + dedup pool.
- **Roundtrip gate**: extract→regenerate→repack `0xABE08869` → byte-identical to
  source `.fhm2d`.
- Validator passes on regenerated unchanged + on edited (add/remove/replace) cases.
- Frontend: targeted tests for Model Manager ops + structure-regeneration service.

## Open implementation details (decide during build)

- Texture-container `unk5` variants (1 vs 2) — derive rule (per-numatb-variant?).
- Multiple-numatb-per-model ordering (`__maya__`, `__nust__`, `m001__nust__`).
- Model-name collisions → folder disambiguation.
- Orphaned-texture GC policy on model/texture remove (dedup refcount==0).
- Reorder-model is lower priority (shl entry order is validate-only, so reorder
  may surface a shl mismatch the user must resolve).
