# 66003001 Darilbalde MSC 研究

生成日期：2026-06-21

本页只使用实际反编译 `.c`、raw Param 与源 FHM2D。没有生成 analysis JSON、
semantic overlay、resolved-label 或其它 JSON 中间物。

上级入口：

- [MSC Research 入口](../../README.md)
- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)
- [66001001 Gundam Aerial](../66001001-gundam-aerial/README.md)
- [66002001 Gundam Pharact](../66002001-gundam-pharact/README.md)

身份由 Character ID Table 与 `character_list.json` 交叉确认：机体名
`ダリルバルデ`，驾驶员 `グエル・ジェターク`。玩家语义参考：

- [EXVS2OB wiki Darilbalde](https://w.atwiki.jp/exvs2ob/pages/746.html)
- [Dengeki Online 参战说明](https://dengekionline.com/article/202404/2843)

Wiki 只用于 Beam Shot Rifle、Gusser Ishvara、Pellet Mine、Daya Ambicar、Beam
Katana 等玩家侧词汇。当前 wiki 同时记录 2024-08-28 平衡调整，而源 FHM2D 的文件系统
时间是 2024-08-08；因此 wiki 数值不能反向证明本包的帧数、弹数或 reload 参数。

## Source map

Character ID Table row：

| Field | Value |
|---|---:|
| `id` | `66003001` |
| `Model` | `0xB7B6E5A6` |
| `Effect` | `0x4CED7061` |
| `Sound` | `0x77F2583F` |
| `Param` | `0x682678AF` |
| `Msc` | `0x39DD42B7` |
| `Motion` | `0x9970CD25` |

Source FHM2D：

| Kind | Source | Size | LastWriteTimeUtc | SHA-256 |
|---|---|---:|---|---|
| MSC | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x39DD42B7.fhm2d` | `110640` | `2024-08-08 12:31:32` | `3A8A1DD6CC970130DBDC67B8291BD1F258644781DED2066CD7716D87C2003396` |
| Param | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x682678AF.fhm2d` | `11848` | `2024-08-08 12:31:45` | `CB0A7B68C01397A4D476B4A9583211385FD854A81D4769E73FAB7E3F645056DA` |

只读源文件解包到独立 workspace：

```text
E:\XB\解包\com\file\040msc\0x39DD42B7
E:\XB\解包\com\file\041cpm\0x682678AF
```

抽取与反编译结果：

| Part | Binary size / SHA-256 | `.c` lines / definitions / SHA-256 |
|---|---|---|
| `0` | `27232` / `50CA4F4B00B7D5AFAAC14684679C65DADFC8FDB81B641631AC02DFDECF308E39` | `3594` / `162` (`func_0..func_161`) / `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `1` | `192` / `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` | `34` / `6` (`main + func_1..func_5`) / `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2` | `308048` / `6D8D35A0F25E9734190423BE6694883637CCCD788C4635F8851837CC89FF7F62` | `33258` / `1187` (`main + func_1..func_1186`) / `3970426BA223DC6A337C001B75C3A98B596BA76C7BCD5246F5CBF2DE59BBA3E2` |

`0.c`、`1.c` 及对应二进制与 Aerial、Pharact byte-for-byte 相同。三台同代机体
共享 external-table input/glue 模板，单位差异主要落在 `2.c + chrsysparam + raw Param`。

## 三份脚本职责

### `0.c`：共享 external-row input adapter

- `0.c:3363-3411`, `func_143/147`：`sys_41(...)` 返回 external action row。
- `0.c:3413-3438`, `func_146`：扫描 `field 0x03 == 0x12C` 特殊入口。
- `0.c:3440-3478`, `func_144`：读取 category/direction 字段。
- `0.c:3480-3496`, `func_145`：读取 action hash `field 0x2E`、group `field 0x0A`，
  再经 `0x700002` 取得 route/flags。

Darilbalde 的玩家动作 hash 不在 `0.c` 内硬编码；`0.c` 负责 native input 到 Param row
的桥接。

### `1.c`：共享 glue stub

`1.c` 只有 34 行、6 个定义，与 Aerial/Pharact 完全相同。没有 Darilbalde 专属武装或
状态逻辑。

### `2.c`：runtime、单位动作与资源状态

- `2.c:25060-25096`, `func_849`：遍历 table0 rows `1..43`，动态注册 action hash、
  row index 与三相 callback。
- `2.c:25097-25133`, `func_873`：group -> runtime callback resolver。
- `2.c:25552-25687`, `func_867/868/870`：把 128-field row 装入 runtime globals。
- `2.c:25756-25767`, `func_875`：直接读取
  `sys_0(0x700000, 0, row, field)`。
- `2.c:28395-28801`, `func_967`：132-case phase/function-key resolver。
- `2.c:31798-31826`, `func_1119`：单位初始化、dynamic/fixed registry、默认 shell、
  drone action 可用性与持久状态初始化。
- `2.c:33073-33258`, `func_1182..1186`：固定 action、slot callback、stance resource
  与 extra resource registry。

全文件结构指标：`sys_0=1275`、`sys_1=544`、`sys_46=396`、`sys_47=482`、
`sys_4B=312`、`sys_4F=63`、`sys_51=32`、`sys_4E=50`。

32 个 `sys_51` 全部是 `sys_51(0x20001, 0x8/0x7)` 型维护调用；没有
`sys_51(0x20000,...)` assist summon。

## External action table

Raw `chrsysparam.csyspm`：

| Item | Value |
|---|---:|
| Magic | `0xB4ACACAF` |
| Version | `0x00010000` |
| Unit ID | `66003001` |
| Table 0 | marker `0xA8BBBAB9`, `44 x 128`, rows `1..43` nonempty |
| Table 1 | marker `0xA8BAA9BA`, `1 x 1`, empty |
| File size | `22592` |

Group runtime 由 `func_873` 和 `2.log` pointer table 对齐：

| Group | Live rows | Runtime callback | Evidence role |
|---:|---:|---|---|
| `0x00` | `1` | `func_944` | basic shot runtime |
| `0x03` | `7` | `func_948` | multi-phase shooting runtime |
| `0x0C` | `10` | `func_924` | melee runtime |
| `0x17` | `1` | `func_942` | special movement/custom melee runtime |
| `0x1F` | `2` | `func_916` | action/movement runtime |
| `0x20` | `2` | `func_916` | same runtime as `0x1F` |
| `0x25` | `1` | `func_919 -> func_914` | executes `field 0x1C` function key |
| `0x27` | `16` | none | phase callbacks remain active |
| `0x29` | `3` | none | phase callbacks remain active |

43 rows provide 126 nonzero phase slots and 120 unique phase keys；`func_967` resolves all
120. Resolver has 12 keys not present in `field 0x02/0x7C/0x7D`。其中
`0x0AABC98B -> func_1149` 仍由 row 14 `field 0x1C` 经 `func_919 -> func_914`
调用，所以“phase columns 未引用”不等于 dead code。

### Rows 1..16：射击与特殊格斗

| Row | Action | Group | Category | Mask | Slot | `02/7C/7D` callbacks | 代码侧角色 |
|---:|---|---:|---:|---:|---:|---|---|
| `1` | `0xF48D2D49` | `0x00` | `0` | `0` | `0` | `969/968/970` | main shot；raw field `0x1E` 是 bullet ID |
| `2` | `0x32A675FF` | `0x03` | `0x0B` | `0` | `0` | `972/971/973` | shooting CS；raw field `0x20` 是 bullet ID |
| `3` | `0x0F856FF7` | `0x1F` | `7` | `0` | `1` | `975/974/976` | 4-unit drone deployment |
| `4` | `0xAFFD33E0` | `0x20` | `7` | `0` | `5` | `978/977/979` | deployed-drone N release |
| `5` | `0x36F4625A` | `0x20` | `7` | `0x3C` | `5` | `981/980/982` | deployed-drone directional release |
| `6` | `0xDD38F870` | `0x03` | `8` | `8` | `3` | `993/992/994` | back special-shot family；8 raw bullet rows |
| `7` | `0x2BED9ED9` | `0x03` | `8` | `0` | `2` | `984/983/985` | neutral scatter shot；can schedule repeat |
| `8` | `0xDAD907CC` | `0x03` | `8` | `0x20` | `2` | `987/986/988` | one horizontal moving shot |
| `9` | `0x20D63AAF` | `0x03` | `8` | `0x10` | `2` | `987/986/988` | opposite horizontal moving shot |
| `10` | `0x11278AE2` | `0x03` | `0x190` | `0` | `2` | `990/989/991` | repeat-shot internal row |
| `11` | `0xEB28B781` | `0x03` | `0x190` | `0` | `2` | `990/989/991` | opposite repeat-shot internal row |
| `12` | `0xCDB1508E` | `0x0C` | `9` | `0` | `5` | `996/995/997` | N special-melee chain entry candidate |
| `13` | `0x61478E1F` | `0x27` | `0x1F` | `0` | `5` | `999/998/1000` | row 12 timed continuation |
| `14` | `0xC569C3DD` | `0x25` | `9` | `4` | `5` | none | custom `func_1149` movement/melee runtime；front special candidate |
| `15` | `0xC8FE460B` | `0x0C` | `9` | `8` | `4` | `1002/1001/1003` | Daya Ambicar barrier-attack candidate |
| `16` | `0xD367520F` | `0x27` | `0x1F` | `0` | `5` | `1005/1004/1006` | row 15 timed continuation |

`Mask 4/8` 与 wiki 的 front/back special-melee 分支对齐，但精确动作名仍需 Motion hash
确认。row 14 的 custom movement、row 15 的 slot-4 consumption 和双侧 barrier proxy
比 category 数字本身更强。

### Rows 17..43：格斗、派生与觉醒链

| Start row | Raw transition graph | 结构角色 |
|---:|---|---|
| `17` | `17 -> 18 -> 19 -> 20` | neutral melee chain；row 20 在末段发射独立 projectile |
| `21` | `21 -> 22` | forward melee chain |
| `23` | `23 -> 24 -> 25` | horizontal melee chain |
| `26` | custom row，target `0xE9BAFD17` 不在 table0 | wire/anchor multi-branch candidate；`func_1035` 自己处理方向分支 |
| `27` | `27 -> 28 -> 29` | BD melee chain |
| `30` | `30 -> 31 -> 32 -> 33 -> 34 -> 35 -> 36` | rows 17/18/23/24 的共同 high-damage derivation |
| `37` | `37 -> 38 -> 39 -> 40 -> 41 -> 42 -> 43` | long cinematic melee/awakening candidate |

关键 raw delays：

```text
12 -> 13 : 11
15 -> 16 : 15
17 -> 18 : 10, 17 -> 30 : 10
18 -> 19 : 21, 18 -> 30 : 21
19 -> 20 : 20
23 -> 24 : 12, 23 -> 30 : 12
24 -> 25 : 20, 24 -> 30 : 20
27 -> 28 : 20, 28 -> 29 : 10
30 -> 31 -> 32 -> 33 -> 34 -> 35 -> 36 : 7,18,33,47,59,72
37 -> 38 -> 39 -> 40 -> 41 -> 42 -> 43 : 19,19,21,24,58,0
```

row 20 `func_1017` 在 timeline `0x8FC` 发射 `0xA4A69B38`。它属于 N-melee raw
transition chain，不应因为出现 `sys_4F` 就误命名为 Pellet Mine。Wiki 说明 N melee
末段是 shooting attribute；这是相符语义，不是单独的 hash 证明。

## 武装证据链

### Main shot 与 shooting CS

```text
row 1, action 0xF48D2D49, group 0, slot 0
  field 0x1E = 0x51A926BB
  func_944 -> func_947 -> func_220(slot, bullet, variant)
  -> sys_4F(0, slot, bullet)
  -> bulletparam row 15

row 2, action 0x32A675FF, group 3, slot 0
  field 0x20 = 0x0DF2BAE7
  func_948 -> func_951 -> func_220(...)
  -> bulletparam row 4
```

| Bullet ID | Move | Lifetime | Resource | Action | Interaction | Speed | Range |
|---|---:|---:|---|---|---|---:|---:|
| `0x51A926BB` | `255` | `300` | `0x7D1118F8` | `0xBCC2423B` | `0x18638488` | `0.8` | `15` |
| `0x0DF2BAE7` | `255` | `300` | `0xF029D3EA` | `0x4CBAD64F` | `0x18638488` | `2.0` | `18` |

结合 category、slot 与 wiki，这两行分别强对应 Beam Shot Rifle 普通射击和 high-output
CS。名称来自多层一致证据，不是从 Param hash 直接猜出。

### Gusser Ishvara 四机 deployment state machine

`func_1119` 初始化时：

```text
enable  0x0F856FF7  (row 3 deploy)
disable 0xAFFD33E0  (row 4 N release)
disable 0x36F4625A  (row 5 directional release)
global955 = 0
global957 = 0x4B0
```

`func_975` 在 motion time `0x3E8` 发射四个 slot-5 rows：

| Bullet ID | Bullet row | Move | Lifetime | Resource |
|---|---:|---:|---:|---|
| `0x0BB2D96F` | `0` | `0` | `10000` | `0xCEEF1967` |
| `0x92BB88D5` | `28` | `0` | `10000` | `0xCEEF1967` |
| `0xE5BCB843` | `47` | `0` | `10000` | `0xCEEF1967` |
| `0x7BD82DE0` | `23` | `0` | `10000` | `0xCEEF1967` |

同一函数随后设置 `global956 = 0x78`、`global957 = 0x4B0`、`global958 = 1`。
`func_1174` 每 update 维护这些值：

- `global956` 递减到 0 时触发一次 `sys_1(0xF0000, 0x12C/0x12D, 1)`，重置为
  `0x78`，`global955++`。
- `global955 < 4` 时禁用 deploy，启用两个 release actions。
- `global955 >= 4` 时反转 action 可用性；drone activity 和 slot-1 ammo 都结束后才恢复。
- `global957 <= 0` 时按 lock state 执行 `sys_4E(0x5, 0x3, 1/2)`，强制进入
  release path。
- `func_1175` 在 13 个 melee/special actions 内暂停或钳住 auto-release countdown。

`func_978/981` 是手动 release：分别执行 `sys_4E(0x5, 0x3, 2/1)`，并把
`global955` 直接置 4。该代码形状与 wiki 的“展开四机、N/方向追加入力、约 2 秒后逐机
自动出击、格斗/防御中暂停”一致。`0x78` 若按 60 updates/s 解释为约 2 秒，这是带帧率
假设的推论；状态转换本身由 `.c` 直接证明。

### Scatter shot 与 Pellet Mine 分槽

rows 7..11 共用 slot `2`：

- row 7 neutral；`func_984` 根据 follow-up input 调度 row 10 或 11。
- rows 8/9 horizontal；`func_987` 用正负 `global924` 写 `sys_46` 横向位移。
- rows 10/11 是第二发 internal rows。
- `func_1181` 根据 slot-2 ammo/state 改写 rows 7/8/9 的可用性。
- row 7 raw field `0x20 = 0xBAF7D181`；rows 8..11 使用
  `0x8FC0F533`。两者都是 `move_type 255`、`lifetime 1` 的 spawner-like rows；
  visible pellet child chain 仍需继续追 `bullet_action_hash`。

row 6 单独使用 slot `3`、back mask `8`。shared group runtime 发射 raw field
`0x20 = 0x0BE477EE`；`func_993` 在同一 timeline 再发射 7 个 literal rows：

```text
0x92ED2654 0xE5EA16C2 0x7B8E8361 0x0C89B3F7
0x9580E24D 0xE287D2DB 0x7238CF4A
```

8 个 rows 全部存在于 `bulletparam.bin`，共用 resource `0xCD1B8325`、lifetime
`100`、max range `8`，但 turn rate 分为 `7.8/8.0/8.5`。独立 slot、back mask、
多方向 row family 与 wiki 的 back special-shot Pellet Mine 相符。

### Daya Ambicar barrier attack

row 15 使用 category `9`、back mask `8`、slot `4`，phase 0 是 `func_1002`。
它在第二阶段调用 `func_1167`：

```text
if slot-4 ammo exists:
  sys_4F(0, 5, 0x51F3B7E9)
  sys_4F(0, 5, 0xABFC8A8A)
  sys_4F(0x7, 4, 1, 1)       # consume slot 4
  detach shell 0x13903716 / 0xE99F0A75
  set global953/global959/global965
```

两条 raw bullet rows 共用 resource `0x7D1118F8`，`hitbox_depth` 分别为 `+180` 与
`-180`，构成左右双侧 proxy。`func_1168/1169` 维护活动/命中状态，`func_1170` 在 ammo
恢复且 action 结束后重新 attach 两个 shell 并播放恢复效果。结合 wiki，这条链强对应
Daya Ambicar 展开屏障攻击。

### Front special custom runtime

row 14 没有三相 key：

```text
group 0x25
field 0x1C = 0x0AABC98B
func_919 -> func_914 -> func_967(0x0AABC98B) -> func_1149
```

`func_1149 -> func_1151/1152/1153/1154` 建立独立 melee runtime，包含纵向/前向
`sys_46`、派生 gate、相机 `sys_53` 和落地/中断 cleanup。它与 wiki 的 front-special
Beam Katana jump thrust 相符，但精确 motion 名称仍待 Motion FHM2D 对照。

## Shell/loadout 与“没有形态切换”

`func_1158` 建立 active shell `0x25A1637D`。row `field 0x0B` 经
`func_861 -> func_1130(value)` 选择动作期间 loadout：

| Field `0x0B` | Representative rows | Dispatcher |
|---:|---|---|
| `1` | main/CS/sub/special shooting | `func_1132` |
| `0x0B` | normal melee rows | `func_1133` |
| `0x0D` | special-melee rows 12/15 | `func_1135` |
| `0x0E` | long derivation row 30 | `func_1136` |
| `0x15` | wire/anchor row 26 | `func_1137` |
| `0x16` | cinematic row 41 | `func_1138` |

`func_1130` 先清当前 loadout，再 attach 对应 shell/effect；`func_1129` 在
`global143 == 0` 时恢复 default loadout。这里是 action-local weapon/body-part presentation，
不是 persistent form selector。Wiki 也记录“形态移行なし”。

## Raw Param bridge

Key raw files：

| File | Entries | Commands | Entry size | Trailing |
|---|---:|---:|---:|---:|
| `armsparam.bin` | `5` | `48` | `200` | `339` |
| `bulletparam.bin` | `51` | `85` | `340` | `0` |
| `characterparam.bin` | `1` | `197` | `796` | `36` |
| `speedparam.bin` | `1` | `74` | `304` | `37` |
| `interactionid.bin` | `51` | `31` | `124` | `0` |
| `hitgroupiddef.bin` | `77` | `15` | `60` | `0` |
| `grapparam.bin` | `10` | `16` | `64` | `0` |
| `projectile_depiction_table.bin` | `1` | `15` | `60` | `0` |

`armsparam.bin` rows：

| Entry ID | Ammo | Reload type | Start | Per-shot | Wait | Cooldown | Bullet type |
|---|---:|---:|---:|---:|---:|---:|---:|
| `0x1BCBF527` | `1` | `0` | `240` | `360` | `80` | `240` | `3` |
| `0x32DDC17B` | `1` | `0` | `180` | `270` | `60` | `180` | `1` |
| `0x7BC4F258` | `7` | `1` | `120` | `180` | `40` | `120` | `0` |
| `0xC026096B` | `1` | `0` | `180` | `240` | `60` | `180` | `4` |
| `0xC0B2F9AF` | `2` | `2` | `300` | `420` | `100` | `300` | `2` |

7-ammo 与 2-ammo rows 分别和 wiki 的 main / scatter ammo count 一致。五个 entry IDs
都不是 `.c` literal，exact slot binding 可能由 native table order 完成；因此这里只记录
强候选，不把 row ID 直接命名为玩家武装。

`speedparam.bin` 只有 row `0xC2B19D12`：movement class `7`、boost gauge `500`、
BD initial `180`、sustained `312`、max `350`、distance `245`、duration `385`、
BD count `8`、air base `280`、air max `65`、step distance `9`。Wiki 当前写 BD count 7；
native 字段与玩家显示值未必同义，且存在版本差异风险，不能据此判定任一侧错误。

`characterparam.bin` 只有 row `0x1B12AE7D`。当前字段标签不足以把 raw 值直接当
玩家 HP/lock/damage 名称。

全文件有 19 个唯一 direct literal fire IDs，全部命中 51-row `bulletparam.bin`；另有
5 个唯一 bullet IDs 从 raw action fields 经 `func_220` 发射，也全部命中。当前直接证明
24 个不同 bullet rows，不需要任何 JSON 转存。

## 同代三机对比

| Metric | Aerial | Pharact | Darilbalde |
|---|---:|---:|---:|
| `0.c/1.c` template | same SHA | same SHA | same SHA |
| live external rows | `46` | `32` | `43` |
| phase resolver cases | `141` | `101` | `132` |
| `2.c` definitions | `1198` | `1153` | `1187` |
| bulletparam rows | `156` | `93` | `51` |
| `sys_4F` calls | `180` | `151` | `63` |
| `sys_51(0x20000)` | present candidate surface | none | none |

Darilbalde 的 bullet table 最小、literal fire 也最少，但 unit runtime 并不简单：
`global954..966`、`func_1167..1176` 明确维护 drone count、auto-release timer、action
enable/disable、barrier detach/restore 和 shell fade。syscall count 不能替代状态机读码。

## 证据边界与下一步

- `func_N` 只对 `0x39DD42B7/2.c` 有效；跨机体主键仍是 action row、phase key、
  callback shape、resource output。
- Wiki 用于玩家名称与操作形状，不用于证明本包平衡数值。
- `0xE9BAFD17` 是 row 26 的 raw target，但不在 table0，也不在 `.c` literal；当前只记录
  missing external target，不能伪造 callback 名。
- resolver 中 phase-unused key 不等于 dead；row 14 已证明 field `0x1C` 可走同一 resolver。
- scatter spawner 的 visible child bullets 还需追 `bullet_action_hash`、interaction 与
  projectile depiction table。
- 下一步应解包 `0x9970CD25` Motion，给 rows 12..43 的 melee stages、front derivation
  与 awakening chain 做 motion-level 对齐。
- 继续追 `interactionid/hitgroupiddef`，确认 anchor、barrier、mine 与 melee final hit 的
  hit behavior。
- exact arms row -> slot mapping 仍需 native initializer 或 runtime capture。

## 当前结论

OB v27 Darilbalde 是 43-action external-table unit。`0.c` 使用与 Aerial/Pharact 完全相同
的 input adapter；`2.c func_849/873/967` 把 raw rows、group runtime 与 120 个实际 phase
keys 接起来。单位专属核心不是单一“形态值”，而是两个持久系统：四枚 Gusser Ishvara
的 deployment/manual/auto-release 状态机，以及 Daya Ambicar 的 slot-4 consumption、
双侧 proxy、shell detach/restore 状态机。main、CS、scatter、mine、drone、barrier 与 melee
final projectile 都已从 `.c` 调用链落到 raw bullet rows；剩余不确定性集中在 Motion 名称、
child projectile、hitgroup/interaction 和 native arms slot binding。
