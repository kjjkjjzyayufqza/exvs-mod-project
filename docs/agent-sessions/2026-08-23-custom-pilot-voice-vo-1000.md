# Custom Pilot Voice VO_1000 → 900000004

## Goal

给机体 `900000004` 挂自定义驾驶员语音。波形已在 OB 散文件里，cue 名按 work 16 克隆成 `vo_16_p01_*`。用 Test Editor 走完整索引链，不手改游戏/mod 二进制。

规格：`docs/exvs2-audio-voice-bgm-indexing.md`。

## In-game result

2026-08-23 游戏实测通过：`900000004` 能播 `VO_1000` 驾驶员语音。

## Settled bind

| Item | Value |
|---|---|
| Unit | `900000004` |
| Voice stem | `VO_1000_P01_0` |
| `character_list` field `0x3573AED2` (`pilotPresentationHash`) | `0x80B7036E` = CRC32(`VO_1000_P01_0`) |
| vrtbl `voiceKey` | `0x80B7036E` |
| vrtbl `streamPathId` | `0x686287AC` = CRC32(`STREAMPATH_ST_VO_1000_P01_0`) |
| vrtbl `votPackage` | `0xA8C57029`（donor `VO_0016_P01_0`） |
| vrtbl `bankPackage` | `0xA4864422`（donor `VO_0016_P01_0`） |
| vrtbl `dummyPackage` | `0x147BC38E`（全表常量） |
| raw_path_id key | `STREAMPATH_ST_VO_1000_P01_0` |
| raw_path_id `source` | `091waveform/voice/pilot/vo_1000/VO_1000_P01_0_01_ST_01.nus3audio` |
| Waveform on disk | `E:\OBHK0.3_v27\data\x64\091waveform\voice\pilot\vo_1000\VO_1000_P01_0_01_ST_01.nus3audio` |

Donor vot/bank 能直接用，是因为 nus3 cue 已经改成 `vo_16_p01_*`，和 `VO_0016` 的 `.vot` / `.nus3bank` 对得上。没有新建 vot/bank 包，也没有写 nus3bank。

## Packs to extract / save / repack

Workspace 走 `mod/090sound`。解包名字由 Rust 按 magic 归位，不是前端 `fs.rename`。

| Pack | Path | Editor | Save target |
|---|---|---|---|
| `0x264D1CA7` | `x64/800etcetera/raw_path_id` | Test Editor → Raw Path ID | `raw_path_id_release.json` + `.vgsht1`（整表重建） |
| `0x8C428AF2` | `x64/090sound` 七文件根包 | Test Editor → Pilot Voice Table | `pilotvoiceresourcetable.vrtbl`（子文件 3） |
| `0xDFD38C70` | `x64/012list/character_list` | Test Editor → Character List | `character_list.bin` 行 `900000004` |

`0x8C428AF2` 七个子文件必须原顺序原类型一起 repack，否则会打掉 SE / 舞台环境音表。

## Editor surfaces added

- Rust：`src-tauri/src/format/raw_path_id.rs`、`pilot_voice_resource.rs`；sound 解包 `apply_raw_path_id_names` 然后 `apply_090sound_root_names`（按 magic，不按 vs2 meta 字符串顺序）。
- 前端：`src/page/TestEditor/components/raw-path-id/`、`pilot-voice-resource/`；catalog `raw-path-id` / `pilot-voice-resource`。
- FHM2D init modal 的 sound init 走同一套后端解包。
- vrtbl 新行默认全空；黄色缺字段；save 拒绝空值。没有 copy-from。填 stem 只自动算 `voiceKey` + `streamPathId`。`votPackage` / `bankPackage` / `dummyPackage` 手填。
- vrtbl stem 反查除 0..199 外额外包含 work `900` 和 `1000`。
- `parse_voice_stem` 会去掉全部空白，所以 `VO_1000_P01 _0` 能过。

## Character List save trap

DualValueProperty 把 `0x80B7036E` 提交成带符号 int32（`-2135514258`）。`characterlist_entry_from_json_value` 以前只 `as_u64()`，toast 还吞掉 `expected u32`。现已走 `json_to_raw_u32_for_kind`，按 32-bit 位型写回。失败 toast 会带后端原文。

## Constraints that stayed

- 数据处理在 Rust；前端只渲染。
- 不要手改游戏/mod 文件来“帮用户填表”。
- 不要在 vrtbl 做 copy-from。
- 不要做 pipeline TODO UI。
- Path ID / VRTBL 页保留 Card-Icon 风格顶栏（Save/Reload、Structure、Loaded、文件路径），详情始终可见。

## Verification

- `cargo test --test raw_path_id_format_test`
- `cargo test --test pilot_voice_resource_format_test`
- `characterlist_json_signed_hash_test`：`signed_dual_value_pilot_presentation_hash_deserializes`
- 2026-08-23 游戏内 `900000004` 语音播放通过

`cargo test --lib` 仍会被无关的 Effect Folder cfg-test 挡住，不是这条链路的门。

## Remaining

这条机体绑定已闭环。未做：`pilotPresentationHash` 改成可反解下拉；新 cue 名需要新 `.vot` / `.nus3bank` 写入器（本次不需要）。
