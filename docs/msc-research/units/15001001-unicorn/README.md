# 15001001 Unicorn / 001UNIGUN MSC 研究

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

## 证据规则

本页不使用 generated analysis JSON、semantic overlay 或 resolved-label 缓存。行为结论直接来自：

1. 实际硬盘 `0.c / 1.c / 2.c`。
2. 原始 `armsparam.bin / bulletparam.bin / chrsysparam.csyspm`。
3. EXVS2OB wiki 只提供玩家可见名称候选，不能代替源码证据。

`character_id_table.json` 仅用于定位源资源。其 `15001001` 行位于 `867..873`，给出
`Param=1524840326 / 0x5AE33786`、`Msc=186125726 / 0x0B180D9E`；它不是动作语义层。

## Source Map

| Field | Value |
|---|---|
| Character ID | `15001001` |
| Unit label from weapon tree | `015GNDMUC / 001UNIGUN` |
| Msc | `186125726 / 0x0B180D9E` |
| Param | `1524840326 / 0x5AE33786` |
| MSC source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x0B180D9E.fhm2d` |
| Param source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x5AE33786.fhm2d` |
| MSC workspace | `E:\XB\解包\com\file\040msc\0x0B180D9E` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0x5AE33786` |

所有源 FHM2D 保持只读。

## Integrity Snapshot

| Artifact | Size / shape | SHA-256 |
|---|---|---|
| MSC source FHM2D | `104783 bytes` | `833798F63FFE6D499997098FAE2E7BC20A0A56768AAE27AE2DFEBA37BA407E61` |
| Param source FHM2D | `10123 bytes` | `A7824817B756A0AA97AEDC64775855D24EC78E1D31EF79C459594E7623984CA1` |
| `0.c` | `145 funcs / 3537 lines` | `880BAF7878CA2FC6150A4DD56FB037F71C7756567270C5BA418FD67B85DA676A` |
| `1.c` | `6 funcs / 34 lines` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `1069 funcs / 31053 lines` | `B3E447D77BE36728BC3F89DCD63EBAA3014F72CD923E0B5F665EDC38EB4ECA7A` |
| `armsparam.bin` | `6 x 200-byte rows` | `94D2872CAE820482D930F080EBA5D365A3D3BC4A5B4A3096F117CF8A3CBC2028` |
| `bulletparam.bin` | `33 x 320-byte rows` | `5BCC59F24F5ECA61558606B79A03DFFD69E03D1EC129E3DB9D90CD0BF5900484` |
| `chrsysparam.csyspm` | `68 bytes; 1 x 1 empty tables` | `0A7BA62DD10651D18873BF78D4DE38830941214BBB0CE604BD91CF36BE14676E` |

## 三个脚本的实际职责

- `0.c func_143`（`3351..3511`）按输入、方向、弹数和形态选择单位 action hash。
- `1.c` 只有 `main -> func_1 -> func_3` 与 `func_2 -> func_4/5`，其中 `func_3/4/5` 都是空函数；本样本未见单位武装或形态逻辑。
- `2.c func_1065`（`30701..30759`）把 action hash 注册到单位 callback；单位 callback 再写 weapon、projectile、assist、effect、motion 和形态状态。

本机没有 `0x700000/1/2`，也没有 `sys_2C/sys_2D`。`chrsysparam` 是空表，因此分类为
**classic local selector**，不是 external Param action-table，也不是 legacy embedded B4AC。

## 主形态状态闭环

形态变量不是推测：`2.c` 把它写回 `0.c` 正在读取的同一 runtime field。

```text
2.c global143
  -> func_41: sys_1(0x10000, 0, 0x17, global143)       # 2.c:2574
  -> 0.c global39 = sys_0(0x10000, 0, 0x17)            # 0.c:257
  -> func_143 branches on global39 == 0 / 1            # 0.c:3361,3443
```

初始化与切换：

- `func_1045` 从 `func_181 -> sys_0(0xB0004, 0)` 恢复 `global143`，再按值绑定不同武器槽（`2.c:5095..5098,30132..30168`）。
- `func_1046` 强制 `global143=1` 并绑定强化形态 loadout（`30270..30288`）。
- `func_1047` 强制 `global143=0` 并恢复通常形态 loadout（`30290..30307`）。
- `func_1067` 按 `global143` 重建 `sys_1(0x10001, 3/4, ...)` registry（`30823..31031`）。

结合两套武器槽、输入分支、wiki 的 Unicorn / Destroy 两形态，当前强证据映射是：

| Runtime value | Form candidate | Direct evidence |
|---:|---|---|
| `global143/global39 = 0` | Unicorn Mode | slot 1 为 1 发武器；有 Bazooka、normal-only shooting CS 与 NT-D 切换 action |
| `global143/global39 = 1` | Destroy Mode | slot 1 为 20 发武器；selector 切到另一套 CS、sub、special melee、melee hashes |

`func_186 -> sys_0(0xB0004, 1)` 是另一个状态轴。它只在 tail registry 的 slot
`0x34/0x4E` 间切换（`2.c:30808..30818,30916..30927,31020..31031`），不能与主形态
`global143` 合并命名。

## Loadout 与原始 armsparam

`func_1045/1046/1047` 的直接绑定：

| Form | Slot 0 | Slot 1 | Slot 3 |
|---|---|---|---|
| Unicorn | `0x2B766A39` | `0x2669A5CE` | `0x369DBEF2` |
| Destroy | `0x9582623C` | `0x72BCB69C` | `0x369DBEF2` |

原始 `armsparam.bin` 的 6 行按 `param_bin_format.rs` 的 LE header/descriptor/entry 布局直接读取；没有经过 JSON。字段名来自当前 Rust parser，其中 reload/enum 语义仍标记为 native-unverified。

| Row / entry id | ammo | reload type | per-shot | start / total / wait | cooldown | shot / bullet type | damage | charge / full |
|---|---:|---:|---:|---|---:|---|---:|---|
| `0 / 0x2669A5CE` | `1` | `3` | `360` | `240 / 80 / 80` | `240` | `0 / 1` | `360` | `0 / 240` |
| `1 / 0x2B766A39` | `5` | `1` | `0` | `0 / 0 / 0` | `0` | `1 / 0` | `0` | `0 / 0` |
| `2 / 0x369DBEF2` | `100` | `0` | `960` | `600 / 600 / 600` | `600` | `1 / 3` | `960` | `600 / 600` |
| `3 / 0x5E74906B` | `1` | `0` | `360` | `240 / 80 / 80` | `240` | `0 / 2` | `360` | `0 / 240` |
| `4 / 0x72BCB69C` | `20` | `1` | `330` | `270 / 90 / 90` | `270` | `0 / 4` | `330` | `0 / 270` |
| `5 / 0x9582623C` | `5` | `1` | `0` | `0 / 0 / 0` | `0` | `1 / 0` | `0` | `0 / 0` |

槽位解释：

- slot 0 两形态都是 5 发；动作 callback 选择不同 projectile row，符合两形态共用 Beam Magnum 弹数、表现不同。
- slot 1 从 1 发切到 20 发，和 wiki 的 Unicorn Bazooka / Destroy Beam Gatling 匹配。
- slot 3 两形态共用 `0x369DBEF2`；它参与 `0x90009,3` 的 NT-D gate，但当前不把 parser 的普通武器字段名直接等同“换装计时器”。
- assist 使用 slot 2。`func_1037` 通过 `sys_51` 选择 payload `4/5` 或 `6/7`，再以 `sys_4F(0x7,2,1)` 消耗；主 loadout 函数没有给 slot 2 做普通 `0xB` arms 绑定。

## `0.c` selector 到 `2.c` callback

### Unicorn Mode

| Input branch | Action hash | Registered callback | Direct output | Semantic candidate |
|---|---|---|---|---|
| main `0x1`, ammo > 0 | `0xDDFFDCA4` | `func_910` | `0x3BF92A21` | Beam Magnum |
| main / special, ammo = 0 | `0x93C9A437` | `func_914` | `sys_4F(0x5,0)` | manual reload |
| shooting CS `0x800` | `0xC79AF01B` | `func_917` | six bursts of `0x9922E1C3 + 0x632DDCA0` | Beam Gatling Gun CS |
| neutral sub `0x80` | `0x6E6EB5C3` | `func_922` | `0xD2AE6C88`, then `0x8B2BFC92` | N Hyper Bazooka |
| directional sub `0x80` | `0x4D84F927` | `func_928` | `0xA40E98DD`, then `0x8B2BFC92` | side Hyper Bazooka |
| special melee `0x200` | `0xCF0B2486` | `func_933` | `0x2F3C9773 + 0xBD1896D2` | Beam Magnum stance shot |
| assist `0x100` | `0x23DF217E` | `func_1034` | slot-2 `sys_51` pair | ReZEL assist family |
| melee CS `0x1000` | `0xCEF7434A` | `func_972` | sets form `1`, rebinds slots, rebuilds registry | NT-D transition |

`0xCEF7434A -> func_972 -> func_974` 在 `sys_0(0x90009,3)==1` 时执行
`global143=1`、绑定 Destroy loadout 并调用 `func_1067`（`2.c:27836..27850`）。这条链与 wiki
的 Unicorn Mode 格斗 CS 启动 NT-D 一致。

### Destroy Mode

| Input branch | Action hash | Callback | Current evidence boundary |
|---|---|---|---|
| main / empty main | `0xDDFFDCA4 / 0x93C9A437` | `func_910 / 914` | 共用 5 发与手动 reload；main projectile 改为 `0x8D3A5C40` |
| shooting CS `0x800` | `0xDFC7F765` | `func_982` | `0x305BB17E + 0xBD1896D2`；Beam Magnum two-hand shot strong candidate |
| sub `0x80` | `0xAA65714C` | `func_978` | 从 slot 1 发 `0x471A6C99`，条件附加 `0xDE133D23`；Beam Gatling strong candidate |
| special melee `0x200` | `0xE86916DE` | `func_1003` | 方向分支、近战 hitbox/interaction，无 bullet row；Beam Tonfa sweep strong candidate |
| melee inputs | `0x53F42C73 / 0x49C8CCFD / 0xC5628615 / 0xA60AA7C3` | `func_1014 / 1020 / 987 / 1006` | 与 Unicorn Mode 的 melee hash 集合完全分离 |
| assist `0x100` | `0x23DF217E` | `func_1034` | 两形态共用 action hash；payload 仍受另一个状态变量影响 |

`2.c func_1065:30731..30758` 是上述 hash 到 callback 的直接注册表。跨机体比较应以 hash、
callback 形状和最终 syscall 为主，不以 `func_N` 编号为主键。

## 代表 projectile 闭环

`bulletparam.bin` 也按原始 LE descriptor/row 直接读取。以下只列已由 callback 引用的代表行：

| Entry id / row | Called from | life | speed / max range | resource | hitgroup / interaction |
|---|---|---:|---|---|---|
| `0x3BF92A21 / 4` | normal main | `300` | `6 / 20` | `0xD4008235` | `0x50B0B76A / 0x86E8CDCD` |
| `0x8D3A5C40 / 15` | Destroy main | `300` | `6 / 20` | `0x9996E647` | `0x50B0B76A / 0x86E8CDCD` |
| `0x9922E1C3 / 17` | normal shooting CS | `72` | `1.8 / 5` | `0x7BF58C5F` | `0x2D5EE3A7 / 0xDC4C73D6` |
| `0x632DDCA0 / 10` | normal shooting CS | `72` | `1.8 / 5` | `0x7BF58C5F` | `0xD751DEC4 / 0xDC4C73D6` |
| `0xD2AE6C88 / 26` | neutral Bazooka | `360` | `5 / 5` | `0x240D7FFE` | `0x12AF0367 / 0xD9384084` |
| `0xA40E98DD / 18` | directional Bazooka | `360` | `5 / 5` | `0x09E8D0C1` | `0x12AF0367 / 0xD9384084` |
| `0x2F3C9773 / 1` | normal special melee | `300` | `6 / 20` | `0x517030A7` | `0x50B0B76A / 0x86E8CDCD` |
| `0xBD1896D2 / 23` | same callback secondary | `60` | `0 / 0` | `0` | `0x312DADEA / 0x86E8CDCD` |
| `0x471A6C99 / 6` | Destroy sub | `300` | `2.2 / 6` | `0x3FAAA184` | `0x2D5EE3A7 / 0xDC4C73D6` |
| `0xDE133D23 / 27` | Destroy sub secondary | `300` | `2.2 / 6` | `0x3FAAA184` | `0xD751DEC4 / 0xDC4C73D6` |
| `0x305BB17E / 2` | Destroy shooting CS | `300` | `6 / 20` | `0x24010DBC` | `0x50B0B76A / 0x86E8CDCD` |

主射链尤其明确：

```text
0.c input 0x1
  -> 0xDDFFDCA4
  -> 2.c func_910 / phase func_913
  -> if global143 == 0: 0x3BF92A21
     else:              0x8D3A5C40
  -> bulletparam row 4 / 15
```

两个 projectile 的 life/speed/range、action、hitgroup、interaction、expire 相同，只替换
resource hash，说明形态差异至少包含 Beam Magnum 的表现资源切换，而不是两套完全独立弹道。

## 觉醒技与强制换装

`0.c:3357..3359` 在觉醒输入条件成立时选择 `0x99A7A777`。其 callback
`func_1039 -> func_1041` 若当前 `global143==0`，先设为 `1`、绑定 Destroy loadout 并调用
`func_1067`（`2.c:29818..29842`）；后续 `func_1042` 交替发出
`0xEACC7842/0x58E87A3B` 与 `0x73C529F8/0xC1E12B81` 等 projectile
（`29880..29912`）。这与 wiki 的觉醒技可强制换装/恢复 NT-D gauge 相符。

## Wiki 对照边界

- [Unicorn overview](https://w.atwiki.jp/exvs2ob/pages/270.html)
- [Unicorn Mode](https://w.atwiki.jp/exvs2ob/pages/271.html)
- [Destroy Mode](https://w.atwiki.jp/exvs2ob/pages/272.html)

wiki 支持两形态、5 发手动 reload Beam Magnum、normal 1 发 Bazooka、Destroy 20 发 Beam
Gatling、ReZEL assist、normal 格斗 CS NT-D、Destroy Beam Tonfa 等名称候选。最终函数命名仍以
`.c -> syscall -> Param row` 为准。

## 当前结论

1. Unicorn 是 classic local selector，但仍能形成完整的
   `0.c input -> action hash -> 2.c callback -> raw Param row` 数据桥。
2. `global143/global39` 是主形态轴；`0` 与 `1` 分别强对应 Unicorn / Destroy。
3. 两形态共用 5 发 Beam Magnum 和 assist action，但 slot 1、CS、special melee、melee registry
   和 projectile resource 会切换。
4. `1.c` 在本机是空 glue，不承载单位状态机。
5. `func_186 / B0004[1]` 是独立状态轴；其业务语义尚未证明。

## 后续研究

- 继续拆 `func_987/1006/1014/1020`，完成 Destroy 各格斗输入的 melee/effect 闭环。
- 对 Destroy CS/Gatling/Tonfa 已确认的 callback，继续追 interaction/hitgroup 到伤害与命中效果层。
- 追 `global201` 如何选择 assist payload `4/5` 与 `6/7`。
- 追 slot 3 的 100-value state、`0x90009,3` gate、NT-D 持续/冷却/恢复路径，避免把
  arms parser 的兼容字段名直接当 native timer schema。
- 单独解释 `B0004[1]` 的三态 registry 切换，并与觉醒、队伍状态或外部模式逐一排除。
