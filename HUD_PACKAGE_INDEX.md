# HUD package index (OB v27)

How the game finds the FHM2D package of a HUD screen, such as the machine-select
screen `0xB13A12EF` or the training machine-select `0xA8A2ADF2`. This note records
what was verified on 2026-10-07, so the index can be added to the tool as an
editable table.

## Summary

A HUD screen's package id is not written in the EXE, and it is not a hash of a
path or name. The game reads it from a small **HUD index table** inside the
resident package **`0x1BC41B9E`** (file `0.bin`). The key is the HUD type id and
the value is the package `HashName` (the DPLID).

| HUD type id | Package | Folder |
|---|---|---|
| `1850781301` (`0x6E50AE75`) | `0xB13A12EF` | `009gui/flash/game/machineselect` |
| `-8010131` (`0xFF85C66D`) | `0xA8A2ADF2` | `009gui/flash/game` (holds `training.lm`) |
| `1533124612` (`0x5B61A004`) | `0x997AD24C` | `009gui/flash/game/gamemodeselect` |

The full table (64 rows) is at the end of this note.

**What this means for the tool:** to point a HUD screen at a new or cloned GUI pack,
edit one row of `0x1BC41B9E/0.bin` and repack `0x1BC41B9E`. The EXE does not need to
change.

## Table format

`0x1BC41B9E/0.bin` is a vgsht2 table, the same layout as `character_id_table`
(`0x036B9E67`), which `src-tauri/src/exvs2_json_cli/character_id_table.rs` already
reads.

| Offset | Size | Meaning |
|---|---|---|
| `0x00` | 4 | magic `A9 B8 AB CE` |
| `0x04` | 4 | `0` |
| `0x08` | 4 | file size (`0x220` = 544) |
| `0x0C` | 4 | `0` |
| `0x10` | 4 | entry count (`64`) |
| `0x14` | 4 | record size (`4`) |
| `0x18` | 8 | `0` |
| `0x20` | 4 × count | keys: HUD type ids as `u32`, **sorted ascending** |
| `0x20 + 4 × count` | record size × count | records: one `u32` DPLID per key, same order |

The game finds a row by binary search over the keys, so the keys must stay sorted
(unsigned order). A new row must be inserted at its sorted position, with its
record inserted at the same index, and the count and file size updated.

## How the game uses it (OB v27 `vsac27_Release.exe`)

1. **Boot.** `sub_140457600` loads the resident packages into
   `EXVS2::CServiceResidentData` (global `qword_142112D80`). Their DPLIDs are a `u32`
   array in `.rdata` starting at `0x1412E313C`. Slot 13 is at `0x1412E3168`, and its
   value is `0x1BC41B9E`.
2. `sub_1406D9170` hands the first file of slot 13 to the HUD manager
   (`qword_1421409B8`, field `+0x490`) as its lookup table.
3. **Opening a screen.** The flow code only knows the HUD type id. It calls
   `sub_1406C3D40(this, typeId, nodeKey, op, data)`, which calls `sub_140DB08F0`.
4. `sub_140DAF830(table, &out, typeId)` binary-searches the keys and returns the
   record, so the first `u32` of the record is the DPLID.
5. The DPLID goes to the FHM2 manager. `DplLoader_ThreadLoad` opens
   `dplcache_release/0x%08X.fhm2d` (uppercase hex) and logs the id with `%08x`. That is
   the `b13a12ef` line seen in the game log.
6. Once the package is loaded, the HUD factory `sub_140901660(typeId, …)` builds the
   HUD class. For example, `1850781301` creates `COutHudMachineSelect` (`sub_1409A5B50`).

**Hardcoded ids:** the extra packages a HUD class loads for itself are immediates in
its constructor. `COutHudMachineSelect` (`sub_1409A53D0`) stores 10 of them at
`this + 1280`: `0x279D5D96 ms_ms_s_random`, `0x82067E11 ms_ms_l_random`,
`0x04F4B2A6 vs_p_l_random`, `0xA0253AA0 ser_ms`, and others. Only the HUD's main
package comes from the index table.

## Ruled out

- Neither DPLID appears in the EXE, either as raw bytes or as hex or decimal text.
- Neither DPLID is in the unpacked `E:\XB\解包\com\file`, because that dump does not
  include `0x1BC41B9E`.
- The DPLID is not a hash of any path segment, file stem or folder of the package's
  meta paths. Tested CRC32 (IEEE, C, BZIP2, MPEG, JAMCRC, POSIX), FNV-1 / FNV-1a, djb2,
  sdbm, murmur3, MD5 and SHA-1, each lower-, upper- and mixed-case, with `/` and `\`.
  Treat ids as build-assigned values. A new pack gets a new id (the tool's existing
  `crc32(seed)` allocation is fine), and this table is what makes the game use it.

## Implementation notes for the tool

- **Parse:** reuse the `character_id_table` reader with record size `4`. Show rows as
  `typeId (signed and hex) → DPLID → resolved package name` (from
  `src/assets/fhm2d-name-map.generated.json`).
- **Edit:** change the DPLID of an existing HUD type. This is the common case: repoint
  machine select to a cloned `0x{NEW}` pack made by `gui_pack_clone.rs`. Adding a new
  HUD type id is only useful if the EXE's HUD factory knows that id, so reject unknown
  ids unless they come from the factory list.
- **Validate before writing:** magic, count × (4 + record size) + `0x20` ≤ file size,
  keys strictly ascending, no duplicate keys, and every DPLID exists as a pack in the
  workspace or in `dplcache_release`.
- **Repack:** write `0.bin` back into `0x1BC41B9E` (structure item 0) and repack that
  package. Its folder holds this one file only.
- **Optional pairing with GUI pack clone:** after cloning a GUI pack, offer "use this
  pack for HUD type …". That edits the row and repacks `0x1BC41B9E` in one step.

## Full table (`0x1BC41B9E/0.bin`)

Rows are in file order, which is sorted by unsigned key. Names come from the tool's
name map; `?` means it has no entry.

| HUD type id | Package | Name |
|---|---|---|
| 427997680 | `0xC48481FA` | 009gui/flash/attract/extreme_match/extreme_match |
| 429796090 | `0xFFA26CEF` | 009gui/flash/livemonitor/group_play/group_play_window |
| 437585949 | `0xCEBD97DA` | 009gui/flash/livemonitor/tournament/result |
| 448131163 | `0x031E4B34` | 009gui/flash/pilot/p_001_001/st_p_001_001_c01/st_p_001_001_c01 |
| 467428514 | `0xA347862C` | 009gui/flash/game/briefing/briefingbg |
| 529873574 | `0x53D871C3` | 009gui/flash/game/vs/vs/vs |
| 593417444 | `0x7E38635D` | img_img_00000_img_00023_24files_7e38635d |
| 713345729 | `0x332E0EA7` | 009gui/flash/livemonitor/tournament/pcbinfo |
| 780087680 | `0x2589B90F` | ? |
| 843883979 | `0xD2099770` | img_img_00000_img_00023_24files_d2099770 |
| 878048130 | `0xE298B42B` | img_00000_00001_e298b42b |
| 963929661 | `0xC5774849` | 009gui/flash/game/continue |
| 986638342 | `0xFC4CC8E0` | 009gui/flash/common/medal/window_medal |
| 1068280426 | `0x979D9A27` | 009gui/flash/livemonitor/tournament |
| 1103254896 | `0xD785A819` | 009gui/flash/ingamehud/common_lm/lm_result |
| 1120236411 | `0x11D41420` | 009gui/flash/livemonitor/info/info_gundam/info_gundam |
| 1163019081 | `0xF537C45B` | 009gui/flash/ingamehud/common/message/message |
| 1164492577 | `0x33405D7C` | 009gui/flash/ingamehud/common/result |
| 1245967831 | `0x6B5DA773` | img_img_00000_img_00023_24files_6b5da773 |
| 1305868095 | `0x9DE99373` | 009gui/flash/attract/notice/notice |
| 1388991587 | `0xC87E1EBB` | ? |
| 1458245381 | `0x06725A71` | img_img_00000_img_00011_12files_06725a71 |
| 1520365258 | `0xA6F02F36` | 009gui/flash/ingamehud/common_lm/hud4 |
| 1533124612 | `0x997AD24C` | 009gui/flash/game/gamemodeselect/gamemodeselect |
| 1544141144 | `0x81B375BA` | 009gui/flash/livemonitor/info_playspot/info_playspot |
| 1584673706 | `0x6046E987` | 009gui/flash/livemonitor/group_play/group_play_yoyaku |
| 1850781301 | `0xB13A12EF` | 009gui/flash/game/machineselect |
| 1890540825 | `0xAFD59FB1` | 009gui/flash/livemonitor/schedule/schedule |
| 1961257770 | `0x7852FD75` | 009gui/flash/outgame/loadcard/cardenterdisp |
| 2014434771 | `0xE546D392` | img_img_00000_img_00004_5files_e546d392 |
| 2027900683 | `0xBF0205E7` | 009gui/flash/livemonitor/ranking |
| 2125152661 | `0x4EB70599` | 009gui/flash/livemonitor/group_play/group_play_list |
| -2085957871 | `0xA4955680` | ob_a4955680 |
| -1859258255 | `0xE1FA3F8C` | 009gui/flash/display_object/display_object |
| -1840200047 | `0xC2FEF2F1` | 009gui/flash/attract/gamemode_info/gamemode_info |
| -1764639438 | `0xE071AEB8` | img_img_00000_img_00023_24files_e071aeb8 |
| -1735228371 | `0xED0A958D` | 009gui/flash/staff_roll |
| -1671108599 | `0xF7D3595D` | 009gui/flash/livemonitor/replay |
| -1494567113 | `0xC617735B` | ? |
| -1456921666 | `0x02666697` | 009gui/flash/game/exburst_change/exburst_change |
| -1454982846 | `0x6D814DBB` | 009gui/flash/game/briefing/briefing |
| -1448274044 | `0xF8C90966` | 009gui/flash/ingamehud/common_lm |
| -1413737257 | `0x01D24716` | 009gui/flash/attract/attract_materials |
| -1400330003 | `0x32E75DEB` | 009gui/flash/test/ex35/common/ex35_cardenterdisp |
| -1386007273 | `0x6691B54B` | 009gui/flash/ingamehud/common/targetgauge/targetgauge |
| -1276392413 | `0xBDFC69D7` | 009gui/flash/game/courseselect/courseselect_start |
| -1210460766 | `0xC5CC098D` | 009gui/flash/game/vs/shuffle/shuffle |
| -1178562120 | `0x88528ED7` | img_img_00000_img_00023_24files_88528ed7 |
| -1162608351 | `0xF9EAFB87` | 009gui/flash/display_object/lm_menu |
| -1092945068 | `0x4283DBA9` | 009gui/flash/ingamehud/common/evaluation/evaluation |
| -933567100 | `0x87C32726` | 009gui/flash/game/continue/gameover |
| -909983290 | `0x2EA5B38B` | 009gui/flash/game/courseselect/courseselect |
| -874642872 | `0xA38A6243` | 009gui/flash/attract/attract_demo/attract_demo |
| -750901095 | `0x09DE28C7` | 009gui/flash/ingamehud/common/startend/end |
| -746528756 | `0x6450FF13` | 009gui/flash/livemonitor/tournament/intro |
| -589660157 | `0xF1A836FA` | 009gui/flash/common/window/window |
| -492521380 | `0x6DC46E25` | 009gui/flash/livemonitor/tournament/entry |
| -491561657 | `0x40762866` | 009gui/flash/livemonitor/tournament/title |
| -355700370 | `0x1D1D547E` | 009gui/flash/ingamehud/common/intrude/intrude |
| -354085976 | `0x5654AB22` | 009gui/flash/common/medal/window_medal_lm |
| -345243274 | `0x2E3C6171` | 009gui/flash/game/vs/gamemode/gamemode |
| -236287782 | `0x87DB00C8` | 009gui/flash/livemonitor/group_play/group_play_info |
| -204237172 | `0xA793477C` | 009gui/flash/attract/title/title |
| -8010131 | `0xA8A2ADF2` | 009gui/flash/game |
