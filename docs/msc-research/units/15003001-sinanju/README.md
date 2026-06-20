# 15003001 Sinanju / 003SINANJ MSC 研究

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

## 证据规则

本页不使用 generated analysis JSON、semantic overlay 或 resolved-label 缓存。行为结论直接来自：

1. 实际硬盘 `0.c / 1.c / 2.c`。
2. 原始 `armsparam.bin / bulletparam.bin / speedparam.bin / characterparam.bin / chrsysparam.csyspm`。
3. EXVS2OB wiki 只提供玩家可见名称候选，不能代替源码证据。

`character_id_table.json` 仅用于定位源资源。精确 `15003001` 行位于 `885..891`，给出
`Param=-1636500622 / 0x9E74FB72`、`Msc=-812662422 / 0xCF8FC16A`；它不是动作语义层。

## Source Map

| Field | Value |
|---|---|
| Character ID | `15003001` |
| Unit label from weapon tree | `015GNDMUC / 003SINANJ` |
| Msc | `-812662422 / 0xCF8FC16A` |
| Param | `-1636500622 / 0x9E74FB72` |
| MSC source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0xCF8FC16A.fhm2d` |
| Param source FHM2D | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x9E74FB72.fhm2d` |
| MSC workspace | `E:\XB\解包\com\file\040msc\0xCF8FC16A` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0x9E74FB72` |

所有源 FHM2D 保持只读。

## Integrity Snapshot

| Artifact | Size / shape | SHA-256 |
|---|---|---|
| MSC source FHM2D | `103400 bytes` | `0B42FD7BA314065798A989884366690FF4D27991A1C57F2A94276C9165D3EB4B` |
| Param source FHM2D | `9549 bytes` | `977CBE3A0FA41E9AECF9AB568B750943FC3954819F92FA653F6E05CB345CE452` |
| `0.c` | `145 funcs / 3506 lines` | `FC2809870C1CB56A499FD6C20A8FD0BB198A5690A7B800BF5431172719C896A3` |
| `1.c` | `6 funcs / 34 lines` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `1099 funcs / 31239 lines` | `8D5DD9104FEF193E17C7D9E769BC92350E7FEF4645CE92F4680BDADD7D1C405E` |
| `armsparam.bin` | `7 x 200-byte rows` | `2DCD37F4B027101EE0B67F8D3FB1F3E709BBCB41F9D5AFDD1D1D177F5C1AE1E0` |
| `bulletparam.bin` | `30 x 320-byte rows` | `CE6357C182B1B1B7FAA96D33426825D8DE30CDC4CB45FF985144BF7AF514B618` |
| `characterparam.bin` | `3 x 796-byte rows` | `B85CE949B1A24C77969C3459F407D4D9E042E1C8D4219BAE590AEE93B14C62B1` |
| `speedparam.bin` | `2 x 304-byte rows` | `850DD65241D9157AEA52BF0918A3A3F7A04DFB920D3E42F012137AB1805F89A6` |
| `chrsysparam.csyspm` | `68 bytes; 1 x 1 empty tables` | `571C35F4210A85DB63E7C0D9DCBA5B70250956EAD8181D9D692C01BD2BE621DB` |

## 三个脚本的实际职责

- `0.c func_143`（`3351..3483`）按输入、方向、弹数、觉醒状态选择单位 action hash。
- `1.c` 只有 `main -> func_1 -> func_3` 与 `func_2 -> func_4/5`，其中 `func_3/4/5` 都是空函数；本样本未见单位武装或形态逻辑。
- `2.c func_1095`（`30982..31045`）把 action hash 注册到单位 callback；单位 callback 再写 weapon、projectile、assist、effect、motion、移动与时限强化状态。

本机没有 `0x700000/1/2`，也没有 `sys_2C/sys_2D`。`chrsysparam` 是空表，因此分类为
**classic local selector**，不是 external Param action-table，也不是 legacy embedded B4AC。

`0.c func_144()` 与 Unicorn、RX-78-2、Delta Plus 的 17-entry fixed input registry 同形（`3485..3505`）。单位差异主要落在 `func_143` selector、`2.c` tail registry、callback body 与 raw Param。

## `0.c` selector 到 `2.c` callback

`0.c func_143` 的直接分支：

| Input / gate | Action hash | `2.c func_1095` callback | Direct output | Semantic candidate |
|---|---|---|---|---|
| main `global49 & 0x1` | `0xF48D2D49` | `func_933` | `func_936 -> sys_4F(0, slot0, 0x2FA07294)` | Beam Rifle |
| shooting CS `0x800` | `0x868B9026` | `func_937` | `func_940 -> sys_4F(0, 5, 0x89BB5A2A)` | high-output Beam Rifle |
| melee CS `0x1000` | `0x2AD20F4C` | `func_942` | `func_945 -> 0xE1733133`; `func_947 -> 0x858F9DFC` | Grenade Launcher |
| sub neutral `0x80` | `0x0C597B09` | `func_948` | `func_951 -> 0x4F616919` | N Bazooka |
| sub side `0x80 + 0x10/0x20` | `0xE2571A25` | `func_957` | `func_960 -> 0x72791C4F` | side Bazooka |
| sub front `0x80 + 0x4` | `0x78FCE1D6` | `func_965` | `func_968 -> 0x99CBDDC8` | front Bazooka |
| sub back `0x80 + 0x8` | `0xB99F35E7` | `func_973` | `func_976 -> 0x803B338C` | back Bazooka |
| special melee `0x200`, slot 3 ammo | `0xD44E9701` | `func_1025` | direction motion + slot3 consume + buff trigger | Meteor Kick |
| assist `0x100` | `0x23DF217E` | `func_1074` | `func_1076 -> sys_51(...)` | Rozen Zulu assist |
| awakening assist branch | `0x1A6949AC` | `func_1074` | alternate `sys_51` payload family | awakening Rozen Zulu assist |
| awakening, back input | `0xFCC0705C` | `func_1041` | melee/rush-style awakening callback | back/N mapping still being split |
| awakening, default | `0x00C6AFFD` | `func_1048` | shooting/rotation-style awakening callback | back/N mapping still being split |

`func_100` uses the same runtime field read into `0.c global39` as an input/cancel table axis:

```text
0.c func_99(var1, global39, arg0) -> sys_0(0x10000, 0x2, computedIndex)  # 2436..2440
0.c func_100(arg0) calls func_99(var1, global39, arg0)                   # 2443..2460
2.c func_41 writes sys_1(0x10000, 0, 0x17, global143)                   # 2570..2575
```

Unlike Unicorn, Sinanju `func_143` does not directly branch on `global39`; the time-limited state still reaches `0.c` through field `0x17`, but current direct selector changes are mostly in `2.c` callback behavior and runtime movement tables.

## Loadout 与原始 armsparam

`2.c func_1082` binds the visible weapon slots:

| Slot | Binding in `func_1082` | Raw arms row | Notes |
|---:|---|---|---|
| `0` | `sys_4F(0xB, 0, 0x9E5E3173)` | row `4` | main Beam Rifle slot, ammo `8` |
| `1` | `sys_4F(0xB, 1, 0xEA66054E)` | row `6` | sub Bazooka slot, ammo `4` |
| `2` | `sys_4F(0xB, 2, 0x3266D23F)` | row `1` | assist slot, ammo `1` |
| `2` dynamic | `func_1089/1090 -> 0x48F71376` | row `2` | assist alternate entry while special assist state is active |
| `3` normal | `sys_4F(0xB, 3, 0x0E7D936F)` | row `0` | special melee ammo `2` |
| `3` if `global772 > 0` | `sys_4F(0xB, 3, 0x550FB7B7)` | row `3` | special melee ammo `4`, matches awakening/wiki candidate |

原始 `armsparam.bin` 的 7 行按 `param_bin_format.rs` 的 LE header/descriptor/entry 布局直接读取；没有经过 JSON。字段名来自当前 Rust parser，其中 reload/enum 语义仍标记为 native-unverified。

| Row / entry id | ammo | reload type | per-shot | start / total / wait | cooldown | shot / bullet type | damage | full charge |
|---|---:|---:|---:|---|---:|---|---:|---:|
| `0 / 0x0E7D936F` | `2` | `0` | `420` | `300 / 100 / 100` | `300` | `0 / 4` | `420` | `300` |
| `1 / 0x3266D23F` | `1` | `0` | `360` | `240 / 80 / 80` | `240` | `0 / 2` | `360` | `240` |
| `2 / 0x48F71376` | `1` | `0` | `300` | `480 / 80 / 160` | `240` | `0 / 3` | `720` | `240` |
| `3 / 0x550FB7B7` | `4` | `0` | `420` | `300 / 100 / 100` | `300` | `0 / 4` | `420` | `300` |
| `4 / 0x9E5E3173` | `8` | `1` | `180` | `120 / 40 / 40` | `120` | `1 / 0` | `180` | `120` |
| `5 / 0xA0329255` | `100` | `0` | `900` | `720 / 720 / 720` | `720` | `0 / 5` | `900` | `720` |
| `6 / 0xEA66054E` | `4` | `2` | `420` | `300 / 100 / 100` | `300` | `1 / 1` | `420` | `300` |

`0xA0329255` 是 100-value gauge-shaped row。当前 `.c` 明确使用 slot `4` 做强化 gauge gate、consume/recovery (`sys_0(0x90009,4)`、`sys_0(0x90007,4)`、`sys_4F(0x3/4/5/15,4,...)`)，但还没有找到 `sys_4F(0xB,4,0xA0329255)` 的直接绑定。因此它是强候选，不作为已证明 slot 4 loadout 写死。

## `赤い彗星の再来` 时限强化闭环

Sinanju 的强化不是换装 selector；它是 `characterparam + speedparam + visual/model toggle + weapon gauge` 的组合状态。

启动：

```text
func_1084(arg0)
  -> global143 = 1
  -> sys_4F(0x5, 4, 0); sys_4F(0x3, 4)
  -> sys_1(0x60008, 0xF51CCF51)
  -> global142 = 0x3548754D
  -> if arg0 == 1: sys_4F(0, 5, 0xCCF8ACC8); sys_4F(0, 5, 0x36F791AB)
  -> sys_4B(0x6, ..., 1) toggles visual/resource parts
```

结束：

```text
func_1085()
  -> sys_4F(0x4, 4)
  -> global143 = 0
  -> sys_1(0x60008, 0x1B12AE7D)
  -> global142 = 0xC2B19D12
  -> sys_4B(0x6, ..., 0) restores visual/resource parts
```

状态测试：

```text
func_1086() returns true when global143 == 1
```

主要触发点：

```text
0.c special melee bit 0x200
  -> 0xD44E9701
  -> 2.c func_1025 / func_1027
  -> if !func_1086() && sys_0(0x90009, 4) == 1:
       func_1084(1)
       global771 = 1
  -> sys_4F(0x7, slot3, 1)
```

这条链把 wiki 的“特殊格闘 / 隕石蹴り触发赤い彗星の再来”落到实际代码：slot 3 消耗特殊格斗弹数，slot 4 作为强化可用 gate，`func_1084` 写强化状态与移动表。

`characterparam.bin` 的 entry id：

| Row | Entry id | Code evidence |
|---:|---|---|
| `0` | `0x1B12AE7D` | `func_1085` normal character entry |
| `1` | `0x6C159EEB` | present; current Sinanju chain 未定位 |
| `2` | `0xF51CCF51` | `func_1084` buff character entry |

`speedparam.bin` 的两行由 `global142` 选择。字段名来自 `SPEEDPARAM_COMMAND_POOL`；这里使用相对差异，不把每个字段都当 native-final 语义。

| Row / entry id | Runtime state | boost gauge | BD initial | BD sustain / max | BD distance | BD count field | air base / max | boost consume / recovery |
|---|---|---:|---:|---|---:|---:|---|---|
| `0 / 0x3548754D` | buff | `0` | `220` | `312 / 380` | `270` | `0` | `300 / 65` | `50 / 303` |
| `1 / 0xC2B19D12` | normal | `2000` | `210` | `312 / 380` | `250` | `500` | `285 / 65` | `50 / 303` |

强证据部分：buff 把 `global142` 从 normal row 切到 buff row，并提高 `boost_dash_initial_speed`、`boost_dash_distance`、`air_speed_base`。wiki 说“机动力强化 / boost 回数 +1 / 5~6 秒”；本地 raw field 的 `boost_dash_count` 数值需要继续结合 native schema，不单独当“+1”证明。

## 代表 projectile 闭环

`bulletparam.bin` 按原始 LE descriptor/row 直接读取。表中 `life/range/resource/action/hitgroup/interaction/expire` 已由 `.c` 的 `sys_4F` 输出命中。当前不列 `initial_speed`，因为本项目 bulletparam 研究已确认基础发射速度常由 firing action / weapon runtime 供给，不能只看 bullet row。

| Entry id / row | Called from | life | range | resource | action | hitgroup / interaction | expire |
|---|---|---:|---:|---|---|---|---|
| `0x2FA07294 / 1` | main BR `func_936` | `300` | `15` | `0x03184CD7` | `0xFB7B9E02` | `0xA6402599 / 0x571EA245` | `0x9B07ACD7` |
| `0x89BB5A2A / 14` | shooting CS `func_940` | `600` | `20` | `0x087B0040` | `0x35514E44` | `0xA6402599 / 0x571EA245` | `0x74F45BBD` |
| `0xE1733133 / 27` | melee CS `func_945` | `90` | `30` | `0x4C95792F` | `0xFC165A1B` | `0x90EDBD32 / 0xF47CAADD` | `0x078086CE` |
| `0x858F9DFC / 12` | melee CS secondary `func_947` | `300` | `0` | `0x00000000` | `0x00000000` | `0x00000001 / 0xF47CAADD` | `0x00000000` |
| `0x4F616919 / 5` | neutral sub `func_951` | `90` | `2` | `0x845604C7` | `0xFC165A1B` | `0x7F2FD60C / 0x837B9A4B` | `0x078086CE` |
| `0x72791C4F / 8` | side sub `func_960` | `90` | `2` | `0x0C35BB9B` | `0xFC165A1B` | `0x7F2FD60C / 0x837B9A4B` | `0x078086CE` |
| `0x99CBDDC8 / 19` | front sub `func_968` | `90` | `2` | `0x5DCE62A8` | `0xFC165A1B` | `0x7F2FD60C / 0x837B9A4B` | `0x078086CE` |
| `0x803B338C / 11` | back sub `func_976` | `90` | `2` | `0xE4CEEB75` | `0xFC165A1B` | `0x7F2FD60C / 0x837B9A4B` | `0x078086CE` |
| `0xCCF8ACC8 / 24` | buff activation `func_1084(1)` | `300` | `0` | `0x00000000` | `0xA4DF7269` | `0xD07E9EE7 / 0xC870D565` | `0x691246B1` |
| `0x36F791AB / 2` | buff activation `func_1084(1)` | `300` | `0` | `0x00000000` | `0xA4DF7269` | `0x2A71A384 / 0xC870D565` | `0x691246B1` |

四个 Bazooka projectile 共享 `life/action/hitgroup/interaction/expire`，只换 `resource`，这支持“同一 Bazooka 武器的四个动作/方向资源变体”解释。

## Assist payload

`0x23DF217E` 与 `0x1A6949AC` 都注册到 `func_1074`。`func_1074` 先按 action hash、方向、强化状态写 `global201`；`func_1076` 在 `func_309(global20, 0xC8)` 后输出 `sys_51`：

| `global201` | Direct output | Candidate |
|---:|---|---|
| `4` | `sys_51(0x20000,0,2,1,5)` + sound `0x1921876B` | awakening lever assist / Psycho Jammer candidate |
| `3` | `sys_51(0x20000,0,2,1,1)` + sound `0x6E26B7FD` | awakening N assist candidate |
| `2` | `sys_51(0x20000,0,2,1,4)` + sound `0x874512C8` | front/back assist candidate |
| `1` | `sys_51(0x20000,0,2,1,0)` + sound `0xF042225E` | side assist candidate |
| `0` | `sys_51(0x20000,0,2,1,3)` + sound `0xA398B282` | neutral assist candidate |

`func_1089/1090` 在 assist active / special state 中把 slot 2 arms entry 在 `0x3266D23F` 与 `0x48F71376` 之间切换。wiki 的 Rozen Zulu N/side/front-back/awakening variants 与 payload 分叉一致，但 payload 数字到具体视觉名称仍需继续用 summon resource 证明。

## Wiki 对照边界

[EXVS2OB Sinanju](https://w.atwiki.jp/exvs2ob/pages/70.html) 提供以下 semantic candidate：

- main Beam Rifle：8 ammo。
- shooting CS：Beam Rifle high-output。
- sub：N/lever Bazooka，4 ammo。
- special shooting：Rozen Zulu assist，normal 与 awakening variants。
- melee CS：Grenade Launcher。
- special melee：Meteor Kick，normal `2` ammo、awakening `4` ammo，触发 `赤い彗星の再来`。
- `赤い彗星の再来`：机动力时限强化，wiki 记载 5~6 秒/6 秒。
- awakening：N awakening `再来の真価` 与 back awakening Beam Rifle continuous rotating shot。

命名流程仍是：先 `.c -> syscall -> raw Param row`，再用 wiki 给 semantic candidate。未闭合的 summon payload、awakening N/back precise split、slot 4 native gauge schema 不能只凭 wiki 命名。

## 当前结论

1. Sinanju 是 classic local selector；`0.c func_143 -> action hash -> 2.c func_1095 callback -> raw Param row` 已对主射、CS、格斗 CS、四向 Bazooka、special melee 与 assist 建立代表闭环。
2. `1.c` 是空 glue，不承载单位状态机。
3. `赤い彗星の再来` 由 Meteor Kick gate 触发，`func_1084/1085/1086` 管理状态，`characterparam` entry 和 `speedparam` row 同步切换。
4. `global143` 会写回 `0.c` field `0x17`，但 Sinanju 当前不是 Unicorn 那种双形态 selector；它更像时限机动 buff 状态。
5. Slot 3 的 `2 -> 4` ammo 切换与 wiki 的 special melee `2<4>` 强对应；slot 4 gauge row `0xA0329255` 仍需 native 绑定证明。

## 后续研究

- 拆 `func_1041/1048`，精确区分 N awakening 与 back awakening，并追最后 projectile / melee hitbox。
- 继续追 special melee 派生 `0xBBEA1ECB / 0x175F51C7` 与普通 melee set 的 melee param / hitgroup。
- 追 `sys_51` summon payload 到 Rozen Zulu 具体 beam/claw/Psycho Jammer 资源。
- 追 slot 4 gauge 的 native loadout 绑定、冷却/持续 timer 与 `0xA0329255` row 的关系。
- 对比 Unicorn：两者同为 UC/classic selector，但 Unicorn 是主形态 selector 轴，Sinanju 是时限 mobility-buff 轴。
