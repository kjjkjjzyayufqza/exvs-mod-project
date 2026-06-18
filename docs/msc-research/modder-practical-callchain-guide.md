# 逆向 / 模组开发实操导览：从玩家动作反查 MSC 调用链

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

这页不是给所有 `func_N` 一次性改名，而是回答更直接的问题：我想改某个动作、武装、镜头、移动或换装时，应该从哪条链开始看，看到一个 `func_N` 又怎么判断它在做什么。

如果你是从零理解整套脚本，先读 [2.c 运行时系统地图](./2c-runtime-system-map-for-modding.md)。本页默认你已经知道 `func_1/func_4/func_44/func_52` 这些主干各自处在哪一层，然后直接按改动目标反查。

如果你已经准备动手改某个武装、格斗派生、移动手感或镜头，继续看 [MSC 模组开发 cookbook](./modding-cookbook-action-editing.md)，那里按具体改动目标列了可改点、风险和验证方式。

## 先把玩家概念翻译成 MSC 入口

OverBoost 玩家侧系统里，BD 是跳键二连、step 是同方向方向键二连，射击 / 格斗 / 跳组合出副射、特射、特格。MSC 里通常不会直接写“玩家按了两次跳”，而是接收 engine 已经识别出的 action hash，再用 `ACTION_*` callback 配置本机动作。

| 玩家想改的东西 | 当前样本入口 | 运行时驱动 | 关键 callback / syscall | 先看什么 |
|---|---|---|---|---|
| 主射 | `ACTION_A_SHOT` / hash `0xf48d2d49` | `func_586` 后进入 ranged runtime | `func_914` 播放动作，`func_915` 用 `sys_4F(0,0,0xcc9f6df0)` 发射 | 弹种 hash、ammo slot 0、`func_123(0x280)` 取消开放 |
| 副射 | `ACTION_AB_SUB` / hash `0x31f61d6c` | ranged runtime | 走 `sys_4F` 的武器 slot 路径 | 先用 JSON 查 `ACTION_AB_SUB` 的 callback 槽，再看发射 hash |
| 特射援护 | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` / hash `0x23df217e` | `func_488` 后进入 `func_502` 系列 | `func_952` 用 `sys_51(0x20000,0,0x2,index,type)` 叫出援护，再用 `sys_4F(0x7,0x2,1)` 扣特射 ammo | `global200` 方向分支、`sys_51` type、slot 2 ammo |
| 特射换锁 / 召唤段 | `ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH` / hash `0x9c05b42d` | `func_586` 后进入多段 ranged runtime | `func_1025/1026/1027`，包含 `func_888(0x8)`、`sys_4B`、`sys_4F`、特效 | shell 进出、slot 5、锁定切换动作段 |
| 特格 / 变形突击 | `ACTION_BC_SPECIAL_MELEE_ALT_2` / hash `0x6ab12717`，以及 `ACTION_BC_SPECIAL_MELEE` / hash `0x193fe550` | `func_488` 后进入 `func_489` 或 `func_507` 系列 | `func_936/937/940`，包含 `func_888(0x7)`、`func_219(...)`、`sys_46`、`func_532` | 移动参数 row、变形 shell、速度 / 诱导 / cancel 窗口 |
| 格斗 | `ACTION_B_MELEE*` 家族 | `func_488` / `func_507` 系列 | 通常先设 `global602/608/609/610`，再由 `func_508/509/510` 驱动 | `func_219(row)`、`global613`、`func_123`、hit / cancel 段 |
| 觉醒技 | `ACTION_ABC_FINAL_ATTACK` / hash `0x8ae55bb1`，以及 `ACTION_ABC_FINAL_ATTACK_LOCK_SWITCH` / hash `0x99a7a777` | 先 `func_488`，后续可切换到 ranged runtime | `func_955` 用 `func_888(0x7)`、`sys_46`、`sys_52`、`sys_53`、`sys_4A`、`sys_4F` | 镜头、变形速度、召唤 / 特效、结束后接续 hash |
| 镜头 / 震动 / cut-in | 动作 callback 内部 | 无固定 action，随动作时间线触发 | `sys_53(...)`、`func_321(hash)`、`sys_58(...)` | 先找动作 callback，再找时间线上的表现 syscall |
| BD / boost / 移动基础规则 | 不是单一 `ACTION_BD` | engine 通用系统 + MSC gate | `func_11/12/13`、`sys_46(...)`、`func_296(...)`、`func_298..302` | 不要先改输入判定，先改动作自己的速度 / cancel / boost gate |

## 判断 `func_1` 在做什么

`func_1` 不应该按“第一个函数”或“初始化函数”粗略理解。更稳的判断方式是看它初始化了哪些后续会被全文件反复读写的槽。

当前样本里，`func_1` 的主线是：

```text
func_1
  -> 清空 global1..global19 这类顶层 callback / 状态指针
  -> func_61 / func_62       初始化动作 gate
  -> func_386                初始化大块 runtime state
  -> func_272                初始化另一组系统状态
  -> func_877                初始化 active shell、默认 loadout、注册表
```

`func_386` 是理解 `func_1` 的关键，因为它把后续动作系统的“槽位”先铺出来：

- `global20`：active shell entry id，后续 `func_308/sys_47/sys_4B` 大量使用。
- `global143/global170`：shell mode / motion resource group。
- `global172/global200`：方向输入或方向保持类状态。
- `global602/608/609/610`：近战 / 特殊移动 runtime callback 槽。
- `global676/677/678/679/680/681`：射击 / 多阶段 weapon runtime callback 槽和 ammo slot。
- `global379..393`：`func_219(row)` 加载的移动 / 格斗参数。

所以 `func_1` 更像“脚本运行时和机体表现系统初始化”，不是某个武装、BD、镜头或格斗本身。除非你要改全局注册、形态基础资源或动作系统入口，否则不要优先改 `func_1`。

## 一个通用反查流程

以后 offset 或 `func_N` 变了，不要从函数编号硬记。按下面顺序反查，结论更稳：

1. 从玩家动作确定 action 家族：射击、格斗、特射、特格、觉醒技、换锁、变形。
2. 在 `func_1043` 或生成的 `generated/0xBDBE6FEA-2.analysis.json` 里找 action hash 到 `ACTION_*` 的注册关系。
3. 看 `ACTION_*` 包装函数，它通常会设置一组 runtime callback 槽。
4. 根据槽位判断 runtime 家族：
   - `global676..681`：ranged / weapon runtime，常由 `func_586` 初始化。
   - `global602/608/609/610`：melee / special movement runtime，常由 `func_488` 初始化。
5. 进入实际 callback，看三类证据：
   - `func_308` / `sys_47(0x2,...)`：播放哪个 motion。
   - `func_309(..., time)`：在动作第几个时间点触发。
   - `sys_4F/sys_51/sys_46/sys_53/sys_4A/sys_58`：发射、援护、移动、镜头、挂接、特效。
6. 再回头看 ammo slot、cancel mask、方向分支和 shell loadout，确认你改的是动作行为而不是只改表现。

## 主射：从 `ACTION_A_SHOT` 看到发弹

主射链路很适合作为模板：

```text
ACTION_A_SHOT
  -> func_586()                  清空 ranged runtime 槽
  -> global677 = func_914        动作开始 / motion callback
  -> global680 = func_915        发射 callback
  -> global681 = 0               ammo slot 0
  -> callFunc3(func_913)

func_914
  -> func_887()                  按当前形态恢复默认 shell loadout
  -> func_610(0x91351d9e,...)    主射动作 / motion 相关设置
  -> func_81(0xf48d2d49,...)     条件满足时接续主射 hash
  -> func_91()                   动作结束判定

func_915
  -> sys_0(0x90000,0,0)          检查 slot 0 ammo / 可用状态
  -> func_123(0x280)             打开一组 cancel / transition mask
  -> sys_4F(0,0,0xcc9f6df0)      真正请求主射武器
```

想改主射时，优先级通常是：

- 改弹种 / 生成物：看 `sys_4F(0,0,0xcc9f6df0)` 的第三参 hash。
- 改 ammo slot：看 `global681 = 0` 和 `sys_0(0x90000,0,0)`，不要只改 `sys_4F`。
- 改取消路线：看 `func_123(0x280)` 和 `func_81(0xf48d2d49,...)`。
- 改动作表现：看 `func_914` 里的 motion / shell / 时间线，不要只改发弹 callback。

## 特射援护：方向分支、召唤 type、扣 ammo 分开看

`ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` 展示了一个更复杂但很清楚的 pattern：

```text
ACTION_AC_SPECIAL_SHOT_DIRECTIONAL
  -> func_488()
  -> global609 = func_952
  -> global200 = (global87 & 0x3c) ? 1 : 0
  -> callFunc3(func_951)

func_951
  -> func_502()

func_952
  -> func_529(0)
  -> func_89(0x23,0)
  -> func_168(0x1000000)
  -> func_887()
  -> func_308(global20,0x51f5773a,...)
  -> func_309(...,0x1f4)
       if global200 == 1:
         sys_51(0x20000,0,0x2,0,0x5)
         sys_51(0x20000,0,0x2,1,0x6)
         sys_58(0x9,0x874512c8)
       else:
         sys_51(0x20000,0,0x2,0,0x2)
         sys_51(0x20000,0,0x2,1,0x4)
         sys_58(0x9,0xa398b282)
       sys_4F(0x7,0x2,1)
       func_123(0x281)
```

这里可以拆成四层：

- 输入方向：`global200` 由 `global87 & 0x3c` 决定，像“是否带方向输入”的分支。
- 援护内容：Notion 记录里 `sys_51(0x20000,0,0x2,index,type)` 是 summon / assist 相关。这里 type `0x5/0x6` 与 `0x2/0x4` 是两组不同援护。
- ammo：`sys_4F(0x7,0x2,1)` 是主动扣 slot 2 ammo，不等于召唤本身。
- cancel：`func_123(0x281)` 决定之后能接什么，不应和发援护混为一谈。

如果要改特射援护，先决定你要改的是“援护类型”、“方向分支”、“扣弹逻辑”还是“取消路线”。这四类改动落点不同。

## 特格 / 变形突击：不要只盯 motion hash

OverBoost wiki 对デルタプラス特格的玩家语义是 Wave Rider 突击，N / 横方向有分支，第一段进入变形状态并且某些时点前不能 step / BD。MSC 里对应的证据主要在 `ACTION_BC_SPECIAL_MELEE_ALT_2` 与后续 callback：

```text
ACTION_BC_SPECIAL_MELEE_ALT_2
  -> func_488()
  -> func_219(0x769a714e)
  -> global602 = func_936
  -> global390 = 0xa
  -> global613 = 0
  -> global76 = 1
  -> global77 = 0
  -> global359 = 0
  -> callFunc3(func_935)

func_936
  -> func_888(0x7)               切到变形 / 突击 shell loadout
  -> func_308(global20,0xe6bd9694,...)
  -> func_900()
  -> func_903()
  -> func_531(func_937)
  -> func_167(0x1004000)
  -> func_296(0x3e8,1)
  -> func_123(0x381)             在时间线条件满足后开放接续

func_937
  -> func_296(0x3e9,0)
  -> sys_46(0x5,0,0x46,0x64)
  -> func_351(0,0x2)
  -> func_532(0x1f,0x20,0x64)
  -> func_535 / func_536
  -> func_321(0x651e4f06)        表现 / camera preset 候选
```

这里 `func_219(row)` 很重要。它从 `sys_0(0x60002,row,key)` 读一组移动 / 格斗参数到 `global379..393`。也就是说，特格的手感不只由 motion hash 决定，通常还由参数 row、`sys_46` 移动子命令、`func_532`、cancel mask 和 shell loadout 一起决定。

对“第一段不能 step / BD”这种玩家语义，当前能看到的 MSC 证据是 `global76/global77/global359`、`func_167(0x1004000)`、`func_296(0x3e8/0x3e9,...)` 和 `func_123` 开放时机。它们很像动作 gate / 状态 bit / cancel 窗口，但真正的 BD 输入拦截仍可能在 native engine 里，不能只凭这一页把 native 语义定死。

## 觉醒技：动作、镜头、变形速度和结束接续混在一起

`ACTION_ABC_FINAL_ATTACK` 是高复杂度动作的好样本：

```text
ACTION_ABC_FINAL_ATTACK
  -> func_488()
  -> global609 = func_955
  -> global390 = 0xa
  -> global613 = 0
  -> func_192()
  -> global183 = 0
  -> func_191()
  -> global771 = 1
  -> sys_1(0x60008,0x6c159eeb)
  -> callFunc3(func_954)

func_955
  -> func_89(0x16,0)
  -> func_888(0x7)
  -> func_308(...,0xe6bd9694,...)
  -> func_296(0x3e9,0)
  -> sys_46(...)
  -> sys_52(...)
  -> sys_58(...)
  -> func_309(...,0x44c)         时间线中段 shell / weapon / effect 操作
  -> sys_46(0x1,0x2,0,0,0xc8)   一段持续速度 / 转向类控制候选
  -> func_81(0x99a7a777,...)     结束后排到 lock-switch 后续动作
```

觉醒技不能按单点改。它至少包含：

- 动作 / 变形 shell：`func_888(0x7)` 与 `func_308(...)`。
- 移动 / 转向：`sys_46(...)`、`func_296(...)`。
- 镜头 / 表现：`sys_52(...)`、`sys_58(...)`、`sys_53(...)` 相关调用。
- 中途资源操作：`sys_4B/sys_4F/sys_4A`。
- 结束接续：`func_81(0x99a7a777,...)` 把后半段动作接上。

因此改觉醒技时，先把动作拆成“起手、命中 / 中段、结束、后续动作”几段，再分别查每段的 timeline marker。

## 镜头和表现：先找动作 callback，再找时间线

镜头不是一个全局“镜头函数”能解释完。当前样本里常见表现相关接口包括：

- `sys_53(...)`：Notion 记录里和 camera / shake / zoom 相关。
- `func_321(hash)`：在特格后续段中出现，像 camera preset 或表现 preset。
- `sys_58(...)`：常跟音效 / 表现 hash 一起出现。
- `sys_4A(...)`：模型挂点 / 特效生成相关。
- `sys_4B/sys_47`：shell entry 和 transform / motion / TRS。

实操上应该先定位动作 callback，再在 callback 里找 `func_309(..., time)` 附近的表现 syscall。不要从全文件里随机搜 `sys_53` 后直接改，因为不同动作对镜头的生命周期和清理点不同。

## BD / boost / 移动：MSC 改的是动作约束，不是通用输入系统

玩家侧 BD 是跳键二连并消耗 boost；step 是方向二连，能切诱导和枪口修正。这个判定属于通用引擎层。`2.c` 里更像是在控制“某个动作期间允许什么、给什么速度、何时开放取消”。

当前样本可先从这些点入手：

- `func_11/12/13`：主循环中的 boost / cancel / 外部转移 / 强制中断 gate，需要继续细拆。
- `func_219(row)`：动作参数 row，改特格 / 格斗移动手感时必须看。
- `sys_46(...)`：动作内移动 / 速度 / 机动控制的核心 native syscall 候选。
- `func_296(0x3e8/0x3e9/0x3ea/0x3eb,...)`：对 `sys_1` / `sys_46` 的封装，常用于状态或运动开关。
- `func_298..302`：对 `sys_46(0x3,...)` 的封装，像 motion rate / speed scaling。
- `func_123(mask)` / `func_81(hash,...)`：动作何时能接别的 action。

所以如果目标是“让特格更快 / 更能转 / 更早能 BD”，不要先找“BD 函数”。先看该动作的 `func_219` row、`sys_46`、`func_296`、`func_123` 时间线，再用实机行为验证。

## 命名建议：先命名角色，不命名结论

为了避免下一个 MSC offset 或 `func_N` 变化后全部失效，命名不要写成“`func_936 = 特格`”这种死名字。更好的 overlay 形式是：

```json
{
  "action_hash": "0x6ab12717",
  "action_name": "ACTION_BC_SPECIAL_MELEE_ALT_2",
  "player_label_zh": "特格 / 变形突击",
  "runtime_family": "melee_special_runtime",
  "callbacks": {
    "start": "func_936",
    "followup": "func_937"
  },
  "evidence": [
    "registered_by_func_1043",
    "sets_global602",
    "uses_func_219_row_0x769a714e",
    "uses_func_888_0x7",
    "uses_sys_46"
  ]
}
```

这种命名把“动作 hash、runtime 家族、callback 角色、证据”分开。以后 `func_936` 变成别的编号，只要重新跑静态分析，根据 action hash 和结构特征还能找回来。

## 改动风险分级

低风险，适合先实验：

- `sys_4F(0,slot,hash)` 的 weapon hash。
- `sys_58/sys_4A` 的表现 hash。
- 不影响控制流的 timeline 时间点微调。

中风险，需要同时看 ammo / cancel / timeline：

- `sys_51` 援护 type。
- `func_123(mask)` cancel mask。
- `func_309(..., time)` 大幅提前或延后。
- `func_219(row)` 的参数 row。

高风险，不建议先改：

- `func_1`、`func_386`、`func_877`、`func_1042` 这类全局初始化 / 注册入口。
- `func_11/12/13` 这类主循环 gate，除非已经明确 native 表含义。
- `func_887/888` 的默认 shell 组合，除非目标就是换装 / 组件挂接。
- `global20/global170/global143` 的全局语义，改错会影响 motion resource group 或 active shell。

## 当前仍需要继续深挖的入口

这页已经能把“我想改某个动作”落到具体链路，但还没有把所有 native syscall 子命令完全命名。下一步最值得深挖的是：

- `func_11/12/13`：主循环如何处理 boost、cancel、强制中断和外部 action 转移。
- `sys_46` 子命令：移动、速度、转向、运动开关的参数语义。
- `func_532/535/536`：特格 / 格斗后续移动控制。
- `ACTION_B_MELEE*` 家族：把普通格斗、横格、前格、后格、派生和 cancel 路线拆成同样的 action map。
- hitbox / damage 表：当前 `2.c` 更偏 depiction / action script，伤害和判定很可能还要结合其他文件或 native 表。
