# 009gui pilot/navi clone — implementation plan for the next agent

## Goal

在 Test Editor 工作区落地 **`009gui/`**（参考 vs2 目录，**字节以 OB 为准**），并把 **Wing Zero 驾驶员 / 系列 016 navi** 的 009gui 包 clone 成新 HashName，绑定到 **`900000004`**，Repack 出 `mod/009gui/0x{NEW}.fhm2d`（游戏覆盖仍是 `0x{NEW}.fhm2d`）。

**不要改包内 `.lm` / `.nutexb` 内容。** 音频 / BGM / `060navi` 语音不在本计划。

前置研究：`docs/agent-sessions/2026-08-23-exclusive-pilot-lmb-ui-copy.md`。

## Donor / target（已核对）

| 角色 | `character_list.entryId` | 说明 |
|---|---|---|
| **Donor 驾驶员（推荐）** | **`16001001`** | ウイングガンダムゼロ（EW版）ヒイロ。016 族完整 |
| Alternate 驾驶员 | `28001001` | ウイングガンダムゼロ ヒイロ。Cut-in 是 016，Boost/scP 混了 028，**不要当默认 donor** |
| Target | **`900000004`** | 自定义机体 |
| Donor navi GUI | 系列 **016 Relena** | vs2 bak：`016gundmw_001relena_001.bin`；包名 `navi_*_016_o01*` |

vs2 参考树（只抄文件夹语义，不要从这里打 OB 包）：

`E:\XB\解包\vs2\bak\009gui`

OB 源包：

`E:\OBHK0.3_v27\data\x64\dplcache_release\0x{HASH}.fhm2d`

工作区根（Test Editor folder，例）：`E:\XB\mod\009gui\...`

## Donor 包清单（OB dplcache 均存在）

### A. EW Heero 009gui（绑 `character_list`）

| 字段 | command hash | donor pack HashName | name-map 名 | vs2-like 工作区相对路径 |
|---|---|---|---|---|
| `lmbCutIn` | `0xAF170BA4` | `0x88BD4DC3` | `st_p_016_001_c01` | `009gui/flash/pilot/p_016_001/st_p_016_001_c01` |
| `lmbPilotClothing` | `0x361E5A1E` | `0x11B41C79` | `st_p_016_001_c02` | `009gui/flash/pilot/p_016_001/st_p_016_001_c02` |
| `lmbBoost` | `0xD263597C` | `0x8C7783E2` | `ex_p_016_001_c01` | `009gui/flash/pilot`（extract 后按 meta 命名） |
| `exPilotClothingLmbHash` | `0x4B6A08C6` | `0x157ED258` | `ex_p_016_001_c02` | 同上 |
| `vsPL` | `0xE835F60F` | `0x9233D6AC` | `vs_p_l_016_001_c01` | `009gui/image/pilot/vs_p_l/vs_p_l_016_001_c01` |
| `vsPR` | `0xCF29CF0B` | `0xDCD27CC6` | `vs_p_r_016_001_c01` | `009gui/image/pilot/vs_p_r/vs_p_r_016_001_c01` |
| `scP` | `0xFC0CAD0B` | `0x41C9ED41` | `sc_p_016_001_c01` | `009gui/image/pilot/sc_p/sc_p_016_001_c01` |

`lmbCutIn`/`lmbPilotClothing` 值 **就是** FHM2D HashName（已 141–236/全中 name-map）。

### B. Relena navi 009gui（绑 `navi_list`，不是 character_list）

| 用途 | HashName | name | packagePath |
|---|---|---|---|
| 战斗 flash | `0x3D877AB4` | `navi_bt_016_o01` | `009gui/flash/navi/battle` |
| 战斗小图 | `0xF98828B4` | `navi_bt_s_016_o01` | `009gui/image/navi/navi_bt_s/navi_bt_s_016_o01` |
| 玩家 flash c01 | `0x707A36C4` | `navi_pl_016_o01_c01_a2` | `009gui/flash/navi/player` |
| 玩家 flash c02 | `0xE973677E` | `navi_pl_016_o01_c02_a2` | `009gui/flash/navi/player` |
| 玩家小图 c01 | `0xBDCC44A9` | `navi_pl_s_016_o01_c01` | `009gui/image/navi/navi_pl_s/...` |
| 玩家小图 c02 | `0x24C51513` | `navi_pl_s_016_o01_c02` | 同上 |

`060navi/voicetable` / `091waveform/voice/navi`（`vo_0016_n01_0_01`）**本计划不做**。

## 工作区约定

现有 `gui.card-icons` 等已经用 prefix **`009gui`**。不要新建 `090sound` 式第二套。

建议：

- 新 route（可选）`gui.pilot` / `gui.navi`，prefix 仍是 `009gui`，避免和 card-icon 包抢同一个 defaultPackName。
- 或 catalog 多条 content，都 `routeId: gui.card-icons` 的 prefix，但 `defaultPackName` 用 name-map 的 `packagePath` 最后一层（`st_p_016_001_c01`）。
- **禁止**把 flash/pilot 解进 `009gui/ms_ms_s`（那是卡片图标）。

工作区形态（clone 后）：

```text
{testEditorFolder}/009gui/
  flash/pilot/p_016_001/st_p_016_001_c01/   + *_structure.json  HashName=0xNEW1
  flash/pilot/p_016_001/st_p_016_001_c02/
  image/pilot/vs_p_l/vs_p_l_016_001_c01/
  ...
  0x{NEW1}.fhm2d
  0x{NEW2}.fhm2d
```

游戏注入目录（`obModPath`，常为 `data/x64/mod`）再放同名 `0x{NEW}.fhm2d`。工作区 `E:\XB\mod` 和游戏 `mod` 可能不是同一路径——Plan 里写清「workspace 009gui 树 + 输出 fhm2d」；复制到游戏 mod 由用户现有 Repack/部署流程做，不要静默写游戏盘。

vs2 bak 只用于：文件夹名、`packagePath`、extract `--type` 命名。**源字节只从 OB dplcache 复制。**

## 功能设计（Test Editor）

### 后端（必须）

Rust 新命令，例如 `clone_fhm2d_pack`：

输入：`sourcePath`（`dplcache\0xDONOR.fhm2d`）、`newHash`（u32）、`outputFhm2dPath`、可选 `extractFolder`。

行为：

1. 读 donor `.fhm2d` 原样字节（**不解析内部 lm/nutexb**）。
2. `newHash` 必须不在：dplcache 文件名、character_list 全部 u32 字段、navi_list 资源 hash。
3. 写 `outputFhm2dPath` 为 `{dir}/0x{NEW:08X}.fhm2d`（文件内容 = donor 字节）。
4. 若请求 extract：调用现有 `extract_fhm2d_to_folder`；structure.json 的 **HashName 写成新 id**（这是游戏认的 id）。extract type：有 `.lm` 的 flash 包不要当 `all_nutexb` 卡片包；优先跟 name-map `packagePath` 走 folder layout。若现有 type 会乱命名，加 `gui` type 或复用 sound 的「按 vs2 meta 路径命名」而不是七文件 090sound 规则。
5. 不改 payload。

新 Hash 建议：`CRC32("GUI_CLONE|900000004|" + donorName)`，冲突则 `|1` `|2`…（与 BGM `BGM_CUEHASH|` 同一思路）。不要用 donor 的 cueCrc 当 pack id。

### 前端

不要做 pipeline TODO。不要 Copy-from 改内部字段。

最小闭环（第一版就能打出包）：

1. **Character List** 目标行 `900000004`：按钮 **Clone Wing Zero GUI**（或通用：选 donor entryId + 勾选上表字段）。
2. 对每个勾选字段：invoke clone → 得到 newHash → 写回该字段（signed u32 保存路径已修）。
3. Save `character_list.bin` + Repack `0xDFD38C70`。
4. 每个新包：Folder structure / 现有 Repack 出 `009gui/0xNEW.fhm2d`。

Navi 第一版可以同一按钮第二步，或独立 **Clone navi GUI**：clone 表 B 六个包 + **追加 `navi_list` 行**（复制 Relena 行，换 `character_unique_id` 和新资源 hash）。只 clone 009gui 不改 `navi_list`，新 navi flash **不会出现在选 navi 列表**。

Init modal：`navi_list` (`0x6FCC0FBA`) only. Do not add 13 GUI donor init rows. Do not extract flash/pilot into `009gui/ms_ms_s`.

## 落地（implemented 2026-08-23）

Shipped as one backend command, not 13 catalog rows:

- Rust: `src-tauri/src/format/gui_pack_clone.rs`, commands `clone_fhm2d_pack` / `clone_character_gui_set`.
- UI: Character List **Clone GUI** dialog. Default donor `16001001`, target = selected entry (`900000004`).
- Product files: `{testEditorFolder}/009gui/0x{NEW}.fhm2d` (byte-identical to donor). Optional copy to `obModPath`.
- navi_list singleton catalog/Init: pack **`0x6FCC0FBA`**, route `list.navi`, folder `012list/navi_list`. Clone appends Relena rows with remapped resource hashes and a new `character_unique_id`.
- v1 is **copy-only** (no extract). Init navi_list before cloning navi GUI.
- After clone: Save `character_list.bin` + Repack `0xDFD38C70`. If navi: Repack `0x6FCC0FBA`.

Do not treat vs2 bak as OB source bytes.

## 验收

- `900000004` 的 LMB/VS/scP 七列不再等于 `16001001` 的 donor hash，且每个新 hash 在 dplcache **原先不存在**。
- `{workspace}/009gui/0x{NEW}.fhm2d` 与 donor 字节相同（或仅 structure HashName 不同若走 extract+repack；**若只 copy 整包，fhm2d 字节应与 donor 完全相同**，游戏只靠文件名）。
- 不解包改 nutexb。
- 不改 `0.c` / 语音 / BGM。

**注意：** 若只改文件名为 `0xNEW.fhm2d`、内容字节不变，游戏用文件名打开即可，不必 rewrite 包内 hash。structure.json HashName 必须是 NEW，否则 Test Editor Repack 会打回 donor id。

## 陷阱

- **不要用 `28001001` 当默认 donor**（016+028 混用）。
- `all_nutexb` extract 是卡片/机体图标，不是 `.lm` flash。
- 七文件 `apply_090sound_root_names` 禁止用在 009gui。
- DualValue 高位 hash：走 `json_to_raw_u32_for_kind`。
- `suppressOptionalLmbSidecar` 是 flag，不要当 pack id clone。
- vs2 `p_016_001` 目录可对照；OB 包仍以 dplcache 为准。

## 明确不做

- 实现时不要手改用户 `character_list.bin` / 游戏目录（编辑器做）。
- 不要复制整份 vs2 bak 009gui（数万 nutexb）。
- 不要做 060navi / waveform navi 语音。
- 不要做 inner LM 换皮。
