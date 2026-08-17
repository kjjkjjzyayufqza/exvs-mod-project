# MSC 模组开发操作手册：从 29664 行 `2.c` 读到可改点

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页只服务一个目标：

```text
逆向者打开 2.c 后，能判断一个函数在系统里的位置，并能把“我要改动作 / BD / 移动 / 镜头 / 射击 / 格斗 / shell”追到具体 patch 点。
```

如果当前问题是“这个 `func_N` 到底能不能改”，直接对照 [2.c 关键函数职责表：给模组 patch 用的工作名](./2c-key-function-atlas-for-patching.md)。

如果当前问题是“BD、移动、镜头、动作、射击、格斗分别该改哪一层”，先看 [MSC 系统控制面矩阵：BD / 移动 / 镜头 / 动作 / 射击 / 格斗怎么改](./system-control-surface-matrix.md)，再回到本手册追具体调用链。

如果当前问题是“我需要看到真实源码证据，而不是只看结论”，直接看 [2.c 源码证据走读：从 `func_1` 证明到可改点](./2c-source-proof-walkthrough-for-modders.md)。它把 `main/func_1/func_4/func_44/func_1043/ACTION_*` 的行号、代码形状和模组可改点串在一起。

如果 AI 帮你改 MSC `X.c`，所有 AI 新增或 AI 修改过的代码都必须用
`// AI decision (YYYY-MM-DD): ...` 和 `// End, origin is ...` 成对包住。
具体格式见 [MSC AI 修改块注释规范](./msc-ai-edit-block-rule.md)。AI 新增状态名
必须像逆向标签一样有意义；不要新增 `global777` 这种只能让人类更难读的占位名。

先把 `2.c` 当成一台机器，不要当成 1,047 个孤立函数。你每次只需要回答四个问题：

| 问题 | 人话 | 常见证据 |
|---|---|---|
| 它在哪一层 | init、loop、registry、dispatch、runtime setup、segment output、cleanup | 调用者、被谁调度、输出 syscall |
| 它控制哪类系统 | 动作、射击、格斗、移动、镜头、shell、资源 | `global` family、`sys_4F/51/46/53/4B/47` |
| 它是不是可改点 | 能不能只影响目标动作 | 是否 action-local，是否共用 driver |
| 改完怎么验证 | 有没有 cleanup / cancel / OH / 被打断问题 | 实机测试矩阵 |

## 1. 先记住整机结构

当前样本主链：

```text
main 2.c:780-787
  -> sys_2(... func_3 / func_26 / func_27)
  -> func_1
  -> callFunc3(func_4)

func_1 2.c:789-841
  -> 清 global1..19
  -> func_386
  -> func_272
  -> sys_1(0x10002,0x2,hash,callback)
  -> func_877

func_877
  -> sys_4B(0, base shell)
  -> global20 = sys_4B(1)
  -> global170 = 0
  -> func_887
  -> func_1042
       -> func_1043 action registry
       -> func_1044 slot callback registry
       -> func_1045 stance resource registry
       -> func_1046 effect/resource registry

func_4
  -> 每帧读取 engine/action/weapon/direction 状态
  -> func_11 boost/cancel gate
  -> func_44 / func_52 action commit
  -> ACTION_* callback
       -> runtime setup
       -> driver
       -> segment output
            -> sys_4F / sys_51 / sys_46 / sys_53 / sys_4B / sys_47
```

一句话：

```text
func_1 建系统，func_4 跑系统，func_1043 登记动作，func_44/52 执行动作，ACTION_* 安装 runtime，segment callback 输出真正效果。
```

这也是判断 `func_1` 的最短证明：

| 证据 | 结论 |
|---|---|
| `main` 先调用 `func_1`，再 `callFunc3(func_4)` | `func_1` 在主循环前，不是单个武装 |
| `func_1` 清 early globals | 初始化脚本运行时状态 |
| `func_1 -> func_386 / func_272` | 初始化 runtime 和 helper 状态 |
| `func_1 -> sys_1(0x10002,...)` | 初始化 action callback 表 |
| `func_1 -> func_877 -> func_1042` | 初始化本机体 shell 和 action/resource registry |

所以 `func_1` 的工作名应该是：

```text
depiction.initializer
```

不是：

```text
main shot init
BD init
melee init
shell only init
```

## 2. 读 `2.c` 的固定流程

每次从目标开始，不要从函数编号开始。

```text
目标
  -> 玩家语义
  -> action hash 或资源入口
  -> ACTION_* callback
  -> runtime family
  -> segment callback
  -> 真正输出 syscall
  -> cleanup / cancel / restore
  -> 实机测试
```

### 步骤 1：把玩家目标翻成脚本目标

| 玩家目标 | 脚本问题 |
|---|---|
| 主射换弹种 | 哪个 ACTION 发 `sys_4F(0,slot,weaponHash)` |
| BR ズンダ / BDC 手感 | 发射点、cancel mask、`func_11` gate、普通 BD 参数分别在哪里 |
| 普通 BD 更远 / 次数更多 | 先看 `speed_param` / native resource，不从某一招 `sys_46` 开始 |
| 某一招横移更远 | 看该 ACTION segment 里的 `sys_46` |
| N 格派生提前 | 看 `func_536(mask,time,callback)` 和 `func_535(start,end)` |
| 镜头更换 | 找 `sys_53(0x4,hash,...)`，再找 `sys_53(0x5)` 清理 |
| 换装 / 组件挂接 | 找 `func_887/888`、`sys_4B`、`sys_47` 和恢复路径 |

### 步骤 2：从 action registry 找入口

注册表在 `func_1043 2.c:29413-29470`：

```text
func_241(0xf48d2d49, ACTION_A_SHOT)                    // 主射
func_241(0x23df217e, ACTION_AC_SPECIAL_SHOT_DIRECTIONAL) // 方向特射
func_241(0x6ab12717, ACTION_BC_SPECIAL_MELEE_ALT_2)      // 特格 alt
func_241(0x193fe550, ACTION_BC_SPECIAL_MELEE)            // 特格
func_241(0x178d1109, ACTION_B_MELEE)                     // N 格
```

`func_241` 的意义不是“按键调用函数”，而是：

```text
action hash -> callback
```

上游输入已经被 engine / 低层脚本翻成 action hash。`2.c` 的主要工作是消费 action hash，而不是直接读原始按键边缘。

### 步骤 3：判断 runtime family

进入 `ACTION_*` 后，先看它写哪组 callback global：

| 形状 | 系统 | 下一步 |
|---|---|---|
| 写 `global677/global680/global681` | 射击 runtime | 找 `global680` 指向的 fire segment |
| 写 `global602` | 格斗 runtime | 找 melee segment、`func_219`、`func_532/535/536` |
| 写 `global609/global610` | 特射 / 特格 / special runtime | 找 special movement 或 assist segment |
| 写 `global170/global143` 或调用 `func_887/888` | shell / 形态 | 找恢复路径 |
| 调 `func_321` 或 `sys_53` | 镜头 / 演出 | 找清理路径 |
| 直接输出 `sys_4F/sys_51/sys_46/sys_53/sys_4B/sys_47` | action-local segment | 通常是可改点 |

不要在 `ACTION_*` 一进去就改。`ACTION_*` 经常只是安装后续 segment。

### 步骤 4：只在 segment output 层动刀

对模组开发来说，优先级通常是：

```text
action-local segment output > action setup > runtime helper > dispatch > loop > init
```

也就是说：

| 层级 | 例子 | 是否优先改 |
|---|---|---|
| segment output | `func_915 -> sys_4F`、`func_940 -> sys_46`、`func_967 -> func_536` | 是 |
| action setup | `ACTION_A_SHOT` 写 callback global | 偶尔 |
| runtime helper | `func_587`、`func_489`、`func_502` | 谨慎 |
| dispatch | `func_44/52` | 不为单招改 |
| loop | `func_4` | 不为单招改 |
| init | `func_1` | 不为单招改 |

## 3. 系统地图

### 3.1 动作系统

动作系统的核心不是某个 `func_N`，而是两张表：

```text
注册表:
  func_1043 -> func_241(actionHash, callback)

执行表:
  func_44/52 -> sys_0(0x10002,0x2,activeActionHash) -> sys_2(... callback)
```

**结果 pose（稳定 hash，勿与主射混用）：**

| hash | 注册 | 语义 |
|---|---|---|
| `0xf32aa1ba` | `func_241(0xf32aa1ba, func_480)` | **胜利 pose 1**（`func_480` → state `0x34`） |
| `0x900ab393` | `func_241(0x900ab393, func_482)` | **失败 pose 1**（`func_482` → state `0x35`） |

详见 `docs/msc-research/2c-call-chain-runtime-flow.md` 与
`docs/exvs-msc-input-action-weapon-pipeline.md`（Result poses 节）。

`func_44 2.c:2615-2668` 做的是 action commit：

```text
global3 = global5
reset movement channels through sys_46(0x1,...)
callback = sys_0(0x10002,0x2,global3)
sys_2(0,0x2,callback)
```

人话：

```text
它把“当前要执行的 action hash”变成“要调度的脚本函数”。
它不是主射、不是格斗、不是 BD。
```

### 3.2 射击系统

主射链：

```text
func_1043
  -> ACTION_A_SHOT

ACTION_A_SHOT 2.c:25765-25783
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0

func_914 2.c:25790-25833
  -> 起手、弹数检查、shell 恢复、cancel 准备

func_915 2.c:25835-25848
  -> sys_0(0x90000,0,0)
  -> sys_4F(0,0,0xcc9f6df0)
```

可改点：

| 想改 | 优先看 |
|---|---|
| 换发射资源 | `sys_4F(0,slot,weaponHash)` |
| 改弹数槽 | `global681`、`sys_0(0x90000,slot,0)`、`sys_4F(0,slot,hash)` |
| 改 projectile 参数 | `arms_param` / `bullet_param` 对应资源 |
| 改发射前动作 | `func_914` |
| 改 BDC 后能否再射 | `func_123`、`func_11`、实机 boost 状态 |

Notion 经验：

```text
sys_0(0x90000,slot,0) 检查武装槽位 / 弹数
sys_4F(0,slot,hash) 请求射击 / weapon resource
sys_4F(0x7,slot,1) 主动扣弹
```

### 3.3 BD、step、boost、动作内移动

这四个不能混在一起。

```text
普通 BD / step 基础性能
  -> speed_param / character_param / native

动作能不能 BD cancel
  -> func_123 / func_125
  -> func_11 + sys_0(0xc000*)

某一招自己的移动
  -> ACTION segment
  -> sys_46
  -> func_219 / func_532 / func_535 / func_536

raw input 变成 BD / step
  -> 更上游输入层，不在 2.c 单文件内完整证明
```

wiki 语义告诉我们：BD 是跳键二连，可取消多数动作；boost 空了以后 BD、step、变形和部分武装会受限，落地硬直变大。脚本里不要把这一整套都塞给 `sys_46`。

按目标选入口：

| 想改 | 先看 | 不先看 |
|---|---|---|
| 普通 BD 距离 | `speed_param.boost_dash_distance`、`boost_dash_duration_frame` | `func_940` |
| 普通 BD 次数 | `boost_dash_count`、`boost_gauge_capacity` | 单个 ACTION |
| step 基础距离 | `speed_param.step_distance`、`step_speed` | 特格横移 segment |
| 主射后 BDC | `func_915`、`func_123`、`func_11` | `func_888` |
| 特格横移距离 | `func_940 -> sys_46(0,global265)` | `func_11` 全局 gate |
| 格斗追踪 / 派生移动 | `func_219(row)`、`func_532/535/536` | `func_44/52` |

特格横移例子：

```text
ACTION_BC_SPECIAL_MELEE 2.c:26586-26600
  -> global609 = func_940
  -> func_939 -> func_502

func_940 2.c:26607-26726
  -> read global172 & 0x20 / 0x10
  -> compute lateral value
  -> sys_46(0, global265)
  -> sys_46(0x1,...)
  -> sys_46(0x2,...)
```

Notion 经验：

```text
global172 & 0x4  前
global172 & 0x8  后
global172 & 0x10 左
global172 & 0x20 右
global200         是否按方向键
```

### 3.4 格斗系统

N 格链：

```text
ACTION_B_MELEE 2.c:27343-27349
  -> func_488()
  -> func_219(0xde3d1477)
  -> global602 = func_966
  -> func_965 -> func_489

func_966 2.c:27356-27374
  -> func_308(... first motion ...)
  -> func_531(func_967)
  -> global170 = 1
  -> func_887()
  -> func_123(0x200)

func_967 2.c:27376-27422
  -> func_308(... next motion ...)
  -> func_532(0x2,0xd,0x58)
  -> func_535(0x1,0xa)
  -> func_536(0x1,0xf,func_968)
  -> func_536(0x20,0xf,func_980)
  -> func_536(0x4,0xf,func_1007)
  -> func_123(0x200)
  -> func_125(0xc00000)
```

工作读法：

| 符号 | 人话 | 常见改法 |
|---|---|---|
| `func_219(row)` | 读取格斗 / 特格动作参数 row | 改追踪、突进、动作参数时要对资源 |
| `func_489` | melee runtime driver | 共用，不优先改 |
| `func_532` | 格斗推进 / 接触 / 贴近候选 | 改手感时跟实机测 |
| `func_535(start,end)` | 派生窗口范围 | 调开放区间 |
| `func_536(mask,time,callback)` | 输入派生登记 | 调第几帧、按什么、跳哪段 |
| `func_123/125` | cancel route / route mask | 调取消路线 |
| `sys_47(0x7,sys_4B(1))` | 命中 / 接触 / 动作完成类判断候选 | 验证命中和空挥分支 |

改 N 格派生时，通常先改 `func_536` 的 `time`，不是先改共用 resolver。

### 3.5 镜头系统

镜头通常藏在动作段里，不是单独动作。

```text
func_321(hash)
  -> sys_53(0x4, hash, 0x4650)

sys_53(0x5)
  -> 停用 / 清理 camera preset 候选
```

native 侧文档已把 `sys_53` 收敛到 camera parameter / preset bus。脚本侧可用规则：

| 调用 | 人话 |
|---|---|
| `sys_53(0x4,hash,...)` | 启动相机 preset |
| `sys_53(0x5)` | 停止 / 还原 preset |
| `sys_53(0,...)` | 震动 / 强度通道候选 |
| `sys_53(0x2,...)` | 三通道插值 / 缩放类候选 |

改镜头必须找四条路径：

```text
自然结束
命中
空挥
被打断 / BD cancel / 死亡复归
```

只找到启动点不够。

### 3.6 shell / 换装 / 组件系统

启动链：

```text
func_877
  -> sys_4B(0,0xab9c3043)
  -> global20 = sys_4B(1)
  -> global170 = 0
  -> func_887()
  -> func_1042()
```

默认 loadout：

```text
func_887
  -> global170 == 0 ? func_888(0) : func_888(1)
```

分发：

```text
func_888(mode)
  -> 0..6  loadout helper
  -> 0x7   enter alternate shell
  -> 0x8   return base shell
```

Notion 和 native 文档合起来的稳定读法：

| 调用 | 人话 |
|---|---|
| `sys_4B(0,entry)` | 激活 shell entry |
| `sys_4B(1)` | 取 active shell entry id |
| `sys_4B(2,...)` | 配置 / 挂接 shell entry |
| `sys_4B(3,...)` | 清理 entry 或全部清理 |
| `sys_47(0x10/0x11/0x12,...)` | rotate / translate / scale |

改组件时必须找：

```text
挂接点
动作中维护点
自然结束恢复
cancel 恢复
被打断恢复
死亡复归恢复
```

## 4. 可改点判定表

| 你看到的函数形状 | 它大概率是 | 改动建议 |
|---|---|---|
| `main` 直接调用，主循环前执行 | bootstrap / init | 不为单招改 |
| 清大量 global，注册基础 `sys_1` | initializer | 只改系统级初始化 |
| 大量 `func_241(hash,callback)` | action registry | 只改映射，不改动作参数 |
| `sys_0(0x10002...)` 后 `sys_2` | dispatch | 不改 |
| 写 callback global | runtime setup | 用来找 segment |
| 有 `func_309` 时间点和 syscall 输出 | action segment | 优先改 |
| 只在一个 ACTION 链出现 | action-local patch point | 优先改 |
| 很多 ACTION 都调用 | shared helper / driver | 谨慎 |
| 启动 `sys_53(0x4)` 但没清理 | camera risk point | 先补清理证据 |
| 调 `sys_4B/47` 改模型 | shell/model point | 必须找恢复 |

## 5. 动刀前必须填的卡片

```json
{
  "goal": "change main shot projectile",
  "player_term": "main shot / BR",
  "action_hash": "0xf48d2d49",
  "action_callback": "ACTION_A_SHOT",
  "runtime_family": "ranged",
  "segment_callback": "func_915",
  "output_syscall": "sys_4F(0,0,0xcc9f6df0)",
  "patch_point": "weapon hash",
  "cleanup_paths_checked": [
    "natural end",
    "BD cancel",
    "overheat",
    "empty ammo"
  ],
  "resource_files_to_check": [
    "arms_param",
    "bullet_param",
    "projectile_depiction_table"
  ],
  "tests": [
    "ground shot",
    "air shot",
    "empty ammo",
    "BR zunda",
    "overheat",
    "death respawn"
  ]
}
```

如果这张卡片填不出来，说明还没追到可改点。

## 6. 常见误区

| 误区 | 为什么错 | 更稳做法 |
|---|---|---|
| `func_1` 里有很多初始化，所以直接改它 | 它是全局 init，影响所有动作 | 从目标 action registry 追下去 |
| `func_887/888` 像换装，所以所有外观问题都改它 | 它是 shell/loadout 分发，动作可能有自己的恢复路径 | 先找具体 ACTION 内是否改 `global170/global143` |
| 看到 `sys_46` 就以为是普通 BD | `sys_46` 在脚本侧更多是动作内移动通道 | 普通 BD 先看 `speed_param` / native |
| 看到 action hash 就当作按键 | action hash 是上游解析后的动作 key | 按键要结合 `0.c` / input selector |
| 只改 camera preset hash | 可能残留镜头 | 同时找 `sys_53(0x5)` |
| 只改 `sys_4F` hash | projectile 可能还受 arms/bullet/hitgroup 控制 | 同时查资源 |
| 把 `func_N` 当跨版本名字 | 函数编号会随反编译和 offset 变化 | 用 semanticId + evidence shape |
| AI 新增 `global777` 这类状态名 | 编译可能通过，但人类不知道它代表哪个系统 | 用证据命名，例如 `deltaKaiFunnelShell0IsOut` |

## 7. 新样本迁移规则

换另一个机体或 offset 后，不要照抄 `func_N`。

按下面形状重新定位：

| semanticId | 当前样本 | 迁移证据 |
|---|---|---|
| `depiction.initializer` | `func_1` | `main` 调用，主循环前，清 globals，进入 shell/action init |
| `depiction.actionHashRegistry` | `func_1043` | 大量 `func_241(hash,callback)` |
| `depiction.primaryActionCommit` | `func_44` | `sys_0(0x10002,0x2,activeHash)` 后 `sys_2` |
| `action.mainShot.fireSegment` | `func_915` | `ACTION_A_SHOT` 写 callback，segment 输出 `sys_4F(0,slot,hash)` |
| `action.specialShotAssist.segment` | `func_952` | `sys_51(... index,type)` + `sys_4F(0x7,slot,1)` |
| `action.bMelee.branchSegment` | `func_967` | `func_532/535/536` 派生窗口 |
| `action.bcSpecialMelee.directionalMovementSegment` | `func_940` | 读方向位，输出 `sys_46` |
| `camera.presetWrapper` | `func_321` | 包装 `sys_53(0x4,hash,...)` |
| `shell.defaultLoadoutSelector` | `func_887` | 根据 `global170` 调 `func_888(0/1)` |

工作名应写在人工研究文档里，并附当前 `.c` 行号、action hash、callback shape 和 syscall/resource 输出。讨论时可以引用稳定工作名，`func_N` 只作为当前样本定位。

## 8. 实机验证矩阵

最小验证不要少于这些：

| 改动类型 | 必测 |
|---|---|
| 射击 | 有弹、空弹、地上、空中、BDC、OH、换锁 |
| BDC / cancel | BR ズンダ、射击后立即 BD、step、OH、落地 |
| 普通 BD / step | 地上、空中、斜向、OH、落地硬直、连续 BD 次数 |
| 特殊移动 | 无方向、前后左右、撞墙、切锁、OH、被打断 |
| 格斗 | 命中、空挥、派生、step cancel、BD cancel、OH、受击打断 |
| 镜头 | 命中、空挥、cancel、被打断、死亡复归、下一个动作 |
| shell / 组件 | 出击、动作中、自然结束、cancel、受击、死亡复归、觉醒技后 |

## 9. 来源

- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki システム：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/559.html`
- [MSC 模组开发 worked traces：从目标到 patch 点](./modder-worked-traces.md)
- [MSC 逆向模组开发总览：从玩家动作追到 `2.c` 可改点](./modder-human-flow-overview.md)
- 跨样本工作名原则：`func_N` 只当当前样本坐标，最终回到 `.c` evidence shape。
- [BD / 移动 / `sys_46` 模组开发工作簿](./movement-bd-modding-workbook.md)
- [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
- [EXVS MSC Input -> Action Hash -> Weapon Callback Pipeline](../exvs-msc-input-action-weapon-pipeline.md)
- [EXVS MSC Syscall 4B Investigation Notes](../exvs-msc-syscall-4b-notes.md)
- [EXVS MSC Syscall 4F Investigation Notes](../exvs-msc-syscall-4f-notes.md)
- [EXVS MSC Syscall 53 Investigation Notes](../exvs-msc-syscall-53-notes.md)
- [EXVS2 Command Hash Mapping](../command_mapping.md)
