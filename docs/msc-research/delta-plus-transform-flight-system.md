# Delta Plus 变形 / WR 飞行系统代码走读

本文改用真实 OB v27 Delta Plus 源样本：

```text
E:\XB\解包\com\file\040msc\0x04AD9F33\0.c
E:\XB\解包\com\file\040msc\0x04AD9F33\2.c
```

旧 `0xBDBE6FEA` 只保留为历史参考：当前工作区里的 BDBE 已含 2026-06-19
AI patch，不再作为官方 Delta Plus 证据。本页所有结论必须能回到上面两份
`.c` 行号。

上级页面：[15004001 Delta Plus MSC 研究](./units/15004001-delta-plus/README.md)

## 当前结论

Delta Plus 的变形链路分三层：

```text
0.c 输入整理
  -> slot 0x17 action hash 0x9475130e
  -> 2.c action registry 绑定 func_450
  -> func_450 选择 slot callback 0x23
  -> slot 0x23 callback func_870
  -> func_870 调 func_888(0x7)
  -> func_1037 切飞机 shell / motion / resource entry
  -> action 0x77b100ff / func_452 进入持续飞行控制
```

`func_450` 是变形突入动作入口，不是直接“切飞机模型”的函数。真正写飞机
模型 hash、飞机 motion fallback、resource entry 的函数是 `func_1037`。

持续飞行控制集中在 `func_452 -> func_453 -> func_454 -> func_455/456/458/459/460/463`。
这些函数读 `global87/global48/global93` 输入缓存，读 `global142` 指向的
`0x60006` 移动参数行，再用 `sys_46` 写转向、侧向、俯仰、前进速度。

## 0.c：输入整理到 action hash

`0.c func_13` 建立 action slot 到 hash 的输入层表：

| Evidence | Meaning |
|---|---|
| `0.c:758` | slot `0x17 -> 0x9475130e`，变形突入入口 |
| `0.c:759` | slot `0x18 -> 0x77b100ff`，持续飞行 loop 候选 |
| `0.c:760` | slot `0x19 -> 0xa02d57dc`，飞行/变形派生候选 |
| `0.c:761` | slot `0x1a -> 0x16d0093c`，飞行/变形派生候选 |

`0.c func_72` 是 slot `0x17` 的 gate：

| Evidence | Gate |
|---|---|
| `0.c:2074-2077` | 排除若干不可行动状态 |
| `0.c:2078-2081` | `func_82(0x17)`，要求 slot 0x17 可用 |
| `0.c:2082-2085` | `global20 & 0x1000000`，当前状态允许变形/特殊移动 |
| `0.c:2086-2089` | `sys_0(0x60000) > 0`，boost/资源大于 0 |
| `0.c:2091-2094` | `func_119(0x20000000)`，输入事件位成立 |
| `0.c:2095-2099` | `func_124()`，方向双击缓存成立 |

`0.c func_71` 消费 gate：

| Evidence | Meaning |
|---|---|
| `0.c:1637-1646` | `func_72()` 成功后清理方向缓存，再返回 `sys_0(0x10000,0x1,0x17)` |

方向双击由 `func_106` 维护：

| Evidence | Meaning |
|---|---|
| `0.c:2566-2570` | 新方向边沿 `global4 & 0x3c`，用 `global70 & global4` 生成 `global74` |
| `0.c:2571-2599` | 处理斜方向组合 `0x28/0x18/0x24/0x14` |
| `0.c:2601-2607` | 方向缓存窗口 `0xe` 帧，`global76 = global72` |
| `0.c:2613-2636` | 超时后清 `global72/global76/global70/global74` |
| `0.c:3249-3251` | `func_124()` 判断 `global74 & 0x3c` |

输入共享给 `2.c`：

| Evidence | Meaning |
|---|---|
| `0.c:3299-3304` | `global76` 写到共享槽 `0x10000,0,0x2c` |
| `2.c:1767-1779` | `func_21` 每帧读 `global87` held input、`global48` pressed input、`global93 = shared 0x2c` |

## 2.c：action registry 与 slot callback

`2.c func_1043` 把输入 hash 绑定到 depiction action：

| Evidence | Binding |
|---|---|
| `2.c:29414` | `0x9475130e -> func_450` |
| `2.c:29415` | `0x77b100ff -> func_452` |
| `2.c:29416` | `0xa02d57dc -> func_464` |

`func_450` 是变形突入：

| Evidence | Meaning |
|---|---|
| `2.c:10775-10785` | 设置 `func_167(0x1008000)`，按 `global9` 算方向，调用 `func_69(0x23)`，读 `0x60006/global142/0x5e8caf43`，转入 `func_451` |
| `2.c:10788-10809` | `func_451` 每帧用 `sys_46(0, var0)` 与 `sys_46(0x1,0x2,...)` 平滑转向/推进 |

slot callback 分发：

| Evidence | Meaning |
|---|---|
| `2.c:3270-3279` | `func_69(slot)` 从 `sys_0(0x10001,0x2,slot)` 取 callback 到 `global223` |
| `2.c:3338-3349` | `func_72` 执行 `(*global223)()` 或 `(*global225)()` |
| `2.c:29496` | slot `0x23 -> func_870` |
| `2.c:29497` | slot `0x24 -> func_871`，持续飞行 loop 动作槽 |
| `2.c:25564-25570` | `func_888(0x7) -> func_1037()`，`func_888(0x8) -> func_1038()` |

`func_870` 是变形突入动作槽：

| Evidence | Meaning |
|---|---|
| `2.c:25228-25243` | 首帧调用 `func_888(0x7)`、播放 motion slot `0x37`、挂 WR 特效/声音 |
| `2.c:25244-25252` | 等 shell/动画完成后置 `global238=1` 并做姿态更新 |

因此完整链路不是 `func_450 -> func_1037` 直接调用，而是：

```text
func_450
  -> func_69(0x23)
  -> sys_0(0x10001,0x2,0x23) = func_870
  -> func_870
  -> func_888(0x7)
  -> func_1037
```

## 形态切换：func_1037 / func_1038

进入飞机形态：

| Evidence | Write |
|---|---|
| `2.c:29288-29292` | `sys_4B(0,0xcb05586)`，`global20=0xcb05586`，active shell 切飞机 |
| `2.c:29293-29296` | motion bank `0x3/0x4` 的 slot `0x1/0x13` 都覆盖为 `0xa8c15086` |
| `2.c:29297-29300` | `sys_4F(0xb,...)` 切 resource entry `0/1/2` 到飞机资源，并关 entry 2 flag |
| `2.c:29301` | `global143=1`，形态标志为飞机 |

退出飞机形态：

| Evidence | Write |
|---|---|
| `2.c:29308-29314` | 恢复 shell `0xab9c3043`、`global142=0xc2b19d12`、`global122=0x201` |
| `2.c:29315-29320` | `func_1045()` 重建普通 motion 表，恢复 `sys_4F(0xb,...)` entry |
| `2.c:29322-29328` | `global143=0`、`global170=0`、`func_887()`、`func_1040()` |

`func_1040` 只在 `global143 == 0` 时维护普通形态 entry 2 flag：

| Evidence | Meaning |
|---|---|
| `2.c:29330-29342` | 飞机形态跳过 `sys_4F(0x16,0x2,...)` 普通维护 |
| `2.c:29343-29350` | `sys_4F(0x15,0x2,...)` 维护 slot 2 可用/不可用状态 |

当前工作命名：

| Symbol | Working name | Evidence |
|---|---|---|
| `global143` | `formState` / `isPlaneForm` | `2.c:29301`, `2.c:29322`, `2.c:29332` |
| `global142` | `moveParamRow` | 普通 `0xc2b19d12`：`2.c:8000`, `2.c:29313`；觉醒技/特殊 WR 行 `0x0577ef6d`：`2.c:27120/27144`，`2.c:27232` 恢复普通行 |
| `0xcb05586` | plane shell/model hash | `2.c:29291-29292` |
| `0xab9c3043` | normal shell/model hash | `2.c:29311-29312` |
| `0xa8c15086` | plane fallback motion hash | `2.c:29293-29296`, `2.c:29562`, `2.c:29612` |

## speedparam：`global142` 行与字段名

`0x60006` 是 speedparam / movement param 表。字段名来自
`docs/command_mapping.md` 的 `speed_param (041cpm, cmd=74, entry_size=304)`；
实际数值来自 Delta Plus 参数包：

```text
E:\XB\解包\com\file\041cpm\0x5556A52B\speedparam.bin
```

该文件 header：`entries=2`，`commands=74`，`entry_size=304`。两个 entry id：

| Entry id | .c assignment | Current role |
|---|---|---|
| `0xC2B19D12` | `2.c:8000`, `2.c:29313` | 普通移动行。普通变形 / 飞行 loop 没看到在入口处改 `global142`，因此默认读这一行。 |
| `0x0577EF6D` | `2.c:27120`, `2.c:27144` | 觉醒技后续 / 特殊 WR 行。`func_956 -> func_958/959` 临时切到此行，`func_960` 在 `2.c:27232` 恢复普通行。 |

飞行段关心的字段：

| Field hash | Field name | `0x0577EF6D` | `0xC2B19D12` | .c usage |
|---|---|---:|---:|---|
| `0x5E8CAF43` | `air_dash_duration_frame` | `320` | `300` | `2.c:10780`, `2.c:10820` 初始化 `global507` |
| `0xFF7A9C8B` | `gravity_air_modifier` | `-5` | `-5` | `2.c:10821`, `2.c:10879` 作为 `global508` 增量 |
| `0x459455EA` | `landing_recovery_frame` | `310` | `280` | `2.c:10822`, `2.c:10880` 作为 `global509` 上限/下限 |
| `0x9FD06227` | `boost_startup_frame` | `35` | `35` | `2.c:10982`, `2.c:11043` 参与姿态量计算 |
| `0x6F6F1BF6` | `guard_move_speed` | `100` | `35` | `2.c:11127`, `2.c:11210` 在飞行控制里缩放 yaw/方向输入；字段名来自资源表，脚本上下文不是 guard |
| `0x4D4B65EA` | `air_brake_speed` | `30` | `30` | `2.c:11237-11263` 作为侧倾/滚转目标幅度 |
| `0x2D28CC4B` | `air_dash_startup_frame` | `200` | `200` | `2.c:11243-11254` 作为侧倾/滚转平滑速度 |
| `0x18895A55` | `jump_initial_velocity` | `93` | `93` | `2.c:11263` 无输入时衰减侧倾/滚转 |
| `0xF8B9B46E` | `boost_cap_rate` | `95` | `95` | `2.c:11277` 无升降输入时衰减 `global167` |
| `0xF3B9AD85` | `air_steer_speed` | `40` | `35` | `2.c:11282`, `2.c:11292` 上升/下降平滑速度 |

读法：

```text
sys_0(0x60006, global142, 0x5e8caf43)
  -> speedparam[global142].air_dash_duration_frame
```

脚本层只告诉我们“当前 `global142` 行读取哪个 field hash”。字段名和实际值来自
`speedparam.bin`。因此普通变形飞行和觉醒技 WR 飞行可以共用 `func_452/453/454`
控制代码，但通过 `global142` 读到不同移动参数。

## 持续飞行控制

`func_452` 初始化飞行 loop：

| Evidence | Meaning |
|---|---|
| `2.c:10812-10819` | 清 `sys_46(0x8,...)`，进入 `0x1004000` 飞行状态 |
| `2.c:10820-10822` | 从 `speedparam[global142]` 读取 `air_dash_duration_frame/gravity_air_modifier/landing_recovery_frame` |
| `2.c:10823-10837` | 清飞行临时变量，选择 slot `0x24` |
| `2.c:10842-10843` | 进入 `func_453` 每帧 loop |

`func_453` 每帧写速度：

| Evidence | Meaning |
|---|---|
| `2.c:10846-10865` | 按状态选择 `func_461/462/454` |
| `2.c:10866-10878` | 把 `global168/global605` 编成 `sys_1(0xe0001,0x9,var0)` |
| `2.c:10879-10892` | 用 `gravity_air_modifier` 更新 `global507`，并用 `landing_recovery_frame` 限制 |
| `2.c:10893-10895` | `sys_46(0x1,0x1,0,global167,global507)` 前进/俯仰速度；`sys_46(0x1,0x2,global601,0,global598)` 侧向速度 |

`func_454` 是飞行控制调度：

| Evidence | Meaning |
|---|---|
| `2.c:11001-11015` | 先跑 `func_463`，再按 `global122 & 0x4` 选择两套控制模式 |
| `2.c:11043-11052` | 用 `speedparam[global142].boost_startup_frame` 计算姿态，再 `func_104/func_360` 同步 |

`func_463` 处理飞行中方向双击/快速横移：

| Evidence | Meaning |
|---|---|
| `2.c:11062-11066` | `global162` 冷却低于 `0x3e8` 不触发 |
| `2.c:11067-11075` | `global122 & 0x200` 且 `global93 & 0x4` 触发一种前向特殊机动 |
| `2.c:11076-11115` | `global122 & 0x2` 且 `global93 & 0x3c` 触发左右快速转向，选择 slot `0x26/0x27`，写 `sys_46(0x5,...)` 和 `sys_4C(0x8,1)` |

左右/俯仰控制：

| Function | Evidence | Meaning |
|---|---|---|
| `func_455` | `2.c:11118-11148` | 普通飞行模式下，用 `global87 & 0x3c` 和 `speedparam[global142].guard_move_speed` 写 yaw/转向 |
| `func_456` | `2.c:11189-11213` | 另一控制模式下，用左右方向 `0x20/0x10` 写 yaw/转向 |
| `func_458` | `2.c:11150-11187` | 用 `global48/global87 & 0x80` 处理上升/下降输入 |
| `func_459` | `2.c:11215-11231` | 另一控制模式下，用前后方向 `0x4/0x8` 处理上升/下降 |
| `func_457` | `2.c:11234-11265` | 用 `air_brake_speed/air_dash_startup_frame/jump_initial_velocity` 平滑侧倾/滚转 |
| `func_460` | `2.c:11267-11299` | 用 `boost_cap_rate/air_steer_speed` 平滑俯仰/升降量 |

## 仍不确定

- `sys_4F(0xb,...,mode=0x4)` 的 native 语义仍不能命名成具体 crossfade 或 replace。
- `0x377d1397/0xf100a0da/0x1799c911` 还没对到资源名。
- `0x60006` field name 已能从 `command_mapping.md` 对到；但部分字段名是资源层通用名，在飞行脚本上下文会承担不同用途，例如 `guard_move_speed` 在 `func_455/456` 中实际缩放 yaw/方向输入。
- slot `0x26/0x27` 在 `func_1044` 注册为 `0`，但 `func_463` 会选择它们；这里可能依赖引擎默认、后续动态覆盖，或反编译路径未覆盖，需要实机/更多调用链确认。

## 下一步

1. 对比 Unicorn / Sinanju 是否有同样 slot `0x17/0x18` 但 action 绑定为 0 或其它用途。
2. 继续追 slot `0x26/0x27` 为什么 registry 为 `0` 仍被 `func_463` 选择。
3. 将 `global143/global142/global87/global93/global122` 加进跨机体工作名表，但不改 `.c`。
