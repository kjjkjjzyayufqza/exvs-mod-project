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
| Game folder | The dumped game root (`CUSA15006`, `GundamV`) or its `archives` folder. Only read, and never listed: every archive is opened by its hash (`archives/XX/HASH.bin`). | Data init, Known content |
| Workspace | A folder of its own that stores the mod files: extracted packages in route folders (e.g. `012list/character_list`) and every edit. It may not be the game folder, its `archives` folder, an `archives\XX` bucket, or a folder inside or around the game root; the page asks for a valid folder until one is set. | Workspace toolbar, Data init |
| Mod output folder | Mirrors the game root: repacks land at `archives/XX/HASH.bin`. Default `<workspace>/_out`. | Repack changes, Single page |

Every path input and dialog remembers its last choice in the app config
(`settings.json`, the same store and `dialogDefaultPath` map the EXVS2
Workspace uses), one entry per input, so it reopens where you left it.

Copy the `archives` folder of the mod output over the game root (or point an
emulator / file-redirect tool at it) to play the edited files.

## Workflow (mirrors OB)

The MBON and GVS workspace pages are built from the EXVS2 Workspace parts: the
toolbar shows only the game badge, the package tree sits on the left and the
grouped EXVS2 editor tabs fill the rest (no right info panel).

| OB | MBON / GVS | Where |
| --- | --- | --- |
| FHM2D Init | **Data init**: curated global tables and shared packs, per-item availability, one-click "extract all new items", batch selection, re-extract, history | Workspace toolbar |
| Workspace file tree | **Package tree**: the packages already in the workspace, by route folder; a yellow dot marks pending edits | Left pane |
| Structure editor | **Structure** tab: the open package's entries beside the entry inspector (textures, models, lists, hex) | Pack group |
| (list-driven init) | **Known content**: every archive the game's lists name, each found by its hash, with extract / open per row | Toolbar "Known content" |
| Single FHM2D | **MBON Single FHM** (`/MbonSingleFhm`), **GVS Single FHM2D** (`/GvsSingleFhm2d`): Unpack tab (source, preview, named folder, output, subfolder, overwrite, open in workspace) and Repack tab (package, pending changes, mod folder / beside / another file, verify) | Sidebar, toolbar "Single file" |
| Dirty packs | Every package keeps a change baseline (size, modification time, manifest digest) taken at extract and after each repack | Tree dots, Repack changes |
| Repack changes dialog | **Repack changes**: packages edited since their last extract / repack, written into the mod folder; untracked (older) packages listed separately; mark clean | Toolbar "Repack changes" |

## GVS editors

GVS has every EXVS2 Workspace tab (the outdated param editors excepted). Each
editor names its data by archive hash; when the archive is not in the
workspace yet, the editor offers to extract it from the game folder. Saving
writes into the package folder, and **Repack changes** writes the mod archive.

| Group | Tab | GVS data |
| --- | --- | --- |
| Pack | Structure | Any package |
| Pack | Effect | `006effect` pack of the selected unit: effects, textures, models (preview, replace, export) |
| Pack | Motion | `nuanmb` files of the selected unit's `002chara` pack |
| Pack | Camera | Common camera tables (`002chara/000common_000common_001`, members 27-30) |
| Character | ID table | `800etcetera/characteridtable`: unit id -> `002chara` / `006effect` / `090sound` archives |
| Character | Cost | Cost and base durability from each unit's character param; battle system tables (COST, TOTAL_COST, ...) |
| Character | Striker | `041cpm/foroutgamearmsparam_striker` |
| Character | List | `012list/character_list` (13 release-schedule versions the game picks by date; edits can go to all of them), unit detail list, pilot / boss / zako lists, GP unlock tables, title plates, command list |
| Character | Series, Navi | `012list/series_list`, `012list/navi_list` |
| Sound | Path | `800etcetera/raw_path_id` (voice banks, movies and images in the game root) and the intro movie table |
| Sound | Slot | `090sound` pilot voice table |
| Sound | BGM | `090sound` BGM table |
| Sound | HUD | The other `090sound` tables (cue mix, mix states) |
| Sound | Bank | `nus3bank` / `nus3audio` of the unit's `090sound` pack and the system sound banks |
| Stage | Card icons | `ms_ms_s`, `ms_ms_l`, `ms_vs_*` image packs of each character row |
| Stage | Stage icons | `stg_grd`, `stg_full`, `stg_vs_2` image packs of each stage row |
| Stage | Stages | `012list/stage_list` |
| Mission | Triad | `051mission` tables, rank / emblem tables, and the `outmission` briefings (VS2 BSFO layout) |
| MSC | MSC | EXVS2 MSC workspace on the unit pack (`0.bscex`, `1.cscex`, `2.dscex`) |
| Param | Param | EXVS2 typed param editor on the unit pack's param tables |

Unit tabs follow the unit picker (search by model number or unit id); opening
a unit package in the tree selects its unit. Table columns show the game's own
field name when its CRC-32 is known (upper case), the VS2 / Over Boost name of
the same field hash, or the hash / byte offset; archive hashes in a row link
to their package.

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
gvs_tool check-workspace <folder> --source-root <game folder>   # is it a valid mod workspace?
gvs_tool table-check <package folders...>                      # every GVS table rebuilds byte for byte
gvs_tool schema-check <workspace>                              # every editor table: rebuild + edit probe
gvs_tool units <workspace> --source-root <game folder>         # Character ID table units and their archives
```

## Not covered yet

* What the MBON unit archives listed by `SCharacterList` hold, and naming the
  stage FHM packs.
* GVS: names of the record-table words that no IDA reader or data pattern
  explains yet (stage list flags, title plate kinds, trial set columns, raw
  path ID floats, the `090sound` mix tables) and the version-2 `090sound`
  members 4-7.
* Research-gated items from the session note (stage placement, havok,
  skinning, new NUT textures, model import).
