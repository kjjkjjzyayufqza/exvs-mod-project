# Wing Zero Rebellion 变形移植：Agent 前置上下文

更新时间：2026-08-09  
用途：让新 Agent 从已证实结论继续，不重复名称盘点、SHL 解析、motion 定位或骨架比较。

## 最短读取路径

1. 先读本文件。
2. 需要实施细节时，只读
   `docs/msc-research/2026-08-09-wing-zero-rebellion-transform-port-plan.md`
   的第 1、9–16、21 节。
3. **鸟形态武装 / 主射封锁 / 0.c 输入 bit（2026-08-14 已实机确认）：**
   `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md`
   — 只改 `0.c` `func_143`；Rebellion 主射 bit=`0x1` 不是 TV 的 `0x100`；鸟 form=`0x2`。
3b. **鸟近战全走 N（2026-08-20）：**
   `docs/msc-research/wing-zero-rebellion-bird-melee-n-followup.md`
   — 鸟 `0x2` → `0x928ca34f` `func_937`；不切模型；不进 `func_41` 白名单。
4. **飞行打断 / 动作≠形态（2026-08-16）：**
   `docs/msc-research/wing-zero-rebellion-flight-interrupt-form.md`
   — 打断只换动作 hash，不清 `global143`。Rebellion 受击必须 FORCED_RECOVERY，
   **禁止**再排 `0x77b100ff`。拆 form 不能只认站立 `0x6d00aeaa`。
5. 只有质疑资源盘点或映射证据时才读：
   - `work/20260809-wing-zero-rebellion-transform-plan/evidence/E-007.md`
   - `work/20260809-wing-zero-rebellion-transform-plan/evidence/E-008.md`

不要默认读取整个 `work/` 时间线，也不要重新扫描全部 `E:\XB`。

## 身份与规范名 source

- Target：Wing Gundam Zero Rebellion，`900000004 / 0x35A4E904`。
- Source：TV Wing Zero，`28001001 / 0x01AB42E9`。
- 主 source 名称：`028gunwtv_001gunwtv_001`。
- Sound 名称：`se_chr_028gunwtv_001gunwtv_001.nus3bank`。
- `_ad47e15a` MSC 不是本次主参考。

已冻结路径：

```text
Model  E:\XB\mod\002chara\028gunwtv_001gunwtv_001
Motion E:\XB\mod\003motion\001hito_028gunwtv_001gunwtv_001
Effect E:\XB\mod\006effect\028gunwtv_001gunwtv_001
MSC    E:\XB\mod\040msc\028gunwtv_001gunwtv_001
Param  E:\XB\mod\041cpm\028gunwtv_001gunwtv_001
Sound  E:\XB\解包\vs2\x64\091waveform\se\chara\028gunwtv\se_chr_028gunwtv_001gunwtv_001.nus3bank
```

当前已验证总数：Model 94、Motion 474、Effect 39、MSC 3、Param 9、Sound 1。五类 FHM2D 均有同名 modern sibling `*_structure.json`。

## 已证实，默认不得重做

### MSC 最小接线

- Target `0.c` 已有 `0x17/0x18/0x19` 输入与 resolver，默认不改。
- Target `func_450..466` 与 source 共通飞行控制器语义一致，默认不复制。
- Target `2.c` 只需把三 action 接到 `func_450/452/464`。
- Unit callback slot `0x23/0x24/0x25` 需要 target-specific enter/loop/exit；`0x26/0x27` 保持 `0`。
- Motion table `0x3`、`0x4` 各补 slot `0x37/0x38/0x3B`。

### 三个 direct motion Item

它们不是 action folder，也没有 wing/weapon child channel：

| 阶段 | Slot | Runtime ID | LE `unk1` | fileIndex | 规范名核心 |
|---|---:|---|---|---:|---|
| Enter | `0x37` | `0x0646F069` | `69f04606` | 16 | `body_tf_kamaesht2neo_sht_air_fr` |
| Loop | `0x38` | `0xCF3250EB` | `eb5032cf` | 418 | `body_tf_kamaesht2nro_sht_air_fr` |
| Exit | `0x3B` | `0x5D85BCF9` | `f9bc855d` | 254 | `body_tf_kamaesht2nrr_sht_air_fr` |

三项均为 `type=Item`、`unk2=00000000`，位于 source motion package 的 `0\0`。Target 534 项 motion structure 中尚无这三个 key。

`kamaesht2neo` 的当前高可信语义推断：`kamae`（構え/架势）+ `sht2`（Shot/Shooting 2）+ `neo`（Neo Bird Mode）；结合 slot `0x37`，功能名可写成 `neo_bird_transform_enter_air_front`。逐词展开不是官方字符串证明。

### Model/SHL 最小 Bird 闭包

- `0xA341F1EF` → `..._body_tf`（Bird root）
- `0x0C241692` → `..._wep_brifle00a`
- `0xF62B2BF1` → `..._wep_brifle00b`
- `0xFF02AFD5` → `..._wep_shield00`

Core Bird 只需以上四组。独立 `wep_wing00` 是 source 普通形态资源；Bird 翼骨已集成在 `body_tf`。

### 骨架结论

- Source `body_tf` 78 骨 vs target normal body 52 骨，只共享 19 个骨名。
- Source wing 21 骨 vs target wing 44 骨，只共享 15 个骨名，6 个同名骨 parent 不同。
- 三条 transform NUANMB 不能播放到 target normal body；source wing motion 不能重定向到 target wing。
- Phase A 应成套使用官方 source `body_tf` skeleton + 三条 direct NUANMB。后续 Rebellion 外观化只替换 mesh/material，保留动画契约。

### Param

- Source speedparam：69 fields、2 rows。
- Target speedparam：74 fields、1 row。
- 新增 flight row `0x09A2F239`：先复制 target normal row `0xC2B19D12`，再按 field hash 覆盖 69 个共有字段；5 个 target-only ground-step 字段保留 target 值。
- 禁止二进制整 row 或整文件覆盖。

## 已作废结论

- “Model 缺 85 个资产”——错误，来自 legacy hash 路径搜索。
- “仍等待用户解包”——错误，规范名资源与 modern structure 已齐。
- “三个 motion 是多子通道 action folder”——错误，它们是 direct Item。
- “需要把 source wing 动作重定向到 Rebellion wing”——错误，骨架不兼容且 Bird 不加载独立 wing。
- “复制整个 source MSC/0.c/共通控制器”——不需要，会扩大回归面。
- “鸟形态 `func_15` 整函数 return 0 可安全挡地面武装”——错误，会挡掉中断后的 slot 重选。
- “受击后跟 TV 一样重选 `0x77b100ff`”——错误。Rebellion 飞行不完整；那会造成动作已离飞行、操作仍是飞行。
- “只在站立 idle `0x6d00aeaa` 拆 form 就够”——错误。受击 `0x4cdc9902`、空中 idle `0xf5f21169`、`0x21`/`0x22` 都过不了这道门。

## 实施检查点

用户授权实际修改时，从这里开始：

1. 捕获 target 六目录 before manifest。
2. 向 target model structure/SHL 追加四个规范名 Bird model group；根据当时 DFS model-group 顺序计算 folderIndex，不硬编码。
3. 向 target motion `0\0` 追加三个 direct Item，分配新 fileIndex。
4. 新增 target flight speed row。
5. 修改 target `2.c`：三 action、三 callback、六条 motion table、Bird/normal 两个 target-first adapter。
6. 跑一个最窄 compile/round-trip，再进入计划中的 T-01～T-14 实机门槛。

当前 scope 仍禁止 Agent 自行解包 FHM2D、覆盖 source、编译 MSC 或实机测试，除非用户明确扩大授权。

## 允许重启研究的条件

仅出现以下情况之一时重查对应证据：

- 用户明确换了 build 或替换了上述 source structure/SHL/NUSKTB。
- 某个已冻结规范路径不存在，或内容与 structure count 冲突。
- 第一个实施语义门槛失败，失败证据直接反驳本文件结论。
- 用户明确要求重新审计。

重查时只查冲突点：名称优先、一次批量读取、一次最窄验证。不得为“更放心”重跑完整盘点。

## 最后证据

2026-08-09 名称级校验通过：

```text
model=94 motion=474 effect=39 msc=3 param=9 sound=1; transform items=3
```

## Suggested skills

- `caveman`、`gpt-fast-path`、`gpt-fast-verify`：所有后续工作。
- `reverse-engineering`：只有出现新二进制/MSC 语义问题时。
- `executing-plans`：用户授权按现有计划实施时。
- 不需要 `deep-research`、新建 case-specific skill 或多 Agent 重复盘点。

