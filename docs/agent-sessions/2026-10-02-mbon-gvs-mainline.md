# MBON / GVS on main: plan and process

Status: landed on `main`. `mbon_gvs` is an ancestor. Follow-up edits stay in the PS4 crates, adapters, and composition root.
Decision record: `docs/adr/0010-mbon-gvs-isolated-workspaces.md`.
Earlier handoff: `docs/agent-sessions/2026-10-01-mbon-gvs-workspaces.md`.

This note is the plan, the process, the Over Boost capability inventory,
the non-impact analysis, the security review, the self-audit, and the
format deferrals for finishing MBON and GVS modding on `main`.

## Plan

1. Keep Over Boost domain code unchanged. MBON, GVS, and `ps4_common` stay
   in their own crates and `src/games/*` trees. The only OB-tree edits are
   composition-root wiring: workspace members, Tauri handler registration,
   router, sidebar, settings, and the full-bleed layout list.
2. Opening a folder is a backend operation. The frontend renders the
   returned index and does not scan, hash, or decide membership.
3. An empty directory is a valid empty index. An `init` file in that
   directory is the membership seed. A real PS4 `archives/` root has no
   loose file named `init`; membership then comes from the startup archive
   ids both executables reference (see Init contract). Never list every
   `.bin` as a fallback.
4. Each game gets backend operations for one model edit, one scene edit,
   one detail or texture edit, and one MSC inspect. Pages only render the
   payloads. A capability OB has that the PS4 formats cannot represent is
   a deferral in this note.
5. User-visible pages, dialogs, and both locale catalogs do not name
   descatal, BoostStudio, or `github.com/descatal`. Those credits stay in
   source comments and markdown. File-top notices keep the author and, for
   MBON research, the comment credit.
6. No game dumps, PKG contents, or secrets are committed. Samples stay
   under gitignored `tmp/` or `EXVS_MBON_SAMPLES` / `EXVS_GVS_SAMPLES`.

## Process

1. Inventory OB routes and commands before adding PS4 editors.
2. Merge `mbon_gvs` into `main`. Resolve conflicts by keeping OB logic and
   adding only registration.
3. Add `open_index` on the MBON and GVS backends, with tests for empty
   roots, init membership, path escape, and truncated init.
4. Remove research names from visible UI and locale catalogs. Update ADR
   0010 so the UI-credit sentence matches this goal. Leave comment and
   markdown credits in place. Restamp notices and run `--check`.
5. Add the four backend operations and render-only pages. Record deferrals
   here instead of routing them through OB modules.
6. Security self-audit, fix high findings, run the gating tests, and save
   logs under the goal scratch directory.

## Isolation rules

| Layer | Over Boost | MBON | GVS | Shared by MBON and GVS only |
| --- | --- | --- | --- | --- |
| Rust domain | `src-tauri/src/**` except `mbon/` and `gvs/` | `src-tauri/crates/mbon` | `src-tauri/crates/gvs` | `src-tauri/crates/ps4_common` |
| Tauri adapter | existing `*commands*` | `src-tauri/src/mbon/` | `src-tauri/src/gvs/` | none |
| Frontend | `src/page/**` | `src/games/mbon/` | `src/games/gvs/` | `src/games/ps4-common/` |

PS4 crates do not import OB modules. OB modules do not import the PS4
crates. `src-tauri/src/lib.rs` may register the adapters. MSC inspect in
the PS4 crates reads the public header layout; it does not call
`msc_toolchain`, so OB compile and decompile results stay untouched.

## OB capability inventory

Routes on `main` before this merge (`src/router/router.tsx`):

| Route | Page | What it edits |
| --- | --- | --- |
| `/` | EXVS2 Workspace | FHM2D packs, param and list tables, MSC workspace |
| `/SingleFhm2d` | Single FHM2D | One compressed OB archive |
| `/SceneEdit` | Scene Edit | Stage placement, textures, Havok preview, DAE |
| `/UnitModelEdit` | Unit Model Editor | Unit meshes, materials, skeleton |
| `/ResourceRegistry` | Resource Registry | OB resource catalog |
| `/MiscTools` | Misc Tools | nutexb, numatb, FBX rename, GVS-map-to-VS2 |
| `/Config` | Config | App settings |
| `/About` | About | Product info |
| `/MissionNodeEditor` | Mission Node Editor | OB mission graph |

Backend families that those pages call, all OB-only:

- Pack extract and repack: FHM2D (`fhm2d`, stage commands).
- Model: unit model commands over SSBH (`.numdlb`, `.numshb`, `.nusktb`,
  `.numatb`, `.nuanmb`).
- Map: stage placement, graphic params, texture slots, Havok overlay.
- Detail tables: `characterparam`, `speedparam`, `bulletparam`,
  `armsparam`, lists inside the workspace.
- MSC: `src-tauri/src/msc_toolchain` compile and decompile. Header is
  little-endian; opcode parameters are big-endian
  (`docs/msc-binary-format-spec.md`).
- Mission: mission transpiler and node editor. Not a PS4 archive feature.

GVS-map-to-VS2 under Misc Tools is an existing OB tool. This work does
not change it.

## Init contract

Selected roots:

- MBON archives: `E:\shadps4\PKG\CUSA15006\archives`
- GVS archives: `E:\shadps4\PKG\GundamV\archives`
- An empty folder the user picks

Both trees are `archives/<2 hex>/<8 hex>.bin` containers (`99 92 CD 90`),
matching the executable format string `/app0/archives/__/________.bin`.
There is no loose file named `init` in either tree.

Discovered seed, recorded here so membership is not invented as a second
catalog format:

- Both executables reference the same three kind-50 archive ids at
  startup: `1212B83E`, `2FBC5CED`, `C9D206AA`. The files exist at
  `12/1212B83E.bin`, `2F/2FBC5CED.bin`, and `C9/C9D206AA.bin` in both
  trees. Their payloads are NTXL texture containers (magic `F6 AD FE A3`
  unwrapped to `NTXL` by the game), not a plaintext list of every pack.
- Therefore a game archives root with no `init` file indexes exactly
  those startup archives that exist under the root. That is the
  init-derived index. It is not a scan of every `.bin`.

Explicit `init` file (tests and any authored workspace):

- Path: `<root>/init`, UTF-8.
- First line must be `EXVS-PS4-INIT 1` and the file must end in a newline.
- Each later non-empty line is one relative path using `/`.
- The returned index members are exactly those lines, in order.
- A missing newline, a short header, or a bad magic fails closed
  (truncated or hostile input).
- `..`, absolute paths, drive prefixes, NUL, and a resolved path outside
  the selected root fail closed, including symlink escapes.
- An empty directory with no `init` and no startup archives returns
  `{ seed: "empty", members: [] }`.

The Tauri commands `mbon_open_index` and `gvs_open_index` are the only
entry. Pages render `seed` and `members`.

## UI credit rule

ADR 0010 required a visible descatal / BoostStudio credit. This goal
overrides that UI sentence only. Comments, file-top notices, and this
markdown still name the author and, for MBON research, descatal /
BoostStudio. Locale catalogs and rendered text do not.

## Security checklist

- Path escape: join only after lexical rejection; canonicalize existing
  targets and require them to stay under the canonical root.
- Hostile `init`: reject absolute paths, `..`, NUL, and non-UTF-8.
- Truncated `init`: missing header or missing trailing newline is an error.
- Startup-archive ids are constants, not paths taken from the file tree.
- Open of a real archives root is read-only. No bytes from PKG trees are
  written into git.
- Parsers return errors on short buffers. They do not invent members.
- No secrets, licenses, or keystones are read into the index.

## OB non-impact analysis

The merge adds new crates and new frontend folders. OB parsers, the MSC
toolchain, model editors, map editors, and OB pages are not edited.
Registration in `lib.rs`, `Cargo.toml`, the router, the sidebar, settings,
and the full-bleed path list only adds MBON and GVS entries. PS4 code does
not call `msc_toolchain`, FHM2D stage save, or param pools. The existing
GVS-map-to-VS2 misc tool is left as it is. A diff that touches any other
OB path is a mistake and must be reverted.

## Format deferrals

These OB capabilities have no PS4 counterpart in the isolated crates.
They are not implemented by importing OB modules.

| OB capability | MBON | GVS |
| --- | --- | --- |
| Compressed FHM2D stage pack, placement CSV, sky slots | No stage pack. Scene edit is the PS4 placement document below. | Same. |
| Havok collision authoring and skin playback | Deferred. | Deferred. Members may be listed later as read-only. |
| DAE / FBX skinned stage import | Deferred. | Deferred. |
| OB param pools (`speedparam`, `characterparam`, `bulletparam`, `armsparam`) | No those containers. Detail edit is ListInfo. | Detail edit is a nutexb name rewrite. |
| Mission node editor and mission MSC | Deferred. | Deferred. |
| Resource registry of OB unit ids | Deferred. | Deferred. |
| NUANMB authoring, ATH bones, homemade motion clock | Deferred. | Animation files stay inspect-only. |
| Full MSC compile and decompile through `msc_toolchain` | Deferred so OB toolchain output cannot change. Inspect reads the shared header. | Same. GVS payloads may carry the same 8-byte magic. |
| ja-JP catalogs, release builds | Deferred. | Deferred. |

What shipped (the crate functions the tests call):

- Model, MBON `exvs_mbon::edit_model`: parse a NUD, add `1.0` to
  `bounding_sphere[0]`, write those four bytes back in the file's endian,
  reparse, and return the vertex count, the new X, and an OBJ from
  `Nud::to_obj`. A zero-polyset NUD is enough for the sphere edit.
- Model, GVS `exvs_gvs::edit_model`: `MeshData::read`, add `1.0` to the
  first `Vector3` position's X, `MeshData::write` the bytes back, and
  return the vertex count, the new X, those bytes, and an OBJ from
  `meshes_to_obj`. `triangle_mesh_bytes` builds the synthetic mesh with
  the same writer.
- Scene: `exvs_ps4_common::scene::apply_scene_edit`, re-exported as
  `edit_scene` on both crates. It upserts one `{name, x, y, z}` into a
  JSON document. A name containing `/`, `\`, `:`, NUL, or `..` is
  rejected. Non-finite coordinates are rejected. This is not an FHM2D
  stage pack.
- Detail, MBON `edit_detail`: `ListInfo::parse`, `ListInfo::set`,
  `ListInfo::to_bytes`, then read the cell back. GVS `edit_detail`:
  `Nutexb::parse`, replace `name`, `to_bytes`, then parse the name back.
- MSC: `exvs_ps4_common::msc_header::inspect_msc`, re-exported on both
  crates. It requires 0x30 bytes and magic `B2 AC BC BA E6 90 32 01`,
  then reads little-endian `entry_count` at 0x18 and `string_count` at
  0x24. A shorter buffer is an error. It does not call `msc_toolchain`.

## Security review

High findings and how they are closed:

1. Path escape. `check_relative` rejects `..`, absolute paths, drive
   prefixes, backslashes, and NUL before any join. `ensure_inside`
   canonicalizes a member that already exists and rejects it when the
   canonical path is not under the canonical root, which covers a symlink
   that leaves the folder. Tests: `path_outside_the_root_is_rejected`
   (`../outside.bin` and `C:/outside.bin`) and
   `escape_and_truncated_init_fail_closed` on both game crates. All return
   `Err` and do not yield a member list.
2. Truncated or hostile `init`. An empty file, a missing trailing newline,
   or a header other than `EXVS-PS4-INIT 1` is `Err`. The parser does not
   return the lines it already saw. Tests: `truncated_init_fails_closed`
   and the truncated half of `escape_and_truncated_init_fail_closed`.
   Non-UTF-8 is rejected. Files larger than 1 MiB are rejected.
3. No committed dumps or secrets. `open_index` on the real archives roots
   only `is_file`-checks the three startup paths and returns those relative
   paths. It does not copy payload bytes. The repository diff from
   pre-merge `2d17a73` contains no PKG, `eboot`, or sample blob.

Medium, accepted: a real archives root with no `init` file indexes the
three startup packs (both trees returned `startup-archives` with count 3),
not every asset. A full-tree scan is the forbidden fallback. Opening one
pack still goes through the existing extract command, which the caller
names by path. The open index does not walk the disk to invent that list.

## Self-audit

- Isolation holds. `git diff --name-only 2d17a73..HEAD` has no path outside
  the PS4 crates, `src/games/{mbon,gvs,ps4-common}`, the notice stamper,
  ADR 0010, the two session notes, and the composition-root files
  (`Cargo.toml`, `Cargo.lock`, `lib.rs`, router, sidebar, settings,
  full-bleed layout). `exvs_mbon`, `exvs_gvs`, and `exvs_ps4_common` are
  imported only from `src-tauri/src/mbon` and `src-tauri/src/gvs`.
  `lib.rs` registers those adapters and does not call them.
- OB non-impact holds for the same diff. No file under `src/page`,
  `src-tauri/src/format`, `src-tauri/src/msc_toolchain`, or the OB command
  modules changed. GVS-map-to-VS2 was not edited. MSC inspect does not call
  `compile_in_process` or `decompile_in_process`.
- Backend owns the index. `MbonSourcesPanel` and `GvsSourcesPanel` call
  `openIndex` and render `members`. They do not hash paths or filter the
  list. `/MbonModding` and `/GvsModding` render `MbonModdingReport` /
  `GvsModdingReport` from command results. Buttons call `editModel`,
  `editScene`, `editDetail`, and `inspectMsc` and store the returned
  fields.
- Visible catalogs. `src/games/mbon/i18n/{en-US,zh-CN}.json`,
  `src/games/gvs/i18n/{en-US,zh-CN}.json`, and
  `src/games/ps4-common/i18n/{en-US,zh-CN}.json` contain no `descatal`,
  `BoostStudio`, or `github.com/descatal`. `CreditsDialog` shows the
  author and this product's repository only. File-top notices still name
  kjjkjjzyayufqza and, on MBON sources, descatal / BoostStudio.
  `python tools/stamp_mbon_gvs_notices.py --check` exited 0
  (`ok: 122 file(s)`).
- Startup-archive ids are E2: both executables contain the immediates
  `1212B83E`, `2FBC5CED`, and `C9D206AA`, and both archive trees contain
  those three files. This is not an in-game behaviour claim. The kind-50
  payloads unwrap to `NTXL` and are not a plaintext list of every pack.
- MSC inspect is a header read. It does not say a script runs in game.
- `cargo check --lib --bins` reports no rustc warning on this crate. Cargo
  also prints a future-incompat note for third-party `binrw` and
  `proc-macro-error2`, pulled in by the existing `ssbh_data` dependency.
  That note is not a warning in our sources.
