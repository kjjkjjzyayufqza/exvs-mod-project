# MBON / GVS (PS4) modding workflow

The PS4 **MBON** (Mobile Suit Gundam Extreme Vs. Maxi Boost ON, CUSA15006) and
**GVS** (Gundam Versus, CUSA08379) workspaces follow the Over Boost workflow:
data init, single-archive unpack / repack, edit in a workspace, repack the
changed packages into a mod folder. They are isolated from the OB code (see
`docs/adr/0010-mbon-gvs-isolated-workspaces.md`).

Credits: every MBON format finding comes from descatal's
[BoostStudio](https://github.com/descatal/BoostStudio) (reimplemented, not
copied). GVS support is kjjkjjzyayufqza's own result, built on this project's
VS2 / Over Boost research. Tooling: kjjkjjzyayufqza.

## Folders

| Folder | What it is | Set in |
| --- | --- | --- |
| Game folder | The dumped game root (`CUSA15006`, `GundamV`) or its `archives` folder. Only read, and never listed: every archive is opened by its hash (`archives/XX/HASH.bin`). | Data init, Known content tab |
| Workspace | Extracted packages in route folders, e.g. `012list/character_list`. | Workspace toolbar, Data init |
| Mod output folder | Mirrors the game root: repacks land at `archives/XX/HASH.bin`. Default `<workspace>/_out`. | Repack changes, Single page |

Copy the `archives` folder of the mod output over the game root (or point an
emulator / file-redirect tool at it) to play the edited files.

## Workflow (mirrors OB)

The MBON and GVS workspace pages use the EXVS2 Workspace layout: a toolbar led
by the game title (`MBON Maxi Boost ON workspace`, `GVS Gundam Versus
workspace`), the package tree on the left, grouped editor tabs in the middle
and a collapsible info panel on the right.

| OB | MBON / GVS | Where |
| --- | --- | --- |
| FHM2D Init | **Data init**: curated global tables and shared packs, per-item availability, one-click "extract all new items", batch selection, re-extract, history | Workspace toolbar |
| Workspace file tree | **Package tree**: the packages already in the workspace, by route folder; a yellow dot marks pending edits | Left pane |
| Structure editor | **Structure** tab: the open package's entries beside the entry inspector (textures, models, lists, hex) | Editor tabs, PACKAGE group |
| (list-driven init) | **Known content** tab: every archive the game's lists name, each found by its hash, with extract / open per row | Editor tabs, INDEX group |
| Single FHM2D | **MBON Single FHM** (`/MbonSingleFhm`), **GVS Single FHM2D** (`/GvsSingleFhm2d`): Unpack tab (source, preview, named folder, output, subfolder, overwrite, open in workspace) and Repack tab (package, pending changes, mod folder / beside / another file, verify) | Sidebar, toolbar "Single file" |
| Dirty packs | Every package keeps a change baseline (size, modification time, manifest digest) taken at extract and after each repack | Tree dots, info panel |
| Repack changes dialog | **Repack changes**: packages edited since their last extract / repack, written into the mod folder; untracked (older) packages listed separately; mark clean | Toolbar "Repack changes" |

## No scanning

Nothing enumerates the game folder. Everything known comes from lists:

* **Data init** extracts the curated rows of the name table (the init list).
* **Known content** indexes every row of the name table and, for MBON, the
  units of the extracted `SCharacterList` (list pack `EB3A9691`, the
  BoostStudio list info): each record holds the unit code (`0x08`) and the
  unit archive hash (`0x7C`). Run Data init for List Info first; the units then
  appear under `unit/`.
* Each listed archive is resolved by hash to `archives/XX/HASH.bin`, so a
  missing file is reported as missing instead of being searched for.
* The single page opens one file the user picks.

Package folders hold their manifest (`mbon_package.json` / `gvs_package.json`)
and change baseline (`*.state.json`). The manifest, not the file names, drives
the rebuild; untouched packages rebuild byte for byte.

## Names

Archives carry hashes only. Each game crate embeds a generated name table:

* `src-tauri/crates/mbon/data/mbon_names.tsv`: the 16 BoostStudio
  `ExvsCommonAssets` hashes (list info `EB3A9691`, unit cost, projectiles,
  hitboxes, ammo, camera, common effects, cosmetics, text, sprites) under
  `common/`, plus the VS2-era tables the PS4 port shares with VS2 / OB
  (`012list/*`, `800etcetera/*`, `051mission/*`, `010localizedtext/*`, ...).
  MBON's own FHM data (units, stages) keeps hash names.
* `src-tauri/crates/gvs/data/gvs_names.tsv`: 2126 names. GVS uses the VS2 path
  hashes for global tables, every unit shell pack (`002chara/<unit>`), effects,
  GUI images and sound banks.

Rows with a group are the data-init list. Regenerate both tables with
`python tools/build_ps4_name_tables.py` (needs the OB name map and the local
archive catalogs of the game dumps under `tmp/`; only hashes and names are
written). Each table starts with `#` credit lines (author, product, license);
they are compiled into the app with the table and the provenance tests fail
without them. Unknown archives extract into a folder named by their hash.

## CLI (agent / batch use)

Artifacts go under `tmp/` (see `.cursor/rules/fhm2d-extract-artifacts.mdc`).

```bash
# from src-tauri/, debug builds only
cargo build -p exvs_mbon -p exvs_gvs --bins
T=target/debug/gvs_tool        # or target/debug/mbon_tool
$T init-list <game folder> --workspace <workspace>
$T init <game folder> <workspace> --group lists 0x036B9E67   # or --all
$T index <game folder> --workspace <workspace>               # known content from the lists
$T unpack <archives/XX/HASH.bin> <workspace> [--name 012list/character_list] [--overwrite]
$T status <workspace>                                       # pending edits
$T repack <package folder> --mod-root <mod folder>          # archives/XX/HASH.bin
$T repack <package folder>                                  # beside the package folder
$T mark-clean <package folder>
```

## Not covered yet

* What the MBON unit archives listed by `SCharacterList` hold, and naming the
  stage FHM packs. The PS4 port also ships VS2-era lists that reference
  thousands of archive hashes (`012list/character_list` DFD38C70, 951 KB;
  `pilot_list` E6902738); indexing them needs their record layouts.
* Research-gated items from the session note (stage placement, havok, GVS
  MSC, skinning, new NUT textures, model import).
