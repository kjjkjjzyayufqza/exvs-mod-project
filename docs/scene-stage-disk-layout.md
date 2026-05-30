# Scene Stage Disk Layout & File Reorganization

This document explains what each Scene Editor stage operation writes to disk, how
it reorganizes the on-disk folder structure, and how `*_structure.json` is
produced. It answers the central question: **which operations physically
reorganize files on disk, and what happens to files you add by hand that are not
listed in the structure JSON?**

All examples use the real stage `0x16F73C97.fhm2d` (41 packable files, 13 shared
nutexb textures, models `001stage001_object_box01`, `base`, `sky`).

---

## 0. TL;DR — does each operation reorganize disk files?

| Operation | Mutates disk layout? | What it does to textures | Rewrites `*_structure.json`? |
|-----------|----------------------|--------------------------|------------------------------|
| **Extract .fhm2d → folder** | Creates the folder tree | Consolidates all nutexb into one content-level `0/0/textures/` | Writes a fresh structure JSON |
| **Open Stage Folder** | **Yes — consolidates** | Runs `restore_shared_textures`: moves numbered nutexb subdirs into `0/0/textures/`, deletes those subdirs + empty numbered subdirs | No (only URL-patches if it moved files) |
| **Save changes to folder** | **Yes — consolidates** | `restore_shared_textures` again (no-op if already consolidated) | Yes — `rebuild_..._with_shared_textures` (preserve, or full rebuild if disk changed) |
| **Repack → .fhm2d** | **Yes — redistributes** | `redistribute_stage_textures`: shared `textures/` → per-model `0/`(maya)+`1/`(nust), deletes shared folder | Yes — `rebuild_..._forced` (per-model layout) |

**The short version:** the editing operations (Extract / Open / Save) all converge
the folder on a single shared `textures/`. Only **Repack to .fhm2d** scatters
textures back into per-model subdirs. Every one of these operations rewrites or
patches the structure JSON, and a full rebuild **picks up new files you added by
hand** (see §7).

---

## 1. The two canonical layouts

There are exactly two on-disk shapes a stage folder can be in.

### 1a. Editing layout (consolidated) — produced by Extract / Open / Save

One shared `textures/` at the content level (`<pack>/0/0/textures`). Each model's
SSBH folder holds only the model files; it has **no** texture subdirs.

```
0x16F73C97/                         <- pack root
├── 0x16F73C97_structure.json       (sibling of the pack root)
├── 0x16F73C97_metadata.bin
└── 0/
    └── 0/                          <- content root
        ├── 001stage001_object_box01/
        │   ├── 0/                   <- SSBH files only (no nutexb here)
        │   │   ├── 001stage001_object_box01.numdlb
        │   │   ├── 001stage001_object_box01__maya__.numatb
        │   │   ├── 001stage001_object_box01__maya__.numshb
        │   │   ├── 001stage001_object_box01__maya__.nusktb
        │   │   ├── 001stage001_object_box01__nust__.numatb
        │   │   └── 001stage001_object_box01.jnttbl
        │   └── map_hit.hkt
        ├── base/  ...               (same shape)
        ├── sky/   ...
        ├── info/                    (fog/light/post_effect env nutexb + csv + hkt)
        └── textures/                <- the single shared model-texture folder
            ├── stage001_panel_01_diffuse.nutexb
            ├── stage001_panel_01_normal.nutexb
            └── ... (13 nutexb total)
```

### 1b. Packable layout (per-model) — produced by Repack to .fhm2d

No shared `textures/`. Each model's SSBH folder gets numbered texture subdirs:
`0/` for the maya material's textures, `1/` for the nust material's textures.

```
0/0/
├── 001stage001_object_box01/
│   └── 0/
│       ├── ...numdlb / numatb / numshb / nusktb / jnttbl
│       ├── 0/        <- maya textures (12 nutexb)
│       └── 1/        <- nust textures (12 nutexb)
├── base/001stage001_base/{0/=6 nutexb, 1/=6 nutexb}
├── sky/0/{0/=1 nutexb, 1/=0 nutexb (empty role still created)}
└── info/ ...
```

> The number of texture subdirs per model equals the number of material roles:
> `parse_numatb_texture_refs_by_role` always returns `[maya_refs, nust_refs]`, so a
> model with both materials always gets `0/` and `1/` (an unused role yields an
> empty subdir, e.g. sky's `1/`).

**Environment textures in `info/`** (`fog/`, `light/`, `post_effect/`) are *not*
model textures and stay in `info/` under **both** layouts.

---

## 2. Extract .fhm2d → folder

**Frontend:** `handleExtractFhm2d` (`src/page/SceneEdit/page.tsx`) → invoke
`extract_stage_fhm2d_to_folder`.
**Backend:** `extract_stage_fhm2d_to_folder` (`src-tauri/src/stage_commands.rs`) →
`extract_stage_fhm2d_to_folder_impl` then `restore_shared_textures`
(`src-tauri/src/format/fhm2d_stage.rs`).

What it writes to disk:

1. The full content tree under `<output>/<stem>/0/0/…` (decoded from the `.fhm2d`
   binary in memory).
2. **In-memory consolidation** (`consolidate_virtual_textures`): nutexb that live
   in per-model numbered subdirs are grouped into a single **content-level**
   `0/0/textures/` *before* writing to disk. This is why a freshly extracted folder
   is already in the editing layout (§1a).
3. `<stem>_structure.json` (via `write_stage_structure_json`) — the manifest, with
   texture `fileUrl`s pointing at `.\<stem>\0\0\textures\<name>.nutexb`.
4. `<stem>_metadata.bin` — original container metadata, kept for faithful repack.

`restore_shared_textures` runs immediately afterwards as a safety net; on a
just-extracted stage it is a **no-op** (`textures_collected = 0`) because the
in-memory step already consolidated everything.

**Example (`0x16F73C97`):** 41 files extracted, 13 nutexb consolidated into
`0/0/textures/`; model folders contain SSBH files only.

---

## 3. Open Stage Folder

**Frontend:** `handleOpenFolder` (`src/page/SceneEdit/page.tsx`) → invoke
`load_stage_bundle` with `stageRoot = <selected>\0\0`.
**Backend:** `load_stage_bundle` (`src-tauri/src/stage_commands.rs`) →
`restore_shared_textures(stage_root)` **then** `load_stage_bundle_impl`.

Open is **not read-only.** Before reading, it runs `restore_shared_textures`,
which:

- Scans each model's SSBH folder for **numbered, nutexb-only** subdirs.
- Copies their nutexb into the content-level `0/0/textures/` (dedup by filename).
- **Deletes** those numbered subdirs, and also deletes **empty** numbered subdirs.
- Patches matching `fileUrl`s in `<stem>_structure.json` to the `textures/` path.

So opening a folder **converges it to the editing layout (§1a).** A folder that was
left in per-model layout (e.g. just repacked) gets consolidated on open. A folder
already consolidated is unchanged (no-op).

Open does **not** rebuild the structure tree — it only patches URLs if it actually
moved files.

**Texture display:** the model loader (`load_model_in_subfolder` →
`ssbh_preview::resolve_nutexb_path`) resolves each texture referenced by a numatb
material, walking ancestor directories to find the shared `textures/`. Textures not
referenced by any material are not displayed (but remain on disk).

---

## 4. Save changes to folder

**Frontend:** `handleSaveFolder` → `executeSaveFolderPipeline`
(`src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts`).

Two texture-relevant phases (both skipped when saving as `.fhm2d`, see §5):

- **Phase 8 — consolidate** (`migrate` step): invoke `restore_shared_textures`.
  Same behavior as Open — converge to a single content-level `0/0/textures/`,
  remove numbered/empty texture subdirs. No-op on an already-consolidated folder.
- **Phase 9 — structure** (`structure` step): invoke
  `rebuild_stage_structure_json_with_shared_textures`. This rebuilds the JSON for
  the **shared-textures** layout. It first tries to *preserve* the original JSON;
  if it cannot, it does a **full rebuild from scratch** (see §6).

Net effect: Save leaves the folder in the editing layout and rewrites
`<stem>_structure.json` to match what is actually on disk — including any new files
you added (§7).

---

## 5. Repack → .fhm2d

**Frontend:** `executeSaveFhm2dPipeline`
(`src/page/SceneEdit/utils/sceneSaveFhm2dPipeline.ts`).

1. Calls `executeSaveFolderPipeline({ skipStructureRebuild: true })` — runs the
   delete/convert/CSV/HKT phases but **skips** the consolidate (Phase 8) and
   structure-rebuild (Phase 9) steps.
2. `redistribute_stage_textures` (`src-tauri/src/format/fhm2d_stage.rs`): reads the
   shared `0/0/textures/`, and for each model parses its numatb texture references
   *by role*, recreating per-model `0/` (maya) and `1/` (nust) and copying the
   referenced nutexb in. It then **deletes the shared `textures/`** and patches the
   `fileUrl`s to the per-model paths. (Phase 2 also cross-populates any textures a
   model references but is missing, from a global nutexb index.)
3. `rebuild_stage_structure_json_forced`: full rebuild for the **per-model**
   layout (no shared `textures/`).
4. `repackFolderToFhm2dFile`: packs the folder back into the `.fhm2d` binary using
   the structure JSON.

So Repack **does reorganize the folder** — it converts the editing layout into the
packable layout (§1b) and rewrites the JSON accordingly. After a repack, the folder
on disk is in per-model layout (a subsequent Open will re-consolidate it).

---

## 6. structure.json anatomy

`<stem>_structure.json` has two parts:

- **`SubFileData`** — the flat file list. Each entry has a `fileUrl` like
  `.\0x16F73C97\0\0\textures\stage001_panel_01_diffuse.nutexb` and a file type.
  Same-named nutexb across models are **deduplicated** to a single entry
  (`RebuildCollector::add_nutexb_dedup`).
- **`SubFileStructure`** — the directory tree as a flat sequence of `Folder` /
  `Item` / `EndMark` records. Notable flags:
  - `unk3 = 32` marks a **texture container** dir (numbered, nutexb-only).
  - `unk3 = 64` marks the **shared `textures/`** folder.

### Preserve vs. full rebuild

`rebuild_stage_structure_json_*` first calls `try_preserve_original_structure`:

1. Every file referenced by the original `SubFileData` must exist on disk. If any
   is **missing** → cannot preserve → **full rebuild**.
2. All packable files on disk are collected (`collect_packable_files_recursive`).
   If there are **extra** files not in `SubFileData`, they are tolerated **only** if
   every extra file is a byte-identical duplicate of a referenced file
   (`extra_files_are_link_materializations` compares `ext + size + CRC32`). A
   genuinely new file → cannot preserve → **full rebuild**.

A **full rebuild** (`rebuild_structure_from_scratch[_with_shared_textures]` →
`build_exvs_structure_tree` → recursive `build_exvs_directory`) walks the entire
disk tree and emits an entry for **every packable file present**, so new files are
included automatically.

> Packable files are those with a stage extension (`.nutexb`, `.numdlb`, `.numshb`,
> `.numatb`, `.nusktb`, `.jnttbl`, `.hkt`, `.spbin`, …). Files/dirs whose name
> starts with `_` or `.` are ignored.

---

## 7. Black-box scenarios

These are the two manual-edit cases and exactly what happens.

### Scenario A — open a consolidated stage, add 2 *new* nutexb folders to `modelA`, then **Save changes to folder**

The outcome depends on how you name the 2 folders.

**A1 — folders are numbered & nutexb-only** (e.g. `modelA/0/0/`, `modelA/0/1/` with
new `.nutexb`):

1. **Save Phase 8** `restore_shared_textures` treats them as texture containers:
   it **moves** the new nutexb into `0/0/textures/` (dedup by filename) and
   **deletes the 2 folders**. Empty numbered subdirs are removed too.
2. **Save Phase 9** rebuild: the new nutexb are not in the original `SubFileData`
   and are not byte-duplicates of existing files → `try_preserve` **fails** → **full
   rebuild with shared textures** → the new nutexb get fresh `SubFileData` entries
   pointing at `…\0\0\textures\…`.

   Result: your hand-added textures are **reorganized into the shared `textures/`
   folder** and **added to the JSON**. They become real stage textures.

**A2 — folders are non-numbered** (e.g. `modelA/myTex/` with new `.nutexb`):

1. **Phase 8** `restore_shared_textures` only processes all-digit folder names, so
   it **ignores** `myTex/` — the files stay where you put them.
2. **Phase 9** full rebuild still walks the whole tree and **includes** the new
   nutexb as part of the `modelA/myTex/` folder in the structure tree.

   Result: files are **not** moved, but they **are** added to the JSON at their
   current location. Whether the resulting structure repacks/loads as intended
   depends on the game's expectations for that folder shape.

> In both A1 and A2, because there are new files on disk, the Save **always**
> triggers a full structure rebuild rather than preserving the original JSON.

### Scenario B — freshly extracted folder, add 2 folders to `modelA` *before* opening, then **Open Stage Folder**

1. **Open** runs `restore_shared_textures` first:
   - **Numbered & nutexb-only** folders → their nutexb are **immediately
     consolidated** into `0/0/textures/` and the folders **deleted** (the folder is
     mutated the moment you open it).
   - **Non-numbered** folders → left untouched.
2. **Open does not rebuild the structure JSON** (it only patches `fileUrl`s if it
   moved files). So the new files do **not** enter `SubFileData` on open — they only
   get added on a later **Save** or **Repack** (which trigger a full rebuild as in
   Scenario A).
3. **Display:** only nutexb referenced by some numatb material are shown (resolved
   via ancestor-walk to `textures/`). New, unreferenced nutexb are physically
   present (possibly moved into `textures/`) but invisible in the viewport.

### Summary of the two questions

| Action | Numbered nutexb subdirs | Non-numbered folder |
|--------|-------------------------|---------------------|
| Open | consolidated into `textures/`, folders deleted; JSON URL-patched only | left in place; JSON untouched |
| Save | consolidated into `textures/`; **full rebuild** adds them to JSON | left in place; **full rebuild** adds them to JSON |

---

## 8. Running these black-box tests yourself

A standalone harness drives the exact backend functions (no UI, no `.fhm2d`
binary state) and audits the on-disk result of every path:

```
cargo run --manifest-path src-tauri/Cargo.toml \
  --bin stage_texture_roundtrip_check -- <input.fhm2d> [workdir]
```

It extracts, then exercises:
- **Path A** Save-to-folder (`restore_shared_textures` + `rebuild_..._with_shared_textures`)
- **Path B** Repack (`redistribute_stage_textures` + `rebuild_..._forced`)
- **Path C** re-consolidate a per-model folder (simulates Open/Save), and reports
  the `textures/` location, leftover subdirs, and dangling `fileUrl`s.

To reproduce the manual-edit scenarios, extract a stage, drop new `.nutexb` into a
model subdir (numbered vs non-numbered), then re-run the relevant path and inspect
the resulting tree and `<stem>_structure.json`.

> This bin is a debug/verification tool. If you don't want it compiled into the app
> build, it can be removed — the production pipeline does not depend on it.
