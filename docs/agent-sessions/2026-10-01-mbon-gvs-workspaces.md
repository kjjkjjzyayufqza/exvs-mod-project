# MBON / GVS PS4 workspaces: handoff plan

Status: in progress. Branch `mbon_gvs` (session 1 also mirrored to
`claude/blissful-ramanujan-33cuu9`; session 2 pushed to `mbon_gvs` only).
Session 2 commits: `bda4dbe` (backend), `d2cedc8` (UI), then docs. No PR yet:
open one only if the owner asks. Decision record:
`docs/adr/0010-mbon-gvs-isolated-workspaces.md`. User guide:
`docs/mbon-gvs/README.md`.

## Goal (owner requests, kjjkjjzyayufqza)

1. Add PS4 **MBON** (FHM) and **GVS** (FHM2D-style, uncompressed) modding
   workspaces, isolated from Over Boost (OB): separate folders for frontend
   and backend, no change to OB code or logic.
2. Extraction and repack must work, including adding new files and updating
   existing ones. Develop against the real game files (TDD).
3. Every feature OB offers should exist for MBON and GVS where the formats
   allow it (self-audited plan).
4. Every MBON/GVS source keeps a varied, non-fixed provenance header crediting
   kjjkjjzyayufqza; nobody may replace an author name. MBON headers credit
   descatal / BoostStudio (https://github.com/descatal/BoostStudio) as the
   source of all MBON research. GVS headers state GVS is our own result,
   built on the VS2 research.
5. Polished, fast UI (repo skills `.cursor/skills/frontend-design`,
   `.cursor/skills/ui-ux-pro-max`).
6. Latest request: Settings must offer selectable MBON/GVS UI layouts (done),
   and the sidebar needs MBON and GVS versions of the OB tools: Scene Edit
   (map), Unit Model Editor and the others (**not done; main remaining work**).
7. Commit and push continuously.
8. Session 2 request: data init, single unpack and single repack for MBON
   and GVS, all following the OB approach, easy to use (**done**, see below).

## Rules that bite on this task

- Read the Agent contract in `AGENTS.md` first. Never strip or unify
  SourceNoticeCanary headers or the MBON/GVS notices.
- Never commit game material: `eboot.bin`, `sce_module`, samples, dumps. They
  stay under gitignored `tmp/`.
- OB stays untouched. Allowed shell touch points (already used): `src/router/*`,
  `src/components/app-sidebar.tsx`, `src/components/SettingsDialog.tsx`,
  `src/layout/Sidebar.tsx` (full-bleed paths; the PS4 pages no longer use it), `src-tauri/src/lib.rs` (mod +
  handler registration), `src-tauri/Cargo.toml` (workspace members).
- Rust: zero warnings on debug `cargo check --lib --bins` (from `src-tauri/`),
  debug builds only, delete unused code instead of `#[allow]`.
- No dev servers. No TODO/FIXME. Code and comments in English (Chinese only in
  `.rs` notice headers and zh-CN JSON).
- i18n: new keys in en-US and zh-CN only (ja-JP deferred). Parser/format field
  labels stay English in both locales (`src/i18n/TRANSLATION_STYLE.md`).
- Do not copy BoostStudio code (no license file); reimplement format knowledge
  and credit it.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  the session link (see previous commits). No model ids in commits.

## Architecture map

| Layer | Path | Notes |
|---|---|---|
| Shared PS4 crate | `src-tauri/crates/ps4_common` | `99 92 CD 90` archive read/write (canonical writer, 747/747 GVS samples byte-identical), texture codecs (`image_dds`), PNG/DDS, `files` (lists a package or sample folder; never a game folder), `packages::build_catalog` (hash-resolved catalog of named archives), `mesh_pack` (PSM1), `cache` (preview LRU), `provenance` (+ notice audit), `skeleton::PoseBone`, `batch::BatchReport` |
| MBON crate | `src-tauri/crates/mbon` | `fhm`, `ntp3`, `nud`, `vbn`, `list_info`, `kinds`, `package`, `inspect`, `content` (known content: name table + `SCharacterList` units), CLI `mbon_tool` |
| GVS crate | `src-tauri/crates/gvs` | `package` (named folders, manifest `gvs_package.json`), `naming`, `nutexb` (v1.1 + v1.2), `ssbh_view` (summaries, viewer meshes, `meshes_to_obj`), CLI `gvs_tool` |
| Tauri adapters | `src-tauri/src/mbon/commands.rs`, `src-tauri/src/gvs/commands.rs` | 25 `mbon_*` + 21 `gvs_*` commands, registered in `src-tauri/src/lib.rs`. Bulk data = raw `tauri::ipc::Response` |
| Shared UI kit | `src/games/ps4-common` | `workspace/` (EXVS2 Workspace layout: `Ps4Workspace`, `WorkspaceToolbar`, `WorkspacePanels`, `PackageTreePane`, `EditorTabNav`, `ContentIndexView`, `InfoPanel`, `StructureSplit`), `ps4-workspace.css` (scoped `.ps4-ws`, app theme tokens), `Hud` primitives, `SectionPanel`, `PathField`, `VirtualList`, `HexView`, `ImageStage`, lazy `MeshViewport`, `CreditsDialog`, `preferences.ts`, `workspaceStore.ts`, `usePackageActions`, `previewUrls`, `psm1.ts`, `i18n` |
| MBON UI | `src/games/mbon` | `MbonWorkspacePage` (+ components), namespace `mbon-workspace` |
| GVS UI | `src/games/gvs` | `GvsWorkspacePage` (+ components, `tree.ts`), namespace `gvs-workspace` |
| Notices | `tools/stamp_mbon_gvs_notices.py`, `tools/mbon_gvs_notice_pool.json` | Scopes: `src-tauri/crates/{mbon,gvs,ps4_common}`, `src-tauri/src/{mbon,gvs}`, `src/games/{mbon,gvs,ps4-common}` |

Routes today: `/MbonWorkspace`, `/GvsWorkspace` (`RouterItems` entries carry
`game: "mbon" | "gvs"`; Config/About carry `app: true`). `RouterItems` and
`SIDEBAR_ROUTE_URLS` must stay identical in order or the router throws.

Preferences (`src/games/ps4-common/preferences.ts`): sidebar mode
(grouped / switcher / flat / obOnly), inspector layout (auto / stacked /
split), density. The workspace layout and visual style choices are gone: the
pages follow the EXVS2 Workspace. Stored in `ps4-workspaces.json` key `preferences` with a
`localStorage` mirror `ps4-workspaces:preferences`; per-game paths use
`ps4-workspaces:<game>.{workspace,sourceRoot,packageDir}`.

## Session 2: OB workflow parity (done)

| OB | MBON / GVS | Code |
|---|---|---|
| FHM2D Init | Data init dialog | `ps4-common/components/InitDialog.tsx`, `*_init_catalog`, `exvs_ps4_common::packages::build_init_catalog` |
| Single FHM2D | `/MbonSingleFhm`, `/GvsSingleFhm2d` | `ps4-common/single/*`, `{mbon,gvs}/pages/*SinglePage.tsx`, `*_suggest_name`, `*_repack_targets`, `*_package_status` |
| Dirty packs + repack dialog | change baselines + Repack changes dialog | `exvs_ps4_common::workspace` (baseline), `RepackChangesDialog.tsx`, `*_workspace_status`, `*_mark_clean` |
| Name map + route folders | `crates/{mbon,gvs}/data/*_names.tsv`, packages in `route/name` | `tools/build_ps4_name_tables.py`, `exvs_ps4_common::names` |
| `obModPath` | per-game mod output folder (`archives/XX/HASH.bin`, default `<workspace>/_out`) | `workspaceStore.ts` `modRoot`, `effectiveModRoot` |

Shared UI talks to a game only through `Ps4GameAdapter`
(`ps4-common/gameAdapter.ts`; `useMbonAdapter`, `useGvsAdapter`). CLI parity:
`mbon_tool` / `gvs_tool` `init-list`, `init`, `unpack`, `status`,
`mark-clean`, `repack --mod-root`.

Evidence (2026-10-01): `cargo test -p exvs_ps4_common -p exvs_mbon -p exvs_gvs`
all green on the real samples (GVS samples 8 s, MBON 4 s); every GVS sample init
table extracts under its VS2 name and repacks byte-identically into
`mod/archives/XX/HASH.bin`; the MBON list pack lands in `common/list_info`.
CLI smoke test on a sample tree under `tmp/mbon_gvs/cli-smoke`. `cargo check
--lib --bins` only the known OB GBK warning. `tsc` clean; vitest 16 files /
59 tests green. Harness screenshots (`tmp/ui-harness/shots`) checked in zh-CN
dark and en-US light.

## Session 3: hardening and modern UI (done)

* Release builds never embed a GitHub token (`read_updater_github_token` is
  runtime only; the CI fallback passes none). The app crate is
  `publish = false`.
* PS4 archive index rejects counts that do not fit the metadata, overflowing
  body ranges, folder nesting deeper than 64 and reads past the file end
  (tests in `exvs_ps4_common::archive`). Repack targets sanitize the manifest
  name; baselines ignore manifest paths that leave the package.
* Name tables carry a credit header compiled into the app; the two MBON / GVS
  Python tools are stamped too (136 files).
* UI: one `standard` visual style (cards on a canvas, 10/7/5px radius scale,
  segmented tabs, filled fields, soft state badges, sticky group headers,
  radio cards, member tables) plus `contrast`. Kind chips are neutral; colour
  and dots only mark state. No staggered entrance. Masthead credits unchanged.

## Session 4: EXVS2 Workspace parity, lists instead of scans (done)

Owner request: MBON / GVS must look and work like the OB EXVS2 Workspace, with
the game title clearly shown; no "Game files" tab and no scanning of any kind;
everything comes from the init list and the lists the game ships.

* Rust: `exvs_ps4_common::scan` and `*_scan_folder` removed; `files::list_files`
  only walks package or sample folders. `packages::build_catalog` resolves any
  set of named archives by hash. `exvs_mbon::content` reads the extracted
  `SCharacterList` (list pack `EB3A9691`; unit code at `0x08`, unit archive
  hash at `0x7C`) and adds the units to the name table (`unit/<code>`, source
  `scharacterlist`). Commands `mbon_content_index` / `gvs_content_index`; CLI
  `index`. Real data: 63 names + 183 units for MBON.
* UI: `src/games/ps4-common/workspace/` reproduces the EXVS2 Workspace
  (toolbar with the game code and title, package tree, grouped editor tabs
  PACKAGE / INDEX, collapsible info panel). Tabs: Structure (package editor +
  inspector) and Known content (list-based index with extract / open). Single
  pages follow the Single FHM2D layout (`SectionPanel` blocks, flow strip).
  Dialogs use the stock shadcn frame. The `.ps4-*` tokens map onto the app
  theme; only "Repack changes" is a primary button on the page.
* Removed: `SourcesPanel`, `WorkspaceFrame`, `PaneLayout`, `Ps4Shell`,
  `StatusBar`, `PathPicker`, the activity log (toasts show progress), the
  workspace-layout / visual-style preferences.
* `FilePathInput` is not used by PS4 code: its config store imports OB pages.
  `PathField` gives the same look without that dependency.

## Settled findings (do not rediscover)

- MBON PS4 and GVS reuse the VS2-era path hashes for shared global tables
  (`DFD38C70` character_list, `036B9E67` characteridtable, `CE74091E`
  stage_list, `F7B91DE7` outmission, ...). The OB name map names 47 MBON and
  2126 GVS archives (all 488 GVS `SHLL` unit shell packs). MBON's own FHM data
  uses other hashes; 8 of BoostStudio's 16 `ExvsCommonAssets` exist in the
  base dump (list info, unit cost, projectiles, camera, common effects and
  particles, cosmetics, text); the sprite / hitbox / ammo ones are referenced
  by `SCharacterList` but absent from the base dump (update / DLC).
- MBON `FBD1AED6` is `FSTL`: count + sorted list of the 3581 FHM hashes, no
  names. MBON `SCharacterList` (164-byte rows) has one archive hash per unit
  at offset 124 (a small FHM). Unit asset naming for MBON is still open: the
  VS2-era `012list/character_list` (951 KB, not in the samples) and
  `pilot_list` reference thousands of archive hashes.

- PS4 container: header 0x30, metadata in the first 64 KiB page, type groups,
  logical vs packed order, page-straddle rule, group totals aligned to 16
  except the last. MBON samples have the 0x10000 preamble stripped.
- MBON FHM (big endian): image entries (load type 1) are written after all
  other data; aliases share (offset, size); nested FHM = load type 3, size 0.
- NTP3: BE header, linear LE DXT; format 0 BC1, 1 BC2, 2 BC3, 14 ARGB8; GIDX id
  links textures to NUD materials.
- VBN: root parent `0x0FFFFFFF`; garbage padding preserved. The **first** matrix
  block (BoostStudio `inverse_bind_matrices`, our field `inverse_bind`) is the
  world bind pose in row-vector form (translation = last row); it equals the
  local chain with rotation X, then Y, then Z (verified on all 20 sample rigs).
  `Vbn::pose()` uses it.
- GVS: VS2 type-id table; nutexb v1.2 footer 0x70, v1.1 footer 0x86C (table at
  +0x60); BC7 lenient decode pads a missing last block row; swizzled
  (`swizzle != 0`) textures are not decodable. MSC magic same as EXVS2;
  triple named `0.bscex / 1.cscex / 2.dscex`. SSBH `Matrix4x4` is column based
  (translation in `col4`); ssbh_data composes `parent * child`.
- Never nest two serde enums tagged `"type"` as a newtype variant (fixed in
  GVS `Inspection::Ssbh { summary }`).

## Verification commands

Fresh Linux cloud sessions first need `apt-get install libwebkit2gtk-4.1-dev
libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
libayatana-appindicator3-dev librsvg2-dev` (for `cargo check --lib --bins`)
and `pnpm install --frozen-lockfile` (for `tsc` / `vitest`).

```bash
# Rust (from src-tauri/)
cargo test -p exvs_ps4_common -p exvs_mbon -p exvs_gvs
cargo check --lib --bins            # only allowed warning: OB src/commands.rs:15 (GBK, Windows-only use)
# Notices
python3 tools/stamp_mbon_gvs_notices.py --write && python3 tools/stamp_mbon_gvs_notices.py --check
# Frontend (repo root)
node_modules/.bin/tsc --noEmit -p tsconfig.json
node_modules/.bin/vitest run src/games src/page/MissionNodeEditor/page.test.tsx src/layout src/router
```

Evidence at handoff: 3 crates all green (sample tests ran on real files),
`tsc` clean, 11 vitest files / 43 tests green. Known pre-existing failure
outside scope: `src/i18n/i18n.test.ts` (OB `test-triad-route` zh-CN lacks `_one`
plural keys; fails on a clean tree; do not fix OB).

## Sample data (needed for Rust sample tests)

Download the owner's archive `https://dogpan.com/f/GZGBfA/mbon_gvs_file.7z` into
`tmp/mbon_gvs/` (the cloud environment needs network access to dogpan.com;
`7z` comes from `apt-get install p7zip-full`), then `7z x mbon_gvs_file.7z`,
`unzip -q mbon.zip -d mbon`, `unzip -q gvs.zip -d gvs`. Besides the samples the
zips hold `catalog-archives.tsv` (every archive of each dump) that
`tools/build_ps4_name_tables.py` reads. MBON samples have the 0x10000 PS4
preamble stripped (raw payloads); GVS samples are full containers. Tests read `tmp/mbon_gvs/{mbon,gvs}/samples` or
`EXVS_MBON_SAMPLES` / `EXVS_GVS_SAMPLES`. **They skip silently when samples are
missing**, so check that they take seconds rather than milliseconds.
Useful categories: MBON `model_nud_fhm`, `skeleton_vbn_fhm`, `texture_nut`,
`table`; GVS `model_ssbh`, `texture_nutexb`, `table`.

## Remaining plan (in order)

Session 2 delivered the single-file pages of steps 3 and 4 (`/MbonSingleFhm`,
`/GvsSingleFhm2d`) with a different scope than the table below (unpack /
repack tabs instead of a tree browser). The rest of the plan stands.

### Step 1: backend for the tool pages

Add a crate function, a Tauri command (registered in `lib.rs`), unit or sample
tests, and CLI parity. Keep big data out of JSON.

MBON (`crates/mbon`, `src-tauri/src/mbon/commands.rs`):
- `mbon_skeleton_pose(path) -> Vec<PoseBone>` via `Vbn::pose`. Sample test: for
  every VBN in `skeleton_vbn_fhm`, `pose()` and `pose_from_locals()` agree within 1e-3.
- `inspect::summaries(&Ntp3) -> Vec<TextureSummary>` (public); replace the
  `to_bytes -> inspect` round trip in `commands.rs::summaries`.
- `textures::list_textures(package) -> Vec<{path, relative, texture: TextureSummary}>`
  for every `.nut` file -> `mbon_list_textures(package)`.
- `textures::export_textures(package, output, Png|Dds) -> BatchReport` with
  mirrored names `<rel_dir>/<stem>.<index:02>.<GIDX:08X>.<ext>`, rayon per NUT
  -> `mbon_export_textures(package, output, format)`.
- `textures::import_textures(package, input, layout?) -> BatchReport`: parse the
  same name pattern, group per NUT, write each NUT once; skip with reasons
  -> `mbon_import_textures`; invalidate the preview cache prefix of the package.
- `tables::list_tables(workspace) -> Vec<{packageDir, packageName, path, relative,
  name, count, recordSize, structuralEdits}>` (sniff ListInfo heads with rayon)
  -> `mbon_list_tables(workspace)`.
- `inspect::overview(path) -> {size, container?: {kind, fileCount, depth,
  canonical}, payloads: [{index, typeId?, size, kind, label, fhm?: FhmListing[]}]}`
  -> `mbon_file_overview(path)`.

GVS (`crates/gvs`, `src-tauri/src/gvs/commands.rs`):
- `ssbh_view::skeleton_pose(bytes) -> Vec<PoseBone>` from the file's
  `world_transforms` (`col4` = translation). Sample test against
  `SkelData::calculate_world_transform` (`w_axis`) -> `gvs_skeleton_pose(path)`.
- `textures::list_textures(package)` (`{path, relative, info?, error?}`),
  `export_textures` (`<rel without .nutexb>.<ext>`), `import_textures`
  (`<rel>.png|dds` -> `<rel>.nutexb`) -> `gvs_list_textures`,
  `gvs_export_textures`, `gvs_import_textures`.

CLI: `mbon_tool pose|tex-export-all|tex-import-all|tables|overview`,
`gvs_tool pose|tex-export-all|tex-import-all`.

### Step 2: shared scene kit (`src/games/ps4-common`)

- `SceneViewport`: generalise `MeshViewport` to `models: {id, name, meshes,
  visible}[]`, an optional `skeleton: PoseBone[]` overlay (line segments
  bone to parent plus points), model isolate / highlight, progressive loading
  (two payloads at a time) with a progress readout. Keep it lazy-loaded.
- `ToolFrame`: `Ps4Shell` plus `PaneLayout` with a per-tool `storageId`; honour
  the density, style and inspector preferences.
- `PackagePicker`: choose a package of the game's workspace (reuse the store
  and `listPackages`).
- `TextureGrid`: virtualized thumbnail grid (`@tanstack/react-virtual` rows),
  lazy previews (`previewUrl` + `useInView`), format and size filters, selection.

### Step 3: MBON tool pages (`src/games/mbon/pages/...`)

Add each to `RouterItems` (`game: "mbon"`, grouped after `/MbonWorkspace`) and to
`SIDEBAR_ROUTE_URLS` in the same order; add the path to the full-bleed list in
`src/layout/Sidebar.tsx`. Titles mirror OB names.

| Route | Title | Content |
|---|---|---|
| `/MbonSingleFhm` | MBON Single FHM | pick a file -> `mbon_file_overview` tree (container files, FHM entries, aliases); Extract to folder (`mbon_extract`), Open in workspace (set store, navigate), Repack folder (`mbon_repack` + save dialog), Verify |
| `/MbonSceneEdit` | MBON Scene Edit | PackagePicker; outliner (NUD models, textures, missing GIDX ids); SceneViewport with all NUDs and GIDX texture binding; properties (`mbon_inspect` stats, replace model, OBJ export); textures tab (TextureGrid + existing nut preview/import/export); verify / repack |
| `/MbonUnitModel` | MBON Unit Model Editor | as Scene Edit plus VBN skeleton overlay (`mbon_skeleton_pose`), bone list, per-model visibility, texture management |
| `/MbonTextureTools` | MBON Texture Tools | TextureGrid for a package; batch export / import with a BatchReport table |
| `/MbonTables` | MBON Tables | `mbon_list_tables(workspace)` virtualized list + reuse `MbonListEditor` |

### Step 4: GVS tool pages (`src/games/gvs/pages/...`)

| Route | Title | Content |
|---|---|---|
| `/GvsSingleFhm2d` | GVS Single FHM2D | `gvs_inspect` archive members (named) + extract / repack / verify |
| `/GvsSceneEdit` | GVS Scene Edit | numshb models (`gvs_model_mesh` each, sibling numdlb/numatb bind textures), TextureGrid (`gvs_list_textures`), havok members listed read-only |
| `/GvsUnitModel` | GVS Unit Model Editor | plus nusktb skeleton (`gvs_skeleton_pose`), nuanmb list (`gvs_ssbh_summary`), numatb material table |
| `/GvsTextureTools` | GVS Texture Tools | batch export / import |

### Step 5: docs and wrap-up

`docs/mbon-gvs/README.md` (architecture, formats, credits, CLI usage), a short
`AGENTS.md` pointer (ADR 0010, this note, stamper command), update ADR 0010 when
routes change, update this note's status.

### Research-gated (ask the owner before starting)

MBON stage placement / collision data, GVS havok collision editing, GVS MSC
(reusing the OB toolchain would couple OB code), animation playback (skinning),
adding new NUT textures with GIDX allocation, DAE/FBX model import.

## Process per step

1. Write the crate code with unit tests first; add sample tests when real data
   decides behaviour.
2. Add commands, register them in `lib.rs`, add the TS bindings in `api.ts` and
   DTOs in `types.ts` (field names = serde camelCase; command args are camelCase,
   for example `maxSide`, `folderPath`, `typeId`, `fileIndex`, `nodePath`;
   `package` is passed as `{ package: dir }`).
3. Build the UI from the shared kit. All visible strings go through i18n
   (`mbon-workspace`, `gvs-workspace`, shared `ps4-workspace`); plural keys
   need `_one` and `_other` in **both** locales (parity test).
4. Add a page smoke test like `src/games/mbon/MbonWorkspacePage.test.tsx`:
   mock `@tauri-apps/*`, `installBrowserStubs()` from
   `ps4-common/testHarness.ts`, and reset the zustand store in each test.
5. Stamp notices, run the verification commands, visually check (recipe
   below), commit, push both branches.

## Visual QA harness (not in git; rebuild under `tmp/ui-harness/`)

- `vite.config.ts`: `root` = harness dir, plugins react + tailwind; aliases
  `@tauri-apps/api/core|plugin-store|plugin-dialog|plugin-opener|plugin-clipboard-manager`
  -> local mock files, `@` -> `<repo>/src`.
- `harness.css`: `@import "../../src/App.css"; @import "../../src/styles.css";
  @source "../../src/games"; @source "../../src/components/ui";`.
- `main.tsx`: read `?page=mbon|gvs|mbonSingle|gvsSingle|ob&open=1&theme=dark&lang=zh-CN`,
  seed the `ps4-workspaces:*` localStorage keys, dynamic-import the page, render
  inside `I18nextProvider` with `appI18n` and a `p-4` main like the app layout
  (`ob` = the EXVS2 Workspace reference; needs `KeepAliveProvider`).
- `fixtures.ts`: synthetic data only (PNG via `OffscreenCanvas`, PSM1 built
  from three.js geometry).
- Build: `node_modules/.bin/vite build --config tmp/ui-harness/vite.config.ts`.
- Shoot: global Playwright (`/opt/node22/lib/node_modules/playwright`), Chromium
  args `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`,
  serve `dist/` through `page.route("http://harness.local/**")` (no server
  process), click rows, `page.screenshot`.

## Gotchas

- `useAsync` keeps old data while reloading; pages compare
  `data.dir === packageDir` before showing a package.
- Workspace / preference `hydrate()` only fills values the user has not
  changed since the store was created.
- react-resizable-panels v4: numeric sizes are pixels; use percentage strings.
- Opener: `openUrl` is allowed only for `github.com/kjjkjjzyayufqza/*`
  (BoostStudio links get a copy button); `openPath` works for any path.
- Portaled dialogs that use `.ps4-*` parts need `className="ps4-ws ..."` to
  get the scoped styles; dialogs built from shadcn parts only do not.
- Radix tabs switch on mouse down: tests use `fireEvent.mouseDown` on a tab.
- Radix dialogs focus and select the first input; the init and repack dialogs
  focus the dialog itself instead (`onOpenAutoFocus`).
- The OB `MiscTools/gvs-map-to-vs2` tool ports GVS maps to VS2; it is OB code,
  leave it alone and do not duplicate it.
