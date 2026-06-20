# MSC 代际与 Param Action Bridge 对比

生成日期：2026-06-20

本页记录真实 `Character ID Table -> Msc/Param FHM2D -> 0.c/1.c/2.c` 配对证据，并修正“新 MSC / 旧 MSC”过度二分的说法。

上级入口：

- [跨机体 MSC 研究总览](cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](cross-unit-first-batch-comparison.md)

## 样本与来源

| 机体 | Character ID | Msc | Param | MSC workspace | Param workspace |
|---|---:|---|---|---|---|
| Unicorn | `15001001` | `0x0B180D9E` | `0x5AE33786` | `E:\XB\解包\com\file\040msc\0x0B180D9E` | `E:\XB\解包\com\file\041cpm\0x5AE33786` |
| Sinanju | `15003001` | `0xCF8FC16A` | `0x9E74FB72` | `E:\XB\解包\com\file\040msc\0xCF8FC16A` | `E:\XB\解包\com\file\041cpm\0x9E74FB72` |
| N-EXTREME Gundam Explosion | `59001001` | `0x693F756D` | `0x38C44F75` | `E:\XB\解包\com\file\040msc\0x693F756D` | `E:\XB\解包\com\file\041cpm\0x38C44F75` |
| Gundam AGE-FX | `33004001` | `0x605245CC` | `0x31A97FD4` | `E:\XB\解包\com\file\040msc\0x605245CC` | `E:\XB\解包\com\file\041cpm\0x31A97FD4` |
| Delta Plus | `15004001` | `0x04AD9F33` | `0x5556A52B` | `E:\XB\解包\com\file\040msc\0x04AD9F33` | `E:\XB\解包\com\file\041cpm\0x5556A52B` |
| RX-78-2 Gundam | `1001001` | `0xF22E425D` | `0xA3D57845` | `E:\XB\解包\com\file\040msc\0xF22E425D` | `E:\XB\解包\com\file\041cpm\0xA3D57845` |
| G-Self | `42001001` | `0x72CD747F` | `0x23364E67` | `E:\XB\解包\com\file\040msc\0x72CD747F` | `E:\XB\解包\com\file\041cpm\0x23364E67` |
| Mack Knife (Mask) | `42002001` | `0xC33AA885` | `0x92C1929D` | `E:\XB\解包\com\file\040msc\0xC33AA885` | `E:\XB\解包\com\file\041cpm\0x92C1929D` |
| Gundam Aerial | `66001001` | `0x19CE466D` | `0x48357C75` | `E:\XB\解包\com\file\040msc\0x19CE466D` | `E:\XB\解包\com\file\041cpm\0x48357C75` |

所有源 FHM2D 只读。输出写入 TestEditor workspace route：

```text
Msc   -> unit.msc   -> 040msc
Param -> unit.param -> 041cpm
```

源输入已核验 size / mtime / SHA-256。这里不把机器导出的 CSV 当正文证据；需要复查时回到源 FHM2D 与 workspace。

## 结论：至少三种 action-record 布局

### A. 外部 Param action-table 型

已验证样本：

- `59001001 / 0x693F756D + 0x38C44F75`
- `33004001 / 0x605245CC + 0x31A97FD4`
- `66001001 / 0x19CE466D + 0x48357C75`

识别特征：

- `chrsysparam.csyspm` table0 是 `N x 128` little-endian u32 action matrix。
- `0.c` 有 162 个函数。
- `0.c` 和 `2.c` 调用 `sys_0(0x700000/0x700001/0x700002, ...)`。
- `0.c func_144..160` 是外部 action row bridge；传统固定 registry 后移到 `func_161`。
- `2.c` 通过 group resolver 和 phase hash resolver 把 Param row 连到单位 callback。

三机 `0.c func_144..161` 中 17/18 个函数源码完全一致。NEXA-N 与 Aerial 的 18 个
函数逐字相同；AGE-FX 只有单位初始化钩子 `func_152` 不同：

```text
NEXA-N: func_135()
AGE-FX: global57 = 0x6D00AEAA; func_13(); func_14(); func_135()
```

因此 `func_144..151`、`func_153..161` 可视为稳定的外部-table runtime template；`func_152` 是单位扩展点，不应统一强制命名为纯 runtime。

### B. 经典本地 selector 型

已验证样本：

- Unicorn `0x0B180D9E`
- Sinanju `0xCF8FC16A`
- Delta Plus `0x04AD9F33`
- RX-78-2 `0xF22E425D`
- G-Self `0x72CD747F`
- Mack Knife (Mask) `0xC33AA885`

识别特征：

- Unicorn / Sinanju / Delta Plus / RX-78-2 / G-Self / Mack Knife 的 `chrsysparam.csyspm` 都是 68 bytes。
- 六个文件都只有两张 `1 x 1` 空表：table0 marker `0xA8BBBAB9`，table1 marker `0xA8BAA9BA`。
- `0.c` 没有 `0x700000/1/2` 调用。
- `2.c` 没有 `0x700000/1/2` 调用。
- `0.c func_144()` 直接注册 17 个固定 `hash -> callback`：`sys_1(0x10002, 0x1, hash, func_N)`。
- RX、Unicorn、Sinanju、Delta Plus、G-Self、Mack Knife 的 `func_144()` 源码逐字相同，均含 17 个非零 callback 加一条 zero row。

历史 `0xBDBE6FEA` 目录仍保留相同 registry 形状，但其当前 `2.c/2.dscex` 含 2026-06-19 Delta Kai AI patch，且当前源库没有对应 FHM2D。它只作为 semantic reference，不再作为未经修改的官方版本证据。

这类样本也没有 `sys_2C/sys_2D`。因此不能直接称为“旧 embedded B4AC”。它们是经典本地 selector / registry 路径，具体 action 数据仍需从 `0.c` 固定 selector、`2.c` tail registry、单位 callback 和其它 Param 文件联合解释。

### C. 真 legacy embedded B4AC 型

当前证据来自旧对照文件 `G:\1. Gundam - 1011.c`，不是本轮 OB v27 FHM2D 抽取样本。

识别特征：

- `add_B4AC()` 用 `sys_2D` 写入 action rows。
- `sys_2C` 读取 row fields。
- action matrix 内嵌于 MSC，而不是外部 `chrsysparam.csyspm`。

因此后续文档必须区分：

```text
external Param action-table
classic local selector
legacy embedded B4AC
```

不能只写“新 / 旧”两个标签。

## 外部-table 桥接函数

NEXA-N、AGE-FX 与 Aerial 的稳定 `0.c` 结构：

| Function | Evidence-based role |
|---|---|
| `func_144(row)` | 读取 fields `0x03/0x04`，导出 gameplay category |
| `func_145(row, category, extraFlags)` | 读取 `0x2E` action hash、`0x0A` group；调用 `0x700002` 得 route/flags；交给 `func_95` |
| `func_146()` | 扫描 action rows，处理 `field 0x03 == 0x12C` 的特殊入口 |
| `func_147/148/149` | action hash 与 row index 双向查找/激活桥接 |
| `func_150/151` | runtime slot `0x1E` 状态清理/设置 |
| `func_152` | unit-specific init hook |
| `func_153..160` | 现有 selector helper 的 wrapper |
| `func_161` | 17 项固定 input callback registry；经典样本中编号是 `func_144` |

## 共享 runtime 与单位数据分层

两个外部-table样本给出很强的分层证据：

| Evidence | NEXA-N | AGE-FX | Cross-unit result |
|---|---:|---:|---|
| Constant `func_241` handler hashes | `25` | `25` | `25/25` 完全相同 |
| Dynamic `func_241(var2,var4)` | `1` | `1` | 都存在 |
| Nonzero Param action hashes | `54` | `71` | 交集 `0` |
| `0.c` external bridge funcs | `18` | `18` | 17 个完全相同，1 个 unit hook 不同 |

解释：

```text
shared runtime layer
  = fixed input registry + 25 common handler hashes + external row bridge

unit data layer
  = chrsysparam row hashes + category/group + phase keys + transition rows

unit behavior layer
  = 2.c group callbacks + phase callbacks + weapon/state/effect/shell logic
```

这比按 `func_N` 对齐更接近 Unreal DataTable / Unity ScriptableObject + controller/state-machine 的架构：

- `chrsysparam` 类似 data-driven action graph/config table。
- `0.c` 类似 input/category adapter 与 action request dispatcher。
- `2.c` 前中段类似共享 character controller/runtime framework。
- `2.c` 后段 callback 类似单位状态、武器、形态和表现层脚本。
- `1.c` 在七个当前真实源样本中完全相同，仍是 6 函数 / 34 行 glue stub。

## RX-78-2：classic selector 的直接闭环

RX `0.c func_143` 直接把输入和方向选成 unit action hash；`2.c func_1058` 再注册
55 个 action row。代表链已经由 `.c` 连到原始 Param：

```text
global48 & 0x1
  -> 0xF48D2D49
  -> 2.c func_915 -> func_918
  -> sys_4F(0, 0, 0x93459D29)
  -> bulletparam row 15

func_885 slot 0
  -> arms entry 0xE4FAB738
  -> ammo 8, reload_per_shot 180 frames
```

同样方法已对齐 N/横 Bazooka、N/方向 shooting CS、双 assist、N Hammer、Beam
Javelin 三段 projectile 和 Last Shooting BR projectile 段。完整行号、Param 值及证据边界见
[1001001 RX-78-2 Gundam](units/1001001-rx-78-2/README.md)。这证明 classic 样本也能
形成 `0.c selector -> 2.c callback -> Param resource` 数据桥，只是 action row 不放在
`chrsysparam`。

## Unicorn：classic selector 的双形态闭环

Unicorn 进一步给出 classic 样本内完整的形态状态桥：

```text
2.c global143
  -> sys_1(0x10000, 0, 0x17, global143)
  -> 0.c global39 = sys_0(0x10000, 0, 0x17)
  -> func_143 按 0 / 1 选择两套 action hashes
```

`func_1045/1046/1047` 同时按该值绑定两套 raw arms rows：通常形态 slot 0/1 为
`0x2B766A39 / 0x2669A5CE`，强化形态为 `0x9582623C / 0x72BCB69C`；原始
`armsparam.bin` 分别给出 `5/1` 与 `5/20` ammo。主射 action `0xDDFFDCA4` 在
`func_913` 又按形态选择 `bulletparam` row `0x3BF92A21 / 0x8D3A5C40`。

通常形态 `0xCEF7434A` 与觉醒输入 `0x99A7A777` 都能在 `2.c` 中直接写
`global143=1`、重绑武器并重建 registry。结合 wiki，两条分别强对应格斗 CS NT-D 与
觉醒技强制换装。完整 selector、callback、raw Param 数值见
[15001001 Unicorn](units/15001001-unicorn/README.md)。本结论没有使用 generated JSON。

## Sinanju：classic selector 的时限强化闭环

Sinanju 同样是 68-byte empty `chrsysparam`，但它不是 Unicorn 那种两套主形态 selector。
`0.c func_143` 直接选择主射、CS、格斗 CS、四向 Bazooka、assist、Meteor Kick 等 action hash；
`2.c func_1095` 注册这些 hash 到单位 callback；callback 再落到 raw arms/bullet/speed/character Param。

代表链：

```text
global49 & 0x200
  -> 0xD44E9701
  -> 2.c func_1025 / func_1027
  -> if !func_1086() && sys_0(0x90009, 4) == 1:
       func_1084(1)
  -> global143 = 1
  -> sys_1(0x60008, 0xF51CCF51)
  -> global142 = 0x3548754D
  -> speedparam buff row
```

结束链 `func_1085` 恢复 `global143=0`、`characterparam` entry `0x1B12AE7D` 与 speedparam row
`0xC2B19D12`。raw `speedparam.bin` 显示 buff row 相比 normal row 提高
`boost_dash_initial_speed 210 -> 220`、`boost_dash_distance 250 -> 270`、`air_speed_base 285 -> 300`。
完整 selector、slot binding、projectile row 与 wiki 边界见
[15003001 Sinanju](units/15003001-sinanju/README.md)。本结论没有使用 generated JSON。

## Delta Plus：classic selector 的 WR / transform loadout 闭环

Delta Plus 同样是 68-byte empty `chrsysparam`，但 `0.c func_143` 有普通与变形两条输入分支。
普通分支把 main、CS、sub、assist、special melee 和 awakening 选成固定 action hash；变形分支在
`global20 & 0x4000` 时改选 WR main / WR sub / WR special shooting / rapid cancel / WR melee。

代表链：

```text
0.c transform branch, global48 & 0x1
  -> 0x91CE1EFC
  -> 2.c func_1009 / func_1012
  -> sys_4F(0, 0, 0xB35B8E04)
  -> bulletparam row 21
```

loadout 切换同样直接落到 raw arms rows：

```text
normal:    slot0/1/2 = 0x1486A84F / 0x10B251B4 / 0xA8E202BF
WR mode:   slot0/1/2 = 0x377D1397 / 0xF100A0DA / 0x1799C911
```

普通主射 `0xF48D2D49 -> func_912/914/915` 命中 `bulletparam` row `24 / 0xCC9F6DF0`；
空弹主射 `0x7158FA47 -> func_916/918` 走脚本驱动手动装填。WR main 命中
`0xB35B8E04 / 0x274CF25B / 0x978AD2F7`，WR sub 命中
`0x85074ECC / 0xDB003474 / 0x210F0917`，WR special shooting 命中
`0xD6E43088 / 0xEBD1EB8C`。

`speedparam.bin` 两行也被 `.c` 区分：normal row `0xC2B19D12` 是普通/退出 WR 后恢复行；
觉醒技后续 `0x99A7A777` 的 `func_958/959` 临时切到 `0x0577EF6D`，`func_960` 再恢复 normal。
完整 selector、transform loadout、projectile row 与 wiki 边界见
[15004001 Delta Plus](units/15004001-delta-plus/README.md)。本结论没有使用 generated JSON。

## G-Self：classic selector 的四形态换装桥

G-Self 是 68-byte empty `chrsysparam`，但 `0.c func_143` 按 `global39 == 0/1/2/3`
拆成四个本地状态族。结合 Character ID 与 wiki，这四个状态对应 Space、Reflector
stored/deployed、Assault 候选。`2.c func_1125/1127/1128/1130` 分别重装 slot 0..4
arms rows，同时写 `characterparam` row 和 `speedparam` row：

```text
state 0 -> character 0x1B12AE7D, speed 0xC2B19D12
state 1 -> character 0xF51CCF51, speed 0x3767F2E5
state 2 -> character 0x6C159EEB, speed 0x76A00477
state 3 -> character 0x821BFFC7, speed 0xC2B19D12
```

代表链：

```text
0.c state 0, global48 & 0x800
  -> 0x7CECBD11
  -> 2.c func_908 / func_910 / func_911
  -> func_1130() loads state 3
  -> sys_4F rows 0x1B80391E, 0x834FF331, 0x7940CE52
```

`func_1146` 还根据 slot 4 ammo `0x78/0x5A/0x3C/0x1E/0` 阈值维护 `global776` resource count，
`func_1149/1150` 再按 `4..0` 选择十个 `bulletparam` rows，interaction 都落到
`0x1241A530`。旧文档把它解释为 Aerial Bit Stave；身份纠正后该解释已撤销。完整
selector、raw arms/bullet/speed Param 数值与 wiki 边界见
[42001001 G-Self](units/42001001-g-self/README.md)。本结论没有使用 generated JSON。

## Mack Knife (Mask)：classic selector 的 Long-Range Booster 二状态桥

Mack Knife 同样是 68-byte empty `chrsysparam`。`0.c func_143` 只用
`global39 == 0/1` 分离 normal 与 Long-Range Booster 派生，且两条路径都继续通过固定
action hash 进入 `2.c` tail registry。

loadout 切换落在 `2.c func_1101/1102/1106/1107`：

```text
normal:             slot1/2 = 0x5DFFF073 / 0xA59ED475, speed 0xC2B19D12, character 0x1B12AE7D
Long-Range Booster: slot1/2 = 0x354FF2C6 / 0xD9FFA8EB, speed 0x56B9DA0B, character 0x6C159EEB
```

代表链：

```text
main: 0.c global48 & 0x1 -> 0x675E5A56
  -> 2.c func_911 / func_914
  -> bullet rows 0x61C544D8 / 0x9BCA79BB

sub: 0.c global48 & 0x80, slot1 ammo gate -> 0x3ACCB1AF
  -> 2.c func_927
  -> bullet rows 0x7C377D62 plus timed rows 0xE53E2CD8 / 0x92391C4E / 0x0C5D89ED ...

booster-state main derivative: global39 == 1 -> 0x749C3260
  -> 2.c func_1024
  -> bullet rows 0xB3479AA1 / 0x4948A7C2
```

这些代表链与 wiki 的 Beam Vulcan、Plasma Claw、Grenade Launcher、Barara assist 词汇
形成候选，但不能只靠输入 bit 给 hash 定名。完整 selector、raw arms/bullet/speed Param
数值与 wiki 边界见
[42002001 Mack Knife](units/42002001-mack-knife-mask/README.md)。本结论没有使用 generated JSON。

## Gundam Aerial：46-action external Param bridge

真正的 Aerial 是 `66001001 / 0x19CE466D + 0x48357C75`。其
`chrsysparam.csyspm` table0 是 `47 x 128`，rows `1..46` 非空；这与 420 系列两台
68-byte classic selector 完全不同。

直接 `.c` 链：

```text
0.c func_143
  -> sys_41(...) returns external row index
  -> func_145 reads fields 0x2E / 0x0A
  -> sys_0(0x700002, group, route/flags, row)

2.c func_849
  -> for each row: field 0x2E action hash + field 0x0A group
  -> func_241(action, func_873(group))
  -> func_973(field 0x02 / 0x7C / 0x7D) resolves phase callbacks
```

`func_973` 有 141 个 phase-key case。代表 action rows：

| Row | Action | Group / slot | Phase 0 | Output |
|---:|---|---|---|---|
| `2` | `0xDF8C4DAB` | `0x03 / 0` | `func_978` | `0x2CE0C3C6 / 0x3A584DBC` |
| `3` | `0x43DCA0EA` | `0x03 / 1` | `func_981` | three directional 11-row families |
| `4` | `0x31B991A3` | `0x03 / 1` | `func_984` | one 11-row family |
| `29` | `0x759EA5C8` | `0x0C / 5` | `func_1053` | 11 rows starting `0x26C6AD02` |
| `44` | `0x15E73A45` | `0x1F / 5` | `func_1098` | timed row plus 11-row family |
| `46` | `0xD02D6AD4` | `0x1F / 5` | `func_1104` | `0x91E0AEC8` plus 11-row family |

所有代表 `sys_4F` literal 都已命中本机 156-row `bulletparam.bin`。这证明 external row、
phase callback 与 raw projectile 的直接桥；GUND-BIT / Long Barrel / Demi Trainer 仍只作为
wiki 语义候选。完整证据见
[66001001 Gundam Aerial](units/66001001-gundam-aerial/README.md)。本结论没有使用 generated JSON。

## NEXA-N action table

`0x38C44F75/chrsysparam.csyspm`：

- header unit id `59001001`
- table0 `55 x 128`
- 非零 action rows `54`
- 24 rows：group callback + old route formula covered
- 10 rows：group callback exists，route formula unresolved
- 20 rows：no group callback；phase callback 仍可能有效

主要 group：

| Group | Group callback | Rows | Route status | Behavior status |
|---|---|---:|---|---|
| `0x03` | `func_950` | `5` | old formula covered | common row resource output resolved |
| `0x0C` | `func_924` | `8` | old formula covered | melee/action-param chain partially resolved |
| `0x0D` | `func_942` | `2` | old formula covered | pending |
| `0x0F` | `func_946` | `3` | unresolved | pending |
| `0x10` / `0x13` | `func_956` | `2 + 3` | `0x10` covered，`0x13` unresolved | all five rows traced to `sys_4F` |
| `0x1F` | `func_916` | `7` | old formula covered | runtime family resolved，row semantics pending |
| `0x25` / `0x26` | `func_919` | `2 + 2` | unresolved | group `0x26` row `7/9` front/side special movement resolved |
| `0x27` / `0x28` / `0x29` | none | `17 + 2 + 1` | phase-only path | must read phase callbacks |

这里必须把 route 解析和行为解析分开。group `0x13` 不在旧 `func_786` route
公式内，但三行行为已经从 `.c` 闭环：

```text
row field7C -> entry callback
row field02 -> per-frame callback -> six sys_4F projectile outputs
row field7D -> cleanup callback
```

三行分别是 neutral、front/back、left/right 输入候选，对应 wiki 的三种
Dagger Funnel。group `0x10` 两行也已分别追到 phase callback 内
`0x0A492911` 和 common runtime 的 `0x2FE1F748`。

group `0x26` 进一步证明 Param payload 是 group-dependent：row `7/9` 的
`field1C=0x3987CD20` 不是 motion，而是 `func_975` 的函数键：

```text
func_919 -> func_914 -> func_975(global839) -> func_1185
func_1185 -> directional sys_46 movement
          -> sys_4F(0, 3, 0x18529444)
```

row `7` mask `0x04` 与 row `9` mask `0x30` 分别覆盖前、左右输入；当前最强语义候选
是前/横特殊射击。`0x18529444` 还直接命中本机 `bulletparam.bin` row `9`。

## 跨机体字段语义反例

NEXA-N 与 AGE-FX 的 `func_849` 都实现相同 registry/phase 三相导入，但相同 Param
field 不能脱离 group callback 命名：

| Payload | NEXA-N | AGE-FX | Rule |
|---|---|---|---|
| `field1C -> global839` | group `0x26` 作为函数键，`func_975` 解析后执行 | group `0x35` 传给 `func_895` 作为 motion | 先定位 group callback，再解释 field |
| `field1E/1F -> global841/842` | 不同 ranged/melee group 可作 bullet、melee param 或空值 | group `0x35 func_980` 作为 `sys_51` 两个 payload | schema slot 不是跨 group 固定业务类型 |
| group key | NEXA-N `func_873` 有 9 个 case | AGE-FX `func_873` 有 13 个 case | group 数字只在匹配单位 resolver 内有意义 |

这修正了早期“field `0x1C` 就是 motion”的过强说法。稳定部分是 loader mapping；业务
类型由当前 unit 的 group callback 决定。

AGE-FX group `0x35` 的 row `6..10` 已继续读到 `func_977/979/980`：row
`6..9` 的 `field1E/1F=1/{1,2,1,0}` 和 row `10` 的 `0/0` 直接进入
`sys_51(0x20000, 0, 2, ...)`，随后扣各自 slot。方向 mask 与 wiki 的 Full Glansa
三向光束、格斗、Glastro Launcher，以及 Dark Hound 无方向 assist 一一形成候选映射。

AGE-FX group `0x1D` row `11..14` 还证明同一 slot `3` 可进入另一套移动 runtime：
四方向 motion 经 `sys_46` 推进，并发出 `0x9B4748FB`；该 hash 直接命中
`bulletparam.bin` row `69`，其 interaction `0x45A0E9ED` 与 callback 挂接对象相同。

完整证据表见
[59001001 NEXA-N 极限高达爆破](units/59001001-nexa-n/README.md)。

## AGE-FX action table

`0x31A97FD4/chrsysparam.csyspm`：

- header unit id `33004001`
- table0 `72 x 128`
- 非零 action rows `71`
- 33 rows：group callback + old route formula covered
- 19 rows：group callback exists，route formula unresolved
- 19 rows：no group callback
- table1 产生 12 条 transition evidence rows

主要 group：

| Group | Group callback | Rows | Route status |
|---|---|---:|---|
| `0x00` | `func_967` | `2` | old formula covered |
| `0x03` | `func_971` | `3` | old formula covered |
| `0x0C` | `func_930` | `14` | old formula covered |
| `0x0D` | `func_951` | `2` | old formula covered |
| `0x1F` | `func_923` | `12` | old formula covered |
| `0x20` | `func_923` | `4` | unresolved |
| `0x1D` | `func_915` | `5` | unresolved |
| `0x27` / `0x29` | none | `17 + 2` | phase-only path |
| `0x35` | `func_977` | `5` | unresolved |

## Wiki 语义候选

EXVS2OB wiki 只提供玩家可见名称与输入候选。它不能单独证明任何 `func_N` 语义；版本平衡数值也可能晚于本地 OB v27 FHM2D。

| Unit | Candidate gameplay vocabulary | Source |
|---|---|---|
| Unicorn | Unicorn / Destroy two forms; Beam Magnum; Beam Gatling; ReZEL assist; Beam Tonfa; NT-D transition | [EXVS2OB Unicorn overview](https://w.atwiki.jp/exvs2ob/pages/270.html), [normal](https://w.atwiki.jp/exvs2ob/pages/271.html), [NT-D](https://w.atwiki.jp/exvs2ob/pages/272.html) |
| Sinanju | Beam Rifle; Bazooka stationary/moving shots; Rozen Zulu assist; Meteor Kick; `赤い彗星の再来` timed mobility buff | [EXVS2OB Sinanju](https://w.atwiki.jp/exvs2ob/pages/70.html) |
| NEXA-N | RAIKIRI Sword; Dagger Funnel; Bomber Knuckle; no form transition | [EXVS2OB N-EXTREME Explosion](https://w.atwiki.jp/exvs2ob/pages/98.html) |
| AGE-FX | Normal / FX Burst forms; Stungle Rifle; Daidal Bazooka; C-Funnel; AGE-1 Full Glansa and AGE-2 Dark Hound assists | [EXVS2OB AGE-FX](https://w.atwiki.jp/exvs2ob/pages/360.html), [normal](https://w.atwiki.jp/exvs2ob/pages/362.html), [FX Burst](https://w.atwiki.jp/exvs2ob/pages/361.html) |
| Delta Plus | Beam Rifle; stationary/moving Grenade Launcher; Jesta assist; transform weapons; Waverider rush | [EXVS2OB Delta Plus](https://w.atwiki.jp/exvs2ob/pages/416.html) |
| RX-78-2 | Beam Rifle; max-output BR/Super Napalm CS; stationary/moving Hyper Bazooka; Guncannon/Guntank assist; Gundam Hammer; no transform | [EXVS2OB Gundam](https://w.atwiki.jp/exvs2ob/pages/78.html) |
| G-Self | Space / Reflector stored/deployed / Assault forms; Beam Rifle; Assault missiles; High-Torque Pack / Montero candidates | [EXVS2OB G-Self](https://w.atwiki.jp/exvs2ob/pages/345.html) |
| Mack Knife (Mask) | Beam Vulcan; concentrated CS; Plasma Claw irradiation; Grenade Launcher; Barara assist; Long-Range Booster | [EXVS2OB Mack Knife](https://w.atwiki.jp/exvs2ob/pages/179.html) |
| Gundam Aerial | Beam Rifle; Long Barrel irradiation/stance/moving shots; GUND-BIT all-range/deploy; Demi Trainer assist | [EXVS2OB Gundam Aerial](https://w.atwiki.jp/exvs2ob/pages/28.html) |

使用规则：

1. 先由 action row / callback / syscall / resource hash 形成证据链。
2. 再用 wiki 词汇给 semantic candidate 命名。
3. 无资源或调用证据时，保持 `ACTION_ROW_N_CAT_X_GROUP_Y`，不直接命名为主射/副射/特射。

## 代码优先记录规则

本页不再把机器导出结果作为交付物列出。NEXA-N、AGE-FX 与 Aerial 等 external-table
样本的后续研究按下面顺序写：

1. 从 `0.c` 证明 action row 如何被选择并写入 `func_95`。
2. 从 `2.c func_867..870` 证明 Param row 字段落到哪个 `global`。
3. 同时读取 `field0x7C/0x02/0x7D -> func_975` 的 entry/tick/cleanup callback；单位输出可能完全绕过 group callback 的 common resource fields。
4. 先判断 group callback 如何解释 payload；不能把 `field1C/1E/...` 在其它 group 的语义直接复制过来。
5. 从 group callback 与 phase callback 继续追到 `sys_4F/sys_51/sys_46/sys_53` 或 motion/effect wrapper。
6. 最后才用 wiki 词汇给语义候选命名。

## 下一步

- NEXA-N row `33 / 0x3AC14535` 已确认由 `func_1185` 前输入显式投递，并在 phase tick 执行移动；下一步追 melee param 的伤害和 hitbox。
- AGE-FX group `0x35` 与 `0x1D` 已分别追到 `sys_51` assist payload 和 `0x9B4748FB` resource row；下一步从 group `0x0C/0x1F` 各选一行读取三相 callback。
- RX、Unicorn、Sinanju 已分别建立单形态武器链、双形态 loadout/武器链、时限 mobility-buff 的 classic selector 闭环。Delta Plus 已有代表 callback，下一步补全 raw Param 对齐。
- G-Self 已建立四状态 classic selector、Assault-state 多弹体族与 resource count 的 `.c -> raw Param` 闭环；下一步追 Reflector stored/deployed 精确语义、motion/resource 名称与 assist payload。
- Mack Knife 已建立二状态 classic selector、slot 1/2 loadout 与 Beam Vulcan / Plasma Claw / Grenade Launcher 候选链；下一步追 `func_921`/`0x1000`、方向特射、interaction/hitgroup 与 slot 0 native 初始化。
- Gundam Aerial 已建立 46-action external table、动态 action/phase registry 和代表性多弹体族的 `.c -> raw Param` 闭环；下一步追全部输入映射、Demi Trainer `sys_51`、GUND-BIT resource/effect 与 arms slot 绑定。
- 加入更多 Character ID 样本，优先每个大 chrsysparam 一机、每个 68-byte empty chrsysparam 一机，避免只按作品或知名度采样。
- wiki 只维护 semantic candidate；最终名称必须回到硬盘证据验证。
