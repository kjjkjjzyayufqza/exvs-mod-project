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

What is implemented instead:

- Model: MBON reads a NUD and returns an OBJ plus the first vertex shifted
  by +1 on X. GVS reads an SSBH summary and returns an OBJ from viewer
  meshes when bytes are a mesh, otherwise the summary counts.
- Scene: both backends apply one placement (`name`, `x`, `y`, `z`) onto a
  backend JSON document. Names cannot contain path separators.
- Detail: MBON `ListInfo::set` then `to_bytes`. GVS sets `Nutexb.name`
  then `to_bytes`.
- MSC: both backends parse the 0x30 header (magic, version word, entry
  count, string count) and reject a short buffer.

## Security review

High findings to close in this change:

1. Index membership must not follow `..` or a symlink out of the root.
2. A truncated `init` must not return a partial member list.
3. Real PKG bytes must not be copied into the repository.

No other high finding is open once the tests for those three cases pass.
Medium: the startup-archive index is three packs, not every asset. That is
intentional; a full-tree scan is the forbidden fallback. Operators open a
single pack through the existing extract commands by path. The open index
does not grant that by walking the disk.

## Self-audit

- Isolation: new behavior lives under the PS4 crates, adapters, and
  `src/games`. OB domain files are not on the edit list.
- Backend owns membership, model, scene, detail, and MSC inspect. The new
  pages render command results.
- Visible strings in `en-US` and `zh-CN` for MBON, GVS, and the shared PS4
  catalog do not include the research names.
- Comment notices still do, and `stamp_mbon_gvs_notices.py --check` must
  pass.
- Evidence grade for the startup archive ids is E2 (both executables
  contain the immediates and both trees contain the files). It is not an
  in-game behavior claim.
- MSC inspect is a header read, not a claim that a script plays in game.
