# 跨机体 MSC 研究总览

生成日期：2026-06-21

本页是跨版本、跨机体 MSC 研究的入口页。它把现有 `docs/` 中 MSC 相关文档、真实硬盘输入源、第一批目标机体和下一阶段 `.c` 读码流程统一到同一张图里。后续每个机体应单独建目录，并从这里互链。

## 当前研究目标

最终目标不是只看 `2.c`，而是把每个机体的 `0.c / 1.c / 2.c` 放在一起解释：

```text
0.c: input / action selector / gameplay category layer
1.c: character-side small script or glue layer, often much smaller
2.c: depiction / action callback / weapon / movement / camera / shell output layer
```

跨机体比较必须回答：

- 动作入口怎么从 `0.c` 选到 action hash。
- `2.c` 怎么注册 action hash、slot callback、resource hash。
- 主射、副射、特射、特格、格斗、觉醒、形态变化、武器资源、镜头、shell/loadout 分别落在哪一层。
- 新式 MSC 与旧式 MSC 的差异是否来自 MSC 自身、`chrsysparam.csyspm`、还是二者配合。

## 已读 MSC 文档覆盖面

本轮已枚举并抽读 `docs/` 下所有文件名或内容与 MSC / unit task / weapon / syscall / input-action / native-truth 相关的 Markdown，并 full-read 核心入口文档：

- `docs/msc-binary-format-spec.md`
- `docs/msc-research/README.md`
- `docs/msc-research/msc-research-gap-map.md`
- `docs/msc-research/msc-modder-operating-manual.md`
- `docs/msc-research/system-control-surface-matrix.md`
- `docs/msc-research/cross-unit-first-batch-comparison.md`
- `docs/msc-research/msc-generation-param-bridge-comparison.md`
- `docs/agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md` 的相关索引与结论段
- `docs/agent-sessions/msc-workspace-redesign/process.md` 的相关索引与结论段

当前文档共识：

- `2.c` 主链是 `main -> func_1 -> func_877 -> func_1042/1043 -> func_4 -> func_44/52 -> ACTION_* -> runtime segment -> syscall`。
- `func_1` 是初始化，不是具体武装。
- `func_1043` 是 action hash registry。
- `func_44/52` 是 action commit / callback dispatch。
- `sys_4F` 偏 weapon / ammo / presentation entry control。
- `sys_51` 偏 assist/summon。
- `sys_46` 偏动作内 movement bus，不能等同普通 BD。
- 普通 BD / step / boost 基础性能优先查 `speed_param` / resource。
- `func_N` 不能作为跨机体主键；必须用 semanticId + evidence shape。
- 新式 MSC 的 rename/动作解释需要 paired `Msc + Param/chrsysparam.csyspm`，不能只读 `2.c`。

## 硬盘输入源核验

Character ID Table 实际路径：

```text
E:\XB\解包\com\file\012list\0x036B9E67\character_id_table.json
```

用户给出的无后缀路径不存在；当前使用上面的 Character ID Table 文件定位 `Msc` / `Param` 资源。

Character ID Table 只用于定位源资源：`id` 对应机体，`Msc` / `Param` 等字段是 signed int，映射 FHM2D 文件时转 uint32 hex，例如 `1765766509 -> 0x693F756D`。它不是动作语义证据；动作语义必须回到 `.c` 和 Param row 的实际读取路径。

## 第一批机体映射

| 机体 | Character ID | Msc signed | Msc hex | Param hex | 源 FHM2D 状态 | 解包状态 |
|---|---:|---:|---|---|---|---|
| Unicorn / 001UNIGUN | `15001001` | `186125726` | `0x0B180D9E` | `0x5AE33786` | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x0B180D9E.fhm2d` exists | done: `0/1/2.c` + raw Param；主形态、loadout、代表射击/援护/换装链已直接读码 |
| Sinanju / 003SINANJ | `15003001` | `-812662422` | `0xCF8FC16A` | `0x9E74FB72` | `E:\OBHK0.3_v27\data\x64\dplcache_release\0xCF8FC16A.fhm2d` exists | done: `0/1/2.c` + raw Param；主射、CS、四向 Bazooka、assist、Meteor Kick、赤色彗星强化已直接读码 |
| NEXA-N 极限高达爆破 | `59001001` | `1765766509` | `0x693F756D` | `0x38C44F75` | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x693F756D.fhm2d` exists | done: `0/1/2.c` + Param；Funnel/Bomber/代表 ranged/melee 链已直接读码 |

第二批扩展样本：

| 机体 | Character ID | Msc hex | Param hex | 状态 |
|---|---:|---|---|---|
| Gundam AGE-FX | `33004001` | `0x605245CC` | `0x31A97FD4` | MSC + Param 解包、0/1/2 反编译、group 摘要与 NEXA registry/field 语义对照完成 |
| Delta Plus | `15004001` | `0x04AD9F33` | `0x5556A52B` | MSC + Param 解包、0/1/2 反编译；主射/手动装填/CS/副射/变形主射/变形副射/变形特射已连到 raw Param row |
| Kshatriya | `15002001` | `0x3724E360` | `0x66DFD978` | fresh MSC + Param 解包；普通态/Besserung 状态轴、5-to-3 loadout、character/speed 双行切换和 98/98 projectile literal bridge 已直接读码 |
| RX-78-2 Gundam | `1001001` | `0xF22E425D` | `0xA3D57845` | fresh MSC + Param 解包；0/1/2 直接读码；主射、CS、Bazooka、assist、Hammer、Beam Javelin 三段、Last Shooting projectile 段已连到 Param row；另完成 MBON-derived legacy 1011 同机体对比 |
| G-Self | `42001001` | `0x72CD747F` | `0x23364E67` | fresh MSC + Param 解包；0/1/2 直接读码；Space / Reflector / Assault 四状态候选与 Assault Pack 多弹体族已连到 raw Param |
| Mack Knife (Mask) | `42002001` | `0xC33AA885` | `0x92C1929D` | fresh MSC + Param 解包；0/1/2 直接读码；normal / Long-Range Booster selector、slot 1/2 loadout、Beam Vulcan / Plasma Claw / Grenade Launcher 候选链已连到 raw Param |
| Gundam Aerial | `66001001` | `0x19CE466D` | `0x48357C75` | fresh MSC + Param 解包；0/1/2 直接读码；46-action external table、动态 action/phase registry 与代表性多弹体族已连到 raw Param |
| Gundam Pharact | `66002001` | `0x33BAAE59` | `0x62419441` | fresh MSC + Param 解包；0/1/2 直接读码；32-action external table、方向特殊移动、82 个 literal bullet hashes 与临时超远锁定态已连到 raw Param |
| Darilbalde | `66003001` | `0x39DD42B7` | `0x682678AF` | fresh MSC + Param 解包；0/1/2 直接读码；43-action external table、四机 drone state machine、scatter/mine 分槽与 Daya Ambicar barrier proxy 已连到 raw Param |

既有旧样本：

| 样本 | Msc hex | 状态 |
|---|---|---|
| Delta Kai modified working copy | `0xBDBE6FEA` | `E:\XB\解包\com\file\0xBDBE6FEA` exists；source FHM2D missing；current `2.c/2.dscex` contains 2026-06-19 AI patch |
| Delta Plus OB v27 source sample | `0x04AD9F33` | source FHM2D verified；fresh `040msc/041cpm` extract complete |

## 工具链核验

前端 Character ID Table 对 `Msc` 字段的 route：

```text
Msc -> unit.msc -> 040msc
msc.workspace -> 040msc
```

证据：

- `src/services/testEditorWorkspace/defaults.ts`
- `src/page/TestEditor/components/character-id-table/assetRoute.test.ts`
- `src/page/TestEditor/components/character-id-table/assetRef.ts`
- `src/page/TestEditor/components/character-id-table/extractFhm2d.ts`

FHM2D extract 命令：

```text
extract_fhm2d_to_folder(sourcePath, outDir, format="fhm2d_msc")
```

Rust 内部函数：

```text
app_lib::format::fhm2d::extract_fhm2d_to_folder_impl(...)
```

当前复用的本地 CLI：

```text
src-tauri/src/bin/fhm2d_extract_folder.rs
```

用途：直接调用现有 Rust extract 函数，避免通过 UI 手动点击。

MSC 反编译命令：

```powershell
python tools\mscdec.py "<script.bscex|cscex|dscex>" -o "<script.c>" -log "<script.txt>"
```

MSC 编译命令：

```powershell
python tools\msclang.py "<script.c>" -o "<script.mscsb>" -i
```

前端 `MscWorkspaceView` 的约定：

```text
0.bscex -> 0.c / 0.txt
1.cscex -> 1.c / 1.txt
2.dscex -> 2.c / 2.txt
```

## 首批实际产物

当前持续使用 `src-tauri/src/bin/fhm2d_extract_folder.rs` 调用现有 Rust FHM2D 解包函数；
十二个真实源样本均已完成 `0/1/2` 解包、反编译和源码快照记录。

解包与反编译输出：

| Msc hex | Workspace path | Binary outputs | Decompiled outputs |
|---|---|---|---|
| `0x0B180D9E` | `E:\XB\解包\com\file\040msc\0x0B180D9E` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c`, `0.txt`, `1.txt`, `2.txt` |
| `0xCF8FC16A` | `E:\XB\解包\com\file\040msc\0xCF8FC16A` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c`, `0.txt`, `1.txt`, `2.txt` |
| `0x693F756D` | `E:\XB\解包\com\file\040msc\0x693F756D` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c`, `0.txt`, `1.txt`, `2.txt` |
| `0x605245CC` | `E:\XB\解包\com\file\040msc\0x605245CC` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0x04AD9F33` | `E:\XB\解包\com\file\040msc\0x04AD9F33` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0x3724E360` | `E:\XB\解包\com\file\040msc\0x3724E360` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0xF22E425D` | `E:\XB\解包\com\file\040msc\0xF22E425D` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0x72CD747F` | `E:\XB\解包\com\file\040msc\0x72CD747F` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0xC33AA885` | `E:\XB\解包\com\file\040msc\0xC33AA885` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0x19CE466D` | `E:\XB\解包\com\file\040msc\0x19CE466D` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0x33BAAE59` | `E:\XB\解包\com\file\040msc\0x33BAAE59` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |
| `0x39DD42B7` | `E:\XB\解包\com\file\040msc\0x39DD42B7` | `0.bscex`, `1.cscex`, `2.dscex` | `0.c`, `1.c`, `2.c` |

正文不列机器缓存。跨机体结论只引用 `.c` 文件、函数行号、注册 hash、Param row 字段落点和 syscall/resource 输出。

第一批横向结论见：[首批跨机体 MSC 对比](cross-unit-first-batch-comparison.md)。

代际与 Param bridge 结论见：[MSC 代际与 Param Action Bridge 对比](msc-generation-param-bridge-comparison.md)。

## Param 配对进展

已解包：

```text
E:\XB\解包\com\file\041cpm\0x5AE33786  # Unicorn
E:\XB\解包\com\file\041cpm\0x9E74FB72  # Sinanju
E:\XB\解包\com\file\041cpm\0x38C44F75  # NEXA-N
E:\XB\解包\com\file\041cpm\0x31A97FD4  # AGE-FX
E:\XB\解包\com\file\041cpm\0x5556A52B  # Delta Plus
E:\XB\解包\com\file\041cpm\0x66DFD978  # Kshatriya
E:\XB\解包\com\file\041cpm\0xA3D57845  # RX-78-2
E:\XB\解包\com\file\041cpm\0x23364E67  # G-Self
E:\XB\解包\com\file\041cpm\0x92C1929D  # Mack Knife (Mask)
E:\XB\解包\com\file\041cpm\0x48357C75  # Gundam Aerial
E:\XB\解包\com\file\041cpm\0x62419441  # Gundam Pharact
E:\XB\解包\com\file\041cpm\0x682678AF  # Darilbalde
```

`chrsysparam.csyspm` shape：

| Unit | Size | Table0 | Action storage classification |
|---|---:|---|---|
| Unicorn | `68` | `1 x 1` empty | classic local selector |
| Sinanju | `68` | `1 x 1` empty | classic local selector |
| NEXA-N | `28224` | `55 x 128` | external Param action-table |
| AGE-FX | `38744` | `72 x 128` | external Param action-table |
| Delta Plus | `68` | `1 x 1` empty | classic local selector |
| Kshatriya | `68` | `1 x 1` empty | classic local selector |
| RX-78-2 | `68` | `1 x 1` empty | classic local selector |
| G-Self | `68` | `1 x 1` empty | classic local selector |
| Mack Knife (Mask) | `68` | `1 x 1` empty | classic local selector |
| Gundam Aerial | `24128` | `47 x 128`, rows `1..46` nonempty | external Param action-table |
| Gundam Pharact | `16960` | `33 x 128`, rows `1..32` nonempty | external Param action-table |
| Darilbalde | `22592` | `44 x 128`, rows `1..43` nonempty | external Param action-table |

当前硬盘证据不支持简单“新/旧”二分。至少区分：external Param action-table、classic local selector、legacy embedded B4AC。

Unicorn 已进一步证明 68-byte empty `chrsysparam` 不等于“无法连 Param”：其
`0.c func_143 -> action hash -> 2.c func_1065 callback -> arms/bullet row` 已形成闭环，
且 `global143 -> runtime field 0x17 -> 0.c global39` 直接构成 Unicorn / Destroy 形态轴。
Kshatriya 进一步证明同一 classic runtime field 也能承载复活形态：`global143=0/1` 在普通态与
Besserung 间切换 5-to-3 arms loadout、两行 characterparam、两行 speedparam 和 action registry；
单位 action 区 98 个唯一 projectile literal 全部命中 114-row raw bulletparam。
Sinanju 进一步证明 classic selector 也能表达非换装的时限强化：`0.c func_143 -> 0xD44E9701 -> 2.c func_1025/1027 -> func_1084` 触发
`global142` 从 normal speedparam row `0xC2B19D12` 切到 buff row `0x3548754D`，同时切
`characterparam` entry `0x1B12AE7D -> 0xF51CCF51`。
Delta Plus 进一步证明 classic selector 也能承载 WR / transform loadout：`0.c func_143` 的
`global20 & 0x4000` 分支选择 `0x91CE1EFC / 0x3470C0CF / 0x9C05B42D`，`2.c func_1037/1038`
在 `0x1486A84F/0x10B251B4/0xA8E202BF` 与 `0x377D1397/0xF100A0DA/0x1799C911` 两套
raw arms rows 间切换，代表 projectile 已命中 `bulletparam.bin` rows。
G-Self 进一步证明 classic selector 也能承载密集的换装状态桥：
`0.c func_143` 按 `global39 == 0/1/2/3` 选择四套 action hash，`2.c func_1125/1127/1128/1130`
分别重装 slot 0..4 arms rows、`characterparam` row 和 `speedparam` row。`func_1146` 还用
slot 4 ammo 阈值维护 `global776` 的 4-to-0 resource count，并由 `func_1149/1150` 选择十个
`bulletparam` rows。结合 wiki，四状态对应 Space / Reflector stored/deployed / Assault
候选；完整证据见 [42001001 G-Self](units/42001001-g-self/README.md)。
Mack Knife 进一步证明 68-byte empty `chrsysparam` 也能表达紧凑的二状态变形/强化桥：
`0.c func_143` 用 `global39 == 0/1` 分离 normal 与 Long-Range Booster 派生，
`2.c func_1101/1102/1106/1107` 在 slot 1/2、`speedparam` row 与 `characterparam`
row 间切换；Beam Vulcan、Plasma Claw、Grenade Launcher 候选均已从 action hash 追到
`sys_4F` 和 raw `bulletparam` row。完整证据见
[42002001 Mack Knife](units/42002001-mack-knife-mask/README.md)。
Aerial 则属于 external Param action-table：`0.c func_143/145` 通过 `sys_41` 和
`0x700000/0x700002` 读取 action row，`2.c func_849` 动态注册 46 个 action 与三相 callback，
`func_973` 将 141 个 phase key 映射到实际函数。代表性 `sys_4F` hash 已逐项命中
156-row `bulletparam.bin`。完整证据见
[66001001 Gundam Aerial](units/66001001-gundam-aerial/README.md)。

Pharact 复用与 Aerial byte-for-byte 相同的 `0.c/1.c` external-table 模板，但 raw
`chrsysparam` 缩为 32 个 action rows，`2.c func_965` resolver 为 101 cases。其
`func_1115` 直接实现左右方向特殊移动，`func_997` 把四方向 movement 与 5 个 raw
bullet rows 接起来；全文件 82 个唯一 literal bullet hashes 全部命中 93-row
`bulletparam.bin`。`func_1054/1055` 还在单次动作中把 `characterparam` 距离从
`380.0` 切到 `5000.0` 后恢复。完整证据见
[66002001 Gundam Pharact](units/66002001-gundam-pharact/README.md)。

Darilbalde 再次复用同一 byte-for-byte `0.c/1.c` template，但 raw table 扩为 43 个
action rows，`2.c func_967` resolver 为 132 cases。`func_1119/1174` 在 deploy 前后切换
`0x0F856FF7/0xAFFD33E0/0x36F4625A` 的可用性，并用 `global955..957` 维护四枚
Gusser Ishvara 的 manual/auto-release；`func_1167..1170` 则消费 slot 4、发射两个
左右 barrier proxy、detach/restore Daya Ambicar shell。24 个 raw-field/literal bullet IDs
全部命中 51-row `bulletparam.bin`。完整证据见
[66003001 Darilbalde](units/66003001-darilbalde/README.md)。

## 新旧 MSC 比较假设

当前最重要的假设来自旧 session 文档：

```text
resource list
  -> Msc/Param pair
  -> chrsysparam table0 row
  -> category bits / action matrix
  -> Msc/0.c gameplay category layer
  -> Msc/2.c group resolver and phase callbacks
```

早期“旧式都内嵌 B4AC、新式都依赖 chrsysparam”的假设已被当前硬盘样本修正。RX、Unicorn、Kshatriya、Sinanju、Delta Plus、G-Self、Mack Knife 都是 classic local selector；NEXA-N、AGE-FX、Gundam Aerial、Gundam Pharact、Darilbalde 是 external Param action-table；只有独立 [legacy 1011 对照](units/1001001-rx-78-2/legacy-1011-vs-ob-v27.md) 命中 embedded B4AC。该文件是 MBON-derived、FB-compatible 且含 XB-style Burst 改造的混合代码，不是 clean official build。跨机体比较不能只做 `2.c` diff，必须同步记录：

- Character ID row
- Msc hash
- Param hash
- `0.c / 1.c / 2.c` 行数、SHA、关键函数行号和调用链
- `Param/chrsysparam` action rows
- action hash registry
- group resolver
- slot callback registry
- weapon/ammo/movement/camera/shell syscall distribution

## 下一阶段目录规范

建议每个机体建立：

```text
docs/msc-research/units/<character-id>-<short-name>/
  README.md
  source-map.md
  0c-analysis.md
  1c-analysis.md
  2c-analysis.md
  cross-links.md
```

`README.md` 必须至少包含：

- Character ID row。
- `Msc` / `Param` signed + uint32 hex。
- 源 FHM2D 路径。
- workspace extract 路径。
- `0.c / 1.c / 2.c` 行数、函数数、SHA-256。
- action registry 摘要。
- 与已知样本的差异摘要。

## 下一步队列

- 用 25 个共同 action handler hash 建立跨样本 semantic candidate 表。
- NEXA-N 已把 26 个 `sys_4F` 输出定位到 bulletparam row，并确认 row `33` 是 `func_1185` 前输入显式投递的移动/BD 格派生候选；下一步追 melee param 与 on-expire/hitgroup/interaction。
- AGE-FX group `0x35` 已追到 `sys_51` assist payload，group `0x1D` 已追到 `0x9B4748FB -> bulletparam row 69`；下一步拆 group `0x0C/0x1F` 三相 callback。
- Unicorn 已完成主形态、slot 0/1/3 loadout、Beam Magnum、两形态 CS/sub、normal special melee、Destroy Tonfa、assist、NT-D 与觉醒技强制换装的代表闭环；下一步拆 Destroy 格斗、interaction/hitgroup 与第二 `B0004[1]` 状态轴。
- Kshatriya 已完成普通态/Besserung selector、5-to-3 arms loadout、character/speed 双行切换、普通态主要射击族和 98/98 literal bullet bridge；下一步拆 native revival event、Besserung 精确武装语义与 24-row all-fire family。
- Sinanju 已完成 classic local selector 的 fixed input hash -> callback -> unit behavior 代表对齐；下一步拆 awakening N/back precise split、Rozen Zulu summon payload 与 slot 4 gauge native 绑定。
- Delta Plus 已完成 classic selector 的主射、手动装填、CS、副射、变形主射/副射/特射与 speed row 代表闭环；下一步拆 Jesta `sys_51` payload、Waverider rush hitbox 与觉醒技全段。
- RX-78-2 已完成 fresh source 抽取和 classic selector 代表链；Beam Javelin 三段 charge 已连到 bullet row `0/14/25`，Last Shooting projectile 段已连到 row `27/2`。继续追 Last Shooting melee 起手 damage runtime、Javelin slow debuff 归因、assist arms entry 到 slot 2 的 native 初始化路径。
- G-Self 已完成 fresh source 抽取和 classic selector 代表链；四个 `global39` 状态、slot loadout、CS 到 Assault state、state 3 多弹体 rows 与 `global776` resource count 已连到 raw Param。下一步追 motion/resource 名称并区分 Reflector stored/deployed。
- Mack Knife 已完成 fresh source 抽取和 classic selector 代表链；`global39 == 0/1`、slot 1/2 loadout、normal / Long-Range Booster speed row 与三类射击候选链已连到 raw Param。下一步追 `func_921`/`0x1000`、方向特射、Plasma Claw interaction/hitgroup 与 slot 0 native 初始化。
- Gundam Aerial 已完成 fresh source 抽取和 external table 代表链；46 个非空 action rows、动态 registry、141-key phase resolver 与代表性 `sys_4F -> bulletparam` 多弹体族已读实码。下一步解析全部 action input、`sys_51` Demi Trainer 候选、GUND-BIT resource/effect 与四个 arms rows 的 native slot 绑定。
- Gundam Pharact 已完成 fresh source 抽取和 external table 代表链；32 个非空 action rows、101-case resolver、方向特殊移动、Corax/Beakfoot 候选、82 个 literal bullet hashes 与临时超远锁定态已读实码。下一步拆 rows `15..31` 的 melee/hitgroup/interaction，并确认 5 个 arms rows 的 native slot 绑定。
- Darilbalde 已完成 fresh source 抽取和 external table 代表链；43 个非空 action rows、132-case resolver、四机 drone timer/action gate、scatter/mine 分槽、Daya Ambicar barrier proxy 与 melee transition graph 已读实码。下一步解包 Motion，追 child projectile、interaction/hitgroup 与 5 个 arms rows 的 native slot 绑定。
- 扩展批量脚本前先决定输出规模：全量 1692 条 Character ID 会产生大量 `040msc` 文件；正文研究仍按少量样本逐台读 `.c`，不堆机器缓存。
