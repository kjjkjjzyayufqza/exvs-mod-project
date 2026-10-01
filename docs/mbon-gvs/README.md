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
| Game folder | The dumped game root (`CUSA15006`, `GundamV`) or its `archives` folder. Only read. | Data init, Game files tab |
| Workspace | Extracted packages in route folders, e.g. `012list/character_list`. | Sources pane, Data init |
| Mod output folder | Mirrors the game root: repacks land at `archives/XX/HASH.bin`. Default `<workspace>/_out`. | Sources pane, Repack changes, Single page |

Copy the `archives` folder of the mod output over the game root (or point an
emulator / file-redirect tool at it) to play the edited files.

## Workflow (mirrors OB)

| OB | MBON / GVS | Where |
| --- | --- | --- |
| FHM2D Init | **Data init**: curated global tables and shared packs, per-item availability, one-click "extract all new items", batch selection, re-extract, history | Workspace masthead and sources pane |
| Single FHM2D | **MBON Single FHM** (`/MbonSingleFhm`), **GVS Single FHM2D** (`/GvsSingleFhm2d`): Unpack tab (source, preview, named folder, output, subfolder, overwrite, open in workspace) and Repack tab (package, pending changes, mod folder / beside / another file, verify) | Sidebar, masthead "Single file" |
| Workspace + dirty packs | Workspace page; every package keeps a change baseline (size, modification time, manifest digest) taken at extract and after each repack | Sources pane lamps, status bar |
| Repack changes dialog | **Repack changes**: packages edited since their last extract / repack, written into the mod folder; untracked (older) packages listed separately; mark clean | Sources pane hammer button |

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
written). Unknown archives extract into a folder named by their hash.

## CLI (agent / batch use)

Artifacts go under `tmp/` (see `.cursor/rules/fhm2d-extract-artifacts.mdc`).

```bash
# from src-tauri/, debug builds only
cargo build -p exvs_mbon -p exvs_gvs --bins
T=target/debug/gvs_tool        # or target/debug/mbon_tool
$T init-list <game folder> --workspace <workspace>
$T init <game folder> <workspace> --group lists 0x036B9E67   # or --all
$T unpack <archives/XX/HASH.bin> <workspace> [--name 012list/character_list] [--overwrite]
$T status <workspace>                                       # pending edits
$T repack <package folder> --mod-root <mod folder>          # archives/XX/HASH.bin
$T repack <package folder>                                  # beside the package folder
$T mark-clean <package folder>
```

## Not covered yet

* Naming MBON unit / stage FHM packs. The PS4 port ships VS2-era lists that
  reference thousands of archive hashes (`012list/character_list` DFD38C70,
  951 KB; `pilot_list` E6902738); parsing them needs the full files.
* Research-gated items from the session note (stage placement, havok, GVS
  MSC, skinning, new NUT textures, model import).
