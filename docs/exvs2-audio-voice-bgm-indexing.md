# EXVS2 音频索引：格式规格与编辑器落地

本文是给 TAURI_PROJECT 编辑器用的**格式规格**。完整逆向证据链在
`xDocs\audio_research\`（8 篇），本文只保留实现所需内容。

手工改表的操作手册（字节级偏移、逐步任务、故障排查）在
`xDocs\audio_research\HANDBOOK_unit_audio.md`；
配套的参考实现是同目录的 `parse_audio_index.py`（读 + 校验）与
`patch_audio_tables.py`（字节级读写）。编辑器实现应与这两个脚本的行为对齐。

基线：`E:\OBHK0.3_v27`（`vsac27_Release.exe`，base `0x140000000`）。
对照：`E:\XB\解包\vs2\x64`（明文，有真名）。

## 为什么编辑器需要关心这个

现在 `character_list` 编辑器把三个字段标成了错的语义。这三个字段实际上
是"这台机体播哪个驾驶员的语音 / 哪首 BGM"的唯一开关：

| command hash | 现在的名字 | 实际语义 | 证据 |
|---|---|---|---|
| `0x3573AED2` | `pilotPresentationHash` | `pilotVoiceResourceKey` = `CRC32("VO_%04d_P%02d_%d")` | 687 行样本里 253 个非零值，253/253 命中 OB `pilotvoiceresourcetable.vrtbl` 的 344 个 key，0 孤儿 |
| `0xA84A15F4` | `pairedBgmMusicIdPrimary` | `defaultBgmCueHashPrimary` = `bgm_table.record_id` | 253/253 落在 OB `bgm_table` 的 135 个 record_id 内 |
| `0xB93FBD0C` | `pairedBgmMusicIdSecondary` | `defaultBgmCueHashSecondary` | 同上，distinct 73；218/253 与 Primary 同值 |

需要改的文件：

- `src/models/characterListEntry.ts`
- `src/models/characterListOB.ts`
- `src/page/UnitEdit/components/CharacterForm.tsx`（`UnkHash19` / `UnkHash22` 的 label）
- `src/page/TestEditor/components/character-list/CharacterForm.tsx`（`pilotPresentationHash` 的 label）

建议在 UI 上把这三个字段做成**可反解的下拉/提示**，而不是裸 u32：

```ts
// pilotVoiceResourceKey: 反解成 "VO_0001_P01_0" 展示
// 全空间只有 200 * 2 * 80 * 10 = 320,000 项，构建一次 Map 即可
function buildVoiceKeyNames(): Map<number, string> {
  const map = new Map<number, string>();
  for (let work = 0; work < 200; work++) {
    for (const kind of ["P", "N"] as const) {
      for (let slot = 0; slot < 80; slot++) {
        for (let variant = 0; variant < 10; variant++) {
          const stem = `VO_${pad4(work)}_${kind}${pad2(slot)}_${variant}`;
          map.set(crc32(stem), stem);
        }
      }
    }
  }
  return map;
}
```

## 索引链

```text
character_list.pilotVoiceResourceKey
  -> pilotvoiceresourcetable.vrtbl   (090sound 包 0x8C428AF2 子文件 3)
       votPackage / dummyPackage / bankPackage  = FHM2D 包 id
       streamPathId = CRC32("STREAMPATH_ST_" + voiceKeyName)
  -> raw_path_id (包 0x264D1CA7) 的 JSON: hash == streamPathId 那行的 "source"
  -> data/x64/091waveform/voice/pilot/vo_xxxx/VO_xxxx_Pyy_z_01_ST_01.nus3audio
```

BGM 侧：`cueHash -> bgm_table 行 -> (bank group, uppercase CRC32(cue label))
-> CSndBankData -> nus3::HBank`。group→文件：
`0→BGM_01`、`1→BGM_02`、`2→BGM_OUT`、`5→BGM_AC27_UPDATE_01`、`6→BGM_AC27_UPDATE_02`
（OB 命名；vs2 那份叫 `BGM_UPDATE_*`，不能混用）。

## 格式规格

### `pilotvoiceresourcetable.vrtbl`

```text
0x00  u32 version = 3
0x04  u32 0
0x08  u32 0
0x0C  u32 0
0x10  u32 recordCount
0x14      record[recordCount] x 20 B
```

不变量：`0x14 + recordCount * 20 == fileSize`（OB 344 行 / vs2 306 行都成立）。

```ts
interface PilotVoiceResourceRecord {
  voiceKey: number;      // +0x00 CRC32("VO_%04d_P%02d_%d")
  votPackage: number;    // +0x04 FHM2D pack -> 090sound/voicetable/<stem>.vot
  dummyPackage: number;  // +0x08 FHM2D pack -> 091waveform/voice/dummy（全表常量 0x147BC38E）
  bankPackage: number;   // +0x0C FHM2D pack -> 091waveform/voice/pilot/<stem>_st
  streamPathId: number;  // +0x10 CRC32("STREAMPATH_ST_VO_%04d_P%02d_%d")
}
```

记录**不按 voiceKey 排序**（OB 实测乱序），所以查表很可能是线性扫描。

OB 统计：344 行 / distinct votPackage 324 / distinct bankPackage 321 /
distinct streamPathId 321 / 106 行未被任何角色引用 /
73 行的 streamPathId 未在 `raw_path_id` 注册（游戏不崩，只是没声）。

### `raw_path_id_release.vgsht1`

```text
0x00  u32 magic = 0xCEABB8A9
0x04  u32 0
0x08  u32 fileSize
0x0C  u32 0
0x10  u32 count
0x14  u32 recordStride = 0x18
0x18  u32 0
0x1C  u32 0
0x20      u32 sortedIds[count]          必须升序（运行时二分查找）
          record[count] x 0x18:
            +0x00 u32 stringOffset      绝对偏移，指向混淆字符串
            +0x04 u32 kind              0 = stream
            +0x08 u32 param01.low32
            +0x0C u32 param01.high32
            +0x10 u32 param02.low32
            +0x14 u32 param02.high32
          混淆字符串块（每条约 51 B）
```

`stringOffset` 必须满足运行时的边界检查：

```text
count * (recordStride + 4) + 32  <=  stringOffset  <  fileSize
```

字符串块存的是 `SHA1(source).hex() + ext`，**运行时解密后立刻丢弃**，
真实路径来自同包 JSON 的 `"source"`。所以编辑器扩容时：

- 必须往 JSON 加行（`hash` = `CRC32(键名)`，`source` = 真实相对路径）
- 必须往 `.vgsht1` 的升序 id 数组插入同一个 id
- `count` 变化后**所有** `stringOffset` 要整体 `+0x1C`（`4 + 0x18`）
  → 结论：**以 JSON 为准整表重建，不要原地打补丁**

### `.vot`（`090sound/voicetable/*.vot`）

```text
0x00  u32 version = 1
0x04  u32 selfId = CRC32(文件名去扩展名，小写)
0x08  u32 0x20
0x0C  u32 cueRegionEnd
0x10  u32 tailOffset
0x20  u32 situationCount
0x30      situation[situationCount] x 0x38:
            +0x00 u32 situationId       全局 situation 枚举键（未反解，见下）
            +0x0C u32 volumePercent     实测恒 100
            +0x10 u32 param50           实测恒 50
            +0x14 u32 param100          实测恒 100
            +0x30 u32 cueCount
            +0x34 u32 cueListOffset     绝对偏移
          cueEntry x 8 B: { u32 cueId, u32 flags }
```

不变量（`vo_0001_p01_0_01.vot` 实测）：
`0x30 + situationCount * 0x38 == 第一条 cueListOffset`；
`cueListOffset(first) + totalCues * 8 == cueRegionEnd`。

**`cueId == CRC32(bank 内 cue 名的大写形式)`**，242/242 命中。例：
`0xCA143FC8 == CRC32("VO_01_P01_CHARA_SELECT_01")`。
注意 bank 里存的是小写 `vo_01_p01_chara_select_01`，哈希前要转大写。

`situationId` 是全局枚举（199 个 pilot `.vot` 合计仅 292 个 distinct），
名字尚未反解。**编辑器不要让用户自造 situationId**，
只允许从 donor `.vot` 继承。

### `voicecategorytable_*.vctbl`

```text
0x00  u32 version = 2
0x04  u32 idBase          character 30000 / pilot 31000 / condition 32000
0x10  u32 count
0x14      character & pilot: index[count] x 8 { u32 key, u32 payloadOffset }  key 升序
          condition:         record[count] x 0x20，首字段 u32 key 升序
```

不变量：character / pilot 的 `0x14 + count*8` 精确等于第一条 `payloadOffset`；
condition 的 `0x14 + count*0x20 == fileSize`。
pilot payload 形状实测为 `{ u32 valueCount = 1, u32 valueHash }`。

OB count：character 122 / pilot 366 / condition 65。
vs2 count：82 / 318 / 48。

### `090sound` 根包子文件归位

`fhm2d_extract -t sound -l flat` 会输出 `0.bin`..`6.bin`，按下表归位：

| 子文件 | OB 大小 | 判据 | 真名 |
|---|---|---|---|
| `0.bin` | 144 | magic `0xCEABB8A9` | `bgmstemstable.vgsht1` |
| `1.bin` | 11,408 | ver 2, base 30000 | `voicecategorytable_character.vctbl` |
| `2.bin` | 34,644 | magic `0xCDABB8A9` | `charaseparamtable.vgsht2` |
| `3.bin` | 6,900 | ver 3, count 344 | `pilotvoiceresourcetable.vrtbl` |
| `4.bin` | 72 | magic `0xCEABB8A9` | `stageambientseparamtable.vgsht1` |
| `5.bin` | 13,448 | ver 2, base 31000 | `voicecategorytable_pilot.vctbl` |
| `6.bin` | 2,100 | ver 2, base 32000 | `voicecategorytable_condition.vctbl` |

**重打包时 7 个子文件必须按原顺序、原类型全带上**，
否则会连带破坏 SE / 舞台环境音参数表。

### `.nus3audio` / `.nus3bank` 必须成对改

| 文件 | 位置 | 节 |
|---|---|---|
| `.nus3audio` | `091waveform/**` 散文件 | `AUDIINDX / TNID / NMOF / ADOF / TNNM / JUNK / PACK` |
| `.nus3bank` | FHM2D 包内 | `BANKTOC / PROP / BINF / GRP / DTON / TONE / JUNK / PACK` |

阿姆罗的一对：`.nus3audio` 16,588,056 B / 753 条；
`.nus3bank` 319,384 B，含 754 个 `vo_01_p01_*` cue 名（753 cue + 1 bank 名）。

`nus3::HBank` 是靠 bank 元数据枚举 cue 的，**只改 `.nus3audio` 运行时找不到新 cue**。
当前两个项目都没有 `.nus3bank` 写入器，所以编辑器的安全策略是：
**只替换 `PACK` 里的音频负载，保持 cue 名、cue 数量、TNID 顺序不变**。

## FHM2D 包 hash

**不可由路径推导。** 对 7 组已知 (hash, path) 测
`crc32 / fnv1a / fnv1 / djb2 / sdbm / joaat` × 32 种路径拼法，命中 `0/7`。

**但可以自选。** 包文件名是 exe 用 `"0x%08X" + ".fhm2d"` 拼的
（`sub_14011E5F0`），表里写什么 id 就去开那个文件。
`*_structure.json` 的 `"HashName"` 就是这个 id，编辑器已经在写它。

先例：`E:\XB\mod\090sound\wing_gundam_zero_rebellion_sound_structure.json`
的 `"HashName": "0xDFA2BBCE"` 在 `dplcache_release` 里不存在，
只以 `data/x64/mod/0xDFA2BBCE.fhm2d` 存在，游戏正常加载。

## 相关 FHM2D 包 id（OB v27）

| 包 hash | 资源路径 |
|---|---|
| `0x8C428AF2` | `x64/090sound`（上面 7 个文件） |
| `0x264D1CA7` | `x64/800etcetera/raw_path_id`（`.vgsht1` + `.json`） |
| `0x5E92AAEC` | `x64/090sound/bgm_table/bgm_table` |
| `0xC91627E8` | `x64/012list/bgm_list/bgm_list` |
| `0xDFD38C70` | `x64/012list/character_list/character_list` |
| `0x147BC38E` | `x64/091waveform/voice/dummy`（vrtbl 全表常量） |
| `0x48B99707` | `x64/090sound/voicetable` → `vo_0001_p01_0_01.vot` |
| `0x87D4809B` | `x64/091waveform/voice/pilot` → `VO_0001_P01_0_01_ST_01.nus3bank` |

## 参考解析器

`xDocs\audio_research\parse_audio_index.py`
—— 解析 `raw_path_id`（双文件）+ `vrtbl` + `.vot`，与 `character_list.json`
交叉 join，把上面每条不变量都当断言。可作为 Rust 侧实现的对照。

OB 基线输出：

```text
streams registered : 307
voice routes       : 344
  voiceKey named   : 344/344
  stream resolved  : 271/344
character rows with a voice key: 253 (253 routed)
vo_0001_p01_0_01.vot: selfId=0x7e80801e situations=103 cues=242
```
