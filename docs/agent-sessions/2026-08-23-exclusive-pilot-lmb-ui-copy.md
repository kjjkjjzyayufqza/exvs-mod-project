# Exclusive pilot LMB/UI bind (research only)

## Goal

给新机体加**专属驾驶员**的 LMB / UI 资源。本轮只做研究记录，不实现 Test Editor，不改任何游戏/mod 文件，不打开 LMB 包内部模型/贴图/动画。

**Audio / voice / BGM is not this research.** Exclusive-pilot LMB/UI only.

Later Test Editor approach (specified, not implemented here): **copy-existing** LMB/UI `.fhm2d`, allocate a **new id/hash**, **inner file contents out of scope**.

- copy an existing LMB/UI `.fhm2d`
- assign an unused `HashName` / pack id
- leave inner file contents untouched
- write the new id into the matching `character_list` LMB fields

## Bind surface

游戏用 `"0x%08X.fhm2d"` 打开包。`character_list` 里这些 u32 **就是** FHM2D 的 `HashName`，不是路径哈希。

源：`src-tauri/src/format/characterlist.rs` 的 `CHARACTERLIST_COMMAND_POOL`；UI 名在 `src/models/characterListEntry.ts` / Character Form「LMB Properties」。

| command hash | UI / pool name | 运行时角色 | 字段里存的值 |
|---|---|---|---|
| `0xAF170BA4` | `lmbCutIn` | `sub_140533CF0` slot0 | `st_p_*` 包 HashName |
| `0x361E5A1E` | `lmbPilotClothing` | `sub_140533CF0` slot1 | `st_p_*` 包 HashName |
| `0xD263597C` | `lmbBoost` | `sub_140533A60` slot0 | `ex_p_*` 包 HashName |
| `0x4B6A08C6` | `exPilotClothingLmbHash` (`ex_pilot_clothing_lmb_hash`) | `sub_140533A60` slot1 | `ex_p_*` 包 HashName |
| `0x7C009F91` | `suppressOptionalLmbSidecar` | 整组 optional LMB sidecar 开关 | flag（不是包 id） |

IDA 选择器（POC `command_system_status_20260419.md`）：

```text
sub_140533CF0 slot: LMBCutIn, LMBPilotClothing, optionalPilotPresentationHashSlot2, Slot3
  fallback 0x031E4B34

sub_140533A60 slot: LMBBoost, EX_Pilot_Clothin_LMB_HASH, optionalSidecarHashSlot2, Slot3
  fallback 0x07D48515
```

slot2/slot3 在当前 OB 主线已清零或删列，专属驾驶员第一版**不必**克隆它们。

## Pack id 证据（name-map 全中）

对 `E:\XB\mod\012list\character_list\character_list.json` 非零值，和 `src/assets/fhm2d-name-map.generated.json` 求交：

| 字段 | 非零行 | 去重 | name-map 命中 |
|---|---|---|---|
| `lmbPilotClothing` | 179 | 141 | 141/141 |
| `exPilotClothingLmbHash` | 179 | 167 | 167/167 |
| `lmbCutIn` | 253 | 206 | 206/206 |
| `lmbBoost` | 253 | 236 | 236/236 |

路径族全部在 **`009gui/flash/pilot`**：

| 前缀 | 含义 | 样本 |
|---|---|---|
| `st_p_{series}_{pilot}_c{costume}` | 标准 LMB 驾驶员展示 | `st_p_001_001_c01` = `0x031E4B34` |
| `ex_p_{series}_{pilot}_c{costume}` | EX 服装 LMB | `ex_p_001_001_c01` = `0x07D48515` |

这两个样本都在 `E:\OBHK0.3_v27\data\x64\dplcache_release\` 有对应 `.fhm2d`（已 `exists`）。

RX-78（`entryId` 1001001）实测：`lmbCutIn=0x031E4B34`，`lmbPilotClothing=0`，`lmbBoost=0x07D48515`。很多机体 clothing 为 0，cut-in / boost 仍指向 `st_p` / `ex_p` 包。克隆时按 donor 哪列非零就复制哪几个包。

name-map 里约 238 个 `st_p_*`、275 个 `ex_p_*`。少数 hash 落到 `009gui/img_*` 占位名，仍是 009gui 包 id，复制方式相同。

## 和 VS 立绘的边界

`vsPL` / `vsPR`（及 C02–C04）也是 009gui 驾驶员图，但是 `009gui/image/pilot/vs_p_l` / `vs_p_r` 的 2D 立绘，**不是** LMB flash 包。本笔记的「复制现有 LMB/UI 包」只覆盖 `st_p_*` / `ex_p_*`。立绘要另开一页。

## 后续 Test Editor 形状（不做本轮）

1. 工作区路由：`009gui`（已有 `gui.card-icons` 等同 prefix）。不要塞进 `unit.sound` / `090sound`。
2. 操作：选 donor 机体或 donor HashName → 复制 `dplcache`/`mod` 里的 `0x{DONOR}.fhm2d` → 写入新 `HashName`（structure.json + 输出文件名）→ **不解包、不改内部文件**。
3. 绑定：把新 HashName 写进目标机体 `character_list` 的 `lmbCutIn` / `lmbPilotClothing` / `lmbBoost` / `exPilotClothingLmbHash`（只填 donor 非零的那些列；高位 hash 走已有 DualValue / signed-u32 保存路径）。
4. Repack/部署：`0x{NEW}.fhm2d` 进 `mod/`，再 Repack `0xDFD38C70`（character_list）。
5. 新 HashName 必须不在 dplcache 与现有 character_list 四列里。包 id 仍是自选 32-bit，不能从路径推导。

## 下一阶段（009gui clone）

实现计划（工作区 `009gui/`、clone EW Wing Zero `16001001` 驾驶员 GUI + Relena navi 009gui、新 Hash、打到 `mod/009gui/0x*.fhm2d`）：

`docs/agent-sessions/2026-08-23-009gui-wing-zero-pilot-navi-clone-plan.md`

vs2 参考树：`E:\XB\解包\vs2\bak\009gui`。源字节：OB `dplcache_release`。

## 明确不做

- 本轮不写 catalog / Init / 克隆 UI
- 不研究 `st_p_*` 包内 numdlb/nutexb/nuanmb
- 不改 900000004 或任何游戏文件
- 不把语音 `pilotPresentationHash` / BGM cueHash 混进这条链

## Sources

- `src-tauri/src/format/characterlist.rs` command pool
- Test Editor Character Form LMB Properties
- `src/assets/fhm2d-name-map.generated.json`（character_list 整数列 × 包表）
- `xDocs\character_list_research\command_system_status_20260419.md`（`sub_140533CF0` / `sub_140533A60`）
- OB `dplcache_release\0x031E4B34.fhm2d` / `0x07D48515.fhm2d` 存在性
