# 15004001 Delta Plus / 004DELTPL MSC 研究

生成日期：2026-06-20

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

## 证据规则

本页不使用 generated analysis JSON、semantic overlay 或 resolved-label 缓存。行为结论直接来自：

1. 实际硬盘 `0.c / 1.c / 2.c`。
2. 原始 `armsparam.bin / bulletparam.bin / speedparam.bin / characterparam.bin / chrsysparam.csyspm`。
3. EXVS2OB wiki 只提供玩家可见名称候选，不能代替源码证据。

`character_id_table.json` 仅用于定位源资源。精确 `15004001` 行位于 `894..900`，给出
`Param=1431741739 / 0x5556A52B`、`Msc=78487347 / 0x04AD9F33`；它不是动作语义层。

历史 `0xBDBE6FEA` 目录当前含 2026-06-19 Delta Kai AI patch，且当前源库没有对应 FHM2D。
它只可作为旧研究上下文或 semantic reference，不能作为本机 OB v27 官方证据。

## Source Map

| Field | Value |
|---|---|
| Character ID | `15004001` |
| Unit label from weapon tree | `015GNDMUC / 004DELTPL` |
| Msc | `78487347 / 0x04AD9F33` |
| Param | `1431741739 / 0x5556A52B` |
| MSC source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x04AD9F33.fhm2d` |
| Param source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x5556A52B.fhm2d` |
| MSC workspace | `E:\XB\解包\com\file\040msc\0x04AD9F33` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0x5556A52B` |

所有源 FHM2D 保持只读。

## Integrity Snapshot

| Artifact | Size / shape | SHA-256 |
|---|---|---|
| MSC source FHM2D | `98482 bytes` | `56E39A0E465A38709F9AC45D70D65EE2EBFECA5D9121A1C0C3CDE53933B25925` |
| Param source FHM2D | `8289 bytes` | `FB40F4E10841B14BFC7D8BC5CE0575286FA543D89A4ADC049451B5127DF8C806` |
| `0.c` | `145 funcs / 3525 lines` | `CE3300FBBC671F13C828DAB184E3734C304D01AA257666043AEC51A1A037EC32` |
| `1.c` | `6 funcs / 34 lines` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `1047 funcs / 29648 lines` | `C09FAFDD7A3C9CE0A9D3DE9D94E3F1FF6E162C9ABD99A6C9902F579FFC61594E` |
| `armsparam.bin` | `6 x 200-byte rows` | `8C7C22B71A61DA49C5018E779361CE3189288A0CB511DE350D50CB36F2A13E3A` |
| `bulletparam.bin` | `30 x 320-byte rows` | `47CF4A184C258F0FFBCAD821385506F9AEB1CD8DECE74E74115F78A0F6C3988F` |
| `characterparam.bin` | `3 x 796-byte rows` | `10FB16AFC5AEC934B4B57F2D8725E51DCA136266C261B912D013C981AF58FEB5` |
| `speedparam.bin` | `2 x 304-byte rows` | `6ACA522EAF1FE9D68F5A3DB3E3E78F57EAF2F07525E92B81F219D500B9BD6C65` |
| `chrsysparam.csyspm` | `68 bytes; 1 x 1 empty tables` | `5BCBCC8B35D99D8826B240E84FD9A8EB6E204541DDB0A0287701164146D155C1` |

## 三个脚本的实际职责

- `0.c func_143`（`3349..3502`）按输入、方向、弹数、变形状态和觉醒状态选择单位 action hash。
- `1.c` 只有 `main -> func_1 -> func_3` 与 `func_2 -> func_4/5`，其中 `func_3/4/5` 都是空函数；本样本未见单位武装或形态逻辑。
- `2.c func_1043`（`29397..29453`）把 action hash 注册到单位 callback；单位 callback 再写 weapon、projectile、assist、effect、motion、移动和变形状态。

本机没有 `0x700000/1/2`，也没有 `sys_2C/sys_2D`。`chrsysparam` 是 68-byte 空表，因此分类为
**classic local selector**，不是 external Param action-table，也不是 legacy embedded B4AC。

`0.c func_144()` 与 Unicorn、Sinanju、RX-78-2 的 17-entry fixed input registry 同形（`3504..3524`）。
Delta Plus 的单位差异主要落在 `func_143` 的普通/变形双分支、`2.c` tail registry、callback body 与 raw Param。

## `0.c` selector 到 `2.c` callback

### 普通形态

| Input / gate | Action hash | `2.c func_1043` callback | Direct output | Semantic candidate |
|---|---|---|---|---|
| main `global48 & 0x1`，slot 0 有弹 | `0xF48D2D49` | `func_912` | `func_915 -> sys_4F(0,0,0xCC9F6DF0)` | Beam Rifle |
| main `global48 & 0x1`，slot 0 空 | `0x7158FA47` | `func_916` | `func_918 -> sys_4F(0x5,0,0)` plus `0xD6073737` | manual reload |
| shooting CS `0x800` | `0x700BB2C6` | `func_919` | `func_922 -> 0x574865F4 / 0x2AC4A5DF / 0xB3CDF465` repeated | Unicorn summon barrage |
| neutral sub `0x80` | `0x31F61D6C` | `func_924` | `func_927 -> sys_4F(0,slot1,0x4AB49ABD)` | N Grenade Launcher |
| directional sub `0x80 + direction` | `0x6AB85F0D` | `func_930` | `func_933 -> sys_4F(0,slot1,0x0A4C98AE)` | moving Grenade Launcher |
| special shooting `0x100` | `0x23DF217E` | `func_950` | `func_952 -> sys_51(...)` pair and `sys_4F(0x7,2,1)` | Jesta assist |
| special melee `0x200` | `0x6AB12717 / 0x193FE550` | `func_934 / func_938` | `func_936/940 -> func_888(7)` plus `sys_46` movement | Waverider rush |
| awakening | `0x8AE55BB1` | `func_953` | `func_955 -> 0x99A7A777` | awakening technique first leg |

主射连射不是从 Param 猜出来的。`func_914` 在 `2.c:25769..25812` 维护 `global773 < 2`
并在动作窗口里允许 `func_81(0xF48D2D49,...)` 重进；`func_915` 在 `2.c:25814..25827`
实际投递 `0xCC9F6DF0`。slot 0 raw arms row `0x1486A84F` 是 4 发且 reload timer 全 0，
与 `0.c` 空弹转 `0x7158FA47`、`2.c func_918` 手动换弹链一致。

### 变形 / Waverider 形态

`0.c func_143` 在 `(global20 & 0x4000) != 0` 时进入变形分支（`3356..3408`）：

| Input / gate | Action hash | `2.c func_1043` callback | Direct output | Semantic candidate |
|---|---|---|---|---|
| transform main `0x1` | `0x91CE1EFC` | `func_1009` | `func_1012 -> 0xB35B8E04 + 0x274CF25B + 0x978AD2F7` | WR main, beam + grenades |
| transform sub `0x80`，slot 1 有弹 | `0x3470C0CF` | `func_1018` | `func_1020 -> 0x85074ECC x4 + 0xDB003474 + 0x210F0917` | WR sub rapid fire |
| transform special shooting `0x100`，slot 2 有弹 | `0x9C05B42D` | `func_1022` | `func_1026 -> 0xD6E43088 + 0xEBD1EB8C`; consumes slot 2 | WR Beam Magnum candidate |
| transform special melee `0x200` | `0x427FE876` | `func_1028` | `func_1030 -> func_888(8)` and return to normal shell | rapid transform cancel |
| transform melee `0x2` | `0x1B89C323` | `func_1032` | `func_1034/1035 -> melee runtime + `sys_46` | WR melee / ram candidate |

变形 loadout 由 `func_1037` 直接绑定：

```text
2.c:29297 sys_4F(0xB, 0, 0x377D1397, 0x1486A84F, 0x4)
2.c:29298 sys_4F(0xB, 1, 0xF100A0DA)
2.c:29299 sys_4F(0xB, 2, 0x1799C911)
```

退出由 `func_1038` 恢复普通 shell、`global142=0xC2B19D12`、普通 slot 0/1/2，并写
`global143=0`（`29308..29328`）。`func_1040` 再根据 assist readiness 管理 slot 2 display/state。

## Loadout 与原始 armsparam

普通初始化 `func_887` 绑定：

| Slot | Binding in `2.c` | Raw arms row | Notes |
|---:|---|---|---|
| `0` | `sys_4F(0xB,0,0x1486A84F)` at `25413` | row `1` | main Beam Rifle, 4 ammo, script-driven manual reload |
| `1` | `sys_4F(0xB,1,0x10B251B4)` at `25414` | row `0` | Grenade Launcher, 2 ammo |
| `2` | `sys_4F(0xB,2,0xA8E202BF)` at `25415` | row `4` | Jesta assist, 2 ammo |

变形绑定：

| Slot | Binding in `func_1037` | Raw arms row | Notes |
|---:|---|---|---|
| `0` | `0x377D1397` with normal fallback `0x1486A84F` | row `3` | WR main, 2 ammo |
| `1` | `0xF100A0DA` | row `5` | WR sub, 1 ammo |
| `2` | `0x1799C911` | row `2` | WR special shooting, 1 ammo |

原始 `armsparam.bin` 的 6 行按 `param_bin_format.rs` 的 LE header/descriptor/entry 布局直接读取；没有经过 JSON。字段名来自当前 Rust parser，其中 reload/enum 语义仍标记为 native-unverified。

| Row / entry id | ammo | reload type | per-shot | start / total / wait | cooldown | shot / bullet type | damage | charge / full |
|---|---:|---:|---:|---|---:|---|---:|---|
| `0 / 0x10B251B4` | `2` | `1` | `300` | `270 / 70 / 90` | `210` | `0 / 1` | `420` | `30 / 210` |
| `1 / 0x1486A84F` | `4` | `1` | `0` | `0 / 0 / 0` | `0` | `1 / 0` | `0` | `0 / 0` |
| `2 / 0x1799C911` | `1` | `0` | `600` | `420 / 140 / 140` | `420` | `0 / 5` | `600` | `0 / 420` |
| `3 / 0x377D1397` | `2` | `1` | `180` | `120 / 40 / 40` | `120` | `1 / 3` | `180` | `0 / 120` |
| `4 / 0xA8E202BF` | `2` | `0` | `360` | `240 / 80 / 80` | `240` | `0 / 2` | `360` | `0 / 240` |
| `5 / 0xF100A0DA` | `1` | `0` | `360` | `240 / 80 / 80` | `240` | `0 / 4` | `360` | `0 / 240` |

## 代表 projectile 闭环

`bulletparam.bin` 按原始 LE descriptor/row 直接读取。以下只列已由 `.c` callback 引用的代表行。
当前不把 `initial_speed` 单独当完整弹速，因为项目 bulletparam 研究已确认基础发射速度常由 firing action / weapon runtime 共同给出。

| Entry id / row | Called from | life | range / speed | resource | action | hitgroup / interaction | expire |
|---|---|---:|---|---|---|---|---|
| `0xCC9F6DF0 / 24` | normal main `func_915` | `300` | `15 / 0.8` | `0xE02753B3` | `0x2F69C700` | `0xFFDC7F8A / 0xE712A8E6` | `0x05633974` |
| `0xD6073737 / 25` | reload visual `func_918` | `300` | `0 / 0` | `0` | `0` | `0 / 0x5FBBE632` | `0` |
| `0x574865F4 / 13` | shooting CS `func_922` | `300` | `15 / 0.8` | `0xB8B1CDE0` | `0x56B57FA4` | `0xFFDC7F8A / 0xE712A8E6` | `0x05633974` |
| `0x2AC4A5DF / 7` | shooting CS `func_922` | `100` | `4 / 4` | `0xD56C290B` | `0` | `0xAC61B369 / 0x689C17F5` | `0xB7F8C6A2` |
| `0xB3CDF465 / 22` | shooting CS `func_922` | `100` | `4 / 4` | `0xD56C290B` | `0` | `0xAC61B369 / 0x689C17F5` | `0xB7F8C6A2` |
| `0x4AB49ABD / 12` | N sub `func_927` | `90` | `4 / 4` | `0x0A1C4CF6` | `0x4175C6D7` | `0xB408F74D / 0x8311E848` | `0xF6B87BDA` |
| `0x0A4C98AE / 1` | directional sub `func_933` | `90` | `4 / 4` | `0xE8440118` | `0x4175C6D7` | `0xB408F74D / 0x8311E848` | `0xF6B87BDA` |
| `0xB35B8E04 / 21` | WR main `func_1012` | `300` | `30 / 1.6` | `0x0ACBF91E` | `0xD0635A18` | `0x66B32162 / 0x0CB05586` | `0x05633974` |
| `0x274CF25B / 5` | WR main secondary `func_1012` | `90` | `4 / 4` | `0x11BA18FA` | `0x21B24F32` | `0x66B32162 / 0x0CB05586` | `0xF6B87BDA` |
| `0x978AD2F7 / 17` | WR main secondary `func_1012` | `90` | `4 / 4` | `0x11BA18FA` | `0` | `0x66B32162 / 0x0CB05586` | `0xF6B87BDA` |
| `0x85074ECC / 16` | WR sub `func_1020` | `300` | `15 / 1.5` | `0x04C714A6` | `0x56B57FA4` | `0x66B32162 / 0x0CB05586` | `0x04A15343` |
| `0xDB003474 / 28` | WR sub secondary `func_1020` | `90` | `4 / 4` | `0x87AABD82` | `0x21B24F32` | `0x66B32162 / 0x0CB05586` | `0xF6B87BDA` |
| `0x210F0917 / 4` | WR sub secondary `func_1020` | `90` | `4 / 4` | `0x87AABD82` | `0x21B24F32` | `0x66B32162 / 0x0CB05586` | `0xF6B87BDA` |
| `0xD6E43088 / 26` | WR special shooting `func_1026` | `300` | `20 / 6` | `0x6F744792` | `0xA7646A8E` | `0x7B82E183 / 0x6BAA794A` | `0xD0BFBAE7` |
| `0xEBD1EB8C / 29` | WR special shooting secondary `func_1026` | `120` | `0 / 0` | `0` | `0` | `0xB3A75C6B / 0x6BAA794A` | `0x691246B1` |

主射链：

```text
0.c global48 & 0x1, slot0 ammo > 0
  -> 0xF48D2D49
  -> 2.c func_912 / func_914 / func_915
  -> sys_4F(0, 0, 0xCC9F6DF0)
  -> bulletparam row 24
```

变形主射链：

```text
0.c transform branch, global48 & 0x1
  -> 0x91CE1EFC
  -> 2.c func_1009 / func_1012
  -> 0xB35B8E04 + 0x274CF25B + 0x978AD2F7
  -> bulletparam rows 21 / 5 / 17
```

## 变形飞行与特殊速度行

变形进入不是单个 motion 名字，而是 `0.c -> 2.c slot callback -> shell/loadout` 的状态桥：

```text
0.c func_71/72 gate
  -> sys_0(0x10000, 0x1, 0x17)
  -> 0.c func_13 maps slot 0x17 to 0x9475130E
  -> 2.c func_1043 maps 0x9475130E to func_450
  -> func_450 selects slot 0x23
  -> func_870 callback calls func_888(7)
  -> func_1037 enters WR shell/loadout and sets global143 = 1
```

持续飞行 `0x77B100FF -> func_452/453/454` 直接读取 `speedparam[global142]`：

- `0x5E8CAF43 air_dash_duration_frame`
- `0xFF7A9C8B gravity_air_modifier`
- `0x459455EA landing_recovery_frame`
- `0x9FD06227 boost_startup_frame`

原始 `speedparam.bin` 的两行：

| Row / entry id | Runtime state | BD initial | BD sustain / max | BD distance | air base / max | air dash duration | gravity air / landing |
|---|---|---:|---|---:|---|---:|---|
| `0 / 0x0577EF6D` | awakening WR special row | `175` | `312 / 350` | `230` | `265 / 65` | `320` | `-5 / 310` |
| `1 / 0xC2B19D12` | normal row | `175` | `312 / 350` | `230` | `265 / 65` | `300` | `-5 / 280` |

`func_956 -> func_958/959` 在觉醒技后续临时设置 `global142=0x0577EF6D`（`27120,27144`），
`func_960` 在 `27232` 恢复 `0xC2B19D12`。因此这两行不是普通/变形二分；它们更像 normal movement row 与 awakening WR special row 的差异。

`characterparam.bin` 有 3 行：`0x1B12AE7D / 0x6C159EEB / 0xF51CCF51`。Delta Plus 当前直接命中：

| Row / entry id | Code evidence | Current boundary |
|---|---|---|
| `0 / 0x1B12AE7D` | `func_1` 初始化常见角色 entry；与其它 UC classic 样本同形 | normal character entry candidate |
| `1 / 0x6C159EEB` | `func_953` 与 `func_956` 使用 `sys_1(0x60008,0x6C159EEB)` | awakening / Unicorn summon related entry candidate |
| `2 / 0xF51CCF51` | present in raw Param;本轮未定位直接使用点 | pending |

三行 parser 字段 `hp=30`、`cost=1650`、`red_lock=100` 相同；这些字段名来自当前 parser，不能直接解释为玩家 UI 的 640 HP / 2000 cost。

## Assist 与 Waverider rush 边界

`0x23DF217E -> func_950/952` 是普通特射 assist 的代码锚点。`func_952` 在 `0x1F4` 帧门控处按方向选择两组 `sys_51(0x20000,...)` payload，再 `sys_4F(0x7,2,1)` 消耗 slot 2。wiki 的 Jesta N/lever assist 与这个方向分叉一致，但 payload 数字到具体机体动作还需继续追 summon resource。

`0x6AB12717 / 0x193FE550` 以及变形 melee `0x1B89C323` 主要走 `func_888(7/8)`、`sys_46`、melee runtime 和效果，不直接落到 bulletparam。当前可命名到 Waverider rush / WR melee candidate；不要把它们强行写成 projectile 行。

## Wiki 对照边界

[EXVS2OB Delta Plus](https://w.atwiki.jp/exvs2ob/pages/416.html) 提供以下 semantic candidate：

- main Beam Rifle：4 ammo，两连射，手动装填。
- shooting CS：Unicorn Gundam summon。
- N/方向 sub：Grenade Launcher。
- special shooting：Jesta assist。
- transform main：beam cannon + grenade。
- transform sub：beam cannon + grenade launcher rapid fire。
- transform special shooting：Beam Magnum。
- special melee：Waverider rush；transform special melee 是急速变形解除候选。
- awakening technique：Unicorn Destroy summon。

命名流程仍是：先 `.c -> syscall -> raw Param row`，再用 wiki 给 semantic candidate。未闭合的 summon payload、melee hitbox、special melee hit behavior 和 awakening 全段不能只凭 wiki 命名。

## 当前结论

1. Delta Plus 是 classic local selector；`0.c func_143 -> action hash -> 2.c func_1043 callback -> raw Param row` 已对主射、手动装填、CS、副射、变形主射、变形副射、变形特射建立代表闭环。
2. `1.c` 是空 glue，不承载单位状态机。
3. `global143` 在 Delta Plus 中是 WR shell/loadout state，而不是 Unicorn 那种两套普通 selector 主形态轴。
4. `speedparam` 的 `0x0577EF6D` 是觉醒技后续临时速度行；普通变形飞行默认仍回到 `0xC2B19D12`。
5. `0xBDBE6FEA` 不再作为本机官方样本证据；Delta Plus 当前 OB v27 证据必须使用 `0x04AD9F33 + 0x5556A52B`。

## 后续研究

- 追 `sys_51` payload 到 Jesta assist 具体资源与攻击段。
- 拆 `0x8AE55BB1 -> 0x99A7A777 -> 0x0FDDF845` 的觉醒技全段，补完 Unicorn summon projectile / melee / camera。
- 拆 `func_936/940/1034/1035` 的 Waverider rush 与 WR melee hitbox/interaction。
- 继续对照 `delta-plus-transform-flight-system.md`，把 `func_455..460` 的转向、俯仰和 `speedparam` 字段读写整理成 movement-only 专页。
