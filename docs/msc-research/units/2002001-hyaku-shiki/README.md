# 2002001 Hyaku Shiki MSC 研究

本页研究百式的 Dodai / flight mode。结论只来自反编译 `.c`、raw Param
二进制和少量 wiki 语义核对；不使用 generated JSON、semantic overlay 或
resolved-label 缓存。

## 证据边界

- 机体：`2002001`，Hyaku Shiki / 百式。
- MSC source FHM2D：`E:\OBHK0.3_v27\data\x64\dplcache_release\0x43BB8719.fhm2d`
  - size `101623`
  - SHA-256 `BF43A8023677BE57A5BF9F0D86962A93470DCC49764BEA0DF9C3780D39609929`
- Param source FHM2D：`E:\OBHK0.3_v27\data\x64\dplcache_release\0x1240BD01.fhm2d`
  - size `8659`
  - SHA-256 `F03709743B53567DADFB78D8460675ABF47BE5104ECE69A6C9086A75A0384D16`
- MSC workspace：`E:\XB\解包\com\file\040msc\0x43BB8719`
- Param workspace：`E:\XB\解包\com\file\041cpm\0x1240BD01`
- Wiki 只作武装名和玩家语义参照：
  - https://w.atwiki.jp/exvs2ob/pages/249.html
  - https://w.atwiki.jp/exvs2ob/pages/82.html

Extractor 这次对 Param 只写出 `0.bin..8.bin`，没有写 typed filename。下面按
header shape 和 command pool 识别：`2.bin` 是 68-byte `chrsysparam`，`6.bin`
是 `bulletparam`，`7.bin` 是 `speedparam`，`8.bin` 是 `armsparam`。

## 解包与反编译

| Part | Binary | Binary SHA-256 | Decompiled | Decompiled SHA-256 | Shape |
|---|---|---|---|---|---|
| `0` | `0.bscex` | `81459B628B465B99E999E035C3A5A8C3D68FF5B8F59E90D8AE4A7B6065E1FE14` | `0.c` | `035184FE6D126E9163C8AB685A7B725B189B2D56878450EBBEEC6E536B11A108` | `145 funcs / 3627 lines` |
| `1` | `1.cscex` | `3BA97A583CC93CEC2E2BFBF85F02FDA0729C17ABE3E2959E4451FBCC04B1C151` | `1.c` | `24FF3EEB5235F34AE9B99918B1C59CC5D5D8972CEE09121DBAF3135F35E6452F` | `6 funcs / 34 lines` |
| `2` | `2.dscex` | `96F287BB5D1974E4E9A9A06F4693CAA7F4D6DBB5B80DB1B5EF3372A872DC196B` | `2.c` | `CA88191D94235B3B18DF901B69F5645D9ADCBB0289EEF24E942521202B1F0F67` | `1102 funcs / 30759 lines` |

反编译命令使用现有 toolchain：

```powershell
python tools\mscdec.py "E:\XB\解包\com\file\040msc\0x43BB8719\0.bscex" -o "E:\XB\解包\com\file\040msc\0x43BB8719\0.c" -c
python tools\mscdec.py "E:\XB\解包\com\file\040msc\0x43BB8719\1.cscex" -o "E:\XB\解包\com\file\040msc\0x43BB8719\1.c" -c
python tools\mscdec.py "E:\XB\解包\com\file\040msc\0x43BB8719\2.dscex" -o "E:\XB\解包\com\file\040msc\0x43BB8719\2.c" -c
```

## 一句话结论

百式的飞行模式不是 external `chrsysparam` action table。它是 classic local
selector 下的四层组合：

```text
0.c input gate
  -> common transform action 0x9475130E / 0x77B100FF / 0xA02D57DC
  -> Hyaku-specific Dodai slot callbacks 0x23 / 0x24 / 0x25
  -> func_1085(1): global143 = 2, bind flying arms rows
  -> func_453: generic transform flight controller
  -> func_1084 + func_1085(0): release Dodai projectile and restore normal loadout
```

最关键的状态拆分：

- `global143 == 2` 是百式的 Dodai / flying loadout presentation state。它会写回
  runtime field `0x17`，但 `0.c` 的飞行武装分支主要看 `global20 & 0x4000`。
- `global24/global20 & 0x4000` 是“正在骑乘 Dodai / transform branch”的动作状态位。
- `global143 == 1` 是复活态。`func_1086` 会禁用三个 transform action hash，
  这与 wiki 的“复活后无变形”一致。

## `0.c` 输入与进入 gate

`0.c func_13` 注册共通变形 action slots：

| `0.c` evidence | Meaning |
|---|---|
| `0.c:762` | slot `0x17 -> 0x9475130E`, transform entry |
| `0.c:763` | slot `0x18 -> 0x77B100FF`, sustained flight loop |
| `0.c:764` | slot `0x19 -> 0xA02D57DC`, transform release / exit |

进入 gate 是 `func_71 -> func_72 -> func_124`：

```text
func_71
  -> if func_72() succeeds
  -> cache direction values with func_125/126/122
  -> return action slot 0x17 / 0x9475130E
```

`func_72` 的硬条件：

- 不在禁止输入/特殊控制状态：`(global20 & 0x3) != 0 && global16 == 0`、
  `func_87()`、`func_88()` 都会挡住。
- `func_82(0x17)` 必须允许 slot `0x17`。
- 必须有 `global20 & 0x1000000`。
- `sys_0(0x60000) > 0`，也就是有 boost / resource。
- 必须通过 `func_119(0x20000000)`。
- `func_124()` 要求 `global76 & 0x3C` 非零，即有方向输入。

方向缓存来自 `func_106`：`global76/global72/global74/global78` 维护一个约
`0x0E` frame 的方向窗口，支持 `0x28 / 0x18 / 0x24 / 0x14` 等斜方向合成。
`0.c:3307` 把 `global78` 写入 shared field `0x2C`；`2.c func_21` 再读成
`global93`，供飞行中 quick turn / side movement 使用。

## `0.c` 飞行武装分支

`0.c func_143` 有三层：

1. `global39 == 1`：复活态分支。
2. `global20 & 0x4000`：Dodai / transform branch。
3. 其它：普通分支。

Dodai branch 直接选择以下 action hash：

| Input evidence | Action hash | `2.c` handler | Current meaning |
|---|---|---|---|
| `global50 & 0x400` | `0x1E1AAB68` | `func_1038` | transform-side special route / cancel family |
| `global50 & 0x80` | `0x0789A5C2` | `func_1012` | transform CS / sub-family candidate |
| `global50 & 0x200` | `0x4249CB3E` | `func_1022` | transform special shooting candidate |
| `global50 & 0x100` | `0x7B65B9B7` | `func_1018` | transform sub / missile candidate |
| `global50 & 0x800` + side dir | `0x9D0021AE` | `func_1006` | transform melee direction branch |
| `global50 & 0x800` + non-side | `0x7CD9DD6F` | `func_1001` | transform melee neutral branch |
| `global50 & 0x20` | `0x95C8786B` | `func_1029` | transform back-melee / counter candidate |
| `global50 & 0x2` | `0xBD4613AE` | `func_1025` | transform special melee / Dijeh candidate |
| `global50 & 0x1` | `0x7158FA47 / 0xBE2FE772 / 0x0E349F07` | `func_931 / 992 / 996` | main / empty-main family |
| `func_96(0x2)` | `0x769011A3` | `func_1034` | transform melee / release route candidate |

这里先保留“candidate”标签。输入 bit 和 wiki 名称能形成强候选，但最终定名还要继续
逐个 action 追 projectile / assist / melee runtime 输出。

## `2.c` registry

百式的 unit tail action registry 是 `func_1098`。与飞行核心相关的三条：

| Action hash | Handler | Evidence |
|---|---|---|
| `0x9475130E` | `func_450` | `2.c:30509` |
| `0x77B100FF` | `func_452` | `2.c:30510` |
| `0xA02D57DC` | `func_464` | `2.c:30511` |

slot callback registry 是 `func_1099`：

| Slot | Callback | Evidence | Meaning |
|---|---|---|---|
| `0x23` | `func_874` | `2.c:30595` | Dodai transform entry depiction |
| `0x24` | `func_875` | `2.c:30596` | sustained Dodai flight depiction |
| `0x25` | `func_876` | `2.c:30597` | dismount / transform release depiction |
| `0x26 / 0x27` | `0` | `2.c:30598..30599` | side quick-turn animation slots are intentionally empty here |

这说明飞行控制器是 common action handler，但百式把外观、loadout 和 Dodai release
放在自己的 slot callbacks 与 tail helper 中。

## 飞行进入：`func_450 -> func_874`

`func_450` 是 transform entry handler：

```text
func_450
  -> func_167(0x1008000)
  -> func_99(global9, 0xA)
  -> func_69(0x23)
  -> global509 = speedparam[global142].air_dash_duration_frame
  -> global164 = entry yaw/forward interpolation timer
  -> func_296(0x3E8, 1)
  -> callFunc3(func_451)
```

`func_451` 每帧做 entry interpolation：

- 若不是特殊状态，写 `global75 |= 0x40000`。
- 调 `func_72()` 继续跑 common update/cancel 逻辑。
- 用 `global164/global267` 平滑朝向，并通过 `sys_46(0)`、`sys_46(0x1,0x2,...)`
  推进机体。
- `global164 <= 0 && global240` 时结束 entry，转入下一 action。

百式 entry slot `func_874` 负责真正“站上 Dodai”的单位逻辑：

```text
func_874
  first frame:
    func_351(3, 4)
    func_74(0x37, 0)
    sys_58(1, 0x6C5A08F2)
    sys_58(0, 0xD07427E7)
    func_110(0x96)
    func_1085(1)
```

`func_1085(1)` 设置：

```text
global143 = 2
sys_4F(0xA, 1)
slot0 = 0x7C7E8E4C, replacing 0x6099A864
slot1 = 0x45FA9DE8
slot2 = 0x824A521A
slot3 = 0x0C205B60
```

这就是 Dodai flying loadout 的入口。

### Dodai shell mount argument

百式 Dodai 的 shell 生成 / 挂接不是只有模型 id。相关调用形态是：

```text
sys_4B(0x2, 0x7AD84955, 0x8CCFAE67, 0x4094B0F4)
```

这里 `0x7AD84955` 是百式 Dodai 模型 / shell entry，`0x8CCFAE67` 是该 Dodai
模型自己的 `.jnttbl` bone hash。这个第三参数不是 `.shl model_type`，也不是
跨机体通用挂点。移植到其他模型时必须使用目标模型自己的 `.jnttbl` hash；如果目标
模型没有对应 bone，实测应使用 `0`。2026-07-05 强人移植中，把 `0x8CCFAE67`
直接用于强人 `0xA59612D5` 模型会让模型黏在地面。

## 持续飞行：`func_452 -> func_453`

`func_452` 初始化 sustained flight：

```text
func_452
  -> if global9 == 1: func_243()
  -> clear sys_46(0x8, 0, 0, 0)
  -> func_167(0x1004000)
  -> read speedparam[global142]:
       0x5E8CAF43 air_dash_duration_frame
       0xFF7A9C8B gravity_air_modifier
       0x459455EA landing_recovery_frame
  -> reset global160/168/169/170/171/600/601/602/164/165/166/167/522/607
  -> func_69(0x24)
  -> callFunc3(func_453)
```

`func_453` 是真正的 flight loop：

```text
func_453
  -> func_72()
  -> if global24 & 0x20000: func_461()
     else if global24 & 0x400: func_462()
     else: func_454()
  -> write pitch/bank flags to sys_1(0xE0001, 0x9, flags)
  -> accelerate/decelerate global509 toward speedparam limit
  -> sys_46(0x1, 0x1, 0, global169, global509)
  -> sys_46(0x1, 0x2, global603, 0, global600)
  -> func_443()
```

普通控制在 `func_454`：

- 先调 `func_463()` 处理 double-tap quick movement。
- `func_455/456` 控 yaw。
- `func_458/459/460` 控 pitch。
- `func_457` 控 banking / roll。
- `func_104(...)` 和 `func_360(global183)` 写姿态。

关键输入关系：

| Function | Evidence | Role |
|---|---|---|
| `func_455` | held `global87 & 0x3C`，speed field `0x6F6F1BF6` | normal yaw |
| `func_456` | held `0x20/0x10` | alternate yaw |
| `func_458` | input `0x80` + `global607` double-tap window | normal pitch |
| `func_459` | input `0x4/0x8` | alternate pitch |
| `func_460` | clamps `global169` to `-3000..3500` | pitch easing |
| `func_457` | speed fields `0x4D4B65EA/0x2D28CC4B/0x18895A55` | roll / bank easing |
| `func_463` | uses shared `global93` from `0.c` direction cache | quick turn / side shove |

`func_463` 证明飞行中还有二次方向输入：

- `global122 & 0x200 && global93 & 0x4`：设置 `global24 & 0x400`，进入
  `func_462` 的 target-facing quick movement。
- `global122 & 0x2 && global93 & 0x3C`：左右方向设置 `global24 & 0x20000`，
  `global170=3/4`，`global603=+/-0x2328`，触发 side shove。

这与 wiki 对百式急速变形“按方向移动”的描述一致；实际实现不是只换动画，而是
在飞行 loop 里继续消费 `0.c` 方向缓存。

## 退出和 Dodai release：`func_464 -> func_876 -> func_1084`

`func_464` 是 transform release action：

```text
func_464
  -> func_167(0x1010000)
  -> func_69(0x25)
  -> sys_46(0x4, 0x4, global487)
  -> cache current roll/pitch into global168/global169
  -> callFunc3(func_465)
```

`func_465` 每帧把姿态缓回 0，并在 slot callback 设置 `global240` 后：

```text
func_375(0xF, 0)
sys_58(0x2)
func_65()
```

百式 exit slot `func_876` 做关键状态翻转：

```text
first frame:
  func_74(0x3B, 0)
  func_351(3, 4)
  func_296(0x3E8, 1)
  sys_58(2)
  sys_58(0, 0x497D765D)
  func_168(0x4000)

at frame gate 0x3E8:
  func_169(0x14000)
  func_1084(0, 0, 1)

at frame gate 0xA8C:
  global240 = 1
```

`func_1084` 是 Dodai release / restore helper：

```text
func_1084(arg0, arg1, arg2)
  if arg0 && arg1 == 1:
    sys_4F(0, 5, 0xBE7CA2EF)
  else if arg0:
    sys_4F(0, 5, 0x3CBC54AC)
  else:
    if arg2 == 1:
      func_119(0xFFFFFFFF)
    sys_4F(0, 5, 0xDFD91DB9)

  func_169(0x4000)
  global779 = 1
  func_893()
  func_1085(0)
```

这给出三个 Dodai projectile / release row：

| ID | Raw bullet row | `lifetime` | `speed_internal` | `bullet_resource_hash` | `bullet_action_hash` | `interaction_hash` |
|---|---:|---:|---:|---|---|---|
| `0xBE7CA2EF` | `29` | `120` | `100` | `0x805FA350` | `0x04A46DE9` | `0x7AD84955` |
| `0x3CBC54AC` | `7` | `120` | `100` | `0x71CA304B` | `0x04A46DE9` | `0x7AD84955` |
| `0xDFD91DB9` | `37` | `120` | `100` | `0x5E1947D3` | `0x04A46DE9` | `0x7AD84955` |

`func_1084` 的调用点显示哪些动作会把骑乘态变成 release：

| Caller | Evidence | Meaning |
|---|---|---|
| `func_876` | `2.c:25369 func_1084(0,0,1)` | standard dismount / release |
| `func_943` | `2.c:26481 func_1084(1,0)` | Dodai-related attack branch releases variant `0x3CBC54AC` |
| `func_1021` | `2.c:28650 func_1084(1,1)` | Dodai-related attack branch releases variant `0xBE7CA2EF` |
| `func_1027` | `2.c:28759 func_1084(0)` | transform special/melee branch releases `0xDFD91DB9` |
| `func_1083` | `2.c:30162 func_1084(0)` | passive safety restore when `0x4000` riding bit disappears unexpectedly |

因此 wiki 的“变形特殊射击：把乘坐的 Dodai 射出”在 `.c` 中对应到
`func_1084` 这一层，但有三种 projectile resource variant；不能只写成单一弹体。

## `func_1085` loadout bridge

`func_1085(1)` 是进入 Dodai flight：

| Slot | Row | Raw arms evidence |
|---:|---|---|
| `0` | `0x7C7E8E4C` | ammo `6`, reload type `0`, count-per-shot `60`, interval `90` |
| `1` | `0x45FA9DE8` | ammo `1`, reload per shot `420`, total `100`, wait `100`, start `300`, bullet type `5` |
| `2` | `0x824A521A` | ammo `1`, reload per shot `240`, total `60`, wait `100`, start `300`, bullet type `6` |
| `3` | `0x0C205B60` | ammo `1`, reload per shot `360`, total `80`, wait `80`, start `240`, bullet type `7` |

`func_1085(0)` 是恢复 normal loadout：

| Slot | Row | Raw arms evidence |
|---:|---|---|
| `0` | `0x6099A864` | ammo `6`, reload type `0`, count-per-shot `90`, interval `90` |
| `1` | `0x7EC69514` | ammo `3`, reload type `1`, reload per shot `240`, total `40`, wait `40`, start `120`, bullet type `1` |
| `2` | `0x7319A1CF` | ammo `1`, reload type `2`, reload per shot `1020`, total `180`, wait `180`, start `540`, bullet type `2` |
| `3` | `0x08D246B8` or `0x75AC26C2` | ammo `2` or `1`, both reload per shot `720`, total `160`, wait `160`, start `480` |

`func_1086` 是 revival loadout：

| Slot | Row | Raw arms evidence |
|---:|---|---|
| `0` | `0xDB649D73` | ammo `6`, reload type `2` |
| `1` | `0xD94EE2BF` | ammo `3`, reload type `1`, reload per shot `240`, total `40`, wait `40`, start `120` |
| `2` | `0` | disabled |
| `3` | `0x08D246B8` or `0x75AC26C2` | same conditional slot 3 as normal |

## Speed Param bridge

`7.bin` has `2` rows, `74` commands, entry size `304`。

| Row | `global142` | Meaning | Key raw fields |
|---:|---|---|---|
| `0` | `0xC2B19D12` | normal and Dodai flight speed base | `air_dash_duration_frame=330`, `gravity_air_modifier=-5`, `landing_recovery_frame=280`, `guard_move_speed=30`, `air_brake_speed=30`, `air_dash_startup_frame=200`, `jump_initial_velocity=93`, `boost_cap_rate=95`, `air_steer_speed=24`, `boost_startup_frame=35`, `air_speed_base=300`, `turning_speed=80`, `boost_dash_initial_speed=200` |
| `1` | `0xC67DA7B2` | revival speed row | flight-specific fields above mostly `0`; `air_speed_base=240`, `turning_speed=70`, `boost_dash_initial_speed=160` |

`func_452..463` 读取的 flying-control fields 都来自 `global142`。`func_1086`
把 `global142` 改成 `0xC67DA7B2` 后，还显式禁用：

```text
func_241(0x9475130E, 0)
func_241(0x77B100FF, 0)
func_241(0xA02D57DC, 0)
```

所以百式复活态不是“仍能进入飞行但性能变差”，而是在 action registry 层直接切断
transform entry/loop/release。

## Wiki 核对

OB wiki 的百式页列出：

- 普通时有变形，复活时无变形。
- 变形 main 与普通 main 共弹。
- 变形 sub 是 Dodai missile。
- 变形 special shooting 是 `ド・ダイ改【射出】`。
- 变形 special melee 是 Dijeh assist。
- 格斗或 special melee 可派生 `ド・ダイ改【搭乗】` / 急速变形。

wiki 用语页把“下駄”解释为 transform command 让机体站在其上的 sub-flight
system，并点名百式 / Dijeh 的 Dodai Kai。这与 `.c` 中 `global143=2` 的 flying
loadout、`global20&0x4000` 的 riding branch、`func_1084` 的 Dodai release projectile
三者相互印证。

## 当前结论

1. 百式属于 classic local selector；`chrsysparam` 是 68-byte empty shape，不是
   external action table。
2. 飞行模式的主控制器复用 common transform handler：`func_450/452/464`。
3. 百式自己的逻辑集中在 Dodai slot callbacks 与 tail helpers：
   `func_874/875/876/1083/1084/1085/1086`。
4. `global143=2` 是 flying loadout / presentation state；`global20&0x4000` 是
   `0.c` 选择 transform weapon branch 的主条件。
5. 退出飞行时并不只是恢复普通状态：`func_1084` 会按上下文释放三种 Dodai
   projectile variant，再清 `0x4000` 并恢复 normal loadout。
6. 复活态 `global143=1` 同时切 arms row、character/speed row，并禁用
   `0x9475130E / 0x77B100FF / 0xA02D57DC`，强对应 wiki 的复活后无变形。

## 后续可继续拆的点

- 把 Dodai branch 每个 action hash 与 wiki 武装名逐一闭环到 bullet / assist /
  melee runtime 输出，尤其是 `0x4249CB3E`、`0x7B65B9B7`、`0xBD4613AE`。
- 拆 `func_989/991` 的急速变形派生，与 wiki “格斗命中与否都可派生”核对。
- 追 `func_1087..1096` 的 per-frame visual / ammo display 维护，确认 `global771` 与
  slot 3 conditional row 的完整语义。

## Motion resource notes

- `motion-folder-bundle-structure.md` records why Hyaku Shiki motion resources use
  both direct `.nuanmb` items and numbered folder bundles. In short, direct items
  store the motion key on the item; folder bundles store the motion key on the
  folder and use child item `unk2` as clip channel / participant key.
