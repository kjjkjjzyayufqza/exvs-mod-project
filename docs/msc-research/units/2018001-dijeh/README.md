# 2018001 Dijeh MSC 研究：百式 Dodai 飞行模式对照

本页研究迪杰的 Dodai / flight mode，目的是给
[2002001 Hyaku Shiki MSC 研究](../2002001-hyaku-shiki/README.md) 提供同框架对照。
证据只来自反编译 `.c`、raw Param 二进制和少量 wiki 语义核对；不使用 generated
JSON、semantic overlay 或 resolved-label 缓存。

## 证据边界

- 机体：`2018001`，Dijeh / ディジェ。
- MSC source FHM2D：`E:\OBHK0.3_v27\data\x64\dplcache_release\0x660B7580.fhm2d`
  - size `110158`
  - SHA-256 `F6633B212885494E413C0CD1B34CB96172BD419144F4BBF59FB237BD59360C4C`
- Param source FHM2D：`E:\OBHK0.3_v27\data\x64\dplcache_release\0x37F04F98.fhm2d`
  - size `11270`
  - SHA-256 `495CE4D8A1509F795C7239BA6085E5C4154E5E10AD65160B7DAB3B2A37DF9945`
- MSC workspace：`E:\XB\解包\com\file\040msc\0x660B7580`
- Param workspace：`E:\XB\解包\com\file\041cpm\0x37F04F98`
- Wiki 只作武装名和玩家语义参照：
  - https://w.atwiki.jp/exvs2ob/pages/137.html

wiki 页把迪杰描述为“ドダイ改に搭乗”的可变万能机，并列出变形主射、变形特射、
变形特格和变形解除。这里的研究目标不是从 wiki 反推命名，而是用 `.c` 证明
这些玩家语义落在哪些 action slot、state flag、raw arms/bullet row 上。

## 解包与反编译

| Part | Binary | Binary SHA-256 | Decompiled | Decompiled SHA-256 | Shape |
|---|---|---|---|---|---|
| `0` | `0.bscex` | `50CA4F4B00B7D5AFAAC14684679C65DADFC8FDB81B641631AC02DFDECF308E39` | `0.c` | `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` | `162 funcs / 3594 lines` |
| `1` | `1.cscex` | `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` | `1.c` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` | `6 funcs / 34 lines` |
| `2` | `2.dscex` | `F2A9E9DAB25F2483E7AAF48876E8D27E88EF7DC51FD0B7B7F89F88169F42F775` | `2.c` | `0D21DA8616406234B25F94D0EF48C53C3FE44FF58D2F89CED1893D47C824EAAA` | `1199 funcs / 33738 lines` |

反编译命令：

```powershell
python tools\mscdec.py "E:\XB\解包\com\file\040msc\0x660B7580\0.bscex" -o "E:\XB\解包\com\file\040msc\0x660B7580\0.c" -c
python tools\mscdec.py "E:\XB\解包\com\file\040msc\0x660B7580\1.cscex" -o "E:\XB\解包\com\file\040msc\0x660B7580\1.c" -c
python tools\mscdec.py "E:\XB\解包\com\file\040msc\0x660B7580\2.dscex" -o "E:\XB\解包\com\file\040msc\0x660B7580\2.c" -c
```

## 一句话结论

迪杰不是百式那种 68-byte empty `chrsysparam` 的 classic-only 样本。它是一个混合样本：

```text
external chrsysparam action table
  -> 0.c func_143/145 负责大多数普通动作 action-row bridge

local common transform slots
  -> 0.c slot 0x17 / 0x18 / 0x19
  -> 2.c common transform controller func_450 / func_452 / func_464
  -> Dijeh-specific slot callbacks func_1118 / func_1119 / func_1120
  -> func_1186(): global143 = 1, bind Dodai riding arms rows
  -> func_1187(): release Dodai projectile 0x86D28C63, then func_1185()
```

也就是说，迪杰有 external action-table，但核心“站上 Dodai、持续飞行、离脱投 Dodai”
仍然复用与百式相同的三段 common transform action hash。

## Param shape

| File | Size | SHA-256 | Relevant result |
|---|---:|---|---|
| `chrsysparam.csyspm` | `24640` | `19C5A6DEBF35E861D2ECE615CAF7430C114857518F31C91345FBC38301BBC59F` | table0 `48 x 128`, table1 `1 x 1` |
| `speedparam.bin` | `1561` | `5833EC7FB1C5108F75BCA70B5FE085557C46DEE09DEFE623FAD850B7091B7C71` | one row, `0xC2B19D12` |
| `armsparam.bin` | `2708` | `A285051AFBE456FC7B2178640B928BC1FAE17A656FBD9843D27E1D6E3C0A5A18` | seven rows, split normal/riding loadout |
| `bulletparam.bin` | `14120` | `721CF43A2A7E71BFA90EB4FA24995CECD3B902EB5313964248FDE21337BF9D0A` | 37 rows, includes Dodai release `0x86D28C63` |

`chrsysparam.csyspm` 的 48 行主表没有以下飞行核心 hash：

```text
0x9475130E
0x77B100FF
0xA02D57DC
0x450C6CE4
0xF32AA1BA
0x900AB393
0x86D28C63
```

这证明迪杰的 Dodai flight core 不是从 external action rows 直接生成；external 表是
另一层普通动作 / 输入 bridge。飞行三段仍在 `.c` 的本地 slot registry 中。

## `0.c`：external bridge 与本地 transform slot 同时存在

`0.c` 后段有 external action bridge：

```text
0.c func_143
  -> sys_41(...) 选择 external row
  -> func_144(row) 解释 category
  -> func_145(row, category, flags)
  -> sys_0(0x700000, 0, row, 0x2E) 读取 action hash
  -> sys_0(0x700002, group, route/flags, row, 1)
  -> func_95(actionHash, route, flags, category)
```

但飞行三段不是这条路径。`0.c func_13` 直接注册本地 action slots：

| Slot | Action hash | Meaning |
|---:|---|---|
| `0x17` | `0x9475130E` | transform entry |
| `0x18` | `0x77B100FF` | sustained flight loop |
| `0x19` | `0xA02D57DC` | transform release / exit |
| `0x23` | `0x450C6CE4` | unit entry depiction action |
| `0x24` | `0xF32AA1BA` | unit sustained depiction action |
| `0x25` | `0x900AB393` | unit exit depiction action |

`0.c func_14` 给这些 slot 装 gate：

```text
0x17 -> func_35
0x18 -> func_36
0x19 -> func_37
0x23 -> func_40
0x24 -> 0
0x25 -> 0
```

进入 gate 是 `func_71 -> func_72`：

- `func_71` 成功后返回 slot `0x17 / 0x9475130E`。
- `func_72` 要求 slot `0x17` 可用、`global20 & 0x1000000`、`sys_0(0x60000) > 0`、
  `func_119(0x20000000)` 和 `func_124()`。
- `func_124()` 要求 `global74 & 0x3C` 非零，即方向缓存非空。

`func_77` 还说明状态回退逻辑：

```text
if global20 & 0x4000:
  return slot 0x18 / 0x77B100FF
else if global20 & 0x1000000:
  return slot 0x0A
else:
  return slot 0x02
```

这里的 `global20 & 0x4000` 与百式一致，是正在变形 / riding branch 的关键位。

## `2.c` registry：共通飞行控制器加迪杰 slot callback

`2.c func_1195` 注册三段 common transform action：

| Action hash | Handler | Role |
|---|---|---|
| `0x9475130E` | `func_450` | entry interpolation |
| `0x77B100FF` | `func_452` | sustained flight loop |
| `0xA02D57DC` | `func_464` | release / exit |

`2.c func_1196` 把 unit slot 连到迪杰自己的 callbacks：

| Slot | Callback | Meaning |
|---:|---|---|
| `0x23` | `func_1118` | Dodai riding entry depiction and loadout switch |
| `0x24` | `func_1119` | sustained riding depiction |
| `0x25` | `func_1120` | dismount, Dodai release, restore |
| `0x26 / 0x27` | `0` | side quick-turn slots remain empty |

因此 common transform handler 负责飞行物理和姿态，unit slot callback 负责“迪杰站上
Dodai 时外观、武装、弹体”的差异。

## 进入：`func_450 -> func_1118 -> func_1186`

`func_450` 是与百式同源的 transform entry：

```text
func_450
  -> func_167(0x1008000)
  -> func_99(global9, 0xA)
  -> func_69(0x23)
  -> global507 = speedparam[global142][0x5E8CAF43]
  -> global162 = entry yaw interpolation timer
  -> func_296(0x3E8, 1)
  -> callFunc3(func_451)
```

`func_69(0x23)` 会进迪杰 `func_1118`：

```text
first frame:
  global238 = 0
  func_351(0x9, 0x4)
  func_74(0x37, 0x5)
  sys_58(0, 0x0C4D6773)
  func_110(0x32)
  func_1186()
  global962 = 1
```

`func_1186()` 是迪杰进入 riding loadout 的核心：

```text
global143 = 1
if !arg0:
  func_1146()
func_1188(global143)
func_1193()
```

这与百式不同。百式用 `func_1085(1)` 把 `global143` 设为 `2`；迪杰用
`func_1186()` 把 `global143` 设为 `1`。

## 持续飞行：`func_452 -> func_453 -> func_1119`

`func_452` 初始化 sustained flight：

```text
func_452
  -> if global9 == 1: func_243()
  -> sys_46(0x8, 0, 0, 0)
  -> func_167(0x1004000)
  -> read speed fields:
       0x5E8CAF43
       0xFF7A9C8B
       0x459455EA
  -> clear flight controller globals
  -> func_69(0x24)
  -> func_296(0x3E8, 1)
  -> callFunc3(func_453)
```

`func_453` 与百式相同，是真正的 common flight loop：它根据 `global24 & 0x20000`
和 `global24 & 0x400` 选择 side movement / quick movement / normal steering，
然后用 `sys_46` 写入 yaw、pitch、roll 和速度。

迪杰 slot `0x24` 的 `func_1119` 很薄：

```text
first frame:
  global238 = 0
  func_351(0x9, 0x4)
  func_74(0x38, 0xA)
later:
  if sys_47(0x7, sys_4B(1)):
    func_74(0x38, 0)
```

这说明持续飞行的运动控制主要不是 unit callback，而是 `func_452/453` common
controller。

## 离脱：`func_464 -> func_1120 -> func_1187 -> func_1185`

`func_464` 是 common transform release：

```text
func_464
  -> func_167(0x1010000)
  -> func_69(0x25)
  -> sys_46(0x4, 0x4, global485)
  -> func_296(0x3E8, 0)
  -> callFunc3(func_465)
```

迪杰 slot `0x25` 的 `func_1120` 做 riding state 的实际退出：

```text
first frame:
  global238 = 0
  func_74(0x3B, 0)
  func_351(0x8, 0x4)
  func_296(0x3E8, 1)
  sys_58(0x2)
  sys_58(0, 0x7B4A57E5)
  func_168(0x4000)

at frame gate 0x3E8:
  func_169(0x14000)
  func_1187()

at frame gate 0xA8C:
  global238 = 1
```

`func_1187` 是迪杰 Dodai release / restore helper：

```text
func_1187
  -> func_119(0xFFFFFFFF)
  -> sys_4F(0, 0x5, 0x86D28C63)
  -> func_169(0x4000)
  -> func_1185()
```

`func_1185()` 恢复普通态：

```text
global143 = 0
if !arg0:
  global170 = 0
  func_1135()
func_1188(global143)
func_1193()
```

因此迪杰标准离脱只释放一个 Dodai projectile row：`0x86D28C63`。百式则通过
`func_1084` 在不同调用上下文中释放三种 Dodai projectile variant。

## `func_1188` loadout bridge

`func_1188(global143)` 是普通 / riding 武装行切换：

```text
if global143 == 0:
  slot0 = 0xAE5420C7, replacing 0xB1CFC1F5
  slot1 = 0x188FBFE1
  slot2 = 0x60E83AD8
  slot3 = 0

else:
  sys_4F(0x16, 2, 0)
  slot0 = 0xB1CFC1F5, replacing 0xAE5420C7
  slot1 = 0xADCAA103
  slot2 = 0x25E3D32B
  slot3 = 0x6AD76698
```

Raw `armsparam.bin` 对应值：

| State | Slot | Row | Key raw fields |
|---|---:|---|---|
| normal | `0` | `0xAE5420C7` | ammo `5`, count-per-shot `90`, interval `90` |
| normal | `1` | `0x188FBFE1` | ammo `2`, reload type `1`, total `60`, per-shot `270` |
| normal | `2` | `0x60E83AD8` | ammo `1`, total `100`, per-shot `420` |
| normal | `3` | `0` | disabled |
| riding | `0` | `0xB1CFC1F5` | ammo `5`, count-per-shot `60`, interval `45` |
| riding | `1` | `0xADCAA103` | ammo `1`, total `100`, per-shot `420` |
| riding | `2` | `0x25E3D32B` | ammo `1`, total `80`, per-shot `360` |
| riding | `3` | `0x6AD76698` | ammo `1`, total `60`, per-shot `240` |

`func_1193` 随后调整 presentation/resource availability：

```text
func_204(0x23E)
func_203(1, 0x122)
global152 = 0 if global143 == 1 else 1
func_200(0x400)
func_199(1, 0x500)
func_202(0x581)
func_201(1, 0x781)
```

这说明 `global143` 不只是 HUD 变量；它会直接影响 arms slot 与 presentation gate。

## Raw bullet row：Dodai release

`func_1187` 和 `func_1182` 都会投递 `0x86D28C63`。raw `bulletparam.bin` 对应：

| Row | `lifetime` | `speed_internal` | `initial_speed_float` | `bullet_action_hash` | `bullet_resource_hash` | `interaction_hash` | `hitgroup_hash` |
|---|---:|---:|---:|---|---|---|---|
| `0x86D28C63` | `120` | `100` | `26` | `0xE243065F` | `0xC2D592C2` | `0xAA1D7E7E` | `0x00000001` |

该 row 的资源形状与同文件 `0x51BDD3C9 / 0xD726FEBC` 很接近，但标准变形离脱直接使用
`0x86D28C63`。目前不要把所有相似 row 都命名为 Dodai release，除非有对应 `.c`
调用点。

## Speed Param bridge

`speedparam.bin` 只有一行：

| Row | Key fields used by transform controller |
|---|---|
| `0xC2B19D12` | `0x459455EA=280`, `0x5E8CAF43=330`, `0x9FD06227=35`, `0xFF7A9C8B=-5` |

`2.c` 初始化时 `global142 = 0xC2B19D12`，common transform controller 在
`func_450/452/453/454..463` 中继续读取同一行。迪杰没有像百式复活态那样为飞行禁用
三段 transform hash 的独立 speed row 证据。

## 百式 vs 迪杰：同框架不同单位逻辑

| Axis | Hyaku Shiki `2002001` | Dijeh `2018001` |
|---|---|---|
| `0.c` family | `145 funcs`, classic local selector | `162 funcs`, external action bridge plus local transform slots |
| `chrsysparam` | `68` bytes, empty tables | `24640` bytes, table0 `48 x 128` |
| Transform action hashes | `0x9475130E / 0x77B100FF / 0xA02D57DC` | same |
| Common controller | `func_450 / 452 / 464` | same function numbers in this sample |
| Unit slot callbacks | `func_874 / 875 / 876` | `func_1118 / 1119 / 1120` |
| Riding state | `global143 = 2` | `global143 = 1` |
| Enter loadout helper | `func_1085(1)` | `func_1186()` then `func_1188(1)` |
| Exit / release helper | `func_1084(...)` then `func_1085(0)` | `func_1187()` then `func_1185()` |
| Release projectile rows | `0xBE7CA2EF / 0x3CBC54AC / 0xDFD91DB9` | `0x86D28C63` |
| Revival / transform disable | `func_1086` disables three transform hashes | no equivalent transform-disable chain found in current read |

最重要的修正是：不能把“Dodai 飞行模式”写成一个全机体通用 helper 名称。通用部分是
三段 action hash 和 `func_450/452/464` 控制器；每台机的 loadout、release projectile、
presentation state 都要回到本机 slot callback 和 raw Param row 读。

## 当前结论

1. 迪杰证明百式飞行模式使用的三段 transform action 是共通框架，不是百式私有动作。
2. 迪杰又证明同一共通框架可以挂在 external action-table 样本上；`chrsysparam`
   存在不代表飞行三段一定来自 external rows。
3. 迪杰 riding loadout 由 `global143=1 -> func_1188(1)` 建立，普通态由
   `global143=0 -> func_1188(0)` 恢复。
4. 标准离脱链是 `func_1120 -> func_1187 -> 0x86D28C63 -> func_1185()`。
5. 百式与迪杰的玩家语义都可以叫 Dodai / sub-flight riding，但 `.c` 实现差异很大：
   百式用 `global143=2` 和三种 release projectile variant，迪杰用 `global143=1`
   和一个标准 release projectile row。

## 后续可继续拆的点

- 把 Dijeh external `chrsysparam` 48 个 rows 逐个连到 wiki 武装名，尤其是变形主射、
  变形特射和变形特格以外的普通动作。
- 追 `func_1182`、`func_1121..1124` 的 Dodai / projectile 相关分支，确认
  `0x86D28C63` 以外相似 bullet rows 的具体动作语义。
- 对比百式 `func_1084` 三种 release variant 与迪杰单 release row 的 collision /
  resource / motion 差异。
