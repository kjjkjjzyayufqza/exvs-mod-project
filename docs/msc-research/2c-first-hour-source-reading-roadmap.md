# 逆向者第一小时：打开 `2.c` 后怎么读到可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前分析快照：

```text
lineCount: 29664
functionCount: 1047
sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
```

这页的目标是把“人话读法”放在最前面：不是先问 `func_887` 是不是换装，也不是先背 syscall 表，而是拿着一份 2.c 能自己追出：

```text
func_1 初始化了什么
func_4 每帧怎么跑
玩家动作怎么变成 ACTION_*
射击、格斗、移动、BD、镜头、shell 分别在哪里控制
哪些点适合改，哪些点只是调度或清场
```

行号只是当前快照里的导航坐标。后续文件重新反编译、函数编号或 offset 变化时，命名必须靠“调用形状 + syscalls + global 家族 + registry 证据”，不能靠行号。

## 0. 先别做的事

打开 `2.c` 后最容易走偏的三件事：

| 错误开局 | 为什么会错 | 更稳的开局 |
|---|---|---|
| 从 `func_887/888` 开始，以为它们就是系统入口 | 它们只是 shell loadout 分发，在 `func_877` 和动作段里被调用 | 先看 `main -> func_1 -> func_877 -> func_1042` |
| 搜一个 syscall，比如 `sys_46`，然后给它直接起最终名 | `sys_46` 是移动控制总线，子命令和上下文都不同 | 先确定它属于 action commit、runtime 初始化，还是具体动作段 |
| 把 action hash 当成按钮 | `2.c` 消费的是上游已经解析好的 action hash，不直接判定 raw A/B/C 输入 | 先看 `func_1043` 注册表，再看 `func_44/52` dispatch |

第一小时只做一件事：把你想改的目标放到正确层级。

## 1. 六层读法

把 1,047 个函数压成六层：

```text
Layer A: VM / engine callback 入口
  main

Layer B: 初始化
  func_1
  func_386 / func_272 / func_877 / func_1042

Layer C: 每帧状态读取和 action commit
  func_4
  func_19..25
  func_11
  func_44 / func_51 / func_52

Layer D: action registry
  func_1043
  func_241

Layer E: ACTION_* runtime setup
  ACTION_A_SHOT
  ACTION_B_MELEE
  ACTION_BC_SPECIAL_MELEE
  ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  ...

Layer F: 动作段 callback 和最终输出
  ranged: func_586 / func_587 / func_593 / global676..681
  melee:  func_488 / func_489 / func_502 / global602/608/609/610
  output: sys_4F / sys_51 / sys_46 / sys_53 / sys_4B / sys_47 / sys_4A / sys_58
```

读任何函数时，先给它贴一个层级。层级错了，命名和改动点都会错。

## 2. 怎么证明 `func_1` 是初始化

当前锚点：

```text
main:   2.c:779
func_1: 2.c:789
func_4: 2.c:873
```

`main` 的形状：

```text
sys_2(... func_3)
sys_2(... func_26)
sys_2(... func_27)
func_1()
callFunc3(func_4)
```

这个形状已经说明：

- `func_1` 在主循环前执行。
- `func_4` 是后续主 action update loop。
- `func_3/26/27` 是被 engine / VM 调度的 callback。

再看 `func_1` 的副作用：

| 证据 | 人话 | 初始化系统 |
|---|---|---|
| 清 `global1..19` | 把顶层 callback、action candidate、route state 清成默认 | 主循环状态 |
| `func_61()` / `func_62()` | 写 gate / cancel 默认状态 | 动作门控 |
| `func_386()` | 清大量 runtime global | 射击、格斗、移动、shell、状态缓存 |
| `func_272()` | 初始化另一组辅助状态 | 外部状态 / 资源侧状态 |
| `sys_1(0x10002,0x2,hash,func)` | 写 action callback 表 | 基础 action handler |
| `func_835()` / `func_836()` / `func_18()` | 写资源 hash / 表现组 | 资源注册 |
| `sys_47(...)` / `sys_50(...)` | 写表现参数 | 初始 model / depiction 状态 |
| `func_877()` | 进入本机体 shell、武装、action 表初始化 | depiction 主初始化 |

所以 `func_1` 的工作名应该是：

```text
init_depiction_script_runtime
```

不要把它命名成主射初始化、格斗初始化或换装初始化。它的范围比这些都大。

## 3. `func_877` 才是本机体系统铺设

当前锚点：

```text
func_877: 2.c:25407
func_887: 2.c:25522
func_888: 2.c:25534
func_1042: 2.c:29405
func_1043: 2.c:29413
```

`func_877` 的读法：

```text
func_877
  -> sys_4B(0, baseShellHash)
  -> global20 = sys_4B(1)
  -> global142 = resourceGroupHash
  -> sys_4F(0xb, slot, hash)
  -> global170 = 0
  -> func_887()
  -> func_1042()
  -> global1 = func_878
```

它做了三件事：

1. 激活 active shell：`sys_4B(0,...)` 和 `global20=sys_4B(1)`。
2. 应用默认外观 / loadout：`global170=0 -> func_887 -> func_888(0)`。
3. 注册动作和资源表：`func_1042 -> func_1043/1044/1045/1046`。

所以更稳的工作名是：

```text
init_unit_shell_resource_and_action_tables
```

`func_887/888` 要放在这里理解：

```text
func_887 = select_default_shell_loadout_from_global170
func_888 = dispatch_shell_loadout_mode
```

它们不是主流程入口。它们是外观 / 组件系统被启动和动作段调用时的下游分发。

## 4. 每帧主循环怎么读

当前锚点：

```text
func_4:  2.c:873
func_11: 2.c:1325
func_21: 2.c:1767
func_24: 2.c:1865
func_25: 2.c:1872
func_44: 2.c:2615
func_52: 2.c:2765
```

`func_4` 不适合逐行硬读。按流水线读：

```text
func_4
  -> func_19 / func_20
       -> func_21 读方向、action mask、状态位
       -> func_22 读 weapon slot / ammo-like 状态
       -> func_23 读 depiction / gauge 状态
       -> func_24 读 primary action candidate 到 global5
       -> func_25 读 secondary action candidate 到 global6

  -> func_879
       -> 每帧 shell / depiction 维护

  -> func_5
       -> action queue / pending action 选择

  -> func_11 / func_12 / func_13 / func_273
       -> boost gate、cancel gate、强制中断、外部状态

  -> func_51 / func_52
       -> secondary action commit

  -> func_44
       -> primary action commit

  -> func_880 / func_264
       -> 帧尾维护
```

这里最重要的认知：

```text
2.c 不直接读 raw 按键。
2.c 读 sys_0(0x10000,...) 和 sys_0(0xc000*)，消费 engine / 上游脚本已经整理好的 action、方向、boost、gate 状态。
```

因此你想理解“玩家按 A 为什么进主射”，不能只看 `2.c`。`2.c` 能证明的是：

```text
上游给了 action hash
2.c 查注册表
2.c 调度对应 ACTION_* callback
```

## 5. action hash 怎么变成 `ACTION_*`

当前锚点：

```text
func_1043: 2.c:29413
func_241:  2.c:6225
func_44:   2.c:2615
func_52:   2.c:2765
```

注册端：

```text
func_1043
  -> func_241(actionHash, ACTION_*)

func_241(hash, callback)
  -> sys_1(0x10002, 0x2, hash, callback)
```

执行端：

```text
func_44 / func_52
  -> activeActionHash = candidate
  -> callback = sys_0(0x10002, 0x2, activeActionHash)
  -> sys_2(0, channel, callback)
```

所以 `func_1043` 和 `func_44/52` 是一组：

```text
func_1043 负责写表。
func_44/52 负责查表并调度。
ACTION_* 是被表调出来的动作入口。
```

当前样本的核心 ACTION 锚点：

| 玩家侧语义 | action callback | 行号 | 入口形态 |
|---|---|---:|---|
| 主射 | `ACTION_A_SHOT` | 25765 | ranged runtime |
| 主射状态 0 | `ACTION_A_SHOT_STATE_0` | 25850 | ranged runtime |
| 蓄力 / 换锁分支 | `ACTION_CHARGE_SHOT_LOCK_SWITCH` | 25910 | charge / lock switch |
| 副射 | `ACTION_AB_SUB` | 26257 | ranged runtime |
| 方向副射 | `ACTION_AB_SUB_DIRECTIONAL` | 26368 | ranged runtime |
| 特格 alt | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 26424 | melee runtime + shell |
| 特格 | `ACTION_BC_SPECIAL_MELEE` | 26586 | special movement runtime |
| 方向特射 / 援护 | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 26957 | special movement + assist |
| 觉醒技 | `ACTION_ABC_FINAL_ATTACK` | 27023 | final attack |
| N 格 | `ACTION_B_MELEE` | 27343 | melee runtime |
| 方向格斗 | `ACTION_B_MELEE_DIR_1/2/4` | 27539 / 27702 / 27929 | melee variants |

## 6. `ACTION_*` 通常不是最终行为

动作入口常见形态：

```text
ACTION_*
  -> reset runtime
  -> 写 callback global
  -> 写 ammo slot / movement row / shell state / route flag
  -> callFunc3(driverWrapper)
```

这意味着：

```text
ACTION_A_SHOT 不是实际发射帧。
ACTION_B_MELEE 不是实际 hitbox / 判定帧。
ACTION_BC_SPECIAL_MELEE 不是全部特格移动逻辑。
```

真正输出通常在后续 segment callback：

| 目标 | 看 setup | 看 driver | 看输出 |
|---|---|---|---|
| 射击 | `func_586`、`global676..681` | `func_587` / `func_593` | `sys_4F(0,slot,hash)`、`sys_4F(0x7,slot,1)` |
| 援护 | `func_488`、`global609` | `func_502` | `sys_51(0x20000,0,0x2,index,type)` |
| 普通格斗 | `func_488`、`func_219(row)`、`global602` | `func_489` | `func_308`、`func_532/535/536`、`sys_46` |
| 特殊移动 | `func_488`、`global608/609/610` | `func_502` | `sys_46`、`func_532/535/536` |
| 镜头 | segment callback | 时间线 `func_309` | `func_321` / `sys_53(0x4)` 与 `sys_53(0x5)` |
| shell | `global170/global143` | `func_887/888` | `sys_4B` / `sys_47` |

## 7. 射击链怎么追

主射的最短路径：

```text
func_1043
  -> func_241(0xf48d2d49, ACTION_A_SHOT)

func_44 / func_52
  -> active action hash == 0xf48d2d49
  -> dispatch ACTION_A_SHOT

ACTION_A_SHOT
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> callFunc3(func_913)

func_913
  -> func_587()

func_914
  -> 起手 motion / ammo check / cancel mask

func_915
  -> sys_4F(0, 0, weaponHash)
  -> func_123(cancelMask)
```

Notion MSC 页的经验要放在这里：

- `sys_4F(0, slot, hash)` 是射击 / weapon request。
- `sys_4F(0x7, slot, 1)` 是主动扣弹。
- `sys_0(0x90000, slot, 0)` 是 weapon slot / ammo 可用检查。

改主射时不要只改一个 hash。至少记录：

```text
action hash
ACTION callback
ammo slot
startup motion
fire segment
weapon hash
active ammo decrement
cancel mask
shell restore path
```

## 8. 格斗链怎么追

N 格的最短路径：

```text
func_1043
  -> func_241(0x178d1109, ACTION_B_MELEE)

ACTION_B_MELEE
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> callFunc3(func_965)

func_965
  -> func_489()

func_489
  -> global184 phase driver
  -> func_490 初始化移动 baseline
  -> func_71(global602)

func_966
  -> func_308(... motion ...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967
  -> func_308(... next motion ...)
  -> func_532(...)
  -> func_535(...)
  -> func_536(mask,time,callback)
  -> func_123(...)
```

格斗相关函数的读法：

| 符号 | 人话 | 改动意义 |
|---|---|---|
| `func_488` | 清 melee / special runtime | 通常不直接改 |
| `func_219(row)` | 读动作移动参数 row | 改追踪 / 突进优先看 |
| `func_489` | 普通格斗 runtime driver | 跨多个格斗动作，改动影响面大 |
| `func_532` | 接近 / 命中 / 前进惯性候选 | 改贴近和命中后位置感 |
| `func_535` | branch window 参数候选 | 和 `func_536` 成组看 |
| `func_536(mask,time,callback)` | 派生 / 输入窗口登记 | 改派生时机 |
| `func_123(mask)` | cancel route mask | 改能否取消 |

当前还不要把 `func_532/535/536` 直接命名成最终 hitbox / damage。它们更像“格斗接触和派生窗口 helper”，damage / down value 还要继续追资源和 native handler。

## 9. BD、step、boost 和移动怎么分层

OverBoost wiki 的玩家侧语义：

- BD：跳键二连，高速移动，能取消多数射击 / 格斗，会消耗 boost。
- step：同方向摇杆二连，用来切诱导和枪口修正。
- overheat：boost 用尽后进入 OH，落地硬直最长，部分武装或特殊移动会受限。
- BR ズンダ：射击后用 BD 取消，再射击，形成 `BR >> BR >> BR` 这类基础流程。

`2.c` 的脚本侧语义：

```text
raw input / BD 二连 / step 二连 / boost gauge
  -> engine / 上游脚本
  -> sys_0(0x10000,...) 与 sys_0(0xc000*) 暴露给 2.c
  -> func_11 更新 boost/cancel gate
  -> func_44/52 提交 action hash
  -> ACTION segment 用 sys_46 / func_532 控动作内移动
```

所以：

| 你要改 | 先看哪里 | 不要先看哪里 |
|---|---|---|
| 普通 BD 燃费 / 基础速度 | native / resource / `speed_param` | 某一条动作段 `sys_46` |
| 某动作能不能 BD cancel | `func_123(mask)`、route、`func_11` gate | `func_887/888` |
| 特格横移距离 | `ACTION_BC_SPECIAL_MELEE -> func_940` | `func_44` 清场 |
| 格斗突进追踪 | `ACTION_B_MELEE -> func_219(row) -> func_489 -> func_532` | 全局改 `func_11` |
| overheat 下是否能用武装 | `sys_0(0xc000*)` gate、`sys_0(0x90000)`、action availability | 只看 weapon hash |

`sys_46` 的位置：

```text
动作切换清场: func_44 中的 sys_46(0x1,channel,0,0,0)
速度倍率包装: func_298..302 -> sys_46(0x3,...)
格斗移动 runtime: func_489/490
特殊移动 runtime: func_502/503/504
具体特格位移: func_937 / func_940
```

详细参数看 [sys_46 脚本侧参数地图](./sys46-script-parameter-atlas.md)。

## 10. 镜头怎么追

镜头不要只找 `sys_53`，要找启用点和清理点。

常见形状：

```text
func_321(cameraHash)
  -> sys_53(0x4, cameraHash, 0x4650)

sys_53(0x5)
  -> clear camera preset candidate
```

读法：

| 问题 | 查什么 |
|---|---|
| 这招什么时候进镜头 | segment callback 内的 `func_309(global20,time)` 后是否调用 `func_321` |
| 镜头 hash 是什么 | `func_321(hash)` 或 `sys_53(0x4,hash,...)` |
| 被打断会不会残留 | action cancel / hit / whiff / end path 是否调用 `sys_53(0x5)` |
| 画面震动或缩放 | Notion 记录中的 `sys_53(0,...)`、`sys_53(0x2,...)` 模式 |

模组规则：

```text
加镜头必须同时找清理路径。
只验证命中不够，还要测空挥、BD cancel、被打断、死亡复归。
```

## 11. shell / 换装 / 组件怎么追

基础链：

```text
func_877
  -> global170 = 0
  -> func_887()

func_887
  -> global170 == 0 ? func_888(0) : func_888(1)

func_888(mode)
  -> mode 0..6: 不同 loadout helper
  -> mode 7: func_1037 enter alternate shell mode
  -> mode 8: func_1038 return base shell mode
```

关键变量：

| 符号 | 工作名 | 证据 |
|---|---|---|
| `global20` | active shell entry id | `global20 = sys_4B(1)`，大量传给 motion / `sys_47` |
| `global170` | stance resource group selector | 影响 `func_887`，也影响 `func_79` 取资源组 |
| `global143` | alternate shell mode flag | `func_1037` 置 1，`func_1038` 置 0 |

Notion MSC 页的经验：

- `sys_4B(0x2, modelHash, boneIndex, actionHash, targetModel)`：把模型接到模型 / bone。
- `sys_4B(0x3)`：解除装备 / detach。
- `sys_47(0x10/0x11/0x12, model,bone,x,y,z)`：rotate / translate / scale。

改 shell 时必须找：

```text
进入点
持续维护点
动作结束恢复点
取消 / 被打断恢复点
死亡复归或回默认形态点
```

## 12. 一个函数拿到手时怎么判层级

给任何 `func_N` 做这张小表：

```text
函数名:
谁直接调用它:
它是否只在 init 链里出现:
它是否被 action registry 绑定:
它是否被 global function pointer 调用:
它写哪些 global:
它读哪些 sys_0 状态槽:
它写哪些 sys_1 注册表:
它输出哪些 syscall:
它是否调用 func_308 / func_309:
它是否调用 func_123 / func_532 / func_536:
它的工作名:
置信度:
跨样本识别 shape:
```

判断规则：

| 形状 | 层级 | 工作名风格 |
|---|---|---|
| 只从 `main/func_1/func_877` 进入，大量清 global / 写注册表 | 初始化 | `init_*` / `register_*` |
| 每帧早期调用，密集 `sys_0(0x10000/0xc000*)` | 状态读取 / gate | `read_*` / `update_*_gate` |
| `sys_0(0x10002,0x2,hash)` 后 `sys_2` | action dispatch | `dispatch_*_action_hash` |
| `func_241(hash, callback)` 大量出现 | registry | `register_action_hash_handlers` |
| 只写 `global676..681` 或 `global602/609/610` | runtime setup | `setup_*_runtime` |
| 有 `func_309` 时间点和 `sys_4F/sys_46/sys_53` | 动作段 | `*_segment` / `*_fire_segment` / `*_movement_segment` |
| 有 `global170/global143/sys_4B/sys_47` | shell / model | `*_shell_*` |

## 13. 第一小时实际路线

如果目标是“我要改某个动作”，照这个顺序走：

1. 先打开 `func_1043`。
   - 找 action hash 和 `ACTION_*` callback。
   - 如果不知道 hash，先按 `ACTION_*` 名字和当前语义表找候选。

2. 打开对应 `ACTION_*`。
   - 判断它是 ranged runtime 还是 melee / special runtime。
   - 记录它写了哪些 callback global。

3. 顺着 driver 找 segment。
   - ranged 看 `func_587/593`。
   - melee 看 `func_489`。
   - special movement 看 `func_502`。

4. 在 segment 里找真正输出。
   - 发射：`sys_4F`。
   - 援护：`sys_51`。
   - 移动：`sys_46`、`func_532/535/536`。
   - 镜头：`func_321` / `sys_53`。
   - shell：`func_887/888`、`sys_4B/sys_47`。

5. 找恢复和取消路径。
   - `func_123(mask)`。
   - `func_125(mask)`。
   - `sys_53(0x5)`。
   - `func_887()` 或 `func_888(0x8)`。
   - `global252` / `func_91()` / motion end branches。

6. 写 overlay，不写死行号。
   - 记录 action hash、callback、syscall shape、global family、motion hash。
   - line 只做当前样本导航。

## 14. 最小模组审计表

每次改动前，先填这个表：

| 项 | 记录 |
|---|---|
| 玩家目标 | 例如：特格横移距离变大 |
| action hash | 例如：`0x193fe550` |
| ACTION callback | 例如：`ACTION_BC_SPECIAL_MELEE` |
| action channel | primary / secondary |
| runtime family | ranged / melee / special movement |
| segment callback | 例如：`func_940` |
| motion hash | `func_308` / `func_79` 使用的 hash |
| weapon / assist | `sys_4F` / `sys_51` |
| movement | `sys_46` / `func_532/535/536` |
| camera | `func_321` / `sys_53` |
| shell | `func_887/888` / `sys_4B/sys_47` |
| cancel | `func_123` / `func_125` |
| ammo slot | `global681` 或 action 自己写的 slot |
| cleanup | shell / camera / state 恢复路径 |
| 测试场景 | 地上、空中、OH、命中、空挥、被打断、BD cancel、step、死亡复归 |

这个表填不完，说明还没定位到真正可改点。

## 15. 当前不能靠 `2.c` 单独完成的证明

| 问题 | 当前边界 |
|---|---|
| raw A/B/C/跳键如何变成 action hash | 需要 `0.c` / native input selector |
| BD 二连和 step 二连的原始判定 | engine / 上游层，不在 `2.c` 完整展开 |
| 普通 BD 基础速度 / 燃费 / OH 惩罚 | native / resource / speed param |
| `sys_46` 每个 case 的最终参数名 | 需要 native syscall handler |
| 格斗 damage / down value / proration | 需要 hit / projectile / melee resource 和 native handler |
| 跨机体函数编号稳定性 | 需要第二个样本验证 shape overlay |

这不是坏事。正确边界是：

```text
2.c 负责定位动作链和脚本可改点。
Notion / syscall 文档负责补脚本经验。
wiki 负责玩家语义。
native / resource / 实机测试负责最终证明。
```

## 16. 来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- 当前源码：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki 初心者指南 / BR ズンダ：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- [2.c 逐帧生命周期：从玩家动作到 MSC 输出](./2c-frame-lifecycle-human-trace.md)
- [2.c 函数角色地图：把 `func_N` 翻成人话](./2c-function-role-map-for-modders.md)
- [`sys_46` 脚本侧参数地图：动作内移动怎么读、怎么改](./sys46-script-parameter-atlas.md)
