# 2.c 线性调用链 walkthrough：从 `func_1` 到可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前静态分析快照：

```text
lineCount: 29664
functionCount: 1047
actionFunctionCount: 21
sha256: 1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589
```

这页只做一件事：把整份 `2.c` 按真实执行顺序串起来。读完以后，逆向时不要再问“`func_1` 看起来像不像 init”，而是能用证据回答：

```text
它从哪里被调用？
它在主循环前还是主循环内？
它写注册表还是查注册表？
它只是 reset / setup，还是最终输出 syscall？
如果我要改动作，真正可改点在哪个 segment？
```

## 0. 总结成一条线

先把全局线背下来：

```text
main
  -> func_1                         启动初始化
     -> func_386                    清大量动作 runtime 默认值
     -> func_272                    初始化辅助状态
     -> func_877                    本机 shell / resource / action table 初始化
        -> func_887 / func_888      默认 shell loadout
        -> func_1042 / func_1043    action hash registry
  -> callFunc3(func_4)              进入每帧 action loop

func_4
  -> func_19 / func_20
     -> func_21                     读方向 / action mask
     -> func_22                     读 weapon slot / ammo-like 状态
     -> func_23                     读 depiction / gauge 状态
     -> func_24                     读 primary action candidate
     -> func_25                     读 secondary action candidate
  -> func_11                        boost / cancel gate
  -> func_51 / func_52              secondary action dispatch
  -> func_44                        primary action dispatch
  -> ACTION_*                       动作入口，只安装 runtime
  -> runtime driver                 ranged / melee / special movement
  -> segment callback               真正 motion / weapon / movement / camera / shell 输出
```

如果要进行模组开发，实际下刀点通常在最后两层：

```text
ACTION_* -> runtime driver -> segment callback -> sys_4F / sys_51 / sys_46 / sys_53 / sys_4B
```

`func_1`、`func_4`、`func_44` 这类函数更像公路和交通灯，不是某一把武器的性能参数。

## 1. 第一证据：`main` 告诉你谁是 init，谁是 loop

当前锚点：`2.c:779-786`。

```text
main
  -> sys_2(... func_3)
  -> sys_2(... func_26)
  -> sys_2(... func_27)
  -> func_1()
  -> global0 |= 0x1
  -> callFunc3(func_4)
```

人话：

- `sys_2(... func_3/26/27)` 是把几个 callback 挂给 VM / engine。
- `func_1()` 在 `func_4` 前直接执行，所以它是启动初始化。
- `callFunc3(func_4)` 把 `func_4` 变成后续主循环。

所以对 `func_1` 的判断不是靠感觉，而是靠调用位置：

```text
func_1 = init_depiction_script_runtime
func_4 = main_action_update_loop
```

模组开发意义：

- 不要从 `func_1` 找“主射弹速”或“N 格伤害”。
- 从 `func_1` 只能知道本机体脚本启动时铺了哪些系统。
- 要找某个动作，继续追 `func_877 -> func_1042/1043 -> ACTION_*`。

## 2. `func_1` 初始化了什么系统

当前锚点：`2.c:789-841`。

`func_1` 的结构可以分成五段：

| 段 | 证据形状 | 人话 | 初始化系统 |
|---|---|---|---|
| 顶层清场 | `global1..19 = 0`，`global2 = func_43` | 清当前 action、pending action、callback 槽 | 主循环状态 |
| gate 默认值 | `func_61()`、`func_62()` | 初始化动作 gate / cancel gate | 动作门控 |
| runtime 默认值 | `func_386()` | 大量 runtime global 清零 | 射击、格斗、移动、状态缓存 |
| 资源 / 表现默认值 | `sys_1(0xb0000,...)`、`sys_47(...)`、`sys_50(...)` | 写 native / depiction 参数 | 初始表现 |
| 本机体系统 | `func_877()` | 进入 shell、resource、action table 初始化 | 机体专属系统 |

最重要的一行是：

```text
func_877()
```

因为 `func_1` 自己只是总初始化，真正机体专属内容在 `func_877` 里铺开。

## 3. `func_877` 把 shell、武装槽和 action 表铺好

当前锚点：`2.c:25407-25429`。

结构：

```text
func_877
  -> sys_4B(0, 0xab9c3043)
  -> global20 = sys_4B(0x1)
  -> global142 = 0xc2b19d12
  -> sys_1(0x60008, 0x1b12ae7d)
  -> sys_4F(0xb, 0, hash)
  -> sys_4F(0xb, 1, hash)
  -> sys_4F(0xb, 2, hash)
  -> global170 = 0
  -> func_887()
  -> sys_4A(0xb, 0xb, 0)
  -> func_1042()
  -> func_183(0)
  -> global1 = func_878
  -> func_1041()
```

人话：

- `sys_4B(0,...)` 激活基础 shell / model entry。
- `global20 = sys_4B(1)` 保存 active shell id，后面 motion、骨骼、命中判断大量用它。
- `sys_4F(0xb, slot, hash)` 是武装 / resource slot 注册候选，不是实际开火。
- `global170 = 0 -> func_887()` 应用默认 shell loadout。
- `func_1042()` 注册 action 表、slot 表、资源 hash 表。
- `global1 = func_878` 安装每帧 shell / depiction 维护 callback。

所以 `func_877` 的工作名应该比“换装”更大：

```text
init_unit_shell_resource_and_action_tables
```

模组开发意义：

- 默认组件挂接：追 `func_887/888`。
- 动作入口：追 `func_1042/1043`。
- 武装槽资源：追 `sys_4F(0xb, slot, hash)` 和后续 `sys_4F(0, slot, weaponHash)`。

## 4. `func_887/888` 是 shell loadout，不是整套系统入口

当前锚点：`2.c:25522-25573`。

结构：

```text
func_887
  -> global170 == 0 ? func_888(0) : func_888(1)

func_888(mode)
  -> 0..6: 不同 loadout helper
  -> 7: func_1037 enter alternate shell mode
  -> 8: func_1038 return base shell mode
```

Notion 经验能解释它为什么像换装：

| 调用 | 脚本侧含义 |
|---|---|
| `sys_4B(0x2, modelHash, boneIndex, actionHash, targetModel)` | 把模型接到模型 / bone |
| `sys_4B(0x3)` | 卸下装备 / detach |
| `sys_47(0x10/0x11/0x12,...)` | rotate / translate / scale |

但 `func_887/888` 不是动作 dispatch，也不是输入判断。它们只是被启动链和动作段调用的 shell 输出层。

改 shell 的正确路线：

```text
先找调用点
  -> 是启动默认 loadout？
  -> 是某个 ACTION segment 中切形态？
  -> 是动作结束恢复？

再改 sys_4B / sys_47
  -> attach 点
  -> detach 点
  -> scale / rotate / translate 点
```

只改 `func_888` 某个分支，不找恢复路径，最容易造成组件残留。

## 5. `func_1043` 是 action 字典，`func_241` 是写表 helper

当前锚点：

- `func_1042`: `2.c:29405-29411`
- `func_1043`: `2.c:29413-29470`
- `func_241`: `2.c:6225-6240`

结构：

```text
func_1042
  -> func_1043()
  -> func_1044()
  -> func_1045()
  -> func_1046()

func_1043
  -> func_241(0xf48d2d49, ACTION_A_SHOT)
  -> func_241(0x31f61d6c, ACTION_AB_SUB)
  -> func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL)
  -> func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE)
  -> func_241(0x178d1109, ACTION_B_MELEE)
  -> ...

func_241(hash, callback)
  -> sys_1(0x10002, 0x2, hash, callback)
  -> 写 availability flag
```

人话：

```text
func_1043 是 action hash -> script callback 的字典。
func_241 是把一条字典项写进 native / VM action 表。
```

重要边界：

```text
action hash 不是 raw 按键。
0xf48d2d49 不是“A 键本身”，而是上游 action selector 给到 2.c 的主射候选 action id。
```

当前样本中，先按这些行为名读：

| hash | callback | 当前工作语义 |
|---|---|---|
| `0xf48d2d49` | `ACTION_A_SHOT` | 主射 |
| `0x31f61d6c` | `ACTION_AB_SUB` | 副射 |
| `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 方向特射 / 援护 |
| `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` | 特格 alt |
| `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 特格 / 特殊移动 |
| `0x178d1109` | `ACTION_B_MELEE` | N 格 |
| `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` | 觉醒技 |
| `0xf32aa1ba` | `func_480` → `func_69(0x34)` | **胜利 pose 1** |
| `0x900ab393` | `func_482` → `func_69(0x35)` | **失败 pose 1** |

结果 pose 注册形如：

```c
func_241(0xf32aa1ba, func_480); // 胜利 pose 1
func_241(0x900ab393, func_482); // 失败 pose 1
```

不要与主射 `func_241(主射hash, ACTION_A_SHOT)` 混改：pose 走 state slot tick（`0x34`/`0x35`），主射走射击 runtime globals。

模组开发入口：

```text
我要改某个动作
  -> 先找 func_1043 的 action hash 和 ACTION callback
  -> 再打开 ACTION callback
  -> 再顺着 runtime global 找 segment
```

## 6. `func_4` 每帧只是在跑流水线

当前锚点：`2.c:873-1002`。

结构：

```text
func_4
  -> func_19()
  -> func_879()
  -> func_5()
  -> func_11()
  -> func_12()
  -> func_13()
  -> func_273()
  -> 处理 global5 / global6 的特殊状态
  -> func_51()
  -> func_44()
  -> func_880()
  -> func_264()
```

人话：

- 前半段读本帧状态。
- 中段跑 boost / cancel / interrupt gate。
- 后半段把 action candidate commit 成实际 ACTION callback。
- 最后做帧尾维护。

这就是判断一个函数是不是“主循环函数”的证据：它不是只做一个动作，而是在一帧内串起多个系统。

## 7. `func_21/22/23/24/25` 是状态读取层

当前锚点：`2.c:1716-1883`。

这组函数是 `func_4` 里的第一层状态总线。

| 函数 | 关键读取 | 人话 |
|---|---|---|
| `func_21` | `sys_0(0x10000,0,0x7/0x8/...)` | 读方向、action mask、状态位 |
| `func_22` | `sys_0(0x90002,slot)`、`sys_4F(0xd,slot,1)` | 读 weapon slot / ammo-like 状态，并同步部分 slot |
| `func_23` | `sys_55(...)`、`sys_4F(0x13)` | 读 depiction / gauge 状态 |
| `func_24` | `global5 = sys_0(0x10000,0,0x10)` | 读 primary action candidate |
| `func_25` | `global6 = sys_0(0x10000,0,0x11)` | 读 secondary / route action candidate |

关键变量：

| 变量 | 工作名 | 证据 |
|---|---|---|
| `global5` | primary action candidate | `func_24` 读取，`func_44` commit |
| `global6` | secondary action candidate | `func_25` 读取，`func_51/52` commit |
| `global87` | direction / movement mask candidate | `func_21` 读取，`func_52` 写入 `global172 = global87 & 0x3c` |
| `global172` | committed direction bits | `func_52` 写，方向动作段读取 |
| `global200` | direction-held flag candidate | 方向特射中由 `global87 & 0x3c` 推出 |

Notion 记录里的方向经验要放在这里用：

```text
0x4  -> 前候选
0x8  -> 后候选
0x10 -> 左候选
0x20 -> 右候选
```

模组开发意义：

- 方向特射 / 方向格斗要看 `global87 -> global172/global200`。
- 不要在 `2.c` 里找 raw A/B/C 输入边缘；这里已经是上游整理后的状态。

## 8. `func_11` 是 boost / cancel gate，不是 BD 速度函数

当前锚点：`2.c:1325-1516`。

wiki 的玩家侧语义：

- BD 是跳键二连，高速移动，能取消大多数射击 / 格斗。
- step 是同方向二连，用来切诱导和枪口修正。
- boost gauge 被 BD、step、武装等消耗；耗尽后进入 overheat，落地硬直变长。
- 射击后 BD 取消再射击就是 BR ズンダ这类基础连携。

`2.c` 的脚本侧不是 raw 判定层。`func_11` 消费的是已经整理好的状态槽：

```text
global11 & 0x1
global24 flags
global33 flags
global46 forced re-entry latch
sys_0(0xc0001 / 0xc0003 / 0xc0005 / 0xc000c)
sys_0(0x6000e, hash)
```

`func_11` 可以按三段读：

| 阶段 | 证据 | 人话 |
|---|---|---|
| enter gate | `global23 == 0` 时检查 `global11`、`0xc0005`、`0xc0003` | 判断本帧是否进入 boost / cancel gate |
| active gate | `global23 = 1/2`、`global43 = 1`、`sys_55(...)` | 维持 gate，并写表现 / 状态位 |
| exit gate | `sys_0(0xc0001)` 不满足或 action 改变时清 `global23` | 退出 gate，恢复 `sys_52/sys_4F/sys_56/sys_4C` |

模组开发意义：

- 改“某招能不能 BD cancel”：先看该动作 segment 的 `func_123(mask)`，再看 `func_11` 是否全局拦截。
- 改“普通 BD 基础速度 / 燃费”：不要先改 `func_11`。这更可能在 native / resource / speed 参数。
- 改“特殊移动冲多远”：去看该 ACTION segment 的 `sys_46`、`func_532/535/536`。

## 9. `func_44/52` 是 action hash 到 callback 的桥

当前锚点：

- `func_44`: `2.c:2615-2668`
- `func_51`: `2.c:2724-2763`
- `func_52`: `2.c:2765-2830`

primary channel：

```text
func_44
  -> if global5 == 0 return
  -> global7 = global3
  -> global3 = global5
  -> 清一批 runtime global
  -> sys_46(0x1, 1/2/4/3, 0,0,0)
  -> callback = sys_0(0x10002, 0x2, global3)
  -> sys_2(0, 0x2, callback)
```

secondary channel：

```text
func_51
  -> if global6 == 0 return 0
  -> global8 = global4
  -> global4 = global6
  -> if global4 is sentinel: func_53()
  -> else func_52()

func_52
  -> global172 = global87 & 0x3c
  -> route / direction state update
  -> callback = sys_0(0x10002, 0x2, global4)
  -> sys_2(0, 0x3, callback)
```

人话：

```text
func_1043 写表。
func_44/52 查表。
ACTION_* 是查表后被调度出来的动作入口。
```

注意 `func_44` 里的 `sys_46`：

```text
sys_46(0x1, channel, 0, 0, 0)
```

这是 action 切换前的 movement 通道清场，不是某个动作的位移参数。要改动作内移动，继续追 ACTION segment。

## 10. Ranged runtime：主射为什么不是一行 `sys_4F`

当前锚点：

- `ACTION_A_SHOT`: `2.c:25765-25782`
- `func_913`: `2.c:25785-25787`
- `func_914`: `2.c:25790-25833`
- `func_915`: `2.c:25835-25845`
- `func_586`: `2.c:15404-15512`
- `func_587`: `2.c:15514-15585`

链路：

```text
ACTION_A_SHOT
  -> func_586()                    reset ranged runtime
  -> global677 = func_914          startup / motion segment
  -> global680 = func_915          fire segment candidate
  -> global681 = 0                 ammo slot
  -> callFunc3(func_913)

func_913
  -> func_587()                    ranged runtime driver

func_914
  -> global170 = 0
  -> func_887()
  -> func_610(motionHash,...)
  -> sys_0(0x90000,0,0) ammo check
  -> func_123(0x280) cancel route

func_915
  -> sys_0(0x90000,0,0) ammo check
  -> func_123(0x280)
  -> sys_4F(0,0,weaponHash)
```

Notion 经验：

| 调用 | 脚本侧含义 |
|---|---|
| `sys_0(0x90000,slot,0)` | weapon slot / ammo 可用检查 |
| `sys_4F(0,slot,weaponHash)` | 射击 / weapon request |
| `sys_4F(0x7,slot,1)` | 主动扣弹 |

模组开发改主射时至少记录：

```text
action hash: 0xf48d2d49
ACTION: ACTION_A_SHOT
runtime family: ranged
ammo slot: global681 = 0
startup segment: func_914
fire segment: func_915
weapon request: sys_4F(0,0,...)
cancel: func_123(0x280)
shell restore: global170=0 -> func_887()
```

如果只改 `sys_4F` 的 weapon hash，可能能换弹体；但如果 ammo slot、空弹分支、扣弹分支没有一起审计，就容易出现 UI 和实际资源不同步。

## 11. Assist runtime：方向特射怎么由方向位分支

当前锚点：

- `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL`: `2.c:26957-26976`
- `func_951`: `2.c:26979-26981`
- `func_952`: `2.c:26984-27020`

链路：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_488()
  -> global609 = func_952
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> callFunc3(func_951)

func_951
  -> func_502()

func_952
  -> func_308(... motion ...)
  -> if func_309(global20, 0x1f4):
       if global200:
         sys_51(..., 0, 5)
         sys_51(..., 1, 6)
       else:
         sys_51(..., 0, 2)
         sys_51(..., 1, 4)
       sys_4F(0x7, 2, 1)
       func_123(0x281)
```

Notion 经验：

```text
sys_51(0x20000,0,0x2,assistIndex,type) = 援护召唤
```

人话：

- `global87 & 0x3c` 表示当前有方向输入。
- `global200` 保存“方向特射 vs N 特射”的动作内分支。
- `sys_51` 真正召唤援护。
- `sys_4F(0x7,2,1)` 扣 slot 2 的弹。

改援护时，优先改 `func_952` 的 `sys_51` 参数，不要先改 `func_502`，因为 `func_502` 是特殊动作通用 driver。

## 12. Melee runtime：N 格怎么从 ACTION 走到派生窗口

当前锚点：

- `ACTION_B_MELEE`: `2.c:27343-27348`
- `func_965`: `2.c:27351-27353`
- `func_966`: `2.c:27356-27373`
- `func_967`: `2.c:27376-27421`
- `func_488`: `2.c:12348-12483`
- `func_489`: `2.c:12485-12509`

链路：

```text
ACTION_B_MELEE
  -> func_488()                    reset melee runtime
  -> func_219(0xde3d1477)          load melee parameter row
  -> global602 = func_966          first segment
  -> callFunc3(func_965)

func_965
  -> func_489()                    melee runtime driver

func_489
  -> global184 phase switch
  -> func_490 / 491 / 492 / 493 / 494
  -> func_574()
  -> func_90()

func_966
  -> func_308(... first motion ...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967
  -> func_308(... next motion ...)
  -> func_532(...)
  -> func_535(...)
  -> func_536(mask,time,callback)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

模组开发改格斗时，按目标分流：

| 目标 | 先看 |
|---|---|
| 改动画 | segment 里的 `func_308(global20,motionHash,...)` |
| 改追踪 / 突进 | `func_219(rowHash)`、`func_489`、`func_532/535` |
| 改派生按钮 / 派生时间 | `func_536(mask,time,callback)` |
| 改取消 | `func_123(mask)`、`func_125(mask)` |
| 改持刀 / 外观 | `global170`、`func_887/888` |

当前不要把 `func_532/535/536` 直接命名成 damage 或最终 hitbox。它们更像接近、窗口、派生注册 helper；damage / down value 还要继续追资源和 native hit handler。

## 13. Special movement runtime：特格横移怎么真正控制移动

当前锚点：

- `ACTION_BC_SPECIAL_MELEE`: `2.c:26586-26599`
- `func_939`: `2.c:26602-26604`
- `func_940`: `2.c:26607-26720`
- `func_502`: `2.c:13212-13231`

链路：

```text
ACTION_BC_SPECIAL_MELEE
  -> func_488()
  -> global609 = func_940
  -> global613 = 0xa
  -> global452/453/454 = timing / speed-like defaults
  -> callFunc3(func_939)

func_939
  -> func_502()

func_502
  -> global184 phase switch
  -> func_503 / 504 / 505 / 506
  -> func_574()

func_940
  -> startup motion
  -> func_888(0x7) shell mode
  -> read target / direction
  -> if global172 & 0x20 / 0x10:
       compute lateral delta
       sys_46(0, global265)
  -> later:
       sys_46(0x1, 0x4, ...)
       sys_46(0x2, 0x3, ...)
       func_104(...)
```

人话：

- `ACTION_BC_SPECIAL_MELEE` 只是把 `func_940` 装进 special movement runtime。
- `func_502` 是通用 driver。
- `func_940` 才是这个动作自己的横移 / 突进 segment。
- `global172 & 0x10/0x20` 控左右方向分支。
- `sys_46` 是 movement bus；不同子命令要按上下文读。

改特格横移距离，先看 `func_940` 里的左右常数和 `sys_46(0,global265)`。不要从 `func_44` 的 movement 清场改起。

## 14. Camera：镜头必须看启用点和清理点

当前锚点：

```text
func_321(hash)
  -> sys_53(0x4, hash, 0x4650)
```

Notion 经验：

| 调用 | 脚本侧含义 |
|---|---|
| `sys_53(0x4,hash,...)` | camera preset |
| `sys_53(0x5)` | camera cleanup candidate |
| `sys_53(0,...)` | 画面震动 |
| `sys_53(0x2,...)` | 镜头缩放候选 |

改镜头的正确路线：

```text
segment callback
  -> func_309(global20,time)
  -> func_321(cameraHash) / sys_53(0x4,...)

结束 / 取消 / 被打断
  -> sys_53(0x5)
```

只改启用点，不找清理点，是最常见的镜头残留来源。测试必须包含：

```text
命中
空挥
BD cancel
step cancel
被打断
死亡复归
```

## 15. 一套判断 `func_N` 职责的方法

给任何函数起名前，先填这张小表：

| 问题 | 证据类型 |
|---|---|
| 谁调用它 | init 链、loop 链、ACTION 链、function pointer |
| 它读什么 | `sys_0(0x10000)`、`0xc000*`、`0x90000`、global family |
| 它写什么 | `sys_1` registry、runtime global、shell global、camera state |
| 它输出什么 | `sys_4F`、`sys_51`、`sys_46`、`sys_53`、`sys_4B`、`sys_47` |
| 它是否 reset | 大量 global 清零通常是 runtime reset，不是动作性能 |
| 它是否 dispatch | `sys_0(0x10002,0x2,hash) -> sys_2` 是 action dispatch |
| 它是否 segment | 有 `func_309` 时间点、motion、weapon、movement、camera 输出 |

常见 shape 到工作名：

| shape | 工作名风格 |
|---|---|
| `main` 前调用，清大量 global，进 `func_877` | `init_*` |
| 每帧早期读取 `sys_0(0x10000)` | `read_*_state` |
| 密集 `0xc000*` 和 `global23/43/45` | `update_*_gate` |
| 大量 `func_241(hash,callback)` | `register_*_handlers` |
| `sys_0(0x10002,0x2,hash) -> sys_2` | `dispatch_*_action` |
| `func_586` 后写 `global676..681` | `setup_ranged_*` |
| `func_488` 后写 `global602/609/610` | `setup_melee_or_special_*` |
| `func_309` + `sys_4F/sys_46/sys_53` | action segment |
| `global170/global143` + `sys_4B/sys_47` | shell loadout |

## 16. Offset / `func_N` 变了以后怎么办

不要把结论写成：

```text
func_489 永远是 melee runtime
```

要写成：

```text
semanticId: runtime.melee.phaseDriver
shape:
  - 被多个 melee ACTION wrapper 调用
  - reset 来自 func_488 family
  - 按 global184 phase switch
  - 调 segment callback
  - 帧尾跑 func_574 / func_90
currentSymbol:
  - sample 0xBDBE6FEA: func_489
```

同理，action 入口也不要靠行号，靠 registry：

```text
semanticId: action.shoot.main
shape:
  - func_1043 has func_241(0xf48d2d49, callback)
  - callback calls ranged reset
  - writes global677 / global680 / global681
  - fire segment emits sys_4F(0, slot, weaponHash)
currentSymbol:
  - ACTION_A_SHOT
```

后续换样本时不要复用旧编号。直接打开当前样本 `.c`，按 registry、wrapper 写入、syscall 输出和 resource hash 的 shape 重新定位。

## 17. 实际跟读练习：从主射到发射点

按这个顺序打开：

1. `func_1043`
   - 找 `func_241(0xf48d2d49, ACTION_A_SHOT)`。

2. `ACTION_A_SHOT`
   - 看到 `func_586()`，确定是 ranged runtime。
   - 记录 `global677 = func_914`、`global680 = func_915`、`global681 = 0`。

3. `func_913`
   - 看到它只调用 `func_587()`，确定是 driver wrapper。

4. `func_914`
   - 找 motion、shell 恢复、ammo check、cancel route。

5. `func_915`
   - 找 `sys_4F(0,0,weaponHash)`，这是脚本侧发射请求候选。

6. 回头补验证表：

```text
玩家目标: 主射
action hash: 0xf48d2d49
ACTION callback: ACTION_A_SHOT
runtime family: ranged
ammo slot: 0
startup segment: func_914
fire segment: func_915
weapon syscall: sys_4F(0,0,...)
cancel: func_123(0x280)
shell: global170=0 -> func_887()
```

这张表能填完，才算真正追到了可改点。

## 18. 实际跟读练习：从 N 格到派生窗口

按这个顺序打开：

1. `func_1043`
   - 找 `func_241(0x178d1109, ACTION_B_MELEE)`。

2. `ACTION_B_MELEE`
   - 看到 `func_488()`，确定是 melee / special runtime。
   - 看到 `func_219(0xde3d1477)`，记录参数 row。
   - 看到 `global602 = func_966`，记录第一段 segment。

3. `func_965`
   - 看到 `func_489()`，进入 melee driver。

4. `func_966`
   - 找第一段 motion、shell 切换、cancel mask。

5. `func_967`
   - 找 `func_532`、`func_535`、`func_536`、`func_123`、`func_125`。

6. 回头补验证表：

```text
玩家目标: N 格
action hash: 0x178d1109
ACTION callback: ACTION_B_MELEE
runtime family: melee
parameter row: 0xde3d1477
first segment: func_966
followup segment: func_967
motion: func_308(...)
branch windows: func_536(...)
cancel: func_123(0x200), func_125(0xc00000)
shell: global170=1 -> func_887()
```

这张表能填完，才适合继续改派生时间、追踪参数或 motion hash。

## 19. 当前边界

这份 `2.c` 可以较稳定地回答：

- action hash 如何 dispatch 到 `ACTION_*`。
- `func_1` 初始化了哪些脚本侧系统。
- `func_4` 每帧如何读状态、跑 gate、commit action。
- 射击、援护、格斗、特殊移动、镜头、shell 在脚本侧分别落到哪些 syscall / segment。

它不能单独最终证明：

- raw A/B/C/跳键如何变成 action hash。
- BD 二连和 step 二连的原始判定。
- 普通 BD 最终速度、燃费、overheat 惩罚。
- `sys_46` 每个 native case 的最终参数名。
- damage / down value / proration 的完整资源路径。

这些边界不是空白，而是下一层证据：`0.c`、native handler、resource、实机测试。

## 20. 来源

- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 项目文档：[EXVS MSC Input -> Action Hash -> Weapon Callback Pipeline](../exvs-msc-input-action-weapon-pipeline.md)
- 项目文档：[EXVS2 MSC Native VM Semantics](../exvs2-msc-vm-native-semantics.md)
