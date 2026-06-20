# 59001001 NEXA-N 极限高达爆破 MSC 研究

生成日期：2026-06-20

上级入口：

- [跨机体 MSC 研究总览](../../cross-unit-msc-research-overview.md)
- [首批跨机体 MSC 对比](../../cross-unit-first-batch-comparison.md)
- [MSC 代际与 Param Action Bridge 对比](../../msc-generation-param-bridge-comparison.md)

本文按实际 `.c` 与二进制文件走读组织，不依赖 generated JSON 或 semantic overlay。

## 身份与来源

Character ID Table：

```text
E:\XB\解包\com\file\012list\0x036B9E67\character_id_table.json
```

Character ID Table 当前有 `1692` 个 entry。`59001001` entry：

| Field | Value |
|---|---|
| `id` | `59001001` |
| `Msc` | `1765766509` / `0x693F756D` |
| `Param` | `952389493` / `0x38C44F75` |
| `Model` | `-413871492` / `0xE754D27C` |
| `Effect` | `470763451` / `0x1C0F47BB` |
| `Sound` | `655388645` / `0x27106FE5` |
| `Motion` | `-913114369` / `0xC992FAFF` |

硬盘来源：

| Field | Value |
|---|---|
| Character ID | `59001001` |
| Working label | `NEXA-N 极限高达爆破` |
| Msc source | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x693F756D.fhm2d` |
| Param source | `E:\OBHK0.3_v27\data\x64\dplcache_release\0x38C44F75.fhm2d` |
| Msc workspace | `E:\XB\解包\com\file\040msc\0x693F756D` |
| Param workspace | `E:\XB\解包\com\file\041cpm\0x38C44F75` |

## 0.c / 1.c / 2.c 快照

| Script | Binary bytes | C lines | Functions | C SHA-256 |
|---|---:|---:|---:|---|
| `0.c` | `27232` | `3594` | `162` | `70F360731C28E2B3DCD9DA14915FCAC0452A57861A65919193BE31B330871795` |
| `1.c` | `192` | `34` | `6` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` |
| `2.c` | `318096` | `34612` | `1223` | `01156A21620757E0456E6D7BC3BB4D8F30F9C6C77F6395624D0280FCB1A67542` |

`1.c` 只有 `main -> func_1 -> func_3` 和每帧 `func_2 -> func_4/5`，`func_3/4/5`
为空。当前读法：NEXA-N 的机体逻辑不在 `1.c`，主差异在 `0.c` 与 `2.c`。

## 当前结论

NEXA-N 是 external Param action-table 型样本。核心流：

```text
Character ID Table
  -> Msc 0x693F756D + Param 0x38C44F75
  -> Param/chrsysparam.csyspm table0 action rows
  -> 0.c func_143 / sys_41 选择 action row
  -> 0.c func_145 读 row action hash / group / route
  -> func_95(actionHash, route, flags, category)
  -> 2.c func_849 扫 table0，把 action hash 动态注册到 group callback
  -> func_873(group) -> func_916 / 919 / 924 / 942 / 946 / 950 / 956
  -> func_867..870 从 row fields 装载 global839..912
  -> group callback 使用这些 globals 输出 motion / weapon / movement / camera
```

这和 Delta Plus / Unicorn / Sinanju 的 classic local selector 不同：NEXA-N 的单位
action hash 不主要写死在 `0.c func_161` 或 `2.c func_1219`，而是由
`chrsysparam.csyspm` 行提供，`2.c func_849` 每次启动时动态导入。

## 0.c：输入到 Param action row

`0.c func_143` 是输入到 action row 的桥：

| Evidence | Meaning |
|---|---|
| `0.c:3363` | `func_143` 主输入选择器 |
| `0.c:3376` | `sys_41(0x1, global48, global2, ...)` 根据输入、方向、当前 shell/status 选 row |
| `0.c:3385-3398` | `var0 & 0x10000000` 表示特殊 row 标志；仍回到 `func_144(row)` 分类 |
| `0.c:3406` | 普通路径调用 `func_145(row, category, 0)` |

`func_144` 从 row fields 派生 gameplay category：

| Evidence | Field | Meaning |
|---|---|---|
| `0.c:3440-3445` | `0x700000, table 0, row, field 0x03/0x04` | field `0x03 % 0x64` 是初始 category；field `0x04` 是输入/方向 mask |
| `0.c:3446-3474` | `field 0x04 == 0x20/0x10/0x08/0x04/0x0c/0x30/0x3c` | 对 category 做方向修正 |

`func_145` 把 row 转成 action request：

| Evidence | Read | Meaning |
|---|---|---|
| `0.c:3487` | field `0x2e` | action hash |
| `0.c:3490` | field `0x0a` | group key |
| `0.c:3492-3493` | `0x700002(group, subfield, row, 1)` | route / flags |
| `0.c:3494` | `func_95(actionHash, route, flags, category)` | 投递到 action queue |

辅助路径：

| Evidence | Meaning |
|---|---|
| `0.c:3420-3434 func_146` | 扫所有 row，找 `field 0x03 == 0x12c` 的特殊入口，然后用 group `0x1f` 投递 |
| `0.c:3498-3511 func_149` | 用 action hash 反查 row index |
| `0.c:3573-3593 func_161` | 仍保留 17 个 fixed input callback，但它是 shared runtime registry，不是单位 action hash 主来源 |

## Param/chrsysparam：只作数据源

`E:\XB\解包\com\file\041cpm\0x38C44F75\chrsysparam.csyspm`：

| Item | Value |
|---|---|
| Magic | `0xB4ACACAF` |
| Version | `0x00010000` |
| Unit id | `59001001` |
| table0 | `55 x 128` action matrix |
| table1 | transition matrix |

table0 直接服务这些 `.c` 读取：

```text
sys_0(0x700000, 0, row, field)
```

本页不把 chrsysparam 机器导出结果当证据主线；只记录 `.c` 实际读取了哪些 field。
当前关键 fields：

| Field | .c consumer | Working role |
|---:|---|---|
| `0x03` | `0.c:3444`, `0.c:3430` | category / special entry class |
| `0x04` | `0.c:3445` | input/direction mask |
| `0x0A` | `0.c:3490`, `2.c:25064` | group key |
| `0x2E` | `0.c:3487`, `2.c:25063`, `2.c:25072`, `2.c:25716` | action hash |
| `0x1C..0x41` | `2.c:25576-25612` | group callback common parameters |
| `0x44..0x46` | `2.c:25619-25632` | optional `sys_46(0x5, ...)` movement parameters |
| `0x59..0x66` | `2.c:25669-25683` | later timing / branch / effect parameters |
| `0x7E..0x7F` | `2.c:25655-25663` | phase lookup helper fields |

Representative rows observed by direct `chrsysparam.csyspm` parse:

| Row | Action hash | Group | `field_03` | `field_04` | Old-route emulation |
|---:|---|---|---|---|---|
| `1` | `0x3AA80D55` | `0x03` | `0` | `0` | route `1`, flags `0x20001` |
| `11` | `0xBE04B8C1` | `0x0C` | `9` | `0` | route `1`, flags `0x20002` |
| `16` | `0x5195355D` | `0x1F` | `9` | `0x10` | route `1`, flags `0x20004` |
| `20` | `0x178D1109` | `0x0C` | `1` | `0` | route `1`, flags `0x20002` |
| `50` | `0x30CBCBA2` | `0x10` | `0x1F` | `0` | route `1`, flags `0x20001` |

这些 row 名称仍不能直接从 Param 猜成主射/副射/特射；必须继续追 callback 输出。

## 2.c：动态 action registry

`2.c func_849` 是 NEXA-N 与 classic selector 最大差异点：

| Evidence | Meaning |
|---|---|
| `2.c:25059` | `sys_0(0x700001,0)` 取 action row count |
| `2.c:25063` | 每行读取 field `0x2e` action hash |
| `2.c:25064` | 每行读取 field `0x0a` group key |
| `2.c:25065-25066` | `func_873(group)` 得 callback，再 `func_241(actionHash, callback)` 注册 |
| `2.c:25072-25073` | `sys_1(0x10002,0x1f,actionHash,row)` 建立 action hash -> row 反查 |
| `2.c:25079-25081` | 每 row 注册三组 phase callback：field `0x02`、`0x7c`、`0x7d` |

`func_241` 本身仍是普通 action registry writer：

| Evidence | Meaning |
|---|---|
| `2.c:6409-6422` | `sys_1(0x10002,0x2,hash,callback)` 注册 action callback，并维护 enabled bit |

`func_873` group resolver：

| Group | Returned script pointer | Function from `2.txt` | Role from body |
|---|---:|---|---|
| `0x03` | `0x3B343` | `func_950` (`2.txt:952`) | ranged runtime：`func_586`, `global676..679` |
| `0x0C` | `0x39689` | `func_924` (`2.txt:926`) | melee/runtime：`func_488`, `global602=func_926` |
| `0x0D` | `0x3A9E1` | `func_942` (`2.txt:944`) | group-specific callback，仍需细拆 |
| `0x0F` | `0x3AEEF` | `func_946` (`2.txt:948`) | group-specific callback，仍需细拆 |
| `0x10` | `0x3BBFE` | `func_956` (`2.txt:958`) | ranged runtime variant：`func_586`, `global676..679` |
| `0x13` | `0x3BBFE` | `func_956` (`2.txt:958`) | shares group `0x10` callback |
| `0x1F` | `0x388B1` | `func_916` (`2.txt:918`) | special movement / melee runtime：`global609=func_918` |
| `0x25` | `0x38BD3` | `func_919` (`2.txt:921`) | thin wrapper：`func_874(); func_914()` |
| `0x26` | `0x38BD3` | `func_919` (`2.txt:921`) | shares group `0x25` callback |

`2.c func_1219` 还保留 25 个 common handler hash（`2.c:34345-34374`），但这些是跨机体
shared runtime handler。NEXA-N 单位 action row 主要由 `func_849` 导入。

## 2.c：row fields 装载为 globals

外部 action row 不是在 callback 内反复 `sys_0(0x700000,...)` 手写读取；NEXA-N 先把
当前 row 的很多 fields 装进 globals：

| Loader | Evidence | Fields | Meaning |
|---|---|---|---|
| `func_867` | `2.c:25552-25612` | `0x1C..0x41` | action common params：motion/effect/weapon/timing/flags 候选 |
| `func_868` | `2.c:25615-25648` | `0x42..0x57` | movement, branch, resource helper params |
| `func_869` | `2.c:25653-25663` | `0x7E..0x7F` | phase helper fields；非负时加 1 |
| `func_870` | `2.c:25667-25680` | `0x59..0x66` | later timing / branch params |

后续 group callback 读 `global839..912`。因此命名时不要只看 `func_950`
的函数体；必须把当前 row 一起带入。

## 2.c：代表 group callback

### Group `0x03` -> `func_950`

`func_950` 是 ranged/action runtime 模板：

| Evidence | Meaning |
|---|---|
| `2.c:27979-28017` | 调 `func_586()`，清 row state，设置 `global676=func_952`、`global677=func_953`、`global678=func_954`、`global679=func_955` |
| `2.c:28020-28095 func_952` | 第一段：播放 motion/effect，可能用 `sys_46(0x5, global876, global877, global878)` 写动作移动 |
| `2.c:28097-28166 func_953` | 第二段：按 `global843..847` 调 `func_220(slot, resourceHash, aux)`，输出武装/资源 |
| `2.c:28168-28200 func_954` | 后段：可再次 `func_220`，再等 motion/frame 结束 |
| `2.c:28222-28234 func_951` | 每帧 driver：按状态选 `func_593/599`，再 `func_886()` 和 `func_912()` |

`func_220` 是这里的实际 weapon output helper：

| Evidence | Meaning |
|---|---|
| `2.c:5943-5955` | `func_220(slot, hash, altHash)`；若 `altHash != 0` 且 `global30 & 1`，改用 `altHash` |
| `2.c:5956` | 最终调用 `sys_4F(0, slot, selectedHash)` |

group `0x03` 的 row-to-output 证据：

| Row | Action hash | Cat/mask | Slot source | Motion field | Primary output field | .c path |
|---:|---|---|---|---|---|---|
| `1` | `0x3AA80D55` | `0 / 0` | `field08=0` -> `global681=0` | `field1C=0xD7DCBF7F` | `field20=0xB3E2B322` | `func_952 -> func_895`; `func_953 -> func_220(0,0xB3E2B322,0)` |
| `2` | `0xA3A15CEF` | `0 / 0` | `field08=0` -> `global681=0` | `field1C=0xABBD9AA4` | `field20=0x2AEBE298` | same path |
| `3` | `0xB07BD48C` | `0x0B / 0` | category `0x0B` forces `global681=5` | `field1C=0xF115868E` | `field20=0xAE2D04F4` | same path, but slot `5` |
| `10` | `0x2F5390CC` | `0x08 / 0` | `field08=2` -> `global681=2` | `field1C=0x565A7291` | `field20=0x71C1DCFD` | same path, slot `2` |
| `54` | `0xE60CEB6E` | `0x0A / 0x08` | `field08=5` -> `global681=5` | `field1C=0x4CED99E3` | `field20=0xBCF3AA2B` | same path, slot `5` |

slot 选择来自 `func_866`：

| Evidence | Meaning |
|---|---|
| `2.c:25520-25522` | 读取 `field03` 到 `var0` |
| `2.c:25523-25535` | 若 `field03 % 0x64 == 0x0B/0x0C`，强制 `global681=5`；否则 `global681=field08` |

因此 group `0x03` 可先读成：

```text
row field1C -> startup motion
row field20 -> primary weapon/resource hash
row field08/category -> weapon slot
func_953 -> func_220 -> sys_4F(0, slot, resourceHash)
```

### Group `0x10/0x13` -> `func_956`

`func_956` 是另一个 ranged runtime variant，但只读这个 common callback 会漏掉真正的
单位武器代码。每行还有三条 phase hash：

| Param field | Registry | Runtime caller | Proven lifecycle role |
|---:|---|---|---|
| `0x7C` | `func_849 -> 0x10001/0x11` | `func_956 -> func_863` | action entry/init |
| `0x02` | `func_849 -> 0x10001/0x10` | `func_957 -> func_912 -> func_862` | per-frame/tick |
| `0x7D` | `func_849 -> 0x10001/0x12` | `func_865`；中断时 `func_864` | end/interrupt cleanup |

直接代码证据：

- `2.c:25079-25081` 把三列 hash 经 `func_975` 解析为函数指针。
- `2.c:25480-25483` 在进入 action 时调用 `0x11`。
- `2.c:25425-25429` 每帧调用 `0x10`。
- `2.c:25366-25370`、`2.c:25495-25499` 在中断或正常结束时调用 `0x12`。

common runtime 的职责：

| Evidence | Meaning |
|---|---|
| `2.c:28236-28269 func_956` | `func_586 -> func_874` 装载当前 row；设置 `func_958/959/960/961` 四段；随后立刻执行 entry phase |
| `2.c:28272-28337 func_958` | `global839=field1C` 作为起手 motion；`global840=field1D` 作为时间门；可调用 `sys_46(0x5,global876..878)` |
| `2.c:28339-28395 func_959` | group `0x12/0x13` 直接输出 `global841..845`；其它 group 经 `func_220` 输出 |
| `2.c:28451-28489 func_960` | 后段可再次 `func_220(global681,global841,global850)` |
| `2.c:28491-28509 func_961` | 收尾等待与 runtime 清理 |

关键 row field 落点：

| Row field | Loaded global | Use |
|---:|---|---|
| `0x08` | `global681` | 默认 weapon/ammo slot |
| `0x0A` | `global811` | group；决定 `func_959` 走 direct `sys_4F` 还是 `func_220` |
| `0x1C` | `global839` | startup motion |
| `0x1D` | `global840` | startup/end timing |
| `0x1E..0x22` | `global841..845` | common runtime resource hashes |
| `0x27` | `global850` | primary alternate hash或 phase/resource bit index |

#### Group `0x13`：三种 Dagger Funnel phase callback

三行的 `field1E..field22` 全为 `0`。所以 `func_959` 的 common direct-output
分支不发射任何东西；实际六枚 Funnel 全在 `field02` 对应的 tick callback 中硬编码：

| Row | Action | Input mask | Startup motion | Entry | Tick | Cleanup | Semantic candidate |
|---:|---|---:|---|---|---|---|---|
| `4` | `0x70D72270` | `0` | `0xDED064E1` | `0xD4AAE2A5 -> func_985` | `0x1903DB43 -> func_986` | `0x5332FE6A -> func_987` | N sub：parallel assault |
| `5` | `0x8ECD3DD2` | `0x0C` | `0x85FDFB5C` | `0x5338B26D -> func_991` | `0x94B0573C -> func_992` | `0xD4A0AEA2 -> func_993` | front/back sub：surround assault |
| `6` | `0x1CE21ABD` | `0x30` | `0x01B3F4B4` | `0xD1C108BE -> func_988` | `0xEC25849F -> func_989` | `0x56591471 -> func_990` | side sub：sequential assault |

方向证据来自 `0.c func_2`：`0x4/0x8/0x10/0x20` 是前/后/左/右输入位，
所以 `0x0C` 覆盖前后，`0x30` 覆盖左右。武器动作名仍是 wiki 交叉验证后的
semantic candidate，不是 hash 自带名称。

三组实际 projectile/resource 输出：

```text
row 4 / func_986 / 2.c:29491-29496
  0x5157B183  0xC85EE039  0xBF59D0AF
  0x213D450C  0x563A759A  0xCF332420

row 5 / func_992 / 2.c:29591-29596
  0xD704FD1A  0x4E0DACA0  0x390A9C36
  0xA76E0995  0xD0693903  0x496068B9

row 6 / func_989 / 2.c:29541-29546
  0x97185E08  0x0E110FB2  0x79163F24
  0xE772AA87  0x90759A11  0x097CCBAB
```

每个 tick callback 都在 `func_915(1,1)` 门成立时：

1. 连续六次 `sys_4F(0,0x5,resourceHash)`。
2. `sys_4F(0x7,global681,1)` 扣除当前 row 的 ammo。
3. `func_297(0x12C,1)` 和 `global359=1` 标记发射完成。

`func_985/988/991` 负责 entry motion override、`func_1212()` 和局部状态初始化；
`func_987/990/993` 都是空 cleanup。`func_1207` 还会按
`sys_0(0x500000,0/1)` 的运行时对象状态，经 `func_888/889` 一起启停这三条
action；这是可用性门控，不是发射输出。

#### Group `0x10`：两条 Bomber Knuckle 候选

| Row | Action | Input mask | Slot | Common resource | Phase route | Direct output |
|---:|---|---:|---:|---|---|---|
| `8` | `0xCE995576` | `0x08` | `4` | none | `func_997 -> func_998 -> func_999` | `func_998` 在 `0x258` 门输出 `0x0A492911` |
| `50` | `0x30CBCBA2` | `0` | `5` | `field1E=0x2FE1F748` | `func_1108 -> func_1109 -> func_1110` | `func_959 -> func_220(5,0x2FE1F748,0)` |

row `8` 的 `field1E..field22` 为空。它的输出仍在 tick callback：

- `func_997` 设置多段 action 状态并调用 `func_1212()`。
- `func_998` 先建立移动、effect 与 camera sequence。
- `2.c:29761-29770` 在 frame gate `0x258` 调
  `sys_4F(0,global681,0x0A492911)`，然后停止位移并清理场景 effect。
- `field04=0x08` 是后输入，因此当前最强候选是
  `后特殊射击：Bomber Knuckle【周围火柱】`。

row `50` 相反：它把 `0x2FE1F748` 放在 `field1E`。group `0x10` 不走
`func_959` 的 `0x12/0x13` direct branch，而是
`func_220(global681,global841,global850) -> sys_4F(0,5,0x2FE1F748)`。
`func_1109` 只补 camera shake/表现。`field04=0`，当前最强候选是
`N特殊射击：Bomber Knuckle【前方爆发】`。

这两行分别使用 runtime slot `4` 和 `5`，与 wiki 所述特殊射击分开管理弹数相符；
这是交叉验证，不替代本地 hash 证据。

### Group `0x25/0x26` -> `func_919`

group `0x25/0x26` 不能按其它 ranged group 把 `field1C` 固定读成 motion。
本机这里把它当成脚本函数键：

```text
func_919
  -> func_874                  装载当前 Param row
  -> func_914
       -> func_975(global839)  global839 = field1C
       -> (*resolvedFunc)()
```

直接代码证据：

- `2.c:26562-26569 func_914`：用 `func_975(global839)` 解析并调用函数。
- `2.c:26879-26883 func_919`：只做 `func_874(); func_914();`。
- `2.c:28914-28915 func_975`：`0x3987CD20 -> func_1185`。

row `7/9` 共用这条特殊移动实现：

| Row | Action hash | Group | Cat/mask | Slot field | `field1C` | Resolved callback |
|---:|---|---|---|---:|---|---|
| `7` | `0xF3B1F6D3` | `0x26` | `0x08 / 0x04` | `3` | `0x3987CD20` | `func_1185` |
| `9` | `0x095E1E59` | `0x26` | `0x08 / 0x30` | `3` | `0x3987CD20` | `func_1185` |

`0x04` 是前输入，`0x30` 覆盖左右输入。`func_1185` 的行为也直接消费方向：

| Evidence | Behavior |
|---|---|
| `2.c:3018` | `global172 = global87 & 0x3C` 保存方向位 |
| `2.c:33389-33419` | 建 melee/movement runtime；左右位把 `global201` 设为 `-2000/+2000`，前输入保持 `0` |
| `2.c:33455-33473 func_1187` | `func_309` frame gate 到 `0x7D0` 时执行 `sys_4F(0,3,0x18529444)` |
| `2.c:33518-33555` | 根据目标角度与左右偏移持续写 `sys_46`，形成前冲或斜向急加速 |
| `2.c:33481-33485` | 前输入 cancel 条件成立时请求 action `0x3AC14535`，即 Param row `33` |
| `2.c:33559-33605 func_1188` | 后段 motion、移动停止与退出处理 |

因此 row `7/9` 的最强语义候选已从“待定位”升级为：

```text
前/横特殊射击：Bomber Knuckle 后方爆发特殊移动
```

理由不是只看 wiki 名称，而是本地证据同时命中前/横输入、方向相关 `sys_46`
急加速、slot `3` 的 `sys_4F` 输出和同一 callback。wiki 所述“前输入直进、横输入斜向、
后方爆发有攻击判定”与代码形状一致。

资源层继续交叉验证：

| File | Row/index | Direct values |
|---|---:|---|
| `armsparam.bin` | `3` | entry `0xB879F6C1`; enabled `1`; ammo `1`; reload-start `300`; reload-total `100`; reload type `0` |
| `bulletparam.bin` | `9` | entry `0x18529444`; field `move_type=255`; range `20`; initial speed `40`; lifetime `10`; on-expire `0xE6194ED6`; interaction `0xD33E7C55` |

这些字段名采用项目当前 `command_mapping.md`；原始 LE 值和 entry index 已直接从二进制
读取。`sys_4F` 的 slot `3` 与后特殊射击的 slot `4` 是不同 arms row，且两行 ammo
都为 `1`。N 特殊射击使用 slot `5`，超出本机五行 armsparam 的 `0..4` index，不能
强行套成 arms row `5`。

### 已命中 bulletparam 的 26 个输出 hash

下表直接读取 `bulletparam.bin` 的 LE entry-id array；row 为零起始 index。当前已从
`.c` 追到的 26 个 `sys_4F` resource hash 全部命中，不需要 generated JSON：

| Source action | Resource hash -> bulletparam row |
|---|---|
| group `0x03` row `1` | `0xB3E2B322 -> 77` |
| group `0x03` row `2` | `0x2AEBE298 -> 16` |
| group `0x03` row `3` | `0xAE2D04F4 -> 74` |
| group `0x03` row `10` | `0x71C1DCFD -> 48` |
| group `0x03` row `54` | `0xBCF3AA2B -> 79` |
| Funnel row `4` | `0x5157B183 -> 37`, `0xC85EE039 -> 83`, `0xBF59D0AF -> 80`, `0x213D450C -> 13`, `0x563A759A -> 39`, `0xCF332420 -> 84` |
| Funnel row `5` | `0xD704FD1A -> 87`, `0x4E0DACA0 -> 34`, `0x390A9C36 -> 22`, `0xA76E0995 -> 70`, `0xD0693903 -> 85`, `0x496068B9 -> 31` |
| Funnel row `6` | `0x97185E08 -> 63`, `0x0E110FB2 -> 7`, `0x79163F24 -> 51`, `0xE772AA87 -> 95`, `0x90759A11 -> 58`, `0x097CCBAB -> 4` |
| N special row `50` | `0x2FE1F748 -> 18` |
| front/side special row `7/9` | `0x18529444 -> 9` |
| back special row `8` | `0x0A492911 -> 5` |

三条 Bomber Knuckle bullet row 还显示不同的数据形状：

| Hash | Row | `move_type` | Range | Initial speed | Lifetime | On-expire |
|---|---:|---:|---:|---:|---:|---|
| `0x2FE1F748` | `18` | `255` | `10` | `270` | `15` | `0xD42F2C54` |
| `0x18529444` | `9` | `255` | `20` | `40` | `10` | `0xE6194ED6` |
| `0x0A492911` | `5` | `3` | `0` | `0` | `90` | `0` |

这支持三条特殊射击不是同一个 projectile 的纯方向变体。具体 `on-expire`、hitgroup、
interaction 和伤害链仍需继续跨 Param 表追踪。

### Group `0x0C` -> `func_924`

`func_924` 偏 melee / special movement runtime：

| Evidence | Meaning |
|---|---|
| `2.c:27276-27291` | 调 `func_488()`，`func_219(global841)`，设置 `global602=func_926` |
| `2.c:27293-27326 func_926` | 起手段：`func_308` 播 motion，`func_531(func_927)` 接后段，必要时读 `sys_0(0x60002, global841, 0x2272e3d6)` |
| `2.c:27328-27332 func_925` | driver：`func_489()` melee runtime + `func_912()` |
| `2.c:27334-27410 func_927` | 后段：可 motion、派生窗口、`func_148/149`、`func_337`、`func_887()` |

group `0x0C` 的 row-to-output 证据：

| Row | Action hash | Cat/mask | Start motion `field1C` | Follow motion `field1D` | Melee param `field1E` | Branch/resource `field20` | Timing fields |
|---:|---|---|---|---|---|---|---|
| `11` | `0xBE04B8C1` | `0x09 / 0` | `0x6966D835` | `0xB4F001B0` | `0x29027961` | `0xF37E46D5` | `field21=5`, `field22=8`, `field59=13` |
| `20` | `0x178D1109` | `0x01 / 0` | `0x8396FF1C` | `0x5E002699` | `0x2DA3F18B` | `0x39685A57` | `field21=3`, `field22=6`, `field59=11`, `field5A=6`, `field5B=11` |
| `26` | `0xA2236F44` | `0x1F / 0` | `0x9189EA1E` | `0x2C4386D0` | `0x84A0C6F8` | `0x0FDBA8A0` | `field21=2`, `field22=5` |
| `27` | `0x0E962048` | `0x01 / 0x30` | `0x5CF56F49` | `0x8163B6CC` | `0x34B8C0CA` | `0x20736B16` | `field21=3`, `field22=6`, `field59=13`, `field5A=6`, `field5B=13` |
| `33` | `0x3AC14535` | `0x06 / 0` | `0x0F23C96E` | `0xD2B510EB` | `0x3A6EEFF1` | `0xB51FBAA5` | `field21=5`, `field22=8`, `field59=11` |
| `38` | `0x446C1D89` | `0x01 / 0x04` | `0x5316C2D3` | `0x8E801B56` | `0xDB6F93BE` | `0xBE543116` | `field21=3`, `field22=6`, `field59=8` |
| `41` | `0xCCE1225F` | `0x1F / 0x43` | `0x5467A8D2` | `0x89F17157` | `0xC66688CA` | `0xA35D2A62` | `field21=5`, `field22=8`, `field59=11` |
| `44` | `0x6C576961` | `0x1F / 0` | `0x689FB5FA` | `0xD555D934` | `0xA51221FB` | `0xF65BE3F0` | `field21=8`, `field22=10`, `field59=16` |

字段落点：

| Field | Loader global | Callback use |
|---|---|---|
| `0x1C` | `global839` | `func_926` 用 `func_308(global20, global839, ...)` 播起手 motion |
| `0x1D` | `global840` | `func_927` 用 `func_308(global20, global840, ...)` 播后段 motion |
| `0x1E` | `global841` | `func_924` 传入 `func_219(global841)`，从 `0x60002` melee/action param 读追踪、速度、窗口等 |
| `0x20` | `global843` | `func_927` 到达 `global844` 帧后 `func_148(global843)`，再按 `global845` 帧 `func_149()` |
| `0x21/0x22` | `global844/global845` | `func_893` / `func_572` / `func_927` 使用的派生窗口和时间点 |
| `0x59/0x5A/0x5B` | `global896..898` | 这一组不在 `func_924/926/927` 主路径直接消费，可能给 phase/后续表使用 |

辅助函数：

| Evidence | Meaning |
|---|---|
| `2.c:5897-5940 func_219` | `global841` 非 0 时读 `0x60002` melee/action param fields，设置 `global379..393` |
| `2.c:14441-14444 func_531` | `func_531(func_927)` 把后段 callback 写入 `global629` |
| `2.c:26181-26195 func_893` | 根据 `global844/global907/global844+0x0A/global908/global842` 调 `func_532` 建派生/窗口 |
| `2.c:4942-4951 func_148` | 设置 `global107=1`、`global109=arg0`，用于后续 action/hash request |
| `2.c:4953-4956 func_149` | 设置 `global110=1`，配合 `func_148` 结束/确认请求 |
| `2.c:7660-7678 func_337` | 到指定帧触发 `sys_58` 事件 |
| `2.c:15482-15515 func_572` | 登记最多四组 timed resource/effect 窗口 |

因此 group `0x0C` 不是直接 `sys_4F` 发射型；它更像：

```text
row field1C/1D -> 起手/后段 motion
row field1E -> melee/action param row (0x60002)
row field20 + field21/22 -> 后段 action request / 派生 timing
func_924 -> func_926 -> func_531(func_927) -> func_927
```

### Row `33`：Bomber Knuckle 前输入派生

row `33 / 0x3AC14535` 已从调用方追到三相 callback：

| Layer | Direct `.c` evidence |
|---|---|
| Source branch | `func_1185` 的两处前输入判断在 `2.c:33481-33487`、`33579-33584` 调 `func_81(0x3AC14535, 1, 2, global173)` |
| Action queue write | `func_81` 把 `0x3AC14535` 写入 `global25`，同时更新 route/flags/category globals |
| Group runtime | row `33` group `0x0C -> func_924`，使用 `field1C/1D/1E/20` 的 motion、melee param 和派生窗口 |
| Entry | `0xEBE664B2 -> func_1057`；若来源 action 是 row `7` 的 `0xF3B1F6D3` 或 row `9` 的 `0x095E1E59`，额外调用 `func_219(0xCD3952E5)` |
| Tick | `0x0F927D9C -> func_1058`；进入后调用 `func_1171(4)`，并按目标距离执行 `sys_46` 位移 |
| Cleanup | `0x6C7E787D -> func_1059`，为空 cleanup |

这证明 row `33` 不是与 Bomber Knuckle 无关的普通 group `0x0C` 动作：它只在
`func_1185` 的前输入窗口被显式投递，entry callback 又检查 row `7/9` 两个
front/side special-shot 来源 hash。结合 wiki 的前输入派生说明，当前可以把它标记为
“Bomber Knuckle 移动中的 BD 格派生”强候选；具体伤害和 hitbox 仍需继续追
`0xCD3952E5 / 0x3A6EEFF1` 的 melee param。

### Group `0x1F` -> `func_916`

`func_916` 是 special movement / melee-style runtime：

| Evidence | Meaning |
|---|---|
| `2.c:26776-26793` | 调 `func_488()`，设置 `global609=func_918`，`global613=0x14`，`global815=0x3` |
| `2.c:26802-26854 func_918` | 起手段：motion/effect，optional `sys_46(0x5, global876, global877, global878)`，设置 state `0xC1D`，跑 `func_920()` 派生窗口 |
| `2.c:26856-26877 func_917` | driver：按状态选 `func_502()` 或 `func_507()`，再 `func_912()` |

## 与 classic selector 的差异

| Layer | NEXA-N external table | Delta Plus / Unicorn / Sinanju classic |
|---|---|---|
| Unit action source | `chrsysparam.csyspm` table0 row field `0x2E` | `0.c` 固定 selector + `2.c` tail registry 常量 hash |
| Input bridge | `0.c func_143 -> sys_41 -> row -> func_145` | `0.c func_143` 直接按输入和资源条件投递 action hash |
| 2.c registry | `func_849` 动态扫 row 注册 hash -> group callback | `func_1043/1065/1095/...` 常量 `func_241(hash, callback)` |
| Per-action params | row fields 经 `func_867..870` 装到 globals | 多数参数写在 callback 或资源表固定读取 |
| Modding boundary | 改 action graph/route/hash 常需 paired MSC + Param | 很多 action selector patch 只改 MSC 即可，资源另算 |

## Wiki 语义候选

EXVS2OB wiki 给出候选词汇和输入分支：

- RAIKIRI Sword shockwave / melee
- E Unit High Mega Cannon
- N sub：六基 Dagger Funnel 横向并列突击
- front/back sub：六基 Dagger Funnel 包围后突击
- side sub：六基 Dagger Funnel 依次突击
- N special shot：Bomber Knuckle front explosion
- front/side special shot：Bomber Knuckle rear explosion movement；本地 row `7/9 -> func_1185` 已闭环
- back special shot：Bomber Knuckle surrounding fire pillars
- no form transition

来源：[EXVS2OB N-EXTREME Gundam Explosion](https://w.atwiki.jp/exvs2ob/pages/98.html)。
这些只用于给 row/callback 语义命名；版本数值和具体 action 名必须回到本地 `.c`
和 Param 文件验证。

## 下一步

1. 从 bullet row 的 `on-expire`、hitgroup、interaction 继续追到子弹伤害和爆炸链；当前 26 个输出 hash 已全部定位到 row。
2. 继续追 row `33` 的 `0xCD3952E5 / 0x3A6EEFF1` melee param，补齐伤害、追踪和 hitbox。
3. 继续拆 group `0x1F`、`0x0D`、`0x0F`，补齐特殊移动、格斗和其它射击行为。
4. 加入更多 external-table 与 classic-selector 机体，避免只从 NEXA-N/AGE-FX 推导通用规则。
