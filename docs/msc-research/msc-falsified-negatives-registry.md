# MSC 被证伪做法总登记（E3- 负面结果）

**Date:** 2026-08-27
**Status:** E3-（本表每一行都来自实机失败记录）；覆盖率见
[2026-08-27-msc-architecture-audit](./2026-08-27-msc-architecture-audit.md) F2
**Kind:** 跨 cluster 负面结果索引 —— **提出任何 MSC 改法之前必须先对撞本表**

**Related:**

- 证据分级与实机协议：[msc-evidence-grade-and-ingame-audit-protocol](./msc-evidence-grade-and-ingame-audit-protocol.md)
- 各行的完整上下文见「来源」列指向的 owner 文档

---

## 为什么需要这张表

实机证伪（E3-）是本仓库**最贵**的知识：每一行都花掉过一次改码 + repack + 进游戏。
但它们原本只存在于各机体长文档底部的「作废路径」表里 —— 一个没读到 owner 文档的 agent
会把已经失败过的做法**原样再提一遍**，并且能为它写出漂亮的源码推导。

本表按**符号**组织，让 `rg 0x928ca34f` / `rg func_81` 这类检索能直接命中负面结果。

> 用法：改动涉及的每一个 hash / `func_N` / `globalN`，先在本表 `Ctrl+F` 一遍。
> 命中即**停止**，去读来源文档，不要重新论证。

---

## A. 动作切换 / 交棒（最高频复发区）

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| A1 | 指望 `func_65()` 之后 0.c 自动把 `0x928ca34f` 接到 `0x77b100ff` | 不接，原地卡 | `0x928ca34f` **不在** `func_13` slot 表，没有 `func_35`/`func_36` resolver | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §`0.c 约束` |
| A2 | 30 帧后 `func_81(0x9475130e, …)` 跨 hash 提交变形进入 | 提交不落地 | 同 A1：近战 hash 没有 resolver 链 | 同上「作废路径」 |
| A3 | 从近战 hash `func_81(0x77b100ff)` 拿 analog | **假卡死飞行**（有飞行外观、不能操控） | `global143` 保持 `0`，30 帧后由地面 `0.c` 自己接原生 analog | 同上 |
| A4 | 用私有 action hash / 假 slot `0x26` | 拿不到原生动作所有权，原地卡 | 复用原生 hash + `func_241` 挂 depiction | 同上 |
| A5 | 打断后在 `func_143` 补交 `0x77b100ff` | 受击动作播完立刻又进飞行 loop | 打断走 FORCED_RECOVERY，不要重排 loop | [flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md) §3 |
| A6 | 鸟形态 `func_15` 默认回 slot `0x18` | **操作被重新武装成飞行**（动作已不是飞、操作还是飞） | `var1` 中断块鸟形态直接回站立 slot `0x2` | 同上 |

## B. `0x3d` / thinker 抢占

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| B1 | 用槽 `0x3d` 让 `func_143` `func_95(0x9475130e)` 强制变形进入 | **每帧变形进入，特格接 N 之后取消全失效** | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §`0.c 约束` |
| B2 | 让 `func_72()`（slot `0x17` 资格）被 `0x3d` 无条件 `return 1` | 同上 | 同上 |

> **注意：** `0x3d` 分支目前仍存在于 Rebellion `0.c func_143` 顶部。它是 B1 的残留，
> 任何再次向 `0x10000/0/0x3d` 写 `1` 的改动都会复现 B1。

## C. 形态 `global143` 所有权

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| C1 | 地面 dash（`cut_in_loop` / 676 / 677）写 `global143 = 0x2` | detach 像没执行；30 帧后按住方向进不了原生飞行；ENTER 被转去 `func_937`，整段 dash 丢失 | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §坑 |
| C2 | `func_41` 只在 `global3 == 0x6d00aeaa`（站立待机）时拆 form | 受击 `0x4cdc9902`、倒地 `0xef809e66`、空中 idle `0xf5f21169` 全部漏掉 | [flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md) §3 |
| C3 | `func_41` 用 `phase == 2` 长期豁免拆 form | `func_593` 结束后人仍是鸟 | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) 作废路径 |
| C4 | 鸟形态把 `func_15`–`func_20` 整函数 `return 0` 当恢复策略 | 挡掉 slot `0x18` 重选，人掉进站立却仍是鸟 form | [flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md) §3 |
| C5 | FORCED_RECOVERY 只做 `func_884()` shell rebuild，不执行 wing refresh | body/form/操作已回 normal，但 `0xf6c1a9c1` wing 仍停在飞行 loop 姿态 | normal shell 后补原版顺序 `func_1025(2); sys_47(0x43,0xf6c1a9c1)`；禁止播放 body+wing `func_74(0x3b)` | [flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md) §5.6 |

## D. 移动通道 `sys_46`

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| D1 | 在 677 函数体里写 `sys_46` 锁冲 | `func_596` 随后 `func_300(global714)`；453/454=0 时倍率为 0，**原地不动** | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) 作废路径 |
| D2 | ENTER 把 `global453`/`global454` 置 0 | 同 D1 的成因；Star Winning 只置 `global452 = 0` | 同上 |
| D3 | 每帧写 `sys_46(0x2,0,0,1)` 或第一帧把 `0x1` 清零 | 通道插值到 0，30 帧**原地卡住不前进** | 同上 |
| D4 | 锁冲后再写 `sys_46(0x1, 0x2, …, 0)` | 幅值 0 的 `0x2` 抵消前冲 | 同上 |
| D5 | 无杆 EXIT 立刻 `sys_46(0x1,0,0,0)` + `func_296(0)` | 冲刺速度被掐死，原地停住落地，没有惯性 | 同上 |
| D6 | 无杆只写 `sys_46(0xf)` | 进 679 时 `0x1` 已空，从 0 淡到 0，仍原地落地 | 同上 |
| D7 | `func_296(0)` 后改写空中 idle `0x2` + 用 `func_287(0x3ed)` 当接地 | 保持飞行观感、**垂直下坠**、突然停 | 同上 |
| D8 | `sys_46(0, lock_err + arc)` 再沿机头飞 | `0x40000/5` 相对机头，一帧后 `command≈0`，变成**固定斜线**不是绕锁 | 同上 §左右绕飞 |
| D9 | 飞行特射只清平移通道，依赖 `func_595` 自己接管朝向 | 足止成功，但不对锁；玩家仍能用飞行输入改变朝向 | [flight-special-footstop audit](./wing-zero-rebellion-flight-special-footstop-handbook-audit.md) 2026-08-27 runtime：足止后按 TV `func_1042` 在 tick 尾写 `func_102(...,0x1f4,0x2)` → `sys_46(0,step)` |
| D10 | 自然 EXIT 只恢复 `global24 & 0x4000` + `sys_1(0x30001,1)`，不恢复 `func_351(0x2,0x4)` | 进入空中 idle，外观仍是鸟但不能飞，自动落地（伪普通） | 同上：`rebellion_transform_loop` 的 profile-2 one-shot 不保证重跑；679 必须在 `func_598` 前成对恢复 profile 2 |
| D11 | Messala 连续 owner tick 中只缩短 `global689`，仍让 `func_595` 在 `func_167(0x1004000)` 之前写 yaw | 按下特射先对敌；START 按住方向后数帧偏向输入方向；进入 SHOOT 时又突然对敌 | 保留 `func_593 → func_167 → clamp`；仅在 676 START 的 tick 尾按 TV `func_1042` 写 `func_102(func_626(),0x1f4,0x2)` → `sys_46(0,step)`。禁止扩到 SHOOT/679，避免照射跟踪或退出竞争 |
| D12 | 在 Messala 连续 owner 的 676 START 尾部追加 TV `func_1042` 形状的 `func_102(func_626(),0x1f4,0x2)` → `sys_46(0,step)` | 与 D11 完全相同，无任何可观察变化 | 该竞争不是 MSC 内 yaw 最后写入顺序；删除额外 yaw。下一单变量候选复用同目标 Bird CS / TV 飞行射击 tick 的 `global47 |= 0x40`，测试后续输入/动作处理是否才是 owner |
| D13 | 在 Messala 连续 owner tick 尾部复用 Bird CS / TV 飞行射击的 `global47 |= 0x40` | 与 D11/D12 完全相同，无任何可观察变化 | 删除该 flag；`global73` 也被 `func_586` 清零且本 action 不重写。先用已存在的 START charge FX 与 10f/40f 时长确认实际加载的 `2.dscex`，再做下一状态探针 |
| D14 | 只在 `2.c SPECIAL_SHOT_FLIGHT` ENTER/START 清 `global87 & 0x3c` | START 后续方向漂移收窄，但 ACTION commit 仍有一帧朝 held direction | `0.c func_6` 已先把 `global2` 发布到共享 field `0x7`；在 bird `0x100` 调 `func_95(0xd94d608f)` 前，重新发布 `(global2 & ~0x3c) | 0x2`，再由 `2.c` mask 维护后续 START 帧 |
| D15 | D14 再加 `0.c` bird-special 提交前重发 neutral shared field `0x7` | 仍与原现象完全相同 | `global87/global2` 方向快照不是已证实 owner；撤销 0.c/2.c mask。必须用录像或显式 motion/effect discriminator 区分 world yaw、body-local pose、motion 与 camera，禁止继续叠输入/yaw修补 |
| D16 | 10f START 仍使用缩短后的 `global689=0x3`，再叠每帧 shared field `0x7` / local `global87` 中和 | 仍出现先对锁、START 中段朝 held direction、SHOOT 再对锁 | 删除所有方向覆盖；按 Messala 恢复 `global689=0xa`，让原生 `func_595` 的 10f aim ownership 覆盖完整 10f START。10f/40f phase timing与 target clamp 保持 |
| D17 | 按 Messala 恢复 `global689=0xa`，但继续保留 Rebellion tick 尾 translation/pose clamp | 用户报告进入特射时仍有 held-direction 朝向瞬间 | 不再混合 owner；下一候选把 tick 收成 Messala `func_970` 原文：仅 `func_593(); func_167(0x1004000);`。接受 target translation 可能回归，以隔离朝向行为 |

## E. 生命周期 / `callFunc3`

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| E1 | `callFunc3(rebellion_transform_start)` 或 `callFunc3(func_1073)` | `callFunc3` 只挂动作主 tick；变形/锁冲必须在 tick 里**直接呼叫** | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §callFunc3 |
| E2 | 把 `rebellion_transform_start` 只在 ENTER 调一次 | 它是每帧状态机，只调一次会停在 START | 同上 |
| E3 | `callFunc3(dash_tick)` 里自己跑 phase 状态机当变形主 tick | 与 `func_916` 用法相反 | 同上 |
| E4 | 679 每帧 `analog` + `locked_loop_move` 且不置 `global252` | **假飞行，松杆也停不下来** | 同上 |
| E5 | 679 太早置 `global252` | `func_44`/`func_93` 把 mag 清 0 = 原地停 | 同上 |

## F. 输入映射 `0.c func_143`

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| F1 | 按 TV 语义在鸟分支「去掉 `0x100` 主射」 | Rebellion 主射是 `0x1` 不是 `0x100`，鸟形态**仍能出主射** | [bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md) §3.3 |
| F2 | 在 `2.c` 的 `ACTION_*` 里按 form 硬 `return` 来做形态武器表 | 形态武器表属于 0.c selector 层，2.c 拦不住 | 同上 §1.2 |
| F3 | 鸟近战用 `global48 & 0x3e`（含 `0x2` 摇杆位） | 会重复提交 `0x928ca34f` 占住机体，原生 loop analog 跑不了 | 同上 §4 注释 |
| F4 | 特格取消窗保留 `func_123(0x9a5)` | bit `0x4` 是 packed 前格，引擎 native cancel 到 `0xa2236f44` 跳过窗 | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) 作废路径 |
| F5 | 特格一进门就 `dash_requested=1`，站立/方向格斗全 hijack | 所有近战变冲刺，取消也没了 | 同上 |
| F6 | Thinker 注册用裸偏移 `sys_1(0x10001,0,0x1,0x5fef)` | `func_143` 之前的 body 变大就错位 | [bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md) §1.1 |

## G. 工具链

| # | 被证伪的做法 | 症状 | 来源 |
|---|--------------|------|------|
| G1 | 用 `msclang_modern.py` / `msc_core` codegen 打游戏包 | body 形状变化，**游戏崩溃** | [msc-repack-runnable-guide](./msc-repack-runnable-guide.md) |
| G2 | 改了 `0.c` 只重打 `2.dscex` | 0.c 侧改动不生效 | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §编译 |
| G3 | 把「反编译回环一致」当成行为正确的证据 | 回环只证明 **E1**（字节码忠实），证明不了 L3 | [audit-protocol](./msc-evidence-grade-and-ingame-audit-protocol.md) §5 #6 |

## H. 自制 motion 时钟 / `func_309` / `func_310`

Homemade NUANMB folder（DCC `*_out.fbx` 导入、Rebellion `tks11a` / `0xa0cd8d56`）的阶段墙钟跟 **游戏帧** 走，不跟 stock motion-complete 走。Owner：[homemade-motion-clock-vs-game-frame](./homemade-motion-clock-vs-game-frame.md)。Rule：`.cursor/rules/msc-homemade-motion-clock.mdc`。

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| H1 | 自制 folder 上用 `func_309` / `sys_47(0xf)` / `sys_47(0x7)` 等 stock motion-complete 等待切段 | 107 帧片墙钟约 **3s**；把门 121→107→81 **墙钟不变**；`func_116` 后再 seek 末帧等 `0x7` → **卡最后一帧** | `global244 -= func_274()`（`global457`，1 帧 = `0x64`）；`func_308` 只 play/seek | [homemade-motion-clock-vs-game-frame](./homemade-motion-clock-vs-game-frame.md) |
| H2 | 用 `func_310` / `sys_47(0x5)` / 每帧 `func_110` 当自制速度或时长旋钮（含 `func_310(1000)`） | 墙钟不变。`func_73` 进段 `func_110(0x64)`；`func_308(..., global276, ...)` 把 `0x64` 再打进去 | 不要当旋钮。时长只走 H1 的游戏帧倒计时 | 同上 |
| H3 | `func_241(action_hash, HANDLER)` 已经证明 ACTION 进入后，仍把根因写成没打包 / 旧 `2.dscex` | 浪费整段 session；改打包对照不改变时长 | `func_241(hash, 0)` 才是「不进 ACTION」对照。仍进入 = 时钟问题，见 H1 | 同上 |

## I. Cross-unit partial ports

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| I1 | Messala 连续 owner tick 直接用于 Rebellion，但不加 target translation clamp | 对锁、射击、自然收招均正常；ACTIVE 仍持续位移，而 Messala 停住 | `func_593` → `func_167(0x1004000)` 后仅清 ch1/ch2、case-4 vector、`func_300(0)`；禁止清 `0x4000`/motor/`global714`，且 679 (`global184==4`) 跳过 | [messala-flight-sub-shot-flow](./messala-flight-sub-shot-flow.md) §2026-08-28 runtime |
| I2 | translation clamp 只清移动通道，不清 body-local rotation bank | 位置已停、收招正常，但左右方向键仍改变机体倾斜角 | ACTIVE 最后 `func_104(0,0,0)` + `func_107(0,0,0)` 清 `global268–273` 对应的 body channel-1 姿态；不改 `sys_46(0)` 世界 yaw，679 跳过 | 同上 §Runtime refinement |
| I3 | Rebellion 使用 loop motion，却在 Messala-style 679 人工等待 10 帧 | 射击已结束且玩家已可自由操控，但 action 仍锁敌并以奇怪姿势离开 | 679 只做一次 cleanup 后立即 `global252=1`；Messala 的 motion-end wait 仅适用于真实 recovery clip | 同上 §looping motion 679 tail |

## J. Independent striker / `sys_51`

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| J1 | 把 `sys_51(0x20000, 0, 0x2, slot, type)` 当成 unit-task automata / 宿主 `bulletparam` 召唤 | 独立 `5xxxxxxxx` 被带去改错层 | 独立机体只走 `sys_51` + `strikertable[host][slot]` | [sys51-independent-striker-vs-automata](./sys51-independent-striker-vs-automata.md) |
| J2 | `2.c` 已调 `sys_51`，但 `0.c` 去掉 EW 的 `sys_0(0x90000, 1)` + `d0001 && !d000b` 再交 `ACTION_AB_SUB` | **动作播了、援护机体不出** | 前后副射进门必须带这两道 native ready 门；不要套到左右/N 自制副射 | 同上 §`0.c` gate；Rebellion 2026-08-29 **E3** 补门后 `516001001` 出现 |

---

## 待提取（本表尚未覆盖）

下列文档含负面结果但**尚未抽进本表**，抽取前不要认为本表已完备：

- `2026-08-09-wing-zero-rebellion-transform-port-plan.md`（144 行表格）
- `wing-zero-rebellion-bird-melee-n-followup.md`（49 行）
- `tv-wing-zero-flight-special-melee-landing-copy-list.md`（25 行）
- `tv-wing-zero-flight-special-melee-landing-todo.md`（20 行）

**其余 60 份 MSC 文档没有任何负面结果记录**（见审计报告 F2）。
这不代表它们没踩过坑，只代表坑没被记下来。
