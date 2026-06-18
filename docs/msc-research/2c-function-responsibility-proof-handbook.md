# 2.c 函数职责证明手册：从 `func_N` 读到模组可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

结构化快照：

```text
lineCount: 29664
functionCount: 1047
actionFunctionCount: 21
sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
```

这页回答一个更实际的问题：

```text
我看到一个 func_N，怎么证明它是在 init、每帧状态读取、action dispatch、runtime driver、动作 segment、输出 syscall，还是 cleanup？
```

这比直接给函数起名更重要。`func_N`、line、offset 都可能随反编译变化；但一个函数的证据形状通常更稳定。

## 0. 先把 `2.c` 分成七层

读整份 `2.c` 时，不要从 `func_887/888` 或某条 syscall 开始。先把它放进七层流水线：

```text
1. entry / boot
   main -> func_1

2. unit initialization
   func_386 / func_877 / func_887 / func_1042

3. frame state read
   func_4 -> func_19/21/22/23/24/25

4. global gate
   func_11 / func_12 / func_13

5. action dispatch
   func_44 / func_51 / func_52

6. ACTION setup + runtime driver
   ACTION_* -> func_586/587 or func_488/489/502

7. segment output
   func_914/915/952/967/937/940 -> sys_4F/sys_51/sys_46/sys_53/sys_4B/sys_47
```

人话：

```text
func_1 不是主射。
func_4 不是一个动作。
func_44/52 不是弹体。
ACTION_* 往往也不是最终输出帧。
真正改参数，通常在 segment output 层。
```

## 1. 判定函数职责的五个问题

每次给 `func_N` 取工作名之前，先填这五个问题。

| 问题 | 证据形状 | 常见工作名 |
|---|---|---|
| 它从哪里被调用 | `main` 前后、`callFunc3`、`sys_2` callback、ACTION wrapper、function pointer | entry、init、loop、driver、segment |
| 它读什么 | `sys_0(0x10000)`、`0x90000`、`0xc000*`、`global87/172/200` | state reader、ammo check、gate reader |
| 它写什么 | `sys_1(0x10002,...)`、大量 `global = 0`、runtime callback global | registry、reset、runtime setup |
| 它输出什么 | `sys_4F`、`sys_51`、`sys_46`、`sys_53`、`sys_4B`、`sys_47` | weapon、assist、movement、camera、shell |
| 它是否复用 | 多个 ACTION 共用，还是只被一个 ACTION segment 用 | shared driver 或 action-local segment |

结论写法也要跟证据强度匹配：

```text
强结论: func_1043 是 action hash registry。
证据: 大量 func_241(hash, callback)，而 func_241 写 sys_1(0x10002, 0x2, hash, callback)。

谨慎结论: sys_46(0,...) 是动作局部 movement delta / steering 候选。
证据: 出现在 func_940 的方向横移段，但 native handler 还没拆完。
```

## 2. 证明 `func_1` 是 init，而不是动作函数

证据范围：

- `main`: `2.c:779-786`
- `func_1`: `2.c:789-841`

关键事实：

```text
main
  -> sys_2(... func_3/26/27)
  -> func_1()
  -> global0 |= 1
  -> callFunc3(func_4)
```

证明链：

| 证据 | 含义 |
|---|---|
| `func_1()` 在 `callFunc3(func_4)` 之前执行 | 它属于启动初始化，不是每帧动作逻辑 |
| `global1..19` 多个槽清零 | 清主循环和 action runtime 状态 |
| `func_61()`、`func_62()` | 初始化 gate / route 类基础状态 |
| `func_386()` | 大量 runtime global 清理，覆盖射击、格斗、移动相关缓存 |
| `sys_1(0x10002,0x2,hash,callback)` 少量写表 | 注册基础 fallback / 基础 action callback |
| `func_877()` | 进入机体专属 shell、resource、action 表初始化 |

可用工作名：

```text
func_1 = depiction_script_initializer
```

模组开发结论：

- 在 `func_1` 里找不到某个武装的完整性能，因为它只负责铺系统。
- 想知道机体动作从哪里开始，继续追 `func_877 -> func_1042 -> func_1043`。
- 想知道每帧怎么执行，追 `callFunc3(func_4)`。

## 3. 证明 `func_877` 是机体初始化枢纽

证据范围：

- `func_877`: `2.c:25407-25429`
- `func_887/888`: `2.c:25522-25572`
- `func_1042/1043`: `2.c:29405-29470`

`func_877` 的关键输出：

```text
sys_4B(0, 0xab9c3043)
global20 = sys_4B(0x1)
sys_4F(0xb, 0/1/2, resourceHash)
global170 = 0
func_887()
func_1042()
global1 = func_878
```

证明链：

| 证据 | 含义 |
|---|---|
| `sys_4B(0,0xab9c3043)` | 激活基础模型 / shell entry |
| `global20 = sys_4B(1)` | 保存 active shell id，后续 motion、骨骼、接触判断大量使用 |
| `sys_4F(0xb,slot,hash)` | 初始化武装 / resource slot 候选 |
| `global170 = 0 -> func_887()` | 应用默认外观组 / loadout |
| `func_1042()` | 注册 action、slot callback、stance resource、extra resource |
| `global1 = func_878` | 安装每帧 shell / depiction 维护 callback |

可用工作名：

```text
func_877 = init_unit_shell_resources_and_action_tables
```

`func_887/888` 的边界：

```text
func_887 = default shell loadout selector
func_888 = shell loadout dispatcher
```

它们不是 action dispatch 入口。它们只是机体初始化和动作 segment 会调用的 shell 输出层。

## 4. 证明 `func_1043` 是 action registry

证据范围：

- `func_1042`: `2.c:29405-29410`
- `func_1043`: `2.c:29413-29470`
- `func_241`: `2.c:6225-6240`

`func_1042` 只是 coordinator：

```text
func_1042
  -> func_1043()
  -> func_1044()
  -> func_1045()
  -> func_1046()
```

`func_1043` 的证据形状：

```text
func_241(0xf48d2d49, ACTION_A_SHOT)
func_241(0x31f61d6c, ACTION_AB_SUB)
func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL)
func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE)
func_241(0x178d1109, ACTION_B_MELEE)
func_241(0x8ae55bb1, ACTION_ABC_FINAL_ATTACK)
```

`func_241` 的工作：

```text
sys_1(0x10002, 0x2, actionHash, callback)
```

证明链：

| 证据 | 含义 |
|---|---|
| 大量 `func_241(hash, callback)` | 它不是动作逻辑，是字典注册 |
| hash 覆盖射击、副射、特射、特格、近战、觉醒技 | 这是 action 层，不是单一武装层 |
| `func_241` 写 `sys_1(0x10002,0x2,...)` | 注册到 engine / VM action callback table |

可用工作名：

```text
func_1043 = register_action_hash_callbacks
func_241 = bind_action_hash_callback
```

模组开发结论：

- 找动作入口时先看 `func_1043`。
- `0xf48d2d49` 这类 hash 不是原始按钮，而是上游 action selector 给 `2.c` 的动作 key。
- 换样本后不要死记 `func_1043` 编号，要找“大量 `func_241(hash,callback)`”这个 shape。

## 5. 证明 `func_4` 是每帧 action loop

证据范围：

- `func_4`: `2.c:873-1002`

它的调用顺序：

```text
func_19()
func_879()
func_5()
func_11()
func_12()
func_13()
func_273()
func_51()
func_44()
func_880()
func_264()
```

证明链：

| 证据 | 含义 |
|---|---|
| 被 `main` 用 `callFunc3(func_4)` 安装 | 后续持续执行 |
| 前段读 `sys_0(0x10000,...)` | 每帧读取 engine / upstream action state |
| 中段调用 `func_11/12/13` | 更新 boost、cancel、interrupt gate |
| 后段调用 `func_51/44` | commit secondary / primary action |
| 末段 `func_880/264` | 帧尾维护 |

可用工作名：

```text
func_4 = main_action_update_loop
```

模组开发结论：

- `func_4` 是交通枢纽，不是主射、BD 或格斗参数。
- 改某个动作时，不要在 `func_4` 里改常量；从 `func_1043` 找目标 ACTION，再追 segment。

## 6. 证明 `func_11` 是 boost / cancel gate

证据范围：

- `func_11`: `2.c:1325-1516`
- OverBoost wiki 系统页关于 BD、step、boost、overheat 的玩家语义

玩家语义压缩：

- BD 是跳键二连，可取消大量射击 / 格斗，并消耗 boost。
- step 是同方向二连，消耗 boost，并切诱导和枪口修正。
- boost 耗尽会进入 overheat，落地硬直明显变长。

`2.c` 里不是 raw 输入层。`func_11` 读的是已经整理好的状态：

```text
global23/43/45/46/54
global11/global24/global33
sys_0(0xc0001)
sys_0(0xc0003)
sys_0(0xc0005)
sys_0(0xc000c)
sys_0(0x6000e, hash)
```

证明链：

| 证据 | 含义 |
|---|---|
| `global23 == 0` 分支决定是否进入 | gate enter |
| `global43 = 1` | gate enter edge |
| `global23 = 1/2` | gate active state |
| `sys_0(0xc0001)` 控制维持 | gate continuation |
| `global45 = 1` | gate exit edge |
| `sys_52/sys_4C/sys_4F/sys_55/sys_56` 混合输出 | gate 会影响移动、武装、表现状态 |

可用工作名：

```text
func_11 = update_boost_cancel_gate
```

模组开发结论：

- 改全局 BD cancel / overheat 边界，研究 `func_11`。
- 改普通 BD 速度，优先看 `speed_param`。
- 改某一招横移距离，优先看该 ACTION segment 的 `sys_46`。

## 7. 证明 `func_44/52` 是 action dispatch

证据范围：

- `func_44`: `2.c:2615-2668`
- `func_51`: `2.c:2724-2763`
- `func_52`: `2.c:2765-2830`

primary channel：

```text
global7 = global3
global3 = global5
sys_46(0x1, channel, 0, 0, 0)
var1 = sys_0(0x10002, 0x2, global3)
sys_2(0, 0x2, var1)
```

secondary channel：

```text
global8 = global4
global4 = global6
global172 = global87 & 0x3c
var5 = sys_0(0x10002, 0x2, global4)
sys_2(0, 0x3, var5)
```

证明链：

| 证据 | 含义 |
|---|---|
| `global5/global6` 被 commit 到 `global3/global4` | pending action 变 active action |
| `sys_0(0x10002,0x2,activeHash)` | 从 registry 查 callback |
| `sys_2(0,channel,callback)` | 调度 callback |
| action 切换时清一批 global 和 `sys_46(0x1,...)` | 清 action runtime / movement channel |

可用工作名：

```text
func_44 = dispatch_primary_action
func_51 = advance_secondary_action_channel
func_52 = dispatch_secondary_action
```

模组开发结论：

- `func_44` 的 `sys_46(0x1,...)` 是切动作清场，不是具体动作位移。
- 真正动作参数在被调度出来的 `ACTION_*` 和它后面的 segment。

## 8. 证明 ACTION 函数多半只是 setup

### 主射例子

证据范围：

- `ACTION_A_SHOT`: `2.c:25765-25782`
- `func_913/914/915`: `2.c:25785-25845`

链路：

```text
ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)

func_913
  -> func_587()

func_915
  -> sys_4F(0, 0, 0xcc9f6df0)
```

证明链：

| 证据 | 含义 |
|---|---|
| `ACTION_A_SHOT` 写 `global677/global680/global681` | 安装 ranged runtime callback 和 ammo slot |
| `func_913` 只进入 `func_587` | wrapper / driver 入口 |
| `func_915` 输出 `sys_4F(0,slot,weaponHash)` | 脚本侧发射请求候选 |

可用工作名：

```text
ACTION_A_SHOT = setup_main_shot_runtime
func_914 = main_shot_startup_segment
func_915 = main_shot_fire_segment
```

Notion 对照：

| 调用 | 读法 |
|---|---|
| `sys_0(0x90000,slot,0)` | 检查 weapon slot / ammo |
| `sys_4F(0,slot,hash)` | 发射 / weapon request |
| `sys_4F(0x7,slot,1)` | 主动扣弹 |

模组开发结论：

- 换主射弹种，先看 `func_915` 的 `sys_4F(0,0,hash)`。
- 改 ammo slot，必须同步 `ACTION_A_SHOT`、`func_914/915` 里的 slot。
- 不要改 `func_586` 来换弹；它是 ranged runtime reset。

## 9. 证明援护分支要从方向位读

证据范围：

- `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL`: `2.c:26957-26976`
- `func_952`: `2.c:26984-27020`

链路：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_488()
  -> global609 = func_952
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> func_502()

func_952
  -> func_309(global20, 0x1f4)
  -> if global200:
       sys_51(..., 0, 5)
       sys_51(..., 1, 6)
     else:
       sys_51(..., 0, 2)
       sys_51(..., 1, 4)
  -> sys_4F(0x7, 2, 1)
```

证明链：

| 证据 | 含义 |
|---|---|
| `global87 & 0x3c` | 是否有方向输入 |
| `global200` | 动作内方向分支 flag |
| `sys_51(...,index,type)` | 援护召唤 |
| `sys_4F(0x7,2,1)` | 扣 slot 2 弹 |

Notion 方向位：

| 位 | 方向候选 |
|---|---|
| `0x4` | 前 |
| `0x8` | 后 |
| `0x10` | 左 |
| `0x20` | 右 |

可用工作名：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL = setup_directional_special_shot_assist
func_952 = special_shot_assist_spawn_segment
```

模组开发结论：

- 改 N 特射和方向特射援护 type，改 `func_952` 的两组 `sys_51`。
- 改扣弹槽，改 `sys_4F(0x7,2,1)` 之前要确认 HUD / reload slot。

## 10. 证明格斗派生窗口来自 `func_536 + func_239`

证据范围：

- `ACTION_B_MELEE`: `2.c:27343-27348`
- `func_966/967`: `2.c:27356-27421`
- `func_532/535/536`: `2.c:14064-14150`
- `func_239`: `2.c:6002-6210`

N 格链路：

```text
ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> func_489()

func_967
  -> func_532(0x2, 0xd, 0x58)
  -> func_535(0x1, 0xa)
  -> func_536(0x1, 0xf, func_968)
  -> func_536(0x20, 0xf, func_980)
  -> func_536(0x4, 0xf, func_1007)
```

`func_536` 的证据形状：

```text
global140 |= mask
global414/415, 406/407, ... = time * 0x64 / callback
```

`func_239` 的证据形状：

```text
等待 sys_47(0, activeShell) 进入 global401/global402 时间窗
读取 global49/global92/global87 输入
根据 global140 mask 选 callback
global430 = selected callback
```

证明链：

| 证据 | 含义 |
|---|---|
| `func_535(start,end)` 写 `global401/402` | 派生有效时间窗 |
| `func_536(mask,time,callback)` 写 mask、时间、callback | 注册派生候选 |
| `func_239` 消费输入和 mask，写 `global430` | 执行派生选择 |

可用工作名：

```text
func_535 = set_branch_window_range
func_536 = register_branch_callback
func_239 = resolve_branch_input_window
```

模组开发结论：

- 改派生开放时间，先改 `func_536(mask,time,callback)` 的 `time`。
- 改派生窗口范围，先改 `func_535(start,end)`。
- 改派生方向，先看 mask 与 `global87` 方向位的对应。
- 不要先改 `func_239`，它是通用派生消费器。

## 11. 证明特格横移是动作 segment，不是全局 BD

证据范围：

- `ACTION_BC_SPECIAL_MELEE`: `2.c:26586-26599`
- `func_939/940`: `2.c:26602-26726`
- `func_502`: `2.c:13212-13469`

链路：

```text
ACTION_BC_SPECIAL_MELEE
  -> func_488()
  -> global609 = func_940
  -> global452/453/454 = local movement defaults
  -> func_502()

func_940
  -> if global172 & 0x20 / 0x10:
       compute lateral value
       sys_46(0, global265)
  -> later:
       sys_46(0x1, 0x4, 0, 0, 0)
       sys_46(0x2, 0x3, 0, var0, 0xc8)
       sys_46(0x1, 0x1, 0, var0, 0x12c)
```

证明链：

| 证据 | 含义 |
|---|---|
| `ACTION_BC_SPECIAL_MELEE` 写 `global609 = func_940` | `func_940` 是这个动作的 segment |
| `func_940` 读 `global172 & 0x10/0x20` | 左右方向分支 |
| `sys_46(0,global265)` 在方向分支内 | 动作局部横移 / steering 输出候选 |
| `func_502` 被 special movement 共用 | driver，不是某一招参数 |

可用工作名：

```text
ACTION_BC_SPECIAL_MELEE = setup_bc_special_movement
func_502 = special_movement_phase_driver
func_940 = bc_special_directional_movement_segment
```

模组开发结论：

- 改特格左右横移，先看 `func_940` 的 `0x28 / 0xffffffd8 / 0xa / 0xfffffff6` 和 `global204`。
- 改普通 BD，不要改 `func_940`；去 `speed_param`。
- 改全局 cancel gate，不要改 `func_940`；去 `func_11`。

## 12. 证明镜头要同时找启用和清理

证据范围：

- `func_937`: `2.c:26520-26584`
- `func_321` 现有文档记录为 `sys_53(0x4,hash,0x4650)` wrapper
- Notion `sys_53` 记录

关键形状：

```text
if (func_544() && global36 == 0 && global241 == 0)
{
    global241 = 1;
    func_321(0x651e4f06);
}
```

Notion 对照：

| 调用 | 读法 |
|---|---|
| `sys_53(0x4,hash,...)` | camera preset |
| `sys_53(0x5)` | camera cleanup candidate |
| `sys_53(0,...)` | screen shake |
| `sys_53(0x2,...)` | camera zoom candidate |

证明链：

| 证据 | 含义 |
|---|---|
| camera hash 出现在 segment 条件内 | 动作局部镜头 |
| `global241` 防止重复触发 | 单次演出 gate |
| 需要另找 `sys_53(0x5)` | 镜头清理路径 |

模组开发结论：

- 换镜头 hash 前，先确认触发条件。
- 改镜头一定要测命中、空挥、被打断、BD cancel、死亡复归。
- 找不到清理路径时，不要只改启用点。

## 13. 普通 BD / step 与动作移动要分开

OverBoost wiki 的系统页把 BD、step、boost gauge、overheat 分成基础系统；这和 `2.c` 的层次一致。

当前证据支持这样分：

| 玩家目标 | 首选入口 | 当前证据 |
|---|---|---|
| 普通 BD 更快 / 更远 | `docs/command_mapping.md` 的 `speed_param` | `boost_dash_initial_speed`、`boost_dash_sustained_speed`、`boost_dash_distance`、`boost_dash_duration_frame` |
| step 更远 / 硬直更少 | `speed_param` | `step_distance`、`step_speed`、`step_recovery_frame`、`step_cancel_frame` |
| overheat / 落地硬直 | `speed_param` + native gate | `landing_recovery_frame`、`func_11` 的 `0xc000*` gate |
| 某个特格横移 | ACTION segment | `func_940 -> sys_46(0,global265)` |
| 某个格斗派生窗口 | segment + branch helper | `func_535/536 + func_239` |

这条边界很关键：

```text
基础机动力看资源表。
单个动作手感看 ACTION segment。
全局 cancel / overheat 边界看 func_11 和 native。
```

## 14. 动态命名：把证据写进 overlay，而不是写死 `func_N`

不要写：

```json
{
  "func_940": "special_movement"
}
```

应该写：

```json
{
  "semanticId": "action.bcSpecialMelee.directionalMovementSegment",
  "currentSymbol": "func_940",
  "confidence": "high",
  "shape": {
    "registeredBy": "func_1043 -> func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE)",
    "setupWrites": ["global609 = func_940", "global452/453/454"],
    "runtimeDriver": "func_502",
    "directionReads": ["global172 & 0x10", "global172 & 0x20"],
    "movementOutputs": ["sys_46(0,...)", "sys_46(0x1,...)", "sys_46(0x2,...)"]
  }
}
```

对 `func_1` 也是一样：

```json
{
  "semanticId": "depiction.initializer",
  "currentSymbol": "func_1",
  "confidence": "high",
  "shape": {
    "calledFrom": "main before callFunc3(func_4)",
    "clearsGlobals": true,
    "calls": ["func_386", "func_272", "func_877"],
    "registersBaseActions": true
  }
}
```

换样本时重新匹配 shape，不靠当前编号。

## 15. 逆向者实际改动前的证明表

每次准备 patch 前，先填这张表：

```text
玩家目标:
游戏语义:
  BD / step / 射击 / 援护 / 格斗 / 特格 / 镜头 / shell:

入口证据:
  action hash:
  registry line:
  ACTION callback:

dispatch 证据:
  primary or secondary channel:
  active hash global:
  sys_0(0x10002) lookup:

runtime 证据:
  reset helper:
  driver:
  segment callback:

输出证据:
  motion:
  weapon:
  ammo:
  assist:
  movement:
  camera:
  shell:

cleanup 证据:
  movement reset:
  camera cleanup:
  shell restore:
  route/cancel close:

改动点:
  exact constant / hash / callback:
  why this level:

验证:
  ground:
  air:
  overheat:
  hit:
  whiff:
  interrupted:
  BD cancel:
  step cancel:
  death / respawn:
```

这张表填不完，说明还没有真正追到可改点。

## 16. 当前还不能证明的边界

当前 `2.c` 已经足够证明：

- `func_1` 是初始化，不是动作。
- `func_1043/241` 是 action hash registry。
- `func_44/52` 是 action dispatch。
- 主射、援护、N 格、特格横移能从 action hash 追到 segment output。
- Notion 中的 `sys_4F/sys_51/sys_53/sys_4B/sys_47` 经验能落到当前样本具体调用点。

当前还不能只靠 `2.c` 最终证明：

- raw A/B/C/跳键如何在所有状态下变成某个 action hash。
- `sys_46` 每个 subcmd 的 native 参数名。
- `0xc000*` 每个槽的真实 native 来源。
- 普通 BD 消耗公式和 overheat 惩罚完整公式。
- damage、down value、proration、hitbox 的完整资源路径。

这些不是文档失败，而是下一层证据边界。后续要继续拆 `0.c`、`1.c`、native handler、resource 表和第二个机体样本。

## 17. 来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- 结构化快照：[generated/0xBDBE6FEA-2.analysis.json](./generated/0xBDBE6FEA-2.analysis.json)
- 动态命名方案：[dynamic-naming-overlay.md](./dynamic-naming-overlay.md)
- BD / movement 工作簿：[movement-bd-modding-workbook.md](./movement-bd-modding-workbook.md)
- `speed_param` 字段：[command_mapping.md](../command_mapping.md)
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- 项目输入链文档：[exvs-msc-input-action-weapon-pipeline.md](../exvs-msc-input-action-weapon-pipeline.md)
