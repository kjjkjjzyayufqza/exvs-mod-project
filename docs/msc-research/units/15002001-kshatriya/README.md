# 15002001 Kshatriya MSC 研究

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

## 证据规则

本页不使用 generated analysis JSON、semantic overlay 或 resolved-label 缓存。行为结论直接来自：

1. 实际硬盘 `0.c / 1.c / 2.c`。
2. 原始 `armsparam.bin / bulletparam.bin / characterparam.bin / speedparam.bin / chrsysparam.csyspm`。
3. EXVS2OB wiki 只提供玩家可见名称候选，不能代替源码证据。

`character_id_table.json` 仅用于定位源资源。精确 `15002001` 行位于 `875..883`，给出
`Msc=925164384 / 0x3724E360`、`Param=1725946232 / 0x66DFD978`。它不是动作语义层。

## Source Map

| Field | Value |
|---|---|
| Character ID | `15002001` |
| Unit identity | Kshatriya；由 Character ID 邻接、普通/复活双状态代码和 wiki 共同核验 |
| Model | `-1185987471 / 0xB94F4471` |
| Effect | `1108660662 / 0x4214D1B6` |
| Sound | `2030828008 / 0x790BF9E8` |
| Msc | `925164384 / 0x3724E360` |
| Param | `1725946232 / 0x66DFD978` |
| MSC source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x3724E360.fhm2d` |
| Param source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x66DFD978.fhm2d` |
| MSC workspace | `E:\XB\解包\com\file\040msc\0x3724E360` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0x66DFD978` |

所有源 FHM2D 保持只读。

## Integrity Snapshot

| Artifact | Size / shape | SHA-256 |
|---|---|---|
| MSC source FHM2D | `100592 bytes` | `5D13FBC4781DAC28D61DBFA377CBD841788AC18597F456C5F41CE8F4F984873A` |
| Param source FHM2D | `11061 bytes` | `80229E26A3BCE4C762CC62D673D0663D814CE0127304D34076D9195D4CA6910C` |
| `0.bscex` | `27456 bytes` | `CF6341C0ADAAA2A35B7B6F6709096FC7DFD27BE0C23A653177ED604A7E8017A4` |
| `1.cscex` | `192 bytes` | `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` |
| `2.dscex` | `278624 bytes` | `0776316DDDDA7B0DAA1DE06297ACAC04793592323235F80D2D59F55B4D3FB1E8` |
| `0.c` | `145 funcs / 3523 lines / 65758 bytes` | `0FD33798A55E8161E2FCDFA757D5CD07012B339D499ED36924AC09CCED5C82CB` |
| `1.c` | `6 funcs / 34 lines / 254 bytes` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `1057 funcs / 30249 lines / 637456 bytes` | `DC6E193CB3DD40111800C6EA0F1530E5CA4E9FB04F26C0341A8B1759678718AA` |
| `armsparam.bin` | `8 x 200-byte rows` | `9BD2BC1FF72C618E25D6B0F31073D8F4F91575A77C4A1119A893B4286A819800` |
| `bulletparam.bin` | `114 x 320-byte rows` | `64EF1DADF70A73ACF23A72884535C8AC2DA95C6D6639039A76B6FAAE23B33AAE` |
| `characterparam.bin` | `2 x 796-byte rows` | `B73661787FFA3E8FBA422F0A66BA87629C7532B512970D294161BC41AA546329` |
| `speedparam.bin` | `2 x 304-byte rows` | `BA600D8A6D0DE6CCA292F33D95415B8B0DB9C271B836AA64EF9EA004EFDF9F18` |
| `chrsysparam.csyspm` | `68 bytes; 1 x 1 empty tables` | `81B3CE32FB868EDAE21A6BABBAE9CF3C092D7500BE0C81F72703BD94F4E6A459` |

## 三个脚本的实际职责

- `0.c func_143`（`3349..3501`）按输入、方向、弹数和状态 `global39` 选择单位 action hash。
- `1.c` 仍是 6 函数、34 行的公共空 glue；没有 Kshatriya 武装或复活逻辑。
- `2.c func_1053`（`29978..30043`）注册固定 action hash；单位 callback 再输出 weapon、projectile、movement、camera、shell 和复活状态。

本机没有 `0x700000/1/2`，也没有 `sys_2C/sys_2D`。`chrsysparam` 是 68-byte 空表，因此分类为
**classic local selector**，不是 external Param action-table，也不是 legacy embedded B4AC。

`0.c func_144()`（`3502..3523`）与其它 classic 样本保持同一 17-entry fixed input registry
形状。单位差异位于 `func_143`、`2.c` tail registry、callback body 和 raw Param。

## 普通态与 Besserung 状态闭环

状态不是根据 wiki 猜测。`2.c` 写入与 `0.c` 读取的是同一个 runtime field：

```text
2.c global143
  -> func_41: sys_1(0x10000, 0, 0x17, global143)   # 2.c:2561
  -> 0.c global39 = sys_0(0x10000, 0, 0x17)        # 0.c:256
  -> func_143 branches on global39 == 0 / 1         # 0.c:3351,3452
```

初始化和切换路径：

- 全局初始化先设 `global143=0`（`2.c:8140`）。
- `func_877` 调 `func_1048`，绑定普通态武器、`characterparam=0x1B12AE7D`、
  `speedparam=0xC2B19D12`，再重建 registry（`25541..25555`, `29914..29936`）。
- `func_870` 的转换阶段在内部计时超过 `0xED8` 后调用 `func_1047`；`func_874/875`
  也直接调用它（`25354..25402`, `25483..25524`）。
- `func_1047` 强制 `global143=1`，绑定复活态武器、`characterparam=0x6C159EEB`、
  `speedparam=0xE6D63D1C`，随后重建 registry（`29887..29912`）。
- `func_1046` 在 `global143==1` 时选 visual/loadout state `2`（`29871..29885`）。

wiki 把该状态命名为 **Kshatriya Besserung**，并说明它在剩余战力 2000 以下被击坠时进入、
武装变化且不能防御。脚本侧证明了双状态、转换和全套资源切换；“剩余战力 2000”条件由
engine/native 事件进入 `func_870/874/875`，当前 `.c` 没有直接读取该数值，因此不把 wiki 条件写成脚本事实。

## `0.c` 输入 selector

### 普通 Kshatriya：`global39 == 0`

| Input / gate | Action hash | `2.c` callback | Direct output | Semantic candidate |
|---|---|---|---|---|
| main | `0xBC87B28B` | `func_900` | `func_903 -> 0xF50921BA / 0x0F061CD9` | Beam Gun |
| back-facing main | `0xE2971995` | `func_904` | `func_907 -> 0x8CE289F9 + 0x76EDB49A` | binder Mega Particle Cannon, two shots |
| shooting CS `0x800` | `0xE6A37694` | `func_910` | `func_913` emits eight literal rows | eight irradiation beams |
| neutral sub | `0x19525020` | `func_916` | `func_919`: parent + seven derivatives | N Funnel all-range, eight funnels |
| front sub | `0x65184413` | `func_922` | `func_925`: parent + five derivatives | upper line, six funnels |
| side sub A | `0x0173ECD3` | `func_928` | `func_931`: parent + five derivatives | side line A |
| side sub B | `0xFB7CD1B0` | `func_934` | `func_937`: parent + five derivatives | side line B |
| back sub | `0xD966FD06` | `func_940` | `func_943`: parent + five derivatives | curtain, six funnels |
| neutral special shot | `0x0237567B` | `func_946` | `func_949 -> 0xF890BC73 + 0x9C922590 + scatter rows` | high-output Beam Gun + chest scatter |
| back special shot | `0xD4BBE3B6` | `func_952` | `func_955 -> 0x485C8AC7` | chest irradiation |
| special movement, slot 4 available | `0x89ED7097` | `func_958` | movement runtime; no projectile literal | directional special movement |
| `0xC0000/0x40000` gate | `0x11EC484A` | `func_1014` | `func_1016`: up to 24 projectile rows | all-fire / awakening-skill candidate |

普通格斗、派生和 guard/action gate 还使用 `0x178D1109 / 0xA2236F44 / 0x0E962048 /
0x58CC87CE / 0xFC8934E3 / 0x1DD08193 / 0x0BABEAF7 / 0x8F714D42`。本页不在
没有 hitbox/native damage 证据时强行给每条格斗 hash 命名。

### Besserung：`global39 == 1`

| Input / gate | Action hash | `2.c` callback | Direct output |
|---|---|---|---|
| main | `0x1AF6147E` | `func_1020` | `func_1023 -> 0x4972167C` |
| sub / slot 1 | `0xD4A3C285` | `func_1024` | `func_1027 -> 0x792E6A88`, optional `0xE0273B32 / 0x97200BA4` |
| special input / slot 2 | `0xE90CAA76` | `func_1030` | `func_1033` repeats four-row beam family |
| melee | `0x245B46F5` | `func_1036` | melee runtime, no direct projectile row |
| state gate | `0x01AB2BB1` | `func_1041` | `func_1044 -> 0xB5D8F671` |

`func_1053` contains 57 source registration calls、54 unique hashes、51 unique hashes with a nonzero
callback。三个 transform hashes 永远为 `0`；`0xDABB0543 / 0x68790B03 / 0xEEE34191`
在 Besserung 状态被置 `0`，普通态才绑定 common callbacks。这是复活态禁用一部分通用动作的
直接脚本证据。

## Loadout 与原始 armsparam

`func_1048` 和 `func_1047` 的直接绑定：

| State | Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 |
|---|---|---|---|---|---|
| normal / `0` | `0x445E947A` | `0xA2DAC8DD` | `0xA2251A98` | `0x1806D2DE` | `0x3265E86A` |
| Besserung / `1` | `0xA8B96E10` | `0x26D2841C` | `0x34E46713` | `0` | `0` |

原始 `armsparam.bin` 按 `ParamBinaryHeader + field descriptors + entry rows` 的 LE 布局直接读取，
没有经过 JSON。字段名来自当前 Rust parser；reload type 和 enum 语义仍是 native-unverified，
但 entry id、ammo 和原始数值是直接二进制事实。

| Row / entry id | State/slot | ammo | reload type | per-shot | total | wait | charge |
|---|---|---:|---:|---:|---:|---:|---:|
| `4 / 0x445E947A` | normal slot 0 | `8` | `1` | `180` | `40` | `40` | `0` |
| `6 / 0xA2DAC8DD` | normal slot 1 | `3` | `0` | `420` | `100` | `100` | `0` |
| `5 / 0xA2251A98` | normal slot 2 | `2` | `2` | `420` | `100` | `100` | `0` |
| `0 / 0x1806D2DE` | normal slot 3 | `1` | `2` | `720` | `160` | `160` | `0` |
| `2 / 0x3265E86A` | normal slot 4 | `1` | `0` | `660` | `140` | `320` | `0` |
| `7 / 0xA8B96E10` | Besserung slot 0 | `3` | `1` | `180` | `40` | `40` | `0` |
| `1 / 0x26D2841C` | Besserung slot 1 | `1` | `0` | `240` | `60` | `60` | `0` |
| `3 / 0x34E46713` | Besserung slot 2 | `1` | `0` | `480` | `120` | `120` | `0` |

普通态 `8 / 3 / 2 / 1` 的主射、Funnel、两种特殊射击、特殊移动弹数与 wiki 表一致。
这只是交叉核验；最终数值以本地 raw Param 为准。

## `characterparam` / `speedparam` 双行切换

脚本在切形态时同时切两个 Param selector：

```text
normal:    characterparam 0x1B12AE7D + speedparam 0xC2B19D12
Besserung: characterparam 0x6C159EEB + speedparam 0xE6D63D1C
```

两行 `characterparam` 有 15 个 descriptor 值不同。当前 parser 的代表工作字段如下；字段名与
native handler 尚未全部核验，所以本页不把 `max_hp=30/31` 误写成玩家可见耐久值。

| Working field | normal raw | Besserung raw |
|---|---:|---:|
| `sub_shot_cost` | `550` | `650` |
| `special_cost` | `1200` | `1400` |
| `camera_distance_near/far` | `420.0` | `300.0` |
| `body_height` | `11.0` | `9.8` |
| `hitbox_height` | `22.0` | `16.0` |
| `melee_reach_distance` | `65.0` | `55.0` |
| `main_shot_damage` | `68` | `70` |

两行 `speedparam` 有 18 个 descriptor 值不同，代表值整体下降，符合损坏后的 Besserung
机动资源另走一行，而不是仅换模型：

| Working field | normal raw | Besserung raw |
|---|---:|---:|
| `ground_run_speed` | `140` | `110` |
| `boost_dash_initial_speed` | `190` | `165` |
| `boost_dash_distance` | `245` | `215` |
| `air_speed_base` | `275` | `255` |
| `air_dash_speed` | `310` | `280` |
| `boost_dash_distance_max` | `90` | `80` |

## Projectile 全量闭环

在单位 action 区 `func_900..1045` 中，直接扫描
`sys_4F(0, literal-or-slot, 0xPROJECTILE)` 的第三参数：

```text
unique projectile literals = 98
found in raw bulletparam     = 98
missing                     = 0
raw bullet rows total       = 114
```

因此不是“抽几个样本碰巧命中”；单位 action 区所有该形状的 literal 都能回到原始
`bulletparam.bin` entry id。代表行如下：

| Entry id / row | Called from | life | speed / max range | resource | hitgroup / interaction |
|---|---|---:|---|---|---|
| `0xF50921BA / 109` | normal main variant A | `300` | `0.8 / 15` | `0xFD8C15AB` | `0x7E8E6A7C / 0x19EDA657` |
| `0x0F061CD9 / 5` | normal main variant B | `300` | `0.8 / 15` | `0xFD8C15AB` | `0x8481571F / 0x19EDA657` |
| `0x8CE289F9 / 62` | back main shot A | `150` | `6 / 20` | `0xEA3D235C` | `0xEA5C5AD6 / 0x5CC3287D` |
| `0x76EDB49A / 52` | back main shot B | `150` | `6 / 20` | `0xEA3D235C` | `0x7113B535 / 0xC5CA79C7` |
| `0x2287029E / 12` | shooting CS beam 1/8 | `300` | `6 / 2000` | `0x30083B56` | `0x00000001 / 0x19EDA657` |
| `0x6FF9B33E / 49` | N Funnel parent | `240` | `15 / 30` | `0x168F10AB` | `0x532948C1 / 0xC5CA79C7` |
| `0x555B2731 / 40` | front Funnel parent | `45` | `0 / 0` | `0xE7A5422E` | `0x532948C1 / 0x5CC3287D` |
| `0x34D5D3D2 / 23` | side Funnel A parent | `45` | `0 / 0` | `0xE7A5422E` | `0xCA20197B / 0x5CC3287D` |
| `0xAC59CB9B / 79` | side Funnel B parent | `45` | `0 / 0` | `0xE7A5422E` | `0x532948C1 / 0xC5CA79C7` |
| `0x244EA783 / 13` | back Funnel parent | `200` | `0 / 0` | `0x92F7EC6E` | `0xCA20197B / 0xC5CA79C7` |
| `0xF890BC73 / 111` | normal special shot beam | `300` | `8 / 25` | `0x0EA25BCE` | `0x00000018 / 0x19EDA657` |
| `0x485C8AC7 / 32` | back special irradiation | `120` | `22 / 3800` | `0x13BC07DB` | `0xF8EEB6E6 / 0x19EDA657` |
| `0x4972167C / 33` | Besserung main | `300` | `0.8 / 15` | `0x9891E579` | `0xB0A20CA6 / 0xF659CA68` |
| `0x792E6A88 / 55` | Besserung sub parent | `240` | `15 / 30` | `0xBBA604F3` | `0xCA20197B / 0xC5CA79C7` |
| `0xE063B77E / 104` | Besserung special family | `230` | `5 / 10` | `0xBB8FD69A` | `0xF0376EB3 / 0xF659CA68` |
| `0xB5D8F671 / 83` | Besserung state-gate beam | `140` | `22 / 3800` | `0x835048B1` | `0x693E3F09 / 0xF659CA68` |

### 多弹体形状与 wiki 的交叉核验

- `func_913` 一次提交 8 个不同 literal，匹配 shooting CS 的 8 本照射。
- N Funnel 是 1 parent + 7 derivative；front/side/back 是各自的 6-row family，匹配
  8 基 all-range 与 6 基 line/curtain 的玩家可见形状。
- back main 同帧提交两行且共享 resource，匹配两发 binder beam。
- neutral special shot 同时提交高输出 beam、第二 beam 和 scatter rows；back special shot
  单独提交长射程 irradiation row。
- `func_1016` 按计数门槛最多提交 24 行，符合全射击动作形状，但具体每行对应胸部炮、
  Funnel 或爆风仍需 Motion/effect/native hit trace 才能最终命名。

## Wiki 对照边界

- [EXVS2OB Kshatriya](https://w.atwiki.jp/exvs2ob/pages/63.html)

wiki 支持 Kshatriya / Kshatriya Besserung 双状态、普通态主射 8、Funnel 3、N special shot 2、
back special shot 1、special movement 1、8-beam shooting CS、四向 Funnel 和复活后武装变化。

本地源 FHM2D 的 mtime 是 `2025-02-05`，wiki 页面还记录 `2025-02-19` 更新并在
`2025-06-14` 编辑。两者版本时间不完全相同，因此 wiki 只用于动作名与整体形状候选；
ammo、callback、projectile 和状态切换数值全部以本地 `.c + raw Param` 为准。

## 当前结论

1. Kshatriya 是 classic local selector；68-byte empty `chrsysparam` 不阻止完整 Param bridge。
2. `global143 -> field 0x17 -> global39` 是普通 Kshatriya / Besserung 主状态轴。
3. 切状态时会同时替换 action selector、5-to-3 arms loadout、characterparam、speedparam、
   registry 和 visual/loadout state，不是只换模型。
4. 普通态的 main/back main、8-beam CS、四向 Funnel、N/back special shot 与 special movement
   已从输入 action 追到 callback 和 raw Param。
5. 单位 action 区 98 个唯一 projectile literal 全部命中 114-row raw bulletparam，0 缺失。
6. `1.c` 仍是公共空 glue，不承载机体状态机。

## 后续研究

- 拆 `func_870/874/875` 对应的 native death/revival event，证明剩余战力 gate 如何进入脚本。
- 补 Besserung 独立玩家页或实机录像，对 `func_1020/1024/1030/1041` 做精确武装命名。
- 追 `func_1016` 的 24-row all-fire family 到 Motion、effect、hitgroup、interaction 和爆风。
- 拆普通格斗/派生 `func_961..1013` 的 melee row、hitbox 和 damage runtime。
- 核验 current parser 中 character/speed working field 名与 native handler，避免把兼容名当最终语义。
