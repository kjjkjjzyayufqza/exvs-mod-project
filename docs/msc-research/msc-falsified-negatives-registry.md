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
| D18 | `SPECIAL_SHOT_FLIGHT` START ENTER 一次性 `face_current_target` 后立刻 `stop_aim`（`global689=-1`） | 背对敌人时转向半途停下；射完进入自由控制后仍持续对锁 | START 全程每帧 `face`（TV `func_1042` 的 `0x1f4` 限速）。`stop_aim` 只在 START 置 `252`、SHOOT/END ENTER、以及 `release_flight_owner` 之前。`stop_aim` 不要写 `global714`（I1）。禁止把 `face` 扩到 677/679（D11）。不要改 ACTION `global689=0xa`（D16） |

## E. 生命周期 / `callFunc3`

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| E1 | `callFunc3(rebellion_transform_start)` 或 `callFunc3(func_1073)` | `callFunc3` 只挂动作主 tick；变形/锁冲必须在 tick 里**直接呼叫** | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §callFunc3 |
| E2 | 把 `rebellion_transform_start` 只在 ENTER 调一次 | 它是每帧状态机，只调一次会停在 START | 同上 |
| E3 | `callFunc3(dash_tick)` 里自己跑 phase 状态机当变形主 tick | 与 `func_916` 用法相反 | 同上 |
| E4 | 679 每帧 `analog` + `locked_loop_move` 且不置 `global252` | **假飞行，松杆也停不下来** | 同上 |
| E5 | 679 太早置 `global252` | `func_44`/`func_93` 把 mag 清 0 = 原地停 | 同上 |
| E6 | N 格 `func_536` 把 BD 段 body（`func_981`/`func_980`）接到 `ACTION_B_MELEE` runtime，不走 `ACTION_B_MELEE_VARIANT` ENTER / `func_219(0x453cdc30)` / `func_979` | N2 之后动作怪异：缺 BD 起手和 param row，且 BD2 出现在 BD1 前 | 不要把别的 ACTION 的 segment 当当前格斗的下一刀 | 2026-08-29 N combo BD splice（user rejected） |
| E7 | N combo BD1→左右3 在 `rebellion_n_dir2_third_start` 把 `global175`/`global188`/`global189` 置 0，跳过 `func_491`/`func_492` | 交棒过短；左右3 不跟踪、打不到。`func_492` 在 `global188<=0` 时写 `global603=1`，`func_493` 的 `func_517` 要求 `global603==0` | 写短接近计时且 `189<=188`，让 `func_516` 追、进 `func_974` 时 `global603` 仍为 0；`global385=0x190`。不要清零接近栏 | 2026-08-29 user: 有点太短了，左右3没有跟踪 |
| E8 | 站立 BD2 `func_981` 在首帧 `func_536(0x1,0x10)` 交 `DIR_2` 左右1 | BD2 转身回切还没播，看起来像 BD1→左右1 | BD2 等到 clip end 再 `func_81`；不要在 `0x10` 切左右 | 2026-08-29 user: 现在是 BD1→左右1 不是 BD2 |
| E9 | 站立 BD1 `func_980` 在 `sys_47(0x7)` 无条件 `global252=1` | BD1 片子一完 VARIANT 就结束，BD2 进不去 | 站立 clip 清 `global140` 后 `func_71(func_981)`，不要 `252`；N 连 `in_bd` 才 `func_81` | 2026-08-29 user: BD1 到 BD2 没了 |
| E10 | 把 `func_981` 当成完整 BD2，clip 直接 `func_81` 前派生 | `981` 只是转身；回切在 `0xbabeaf7` → `func_982`/`984`/`985`。BD2 看起来没了 | 恢复 `981` vanilla `func_81(0xbabeaf7)`；前派生只从 `func_985` clip 交 | 2026-08-29 user: BD2 是好几个函数连在一起 |
| E11 | `func_985` 在 `func_149`/`0x2bc` `func_81` 前派生并 `want=1`+`global252`，clip 见 want 已置就不再 `func_81` | 出刀瞬间 81 未落地，clip 只 252，BD2 结束后接不上前派生 | 出刀用 `func_536` mash；clip **总是** `func_81`，不要用 want 当失败闩 | 2026-08-29 user: BD2 完了基本上接不到下一个 |
| E12 | BD 前派生 `func_990`/`func_991`/`rebellion_bd_fwd_first_start` 写 `func_351(0x2,0x4)` + `func_167(0x1004000)` + 每 tick `sys_46(0x2,0x3,0,sys_0(0x40000,0x3,global39),0xc8)` | **突然冲到天上**。`func_351(0x2)` 是飞行姿态；`0x40000,3` 是横向/高度偏移，不是安全爬升 mag | 地面格斗只留 `func_351(0,0x4)` 与平面 `func_532`/`global385`/`func_528`。禁止把飞行 analog 和 `sys_46(0x2)` 高度插值放到前派生 | 2026-08-29 user: 突然冲到天上 |
| E13 | BD 前派生 loop 在 `rebellion_bd_fwd_reopen_chase` 写 `global184=1` 想重跑 `func_491`/`func_516` | 1 接不上 2，一直重复 1，mash 可无限 1。`func_492→493` 清 `global185` 并 `func_530` 清 `global140`，然后 `func_71(global629)`；`first_start` 的 `func_531(func_990)` 让 629 一直是 990。`func_239` 只在 `func_493` | loop 留在 `func_493`。追人用 `func_532`/`func_517` + `global603=0`/`global507`。不要把 `global184` 打回 1 | 2026-08-29 user: 前派生1,2不会连2，一直1重复，无限重复 |
| E14 | `ACTION_B_MELEE_VARIANT` 把 `global602` 指到攻击 body `func_980`（想跳过 BD1 起手直接出刀） | BD2 之后那一刀 BD1 **原地卡死**，动作不结束 | `global602` 只能是接近 body。`func_490` 用它跑近战 phase 1-2，phase 3 由 `func_493` 走 `func_71(global629)`，而 `global629` 只由 `func_531` 写、且 `func_488` 刚清零 —— `func_980` 不含 `func_531`，于是 phase 3 执行 `func_71(0)`，`func_72` 无 body 可跑。语料：300 个原版机体 1255 个 `global602` 目标全部调用 `func_531`，零反例。额外一刀请整对重放 `func_979 -> func_980`。**该 BD 连段扩展已于同日被用户撤回**：站立 BD 现已还原为原版 `BD1 -> BD2`，`func_980` 片尾回到 `global252 = 0x1`，仅保留 `rebellion_n_combo_in_bd` 包住的 N 连段分支 | 2026-08-29 user: BD2 了后 BD1 就卡住了；随后 user: 改回原本的 BD1 -> BD2 |
| E15 | 左右2 用 `func_536(0x1, 0x1c, rebellion_dir2_enter_n3)` 把 N3 `func_955` 当 body 接进 `ACTION_B_MELEE_DIR_2` | N3 **不往敌人冲**、打不到；补 `func_532(0x28,0x32,0x5f)` + `global385=0x190` 也救不回来 | 冲刺来自近战驱动的 phase 1-2（`func_491`/`func_492`），只有真 ENTER 会跑：`func_219(row)` 读 grapparam 的 `global390/391/392` → `func_490` → `func_526()` → `global175/188/189`。`func_536` 落在 phase 3（`func_493`）里，整段接近腿被跳过，且 `global385` 已被 `func_488` 清零。改法同 E6：`func_81(0x6338be1f)` 重新 ENTER DIR_2，ENTER 里按 `want_n3` 把 `global602` 指到 `func_531(func_955)` 的接近 body；N3 再接左右3 也必须走 ENTER （`rebellion_n_submit_dir2_third`），不能 `func_536` 到 `func_974` | 2026-08-29 user: 这个N3缺少了冲刺动作，不往敌人冲，所以打不到。**但改成 ENTER 后实机仍不冲（见 E16）** |
| E16 | 把 左右2→N3 改成 `func_81(0x6338be1f)` 重新 ENTER DIR_2，靠 `func_490`/`func_526` 的接近段给 N3 冲刺 | N3 照样出刀，**还是不冲、打不到**（与 E15 现象相同） | ENTER 让 `global630 = 0`，`func_493` 的追踪改用 `global384` 而非 `global385`；且 `func_492` 一旦 `global188 <= 0` 就写 `global603 = 1`，而 `var1` 要求 `global603 == 0`，接近段没够到人就进 phase 3 时追踪被整个关掉。**结论：格斗后续刀的位移不要指望接近段。**确定性做法是脚本直写移动通道 —— 本机体原版 `func_962` 用 `sys_46(0x1, 0x1, 0, 0, 0x12c)`、前派生3段 `func_992` 用 `sys_46(0x1, 0x1, ..., 0x190)`；驱动追踪走通道 `0x2`（`func_493` 的 `sys_46(0x1, 0x2, 0, global182, global507)`），通道 `0x1` 空闲，两者叠加。yaw/pitch 必须为 0，非零 pitch 就是 E12 冲上天的原因 | 2026-08-29 user: N3 照样出刀，但还是不冲、打不到 |
| E18 | 左右3 `func_974` 每 tick `sys_46(0, func_102(0x40000/3, 0x2bc, 0x2))` + 通道 1 mag `0x320` + `global385=0x320` | **追踪过猛**，像磁铁吸过去。E16 的通道 1 冲刺仍需要，但 800 mag 再叠每帧锁转向超过 EW 原版（原版只有 `func_532(0x1f,0x2a,0x50)` + `global385=0x190`，无 ch1、无 yaw） | mag / `global385` 回到 `0x190`；删每帧 yaw。保留 `func_532` 从第 2 帧开始（坡/空隙还要够）。下一刀若仍猛，再推迟 `func_532` | 2026-08-30 user: 左右3追踪太暴力 |
| E19 | 左右3 仍 `sys_46(0x1,0x1,0,0,0x190)` 从第 0 帧冲，且 N3 `func_536(0x1, 0x1c, func_974)` | **到了敌人位置但打不到**。N3 判定 17f 结束；536 要 28f 才进 974；974 的 `func_148` 在 `0xc80`（32f）。人已经贴上，再冲 32f 冲过头，判定才开 | 536/535 改 `0x12`（N3 `func_149` 之后立刻交 974）。974 **不要** ENTER 通道 1 mag；`func_532` 推迟到 `0x14`（vanilla 是 `0x1f`）。不要在 536 窗口前对 N3 写 `global252`（252 会结束整段 DIR_2） | 2026-08-30 user: 还是冲太快；N3 结束要加快否则左右3接不上 |
| E20 | 左右3 去掉 ENTER mag 后，整段 32f 挥空都没有通道 1 | **起手已经贴上，出刀时不跟随，永远打不到**。`func_532`+`global385` 在 DIR_2 phase 3 带不动位移（E15/E16）。左右1/2 判定在 3–13f，来不及丢目标；974 要等到 `0xc80` | 只在出刀窗口写 `sys_46(0x1,0x1,0,0,0x190)`：`0xbb8` 开、`0xe10` 关。不要第 0 帧写（E19），不要每 tick `sys_46(0, func_102…)` 锁转向（E18） | 2026-08-30 user: 左右3 start 靠近后，开始攻击时没跟随 |
| E21 | E20 把通道 1 推迟到 `0xbb8`（判定前 2f） | **左右3 根本追不上**。N3 命中会把敌人打飞一段，2f 的 `0x190` 补不回这段距离 | mag 仍 `0x190`、仍无 yaw；开写时刻改到 `0xc8`（974 第 2 帧，与 N3 冲刺同一写法），`0xe10` 再清。不要加回每帧锁转向。若仍追不上，下一包只加 mag（`0x258`/`0x320`），不要两件事一起改 | 2026-08-30 user: N3 打完敌人被打飞有点远 |
| E22 | 左右3 通道 1 从 `0xc8` 跟到 `0xe10`（已 0 距离）仍只靠 yaw=0 的前冲出刀 | **0 距离仍挥空，感觉没追中**。位移够了，缺的是出刀朝向：前向判定对着冲刺轴，人叠在身上但 hurtbox 不在刀里。再加 mag 会冲过头（E19） | 只在 `func_148` 那一帧 `sys_46(0, func_102(0x40000/3,…))` 对锁定转向，用 `rebellion_dir2_fourth_aimed` 闩住。不要每 tick 写（E18）。mag 时机不动。若仍挥空，下一包在 `0xbb8` 停 mag 让刀打在身前，或提前 `0xc80` | 2026-08-30 user: 已经 0 距离仍挥空，没追中 |
| E23 | E22 出刀瞬间转向后 mag 仍开到 `0xe10` | **改善很多，但约 9 成仍打不到**。转向轴对了；0 距离时通道 1 还在把前向判定送过 hurtbox。E20 在「还没贴上」时切 `0xbb8` 会追不上（E21）；现在已经贴上 | mag 仍 `0xc8` 起、`0x190`；**停写改到 `0xbb8`**（判定前 2f）。E22 一帧转向保留。不要加 mag、不要每 tick yaw。若仍 9 成空，下一包把转向提前到 `0xbb8` | 2026-08-30 user: 改善了很多，但 9 成打不到 |
| E24 | E23 停冲 + E22 转向后，刀仍从敌人**上方**挥过 | **敌人位置偏低，打空**。N3 打飞后 hurtbox 在下方；通道 1 pitch 一直是 0，只有平面追。E12 禁止的是 `sys_46(0x2)` + `func_351(0x2)` 冲上天，不是通道 1 的负 pitch | 追击 `sys_46(0x1,0x1,0,0xffffdcd8,0x190)`：pitch −90°（百分度，atlas）。`0xbb8` 清掉 pitch。不要 `sys_46(0x2)`、不要改 `func_351(0)`。若扎地，下一包改 `0xfffff254`（−35°，机体原版格斗下潜） | 2026-08-30 user: 改善很多但 9 成打不到；敌人偏低，要更强 |
| E25 | E24 用 atlas「−90°」`0xffffdcd8` 当「往下」 | **人往上冲，太上了**。通道 1 pitch 符号与 atlas 字面相反：负值抬头。随后 `0x7d0`（+20°）仍偏高 | 正的、更弱：`1000`（+10.00°，同 `0x3e8`）。不要 `0x2328` / `0xffffdcd8`。仍禁止 `sys_46(0x2)` / `func_351(0x2)`。用户 2026-08-30 实机：`1000` 比 `0x7d0` 更好 | 2026-08-30 user: 应该是正的不要太强；随后 user: `1000` 更好 |

## F. 输入映射 `0.c func_143`

| # | 被证伪的做法 | 实机症状 | 来源 |
|---|--------------|----------|------|
| F1 | 按 TV 语义在鸟分支「去掉 `0x100` 主射」 | Rebellion 主射是 `0x1` 不是 `0x100`，鸟形态**仍能出主射** | [bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md) §3.3 |
| F2 | 在 `2.c` 的 `ACTION_*` 里按 form 硬 `return` 来做形态武器表 | 形态武器表属于 0.c selector 层，2.c 拦不住 | 同上 §1.2 |
| F3 | 鸟近战用 `global48 & 0x3e`（含 `0x2` 摇杆位） | 会重复提交 `0x928ca34f` 占住机体，原生 loop analog 跑不了 | 同上 §4 注释 |
| F4 | 特格取消窗保留 `func_123(0x9a5)` | bit `0x4` 是 packed 前格，引擎 native cancel 到 `0xa2236f44` 跳过窗 | [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) 作废路径 |
| F5 | 特格一进门就 `dash_requested=1`，站立/方向格斗全 hijack | 所有近战变冲刺，取消也没了 | 同上 |
| F6 | Thinker 注册用裸偏移 `sys_1(0x10001,0,0x1,0x5fef)` | `func_143` 之前的 body 变大就错位 | [bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md) §1.1 |
| F7 | 飞行特格 A 段 `func_123(0x200)` 且 `func_233(0x7e, 0)` | **一按特格立刻变普通形态，下落动作丢失**。`0x200` 就是特格；起始按住会 native cancel 进地面特格。`func_233` 第二参 0 不排除 `0x200` | [flight-hit-air-hold-and-special-melee-cancel](./wing-zero-rebellion-flight-hit-air-hold-and-special-melee-cancel.md) 2026-08-30 user |
| F8 | wait 用 `func_309(global20, 0x960)` 当 TV `func_1054` 超时 | A 已走到 `0x708`，再 6f 就超时，空中 fallback 立刻结束动作 | 同上；2026-08-23 基线已删该超时 |
| F9 | 飞行特格 ENTER 保形：三 hash 进 `func_41` allowlist 与 `func_882` skip，仍播普通身 Folder `0x1192E91E` | 用户第三次仍报**还是一样改坏了 / 一按丢失**。copy-list：normal-form motion 不能在 bird owner 上启动 | [flight-hit-air-hold-and-special-melee-cancel](./wing-zero-rebellion-flight-hit-air-hold-and-special-melee-cancel.md) 2026-08-30 user。回到 2026-08-23：ENTER `interrupt` 再播 A。视觉会变普通，但下落在。不要再保形除非换鸟 owner 片 |

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
| H4 | 胜利 pose 用 `func_97(0)` / `sys_47(0x4, global20, 0)` 解 GBL_RT 骨锁，指望自制 `GBL_RT` Y=10 离地 | **仍贴地**。用户停这条路，改在 clip 里做 `CENTER_RT` / `BASE` | 不要再解骨 0，也不要叠 `func_351(0x2)`（E12）。高度走 motion 骨骼 | [victory-pose](./wing-zero-rebellion-victory-pose.md) §7；2026-09-05 user |

## I. Cross-unit partial ports

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| I1 | Messala 连续 owner tick 直接用于 Rebellion，但不加 target translation clamp | 对锁、射击、自然收招均正常；ACTIVE 仍持续位移，而 Messala 停住 | `func_593` → `func_167(0x1004000)` 后仅清 ch1/ch2、case-4 vector、`func_300(0)`；禁止清 `0x4000`/motor/`global714`，且 679 (`global184==4`) 跳过 | [messala-flight-sub-shot-flow](./messala-flight-sub-shot-flow.md) §2026-08-28 runtime |
| I2 | translation clamp 只清移动通道，不清 body-local rotation bank | 位置已停、收招正常，但左右方向键仍改变机体倾斜角 | ACTIVE 最后 `func_104(0,0,0)` + `func_107(0,0,0)` 清 `global268–273` 对应的 body channel-1 姿态；不改 `sys_46(0)` 世界 yaw，679 跳过 | 同上 §Runtime refinement |
| I3 | Rebellion 使用 loop motion，却在 Messala-style 679 人工等待 10 帧 | 射击已结束且玩家已可自由操控，但 action 仍锁敌并以奇怪姿势离开 | 679 只做一次 cleanup 后立即 `global252=1`；Messala 的 motion-end wait 仅适用于真实 recovery clip | 同上 §looping motion 679 tail |
| I6 | `0xd94d608f` `SPECIAL_SHOT_FLIGHT` 679 ENTER 立刻 `rebellion_flight_special_release_flight_owner`（`func_351(0x2,0x4)` / `func_296(0x3e8,1)`），同时 `rebellion_flight_special_end_hold` 仍每 tick `rebellion_flight_special_face_current_target` | 照射结束后可自由飞，但朝向仍锁敌 | 679 hold 保持 analog profile 0；`release_flight_owner` 与 `global252` 同一拍、先于 `func_598`（D10）。不是 I3：I3 是 analog 已还回去之后再空等 | 同上 §2026-08-30 679 analog restore |
| I7 | 百分百 PMX-000 Messala `func_970`（`func_593(); func_167(0x1004000);`）+ Messala `452/453/454=0x64/0x61/0x61`，去掉 Rebellion 平移 clamp / `face` / `stop_aim`，679 ENTER 立刻 profile 2 | **START / SHOOT / END 全程持续移动，跟随键盘方向，足止完全没有** | 不要把 Messala tick 当成足止。鸟形态飞行位 `0x4000` 仍在时，原生 analog 同时写位移和朝向（D9/I1）。梅萨拉的停是它自己的 analog/clip，不可移植。下一刀若要悬停，只能加回 target clamp（I1），不要再叠自制活锁 | 同上 §literal Messala tick E3- 2026-08-30 |
| I8 | I7 之后只把 ACTION `global452/453/454` 从 `0x64/0x61/0x61` 改成 `0x32/0x32/0x32` | **照射跟杆飞的敏捷度与改前一样** | 这组 mix 在 `func_593`/`func_300` 里被消费，随后 `func_167(0x1004000)` 把飞行 analog 残量按全速写回。要降照射敏捷，必须在 `func_167` **之后**、且仅 `global184==2` 时 `func_298/299/300` 压 ch1/ch2/ch4。不要再降 ENTER mix。不要写成 0（I1 足止 / D2 冻结） | 同上 §I8 ENTER mix |
| I9 | Rebellion `SUB_SHOT_FLIGHT_ROLL_*` 只把 TV `func_351(0x1,0x4)` 加到 START/SHOOT ENTER，期待移动与 yaw 解耦 | **与前包无可观察差异**：背对敌人 START 能对准；持续 SHOOT 按住后仍把朝向拉离目标 | profile 1 不是本机 SHOOT yaw owner。下一单变量仅在 bare `func_593()` tick 之后、`global184==2` 时写 current-target yaw；不扩到 START/679，不动平移通道。该 tick 没有 D12 的后置 `func_167` | [hambrabi-flight-sub-side-roll-shot](./hambrabi-flight-sub-side-roll-shot.md) §4.10；2026-08-31 user |
| I10 | Rebellion roll-sub 在 bare `func_593()` 后、仅 `global184==2` 写 `func_102(func_626(),0x1f4,2)` → `sys_46(0,step)` | **完全不起作用**；持续 SHOOT 按住后仍偏离目标 | 禁止继续加大 yaw。用户拒绝 SE 探针。I11 证明 ENTER-only 关电机同样不能保住朝向 | [hambrabi-flight-sub-side-roll-shot](./hambrabi-flight-sub-side-roll-shot.md) §4.10；2026-08-31 user |
| I11 | Rebellion roll-sub 只在 677 ENTER 写 `func_296(0x3e8, 0)` | 当时按锁朝向读；后澄清为持续按后仍往后飞。单帧关电机不够 | 不要再关电机。I12 已证明每 tick 关电机会自由落体 | [hambrabi-flight-sub-side-roll-shot](./hambrabi-flight-sub-side-roll-shot.md) §4.10；2026-09-01 user |
| I12 | Rebellion roll-sub 677 **每一 tick** `func_296(0x3e8, 0)` | **SHOOT 全程自由落体**，形态闩仍是鸟，落地后解除变形（假鸟态） | 禁止再关 `sys_1(0x30001)`。Hambrabi / 鸟主射都不关电机 | [hambrabi-flight-sub-side-roll-shot](./hambrabi-flight-sub-side-roll-shot.md) §4.10；2026-09-01 user |
| I13 | Rebellion roll-sub 只把 `global454` 从 `0x62` 改成鸟主射 `0` | **没用**：不按后仍正常，持续按后仍往后飞、镜头偏 | leftover mix 不是后向位移 owner。没有 `func_167` 时 native `0x4000` analog 仍全速写后退。禁止再降 ENTER mix。禁止再关电机（I12）。禁止清 `0x4000` / 抄足止 clamp / 再写 yaw。不按后这条招保持现状 | [hambrabi-flight-sub-side-roll-shot](./hambrabi-flight-sub-side-roll-shot.md) §4.10；2026-09-01 user |
| I4 | 按 HUD 序号抄 TV `sys_4F(0xb, 0x3, 0)` 清 Rebellion slot 3，退出不重暂停 | 飛翔在空中就开始 reload | 卸格可以；EXIT 必须三参数重绑 FLYING 后若 `global772==1` 立刻 `sys_4F(0x15, 3, 0)`（`func_1034(4)`） | [slot3-flying-land-reload](./wing-zero-rebellion-slot3-flying-land-reload.md) |
| I5 | 用 Gyan/Delta 的 `sys_4F(0x16, 3, 0/1)` 藏 Rebellion FLYING HUD | normal 槽 3 变红色 disable | vanilla EW 从不写槽 3 的 `0x16`。`0x16=1` 会把飞翔格打成 sealed。鸟形态卸格用 `0xB`，不要写 byte 322 | 同上；2026-08-29 user |

## J. Independent striker / `sys_51`

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| J1 | 把 `sys_51(0x20000, 0, 0x2, slot, type)` 当成 unit-task automata / 宿主 `bulletparam` 召唤 | 独立 `5xxxxxxxx` 被带去改错层 | 独立机体只走 `sys_51` + `strikertable[host][slot]` | [sys51-independent-striker-vs-automata](./sys51-independent-striker-vs-automata.md) |
| J2 | `2.c` 已调 `sys_51`，但 `0.c` 去掉 EW 的 `sys_0(0x90000, 1)` + `d0001 && !d000b` 再交 `ACTION_AB_SUB` | **动作播了、援护机体不出** | 前后副射进门必须带这两道 native ready 门；不要套到左右/N 自制副射 | 同上 §`0.c` gate；Rebellion 2026-08-29 **E3** 补门后 `516001001` 出现 |

## K. CSA 蓄力条 / `sys_4F(0)` / `sys_58(0x436f1f0a)`

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| K1 | 自制 `SUB_SHOT_CUSTOM` 只把开火改成三参 `sys_4F(0, 0x1, CDA9F563/564)`，仍在 676 起手 `sys_58(0x1, 0x436f1f0a)` | 当时报告：按住射击蓄力再按副射条空。后续澄清：**按下没问题，出弹那一帧才空** | slot `0x1` 三参仍打在弹药槽上，不够。获胜是 K4 | 2026-08-30 user |
| K2 | 676 起手去掉 `sys_58(0x1, 0x436f1f0a)` | 按下副射条仍在；**射出弹那一帧仍清空** | 蓄力循环 SE 不是出弹帧 owner | 2026-08-30 user: 按下没问题，射出弹才会清空 |
| K3 | 677 出弹帧去掉 `sys_4A(0x1, 0x7, 0/1)`，仍 `sys_4F(0, 0x1, CDA9F563/564)` | **出弹那一帧条仍空** | group-7 清光不是出弹帧 owner | 2026-08-30 user: 也还是一样 |
| K4 | 677 `sys_4F(0, 0, CDA9F563/564, 1)`（slot 0 + 第 4 参）或 `sys_4F(0, 0x1, hash)` | **打包进游戏后**，出弹帧仍清正在蓄的 CSA 条 | `sys_4F(0, 0x5, CDA9F563/564)` **三参**。`arg2=0x5` 是 `func_589` 跳过 `0x90000` 的虚拟出弹槽，不是弹药槽 1。第 4 参是**该 slot 的蓄力消费 bool**（`sub_1405BCF00`），不是 CS 槽编号；slot 0 + `1` = 清 CSA。ENTER 的 `global681=0x1` 仍管副射弹药 | 2026-08-30 user **E3** 打包后确认 |

## L. `sys_4A` effect group

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| L1 | 同一 tick 把 `0xdc4314cd` 和另一 `sys_4A` 写进**同一 group**（只改 slot，例如 `0x7/0` → `0x7/1`） | 后写覆盖先写；闪光或气场消失 | group 分流：`0xdc4314cd` 用 `0x6/0`，`0x2133778d` 用 `0x7/0`。地面 dash 676 也不要把该 hash 写进光剑 group `0x8` | [bird-melee-n-followup](./wing-zero-rebellion-bird-melee-n-followup.md) §`sys_4A` 2026-08-21 E3；dash 见 [special-n-bird-dash](./wing-zero-rebellion-special-n-bird-dash.md) §676 闪光 |

## M. Victory extra shell / `sys_4B`

| # | 被证伪的做法 | 实机症状 | 正确方向 | 来源 |
|---|--------------|----------|----------|------|
| M1 | 自制胜利 `func_870` 首帧 `sys_4B(0x2, 0x04dc16ce, 0, 0x8525ad9a)` + `func_308` 同 Folder + `func_314` 挂 SHL Part 白机 | **完全没有第二台** | 不要把自制 Folder Runtime 当 `sys_4B` attach action。Hambrabi extras 的第 4 参是该 extra 自己的 clip | [victory-pose](./wing-zero-rebellion-victory-pose.md) §9；2026-09-05 user |
| M2 | 同 M1 但 `sys_4B` 第 4 参改成本机 Part 挂载 `0x4094b0f4`，骨 hash 仍为 0，且 spawn 只写在 `func_870` | **仍看不见白机** | 胜利 ENTER 是 `func_480`；`func_186()==1` 时 tick 是 `func_871`，`func_870` 根本不跑。`func_871` 的 `sys_4B(0x3)` 还会清掉 ENTER 挂件。E3 2026-09-05：改到 `func_480`（`func_884` 之后）并在 `func_871` 再挂一次后，白机以 **T 姿**出现 | 同上；2026-09-05 user |
| M3 | 白机可见之后仍用 `0x4094b0f4` + 骨 0 当整机 extra | **有动作，但挂在错误的骨头上，不是 GBL_RT** | 骨 0 已是 jnttbl GBL_RT；错的是 arg4。不要武器挂载 `0x4094b0f4`。白翅膀 `0x7914aada` 用主机翅膀那组 `0xad1a39fb` / `0xae17be24`，第 5 参 parent 白 body `0x04dc16ce` | 同上；2026-09-05 user |
| M4 | 整机 extra 抄 `func_190` 的 `0x810a8bef`（`down_faceup_gnd_fr`）当 `sys_4B` arg4，并把 `0xfa0` 写进 `sys_47(0x10)` | **body+wing 都动，但往前坠**。Blender 白机 GBL_RT 与主机重合 | `0x810a8bef` 是倒地 clip。Hambrabi extra 第 4 参是该 extra 自己的 Folder。`sys_47(0x10)` 是旋转（deg×100），`0xfa0`=+40°；平移用 `sys_47(0x11)`。不要在 MSC 里猜 90° 微调 | 同上；2026-09-05 user |

---

## 待提取（本表尚未覆盖）

下列文档含负面结果但**尚未抽进本表**，抽取前不要认为本表已完备：

- `2026-08-09-wing-zero-rebellion-transform-port-plan.md`（144 行表格）
- `wing-zero-rebellion-bird-melee-n-followup.md`（49 行）
- `tv-wing-zero-flight-special-melee-landing-copy-list.md`（25 行）
- `tv-wing-zero-flight-special-melee-landing-todo.md`（20 行）

**其余 60 份 MSC 文档没有任何负面结果记录**（见审计报告 F2）。
这不代表它们没踩过坑，只代表坑没被记下来。
