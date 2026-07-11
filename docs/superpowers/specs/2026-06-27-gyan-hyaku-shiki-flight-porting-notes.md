# 强人移植百式 Dodai 飞行模式研究记录

日期：2026-06-27

## 目标

本记录用于继续研究：百式为什么能通过“按住喷射 + 两次方向输入”进入 Dodai 飞行模式，以及强人如果要实现类似功能，需要补哪些 MSC 逻辑和资源。

证据优先级：

1. 直接读取 `E:\XB\解包\com\file\040msc\0x43BB8719` 的百式 `0.c/2.c`。
2. 直接读取 `E:\XB\解包\com\file\040msc\0xFEEA714A` 的当前强人 `0.c/2.c`。
3. 对照已有研究文档：
   - `docs/msc-research/units/2002001-hyaku-shiki/README.md`
   - `docs/msc-research/units/2018001-dijeh/README.md`
   - `docs/msc-research/delta-plus-transform-flight-system.md`
4. 不使用 generated JSON、semantic overlay 或旧 resolved-label 缓存作为结论来源。

## 一句话结论

百式不是在 `0.c` 里直接“载入飞行模式”。它的实现分成三层：

```text
0.c 输入 gate
  -> 0x9475130E / 0x77B100FF / 0xA02D57DC 三段共通 transform action
  -> 2.c common flight controller: func_450 / func_452 / func_464
  -> 百式自己的 slot 0x23 / 0x24 / 0x25 callback
  -> func_1085(1) 切 Dodai flying arms rows
  -> func_453 飞行 loop 继续读方向缓存
  -> func_1084 + func_1085(0) 释放 Dodai 并恢复普通 arms rows
```

强人当前已经有 `0.c` 的三段 transform action slot，但 `2.c` 把这三段 action 全部绑定为 `0`，并且 `slot 0x23/0x24/0x25` 也是 `0`。所以强人不是“输入表完全没有”，而是“输入能指到共通 transform hash，但机体侧没有接上飞行 controller 的 action/slot/resource 实现”。

## 百式如何进入飞行

百式 `0.c func_13` 注册三段共通 transform action：

| Evidence | Slot | Action hash | 作用 |
|---|---:|---|---|
| `0.c:762` | `0x17` | `0x9475130E` | 进入 transform / Dodai flying |
| `0.c:763` | `0x18` | `0x77B100FF` | 持续飞行 loop |
| `0.c:764` | `0x19` | `0xA02D57DC` | 退出 / 离脱 |

入口 gate 是 `func_71 -> func_72`：

```text
func_71
  -> func_72() 必须通过
  -> global61 = func_125()
  -> func_126()
  -> func_122()
  -> return slot 0x17 / 0x9475130E
```

`func_72` 的核心条件：

| Evidence | 条件 |
|---|---|
| `0.c:2082` | `func_82(0x17)`，slot `0x17` 可用 |
| `0.c:2086` | `global20 & 0x1000000`，当前状态允许 transform / 特殊移动 |
| `0.c:2090` | `sys_0(0x60000) > 0`，还有 boost / 资源 |
| `0.c:2095` | `func_119(0x20000000)`，输入事件成立 |
| `0.c:2099` | `func_124()`，方向缓存成立 |

方向两连按不是在 `func_72` 内临时判断，而是由 `func_106` 持续维护：

| Evidence | 作用 |
|---|---|
| `0.c:2570..2610` | 记录方向边沿、斜方向合成和 `0x0E` frame 窗口 |
| `0.c:3253..3255` | `func_124()` 要求 `global76 & 0x3C` 非零 |
| `0.c:3307` | `global78` 写入 shared field `0x2C`，供 `2.c` 使用 |

因此“按住喷射 + 两次方向键”的脚本含义更准确地说是：

```text
boost resource > 0
当前动作状态允许 transform
输入事件 0x20000000 成立
方向缓存 global76 在窗口内命中
```

## 百式的 2.c 飞行链路

百式 `2.c func_1098` 把三段 transform action 接到 common controller：

| Evidence | Action hash | Handler |
|---|---|---|
| `2.c:30509` | `0x9475130E` | `func_450` |
| `2.c:30510` | `0x77B100FF` | `func_452` |
| `2.c:30511` | `0xA02D57DC` | `func_464` |

`func_450` 是进入段：

```text
func_450
  -> func_167(0x1008000)
  -> func_99(global9, 0xA)
  -> func_69(0x23)
  -> read speedparam[global142][0x5E8CAF43]
  -> callFunc3(func_451)
```

关键点是 `func_450` 并不直接载入 Dodai。它只选择 `slot 0x23`。真正的机体表现层在百式 slot callback。

百式 `2.c func_1099` 注册飞行 slot：

| Evidence | Slot | Callback | 作用 |
|---|---:|---|---|
| `2.c:30595` | `0x23` | `func_874` | Dodai entry / 站上 Dodai |
| `2.c:30596` | `0x24` | `func_875` | sustained flying depiction |
| `2.c:30597` | `0x25` | `func_876` | dismount / release |
| `2.c:30598..30599` | `0x26/0x27` | `0` | 左右 quick-turn slot 在百式里为空 |

百式进入 slot `func_874` 的核心：

```text
2.c:25317  func_74(0x37, 0)
2.c:25318  sys_58(1, 0x6C5A08F2)
2.c:25319  sys_58(0, 0xD07427E7)
2.c:25321  func_1085(1)
```

这里 `0x37` 是 entry motion slot，`0x6C5A08F2 / 0xD07427E7` 是 sound/effect/resource 类挂接，`func_1085(1)` 才是切到 Dodai flying loadout 的核心。

百式持续飞行 `func_452 -> func_453`：

```text
func_452
  -> func_167(0x1004000)
  -> 读取 speedparam[global142] 的 0x5E8CAF43 / 0xFF7A9C8B / 0x459455EA
  -> func_69(0x24)
  -> callFunc3(func_453)

func_453
  -> func_72()
  -> func_454 / func_461 / func_462
  -> sys_46 写 yaw / pitch / roll / forward speed / side movement
```

飞行中仍然消费 `0.c` 方向缓存：

| Evidence | 作用 |
|---|---|
| `2.c:11061..11121` | 百式 `func_463` 使用 `global93` 触发 flying quick movement |
| `2.c:11073` | `global122 & 0x200 && global93 & 0x4` 触发一种前向 quick movement |
| `2.c:11082` | `global122 & 0x2 && global93 & 0x3C` 触发左右 side shove |

也就是说，进入飞行后的控制不是纯动画。`func_453` 是实际飞行物理 loop，会读 speedparam 并通过 `sys_46` 写运动。

## 百式如何切换飞行武器

百式 `func_1085(1)` 把普通武器槽切成 flying arms rows：

| Evidence | Slot | Flying arms row |
|---|---:|---|
| `2.c:30205` | `0` | `0x7C7E8E4C`，替换普通 row `0x6099A864` |
| `2.c:30206` | `1` | `0x45FA9DE8` |
| `2.c:30207` | `2` | `0x824A521A` |
| `2.c:30208` | `3` | `0x0C205B60` |

退出时 `func_1085(0)` 恢复普通 rows：

| Evidence | Slot | Normal arms row |
|---|---:|---|
| `2.c:30213` | `0` | `0x6099A864`，替换 flying row `0x7C7E8E4C` |
| `2.c:30214` | `1` | `0x7EC69514` |
| `2.c:30215` | `2` | `0x7319A1CF` |
| `2.c:30216` | `3` | `0x08D246B8` |

这些 `sys_4F(0xb, slot, row)` 调用不是“加载模型文件”，而是把 armsparam 的武器 row 绑定到 runtime 武器槽。真正的弹体、效果、模型资源还要继续由 armsparam -> bulletparam -> effect/model/shell 连接。

## 五个武器槽是怎么载入的

强人当前的五个武器槽维护在 `2.c func_22`：

```text
2.c:1789  var0 = sys_0(0x10000, 0, 0x1B)
2.c:1794  while (var1 < 0x5)
2.c:1816  var3 = sys_0(0x90002, var2)
2.c:1825  if ((var0 & (0x1 << var2)) != 0)
2.c:1827    sys_4F(0xD, var2, 1)
```

这里的 `var2` 实际遍历 `0,1,2,3,4` 五个 weapon slot。`sys_0(0x90002, slot)` 返回 slot 类型，`sys_4F(0xD, slot, 1)` 按 shared bitmask 标记/维护 slot 状态。

强人的 arms/resource 基础表在 `func_1010 -> func_1014`：

| Evidence | 表项 |
|---|---|
| `2.c:28082..28088` | `func_1010()` 依次重建 action registry、slot callback、motion table、resource table |
| `2.c:28320..28334` | `func_1014()` 写 `sys_1(0x10001, 0xB, slot, hash)` |

强人 `func_1014` 当前写入的 `0x10001,0xB` 表：

| Slot | Hash |
|---:|---|
| `0` | `0x5F2CCC5D` |
| `1` | `0xF5339100` |
| `2` | `0` |
| `3` | `0x6C5A08F2` |
| `4` | `0x8CC25353` |
| `5` | `0x3002FE97` |
| `6` | `0x588093FA` |
| `7` | `0x5F2CCC5D` |
| `8` | `0x76E079EC` |
| `9` | `0` |
| `0xA` | `0x6C5A08F2` |
| `0xB` | `0x5F2CCC5D` |
| `0xC` | `0xD8C25646` |
| `0xD` | `0xBA276E22` |
| `0xE` | `0x4D12CC56` |

强人 `0.c func_143` 读取武器槽状态来选择 action：

| Evidence | 读取 |
|---|---|
| `0.c:3367` | `sys_0(0x90000, 0x2)` 判断 slot 2 |
| `0.c:3379` | `sys_0(0x90000, 0x1)` 判断 slot 1 |
| `0.c:3390` | `sys_0(0x90000, 0x3)` 判断 slot 3 |
| `0.c:3404` | `sys_0(0x90000, 0x4)` 判断 slot 4 |

所以“载入五个武器”的流程不是单点初始化，而是：

```text
2.c resource table: sys_1(0x10001, 0xB, slot, hash)
  -> engine/native 根据 0xB 表建立 weapon/resource slot
  -> 2.c func_22 遍历 slot 0..4，用 0x90002 读取 slot 类型并维护 0xD 状态
  -> 0.c func_143 用 0x90000 检查 slot ammo/可用性
  -> 0.c 选出 action hash
  -> 2.c func_1011 把 action hash 绑定到具体 handler
  -> handler 内再通过 sys_4F(0, ..., bulletRow) 等发射弹体或切资源
```

百式 flying loadout 的特殊之处是：它在进入飞行时用 `sys_4F(0xB, slot, armsRow)` 动态切换当前 arms rows。强人当前没有等价的 flying loadout 切换函数。

## 强人当前缺口

强人 `0.c func_13` 已经注册三段 transform action：

| Evidence | Slot | Action hash |
|---|---:|---|
| `0.c:560` | `0x17` | `0x9475130E` |
| `0.c:561` | `0x18` | `0x77B100FF` |
| `0.c:562` | `0x19` | `0xA02D57DC` |

但强人 `2.c func_1011` 禁用了它们：

| Evidence | Binding |
|---|---|
| `2.c:28107` | `func_241(0x9475130E, 0)` |
| `2.c:28108` | `func_241(0x77B100FF, 0)` |
| `2.c:28109` | `func_241(0xA02D57DC, 0)` |

强人 `2.c func_1012` 也没有飞行 slot callback：

| Evidence | Slot | Callback |
|---|---:|---|
| `2.c:28188` | `0x23` | `0` |
| `2.c:28189` | `0x24` | `0` |
| `2.c:28190` | `0x25` | `0` |
| `2.c:28191..28192` | `0x26/0x27` | `0` |

强人 `2.c func_1013` 还把飞行相关 motion slot 置空：

| Evidence | Slot | Motion hash |
|---|---:|---|
| `2.c:28293` | `0x37` | `0` |
| `2.c:28294` | `0x38` | `0` |
| `2.c:28295` | `0x3B` | `0` |

百式这些 slot 分别是：

| Slot | 百式 hash | 用途 |
|---:|---|---|
| `0x37` | `0x26657BF0` | entry motion |
| `0x38` | `0x7E3F656A` | sustained flying motion |
| `0x3B` | `0xDB986227` | release / dismount motion |

强人还存在状态冲突风险：

| Evidence | 现状 |
|---|---|
| `2.c:27886..27899` | `func_998()` 把 `global143 = 1`，切 `global142 = 0xB7027DBE`，并调用 `func_1010()` |
| `2.c:27901..27912` | `func_999()` 把 `global143` 恢复为 `0`，并调用 `func_1010()` |
| `2.c:27915..27927` | `func_1000()` 也是恢复普通状态的一条路径 |

百式用 `global143 = 2` 表示 Dodai flying loadout，强人当前 `global143 = 1` 已经有自己的特殊状态。移植时不能直接复制百式状态值，必须先确认强人的 `global143=1` 语义，避免把特殊状态、speed row、motion table、resource table 混在一起。

## 要移植到强人必须补的资源

最低限度的飞行 movement-only 版本需要：

1. MSC action 绑定：
   - 把 `0x9475130E` 绑定到 entry handler。
   - 把 `0x77B100FF` 绑定到 sustained flight handler。
   - 把 `0xA02D57DC` 绑定到 release handler。
   - 不能 hardcode 成百式函数体原样复制；要按强人当前 registry / slot / state 设计。

2. Unit slot callbacks：
   - `slot 0x23`：进入飞行，播放 entry motion，设置 flying state，必要时切 arms rows。
   - `slot 0x24`：持续飞行表现，播放 flying loop motion。
   - `slot 0x25`：退出飞行，恢复普通状态，必要时释放飞行器 projectile。

3. Motion 资源：
   - `0x37` entry motion。
   - `0x38` flying loop motion。
   - `0x3B` release / dismount motion。
   - 强人当前这三个 slot 都是 `0`，如果不补 motion，common controller 即使能跑，也可能表现为空动作或引擎 fallback。

4. Arms / weapon rows：
   - 如果只做 movement-only，可以先不新增 flying weapons，但要明确 flying 状态下普通武器是否可用。
   - 如果要像百式一样有变形主射、变形副射、变形特射、变形特格，需要在强人的 Param 中有对应 `armsparam` row，并在 MSC 中用 `sys_4F(0xB, slot, row)` 或等价机制切换。
   - `0.c func_143` 也要有 `global20 & 0x4000` 的 flying branch，否则飞行中按键仍会走普通强人武装选择。

5. Bullet / projectile rows：
   - 百式退出时 `func_1084` 会投递 `0xBE7CA2EF / 0x3CBC54AC / 0xDFD91DB9` 三种 Dodai projectile。
   - 强人如果需要“飞行器离脱/射出”，必须新增或复用本机 bulletparam row。不能直接引用百式 row，除非对应 bullet resource、effect、interaction、hitgroup 都已经在强人资源包可用。

6. Shell / model / effect：
   - 强人当前确认的 chara 资源包是 `E:\XB\解包\com\file\002chara\0x46DE9B9C`，来自 registry seed `Gyan_eva_mod_model`。
   - 当前强人 model 子目录能看到 `body_normal`、shield、bomb、azleader、assist_adzam 等资源，但没有已确认的 Dodai / flight board 模型。
   - 如果飞行模式需要“站上飞行器”的视觉，必须补模型、shell、vernier/effect、必要的 `sys_4A/sys_4B/sys_4F` 资源切换。
   - 2026-07-05 correction：`E:\XB\解包\com\file\002chara\gundam_005gyan00\shell_001gundam_005gyan00_001.shl` record 9 是 raw `D5 12 96 A5`，LE model id `0xA59612D5`，`model_type=3`，`folder_index=9`。MSC 中引用该模型应使用 `0xA59612D5`。
   - `sys_4B(0x2, model, arg3, action)` 的 `arg3` 是目标模型自己的 `.jnttbl` bone hash，不是 `.shl model_type`。百式 `sys_4B(0x2, 0x7AD84955, 0x8CCFAE67, 0x4094B0F4)` 里的 `0x8CCFAE67` 只对百式 Dodai `0x7AD84955` 成立。
   - 强人 `0xA59612D5` 没有已确认的 `0x8CCFAE67` bone。实测把 `0x8CCFAE67` 搬过来会让模型黏在地面；当前应使用 `0`，或换成从 `0xA59612D5` 自己 `.jnttbl` 证明存在的 bone hash。

7. Speed / movement Param：
   - 百式飞行 controller 读 `speedparam[global142]` 的字段，例如 `0x5E8CAF43`、`0xFF7A9C8B`、`0x459455EA`、`0x6F6F1BF6`、`0x4D4B65EA` 等。
   - 百式普通和 Dodai flying 都使用 `0xC2B19D12` 行；复活态 `0xC67DA7B2` 会禁用 transform。
   - 强人如果用当前 `0xC2B19D12`，需要确认该 speed row 的飞行字段不为 0，且数值适合飞行。若不适合，应新增/选择飞行专用 speed row，并在进入/退出状态时恢复。
   - **2026-07-11 实测/读码（N2 rocket mod `2.c`）：**
     - `global142` 默认 / 恢复：`0xC2B19D12`。
     - `func_998` 特殊态：`global142 = 0xB7027DBE`，`global143 = 1`，且 **禁用** 三段 transform action 绑定。
     - 因此 **common transform 飞行（slot 0x23/24/25）走的是 `0xC2B19D12`**，不是 B7。
     - 气槽「变成一半」**不是** transform MSC 里的 `/2`；`func_407` 的 `/2` 作用在 `boost_dash_initial_speed`，与飞行 controller 无关。耗气优先查 engine + speedparam。
     - 飞行拉远镜头：用 `sys_53(0x2, …)`；推荐挂在 `GYAN_TRANSFORM_ENTRY/RELEASE_SLOT`，不要长期写在 `func_452/464`；不要默认塞进 `MOUNT_*`（Dodai 特射也会调 MOUNT）。
     - 百式 Dodai spawn 表现：`sys_47(0x25/0x26, model)` + 可选 `sys_4A(0, aleo, model)`；强人 N2 模型 `0xA59612D5` 可抄**形态**，不能直接抄百式 model/aleo/bone hash。详见 `docs/msc-research/gyan-session-2026-07-11-handoff.md`。

## 推荐实现阶段

### Phase 1：只让强人能进入和退出飞行

目标是验证 common controller 是否能在强人上跑起来：

```text
0.c 保持现有 slot 0x17/0x18/0x19
2.c 启用 0x9475130E / 0x77B100FF / 0xA02D57DC
2.c 补 slot 0x23 / 0x24 / 0x25 callbacks
2.c 补 motion 0x37 / 0x38 / 0x3B
不新增飞行武装，不做 Dodai projectile release
```

这个阶段如果能稳定飞行，就说明输入 gate、common controller 和 motion/state 连接成立。

### Phase 2：补 flying loadout

目标是让飞行中武器槽合理：

```text
新增或选择 flying arms rows
进入时切 slot 0..N
退出时恢复普通 rows
0.c func_143 增加 global20 & 0x4000 branch
```

这一步才是真正的“飞行模式武装”。不能只改 action registry。

### Phase 3：补飞行器模型和离脱 projectile

目标是视觉和玩法完整：

```text
补 Dodai/飞行器模型或强人自定义飞行器模型
补 shell / effect / vernier
sys_4B attach bone 参数使用目标模型 jnttbl；无证据时用 0，不搬百式 0x8CCFAE67
补 bulletparam projectile row
补 release callback
```

如果没有这部分资源，强人可以有飞行物理，但不会像百式那样“站在 Dodai 上并离脱射出”。

## 不能直接复制百式的原因

1. 百式 `global143=2` 是 Dodai flying，强人 `global143=1` 已有特殊状态。状态值必须重新设计。
2. 百式 arms rows、bullet rows、motion hashes 都属于百式 `0x43BB8719 + 0x1240BD01` 证据链；强人不一定有对应资源。
3. 百式 `func_1084` 释放三种 Dodai projectile，强人没有确认这些 bullet resource / interaction / effect。
4. 强人当前 `slot 0x23/0x24/0x25` 和 motion `0x37/0x38/0x3B` 是空的。只启用 action hash 会让 common controller 找不到 unit callback。
5. `0.c` 飞行武装分支也缺失。即使能进入飞行，按键也可能继续走普通强人武装逻辑。

## 下一步建议

下一步应先做 Phase 1 的最小原型，但在改 `.c` 前先确认两件事：

1. 强人 `global143=1` 的特殊状态是否可以与 flying state 并存，或需要新状态值。
2. 强人是否已有可复用的飞行/悬浮 motion；如果没有，至少需要选择 fallback motion，避免空 slot。

完成这两点后，再决定是做“纯飞行 movement-only”还是“带新飞行武装和飞行器模型”的完整移植。
