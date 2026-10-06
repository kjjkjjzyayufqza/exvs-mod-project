# GVS workspace: complete editor set (plan and process)

Status: implemented (2026-10-04); open research items under Remaining.
Owner request (kjjkjjzyayufqza): implement the whole GVS workspace with the
EXVS2 Workspace editor set (Pack: Structure / Effect / Motion / Camera;
Character: ID table / Cost / Striker / List / Series / Navi; Sound: Path /
Slot / BGM / HUD / Bank; Stage: Card icons / Stage icons / Stages; Mission:
Triad; MSC: MSC; Param: Param). Game data: `E:\shadps4\PKG\GundamV\archives`
(256 sub folders `00`..`FF`, 5273 archives; the owner's stored GVS workspace
was `archives\00`). UI/UX and operation style follow the EXVS2 Workspace;
there must not be two separate UI systems. The right info panel goes away in
the EXVS2, GVS and MBON workspaces. The top-left corner shows only the game
badge (no "Format research ..." credit line, no "Gundam Versus workspace"
title). Research with ida-pro-mcp on the GVS eboot. No TDD and no new test
code.

Added by the owner during the task (same goal, for ease of use):

* The GVS workspace is a separately chosen new folder that stores the mod
  files (extracted packages and edits). It is never the game folder
  (`archives`, a `XX` bucket such as `archives\00`, or the game root).
* Every path in the GVS workspace (workspace, game folder, mod output, every
  file input and every open / save dialog) remembers its last choice in the
  Tauri project config, the way the EXVS2 Workspace does (`settings.json`,
  value key plus the `dialogDefaultPath` map), each under its own key, so it
  reopens at that path.

Decision record: ADR 0010 (amended by this task, section 7).

## Plan

### Decisions

1. **One UI system.** The GVS page is built from the EXVS2 Workspace parts:
   the grouped editor tab bar (`MainViewTabNav`, now driven by a tab list
   prop), the resizable split (`TestEditorWorkspacePanels`, now two panes),
   and the same list + detail editor pattern. Tab ids, groups, short names and
   order are the EXVS2 ones.
2. **No right panel anywhere.** `TestEditorWorkspacePanels` and the PS4
   `WorkspacePanels` drop the info column. Facts that lived there move into
   the editors (status rows) or the tree.
3. **Toolbar.** The PS4 toolbar shows the game badge only; title and credit
   text are removed from the page and the locale catalogs keep only what is
   still rendered.
4. **Reuse OB where the bytes are the same.** GVS unit packs carry the VS2
   param tables. OB parsers read and rebuild them byte-identically (checked
   on real data, see Evidence). The Param tab reuses `TypedParamDataPanel`
   and `parse_typed_param_file` / `build_typed_param_file`. The MSC tab reuses
   `MscWorkspaceView` on the unit package folder (`0.bscex`, `1.cscex`,
   `2.dscex` sit at the package root).
5. **GVS table engine.** GVS keeps two table families:
   * `CDABB8A9` field tables (sorted field hashes, 12-byte descriptors,
     sorted row ids, fixed rows, string pool),
   * `CEABB8A9` record tables (row count at 0x10, record size at 0x14, sorted
     row ids, fixed records, string pool).
   `exvs_gvs::table` reads both losslessly into a JSON document and writes
   them back; unknown bytes are kept. Schemas (field names, value types,
   string fields) live in `exvs_gvs::schema`, named from IDA evidence; a
   field without evidence keeps its hash name.
6. **Content locator.** Each editor names its archive by hash (GVS name table
   or IDA-found hash). The backend finds the extracted package in the
   workspace (`packages_by_hash`), or reports the game file so the editor can
   offer extraction. Pages never scan folders.
7. **Repack.** Saving writes into the package folder; the existing baseline
   marks the package dirty and "Repack changes" writes
   `<mod>/archives/XX/HASH.bin`.
8. **Workspace is a mod folder.** The backend rejects a workspace that is,
   or lies inside, the game folder, or that looks like a game dump (an
   `archives` folder of `XX` buckets, a bucket of `HASH.bin` files, or a game
   root with `eboot.bin` / `sce_sys`). The workspace page shows a
   "choose a workspace folder" gate until a valid folder is set.
9. **One path memory.** The PS4 path settings move from their own
   `ps4-workspaces.json` into the EXVS2 config store (`settings.json`, keys
   `gvs.*` / `mbon.*`, migrated once from the old file). Dialogs use the
   EXVS2 `dialogDefaultPath` map through one shared helper that
   `FilePathInput` also uses, with one key per input.

### Tab map (GVS data, by archive hash)

| Tab | GVS source | Codec |
| --- | --- | --- |
| Structure | any package | existing GVS structure editor |
| Effect | `006effect/<unit>` | efxbn list + models (package edit) |
| Motion | unit pack `002chara/<unit>` nuanmb | package edit + SSBH summary |
| Camera | `002chara/000common_000common_001` (`CB665375`) members 27-30 | field table |
| ID table | `036B9E67` characteridtable | record table |
| Cost | unit characterparam `7D1A0ACF` / `B7D5327E`; battle system tables (`CB665375` 33-38) | field table |
| Striker | `A8FCC349` foroutgamearmsparam_striker | field table |
| List | `DFD38C70` character_list (13 languages) | field table |
| Series | `B7367090` series_list | field table |
| Navi | `6FCC0FBA` navi_list | field table |
| Path | `264D1CA7` raw_path_id | record table |
| Slot | `8C428AF2` 090sound member 2 | field table |
| BGM | `8C428AF2` 090sound member 0 | field table |
| HUD | `8C428AF2` 090sound members 1, 3, 8 | field / record tables |
| Bank | unit `090sound` pack and the system nus3bank packs | package members |
| Card icons | character_list ms_* image archives | nutexb list |
| Stage icons | stage_list stg_* image archives | nutexb list |
| Stages | `CE74091E` stage_list | record table |
| Triad | `051mission` set / scene tables + outmission BSFO | record tables |
| MSC | unit pack scripts | OB MSC workspace |
| Param | unit pack param tables | OB typed param editor |

### Order

1. Shell: drop the right panels, badge-only toolbar, shared tab bar.
2. Backend: table codec, schema registry, content locator, commands, CLI
   round-trip check over every table of the init set.
3. GVS page on the EXVS2 parts with all tabs wired.
4. Editors in tab order; IDA research per schema as each editor lands.
5. Workspace folder validation and path memory (decisions 8 and 9).
6. Docs: this note, ADR 0010 amendment, `docs/mbon-gvs/README.md`.

## Process

### 2026-10-04

* IDA: opened `E:\shadps4\PKG\GundamV\eboot.elf.i64` as a second instance
  (`ida-46392`).
* Tables load through a resident-data manager: `qword_533DD18->vtbl[2]`
  is called with `{hash, dst...}` request records (for example
  `sub_325F80` loads `036B9E67`, `CE74091E`, `A073DA71`, `1BC41B9E`).
  `CServiceResidentData::Load` owns one lambda per resident table; each
  lambda type name is followed by its archive hash in rodata.
* Field lookup is a binary search on the sorted field hash list, then on the
  sorted row ids (`sub_803E00` reads series field `6CA1A996`), the same as
  OB.
* Eboot scan: 188 archive hashes are embedded as 32-bit values; 96 are
  named by the name table. Unnamed but identified so far:
  `AB5E0D57` (13 language files, 280 rows x 93 fields, loaded beside
  character_list), `FA5D5374` (28 x 28 record table, loaded beside
  outmission / 090sound), resident tables `6A9F556B`, `D1C00639`,
  `5E8D0594`, `8D5A003D`, `D61CFCA8`, `569B2C44`, system nus3bank packs
  (`26F6AFD3`, `2D33DDA0`, `7280AB47`, `97759432`, `B43A8C1A`, `BB874EB3`,
  `BFFFFE69`, `C33DBC8C`, `C8F8CEFF`, `DD9B88BA`), fonts, LMB menus.
* Unit pack `7C45E54C` (001gundam) holds models, 406 nuanmb, the MSC triple
  and ten param tables. Field-hash match against the OB pools: grapparam,
  interactionid, bulletparam, characterparam, speedparam, hitgroupiddef,
  vernier_table, effect_project, projectile_depiction_table all 100 %;
  armsparam 34 / 38 fields.
* `exvs2_json inspect --roundtrip-check` on GVS armsparam, bulletparam,
  vernier_table and projectile_depiction_table: byte identical.
* `tools/mscdec.py` decompiles the GVS `0.bscex`, `1.cscex`, `2.dscex`.
  `msclang` recompiles `1.cscex` byte identical; `0.bscex` and `2.dscex`
  come back smaller (OB compiler output differs from the shipped bytes;
  OB already relies on `verify_msc_roundtrip_from_c`).

* Table codec (`exvs_gvs::table`): `gvs_tool table-check tmp/gvs-ws/ws
  tmp/gvs-ws/refs` reads and rewrites 207 tables, 0 failures, including an
  edit probe (rename text, clone a row under a new id, drop a row, re-read).
* Record-table text columns: a column is text when every row points at a
  string start in the pool. Found: stage_list +08 / +2C, titleplatetable
  +14 / +20, challengesetidtable +0C, missionsetidtable +08, sceneidtable
  +08, trialset 2-4 +0C, raw_path_id +00, 5E8D0594 +04, 6A9F556B +04,
  8D5A003D +10, FA5D5374 +14. No table has a text column with zero rows.
* Field names: GVS field hashes are CRC-32 of the upper-case field name. A
  dictionary attack (eboot identifiers, VS2 pool words, domain words; 1-3
  word combinations) named about 100 fields; only names that fit the data
  were kept (collisions such as `ZH_PA_STRUCTURE` are dropped). Examples:
  character_list `DLC_ID`, `DLC_HIDDEN`, `UNLOCK_ID`, `CATEGORY_TYPE`,
  `REPLAY_ID`, `BGM_ID_1..4`; camera `FRAME`, `CAMERA_TYPE`, `START_FOV`,
  `END_DIST`, `PIVOT_MOVE`; battle system `COST`, `TOTAL_COST`,
  `BOOST_MAX`, `EX_TIME`; striker `BULLET_MAX`; ultimate casher `COST`,
  `PARAM`, `LEVEL`. The VS2 / Over Boost pools name the shared hashes
  (character, navi, pilot, series, stage, BGM, all unit params).
* Data links (archive hashes in rows, resolved with the name table):
  characteridtable row = unit id, +00 `002chara`, +04 `006effect`, +08
  `090sound` pack; character_list `E4E3753B` ms_ms_s, `C8CDB696` ms_ms_l,
  `11A659D4` ms_vs_r, `1CFE4C4F` ms_vs_l, `5EDC5633` ms_vs_s_r,
  `B903F9EC` ms_vs_s_l; stage_list +04 stage pack, +1C stg_grd, +20
  stg_full, +24 stg_vs_2, +28 stg_grd of the base stage; titleplatetable
  +10 009gui plates; series_list `FC07057E` 009gui logos; raw_path_id rows
  are the 183 `<sha1>.nus3audio` voice banks, 20 `.mp4` movies and 5 images
  of the game root; FA5D5374 +08 = raw_path_id row of an intro movie.
* IDA `sub_2E89C0` / `sub_719B70`: the `090sound` archive (`8C428AF2`) is
  loaded by the resident sound manager (`qword_533EAB0`): member 0 (the
  BGM table, or member 8 when the build flag at `qword_52C2500->vtbl[+32]`
  is set) -> `+1160`, members 1-7 -> managers at `+1088`, `+936`, `+864`,
  `+792`, `+720`, `+648`, `+576`, member 8 -> `+568`. Member 0 carries the
  VS2 bgm_table + bgm_list fields (cue CRC, bank group, series, BGM name).
* IDA `sub_325F80`: one request loads characteridtable, stage_list,
  sceneidtable and hudidtable into one manager (`+1208` .. `+1232`).
* IDA `sub_7FE4E0`: navi_list `144AB665` is tested `== 1`.
* IDA `sub_7FCB10` / `sub_88C530`: 20 character_list fields listed at
  `0x4111780` (`3B22BD60`, `A22BECDA`, `D52CDC4C`, `4B4849EF`, `3C4F7979`,
  `A54628C3`, `D2411855`, `42FE05C4`, `22398C21`, `553EBCB7`, `22398C21`,
  `BB30DD9B`, `CC37ED0D`, `525378AE`, `25544838`, `BC5D1982`, `525378AE`,
  `5BE53485`, `2CE20413`, `7E13EF74`) are the unit's selectable pilots
  (pilot_list row ids; 132 / 132 units have the first); the pilot select
  loads each pilot image through pilot_list `639EA8F5`.
* IDA `sub_893030` (unit profile window): `12C74AEC` name, `321F8B3F` intro
  text, `A3DB59DE` model number, `3D371540` / `64256AC9` height and
  `00615077` / `D937BCEC` weight (the second of each pair for languages 2
  and 4), `E0588D73` / `12D83D3D` mark the height / weight text as a text
  key, `6CEE9AE7` affiliation.
* IDA `sub_8D5590` (replay list): `E9FE66A3` / `60B9905E` index the unit in
  the right / left `ms_vs_s` image lists.
* IDA `sub_9258A0`: the character_list member is picked by the network date
  (`sub_301560`), member 13 under the build flag at
  `qword_52C2500->vtbl[+72]`, so the 13 members are release-schedule
  versions. `34A3BA6D` is the unit's member in a GP unlock table family
  (`AF71FF9A`: `2ABD43F2` item id, `5C74974F` category, `FB275DF5` value,
  `629B9E5B` flag, `958A9AC9` = CRC-32 `GP`, the price).
* Unit param tables: `exvs2_json inspect --roundtrip-check` is byte
  identical for GVS grapparam, interactionid, bulletparam, armsparam,
  speedparam, hitgroupiddef, vernier_table and projectile_depiction_table;
  characterparam (166 / 183 named) and effect_project parse by hash with the
  same pools. The Param tab finds a table's kind by the pool that names most
  of its fields.
* BSFO: all 263 `outmission` briefings have the VS2 layout (0x24 header,
  48-byte section 0, 496-byte section 2, 44-word section 4), so the VS2 BSFO
  codec reads them; writes are refused for a file that does not rebuild byte
  for byte.
* `gvs_tool schema-check tmp/gvs-ws/ws` and `.../refs`: every editor schema
  (164 members) rebuilds byte for byte and passes the edit probe.
* `gvs_tool units tmp/gvs-ws/ws`: 638 units; RX-78-2 (1001001) ->
  `7C45E54C` / `871E708B` / `BC0158D5`.
* Workspace rule (`gvs_tool check-workspace`): `archives\00` (bucket),
  `archives` (bucket folder), the game root, a folder inside or around it are
  rejected; `tmp/gvs-ws/ws` and a new folder elsewhere are accepted.
* Verification: `cargo check --lib --bins` (src-tauri) clean, `tsc --noEmit`
  clean, `stamp_mbon_gvs_notices.py --check` ok (176 files).

## Evidence log

Commands and results are recorded above with the date. Samples stay under
`tmp/gvs-ws/` (gitignored).

## Remaining

* Record-table words without an IDA reader or a data pattern keep their
  offsets: stage_list +10 / +14 / +18, titleplatetable +04 / +0C / +1C /
  +28, trialset columns, raw_path_id +04..+14, `090sound` members 1 / 3 / 8.
* `090sound` members 4-7 are version-2 tables (not field / record tables)
  and are not edited yet.
* `34A3BA6D` reaches 120 while `AF71FF9A` has 95 members; the archive the
  unlock code receives as `a2` may be a sibling of `AF71FF9A`.
* The two workspace page tests asserted the removed title, credit line and
  info panel and were deleted (no new tests, per the owner).
