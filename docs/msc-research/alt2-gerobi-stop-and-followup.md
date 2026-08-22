# Rebellion N 特射：中途停掉照射，再打一发巨大的

**Date:** 2026-08-17  
**Status:** 脚本侧实机确认：停第一发、软转对准、开火后必须关 `func_300` 否则会一直跟锁。弹体 / 停顿 / yaw 速率仍可调。  
**Kind:** MSC `2.c` 特射 followup / 照射生命周期  
**Primary tree:**

```text
E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c
```

**Related:**

- `func_593` 四槽：`docs/msc-research/func593-vanilla-ranged-slots.md`
- `sys_4F` 子命令（含 `0x12`）：`docs/exvs-msc-syscall-4f-native-handler.md`
- `sys_4E` 子命令（含 `0`）：`docs/exvs-msc-syscall-4e-notes.md`
- EW wiki 对照：后觉醒是 3 圈 `func_81`，本招只借「单圈：停顿 + effect + 一发大照射」

---

## 一句话

要在第一发照射还在墙上的时候加一发巨大的，必须 **先把第一发整条梁拆掉，再改朝向或切段**。  
只 `sys_4F(0x12, slot)` 不够；回收段用的 `sys_4E(0)` 才能拆掉墙黏照射。  
`678` 是空弹段，不是 cancel。点按后走官方 `677 → global252 → 679`。  
停顿里禁止 `rebellion_hiv_lock_aim()`（`0x3e8` 一步掰满，活梁会扫向敌人）。  
软转必须：`func_121` 只刷新一次 + 停顿里 `func_300` + 开火立刻 `func_300(0)`。只改 `func_102` 速率不会转；`func_300` 开火后不关会一直跟锁。

---

## 1. 产品目标（不要和后觉醒 3 连搞混）

Wiki 后觉醒「ツインバスターライフル【連射】」是 **同一条 action `func_81` 重进 3 次**，每圈一发 `0x756ddf5d`。

Rebellion `ACTION_AC_SPECIAL_SHOT_ALT_2`（`0x20923fb6`，N 特射）要的不是 3 连，而是：

```text
922 start
  → 923 冻 15f + 第一发 A/B（CDA9F55A/B）持续照射
  → 运动帧 34–50 点按
  → 立刻拆掉第一发
  → 离开 677，进 925 先停顿做 effect
  → 只再打 1 发巨大的（CDA9F55C/D）
  → 925 原来的收枪 / TRS / func_887
```

后觉醒只借 **单圈** 的形状：接枪后雷 → 停几帧 → 一发大照射。圈 2、圈 3 不做，也不 `func_81(0x888d9b7d)`。

觉醒中（`sys_0(0xc0000)`）第一发仍直接打 C/D，不走点按。

---

## 2. `func_593` 里这段该走哪一槽

`ACTION_AC_SPECIAL_SHOT_ALT_2` 是旧版 `func_593` 四槽：

| 槽 | 回调 | 职责 |
|----|------|------|
| `676` start | `func_922` | f0–18，f14 `func_886` 接合成枪 |
| `677` shoot | `func_923` | 冻 15f + 第一发 + 点按窗 |
| `678` no_ammo | `func_924` | **没弹药**才进。不是 cancel，不能当第二发宿主 |
| `679` end | `func_925` | 点按 followup（停顿 + 巨大发）→ 再原来的 recovery |

从 shoot 置 `global252` 之后，`func_596` **只会** `func_71(global679)`，不会进 `678`。  
所以「触发 cancel」在这套 driver 里的正确意思是：

1. 脚本自己拆掉第一发弹体  
2. 置 `global252`，让 driver 按官方路径进 **end**  
3. 在 `925` 里先做停顿 / effect / 第二发，再走原来的收枪  

不要手改 `global184 = 3` 去进 `924`。那会覆盖空弹演出，也会和 `func_596` 抢段。

`func_71` → `func_73` 会清掉 `global240`–`global253`。  
followup 锁存必须放在这个范围外：`rebellion_alt2_big_followup`  
（`0` 空闲，`1` 停顿 + FX，`2` 巨大发播放中，播完清回 `0` 再跑 recovery）。

进招时在 `ACTION_AC_SPECIAL_SHOT_ALT_2()` 里清零，避免上一发被打断后脏锁存。

---

## 3. 如何停掉第一发照射（详细）

### 3.1 第一发是怎么打出去的

`func_923` 解冻后：

```c
sys_4F(0, 0x5, 0xCDA9F55A);
sys_4F(0, 0x5, 0xCDA9F55B);
```

这是 **按 depiction / weapon slot 发一条照射**。槽是 `0x5`，不是特射 ammo 槽 `global681 = 0x2`。  
弹种是照射（gerobi）：梁会在世界上留着，打到墙会黏住，朝向一变整条梁会跟着扫。

### 3.2 `sys_4F(0x12, slot)` 只做「按槽 release」

`docs/exvs-msc-syscall-4f-native-handler.md`：`sys_4F` 子命令 `0x12` 是 **单 entry 的 release / stop / end**。

脚本里空弹段、旧第二发点按都习惯写：

```c
sys_4F(0x12, global681);   // 这里是 0x2，特射 ammo 槽
sys_4F(0x12, 0x5);         // 真正开火的 depiction 槽
```

两个都要打。只打 `global681` **停不掉** 打在 `0x5` 上的那对 A/B。

但实机证明：照射已经打在墙上之后，**只靠 `0x12` 往往还留着一条活梁**。  
梁的 handle 可能已经不跟 slot 一一对应，或墙黏段不再走这条 release。

### 3.3 `sys_4E(0)` 才是回收段真正用来收掉整段射击的调用

几乎所有 `func_593` 的 `679` recovery 一进段就：

```c
sys_4E(0);
```

`docs/exvs-msc-syscall-4e-notes.md` 里 native 把 `sys_4E(0)` 写成 depiction 子系统的 **总开关 / 初始化 request**，还不能在 native 层命名成「销毁投射物」。

脚本侧的稳定事实是：

- recovery 入口高频调用它  
- 在「墙黏照射还活着」时补上它，梁会立刻消失  
- 只 `0x12`、不 `sys_4E(0)`，梁继续活，后续任何 yaw 都会带着梁走  

所以当前 **脚本配方**（不是完整 native 命名）是：

```c
sys_4F(0x12, global681);   // 按动作 ammo 槽 release
sys_4F(0x12, 0x5);         // 按实际开火槽 release
sys_4E(0);                 // 收掉残留照射 / 当前射击段
```

### 3.4 必须在改朝向、切段之前做完

错误顺序（旧第二发 / 第一次 followup）：

```text
点按 → 只 0x12 → hiv_lock_aim 瞬转身体 → 活着的梁黏墙扫向敌人
```

正确顺序：

```text
点按
  → 0x12 两个槽
  → 立刻 sys_4E(0)
  → 再置 global252 离开 677
925 停顿入口再杀一次（防止 func_71 切段后残留）
  → 冻住、func_121 一次、func_300(0x5c)、播 charge FX
  → 停顿每帧 0x190 软转（rebellion_alt2_followup_aim）
  → 开火帧 func_300(0)，再打 C/D
  → 巨大发持续中每帧再 func_300(0)
  → 播到运动 f53 再 sys_4E(0) + TRS 收回（原来的 925）
```

`sys_4E(0)` 打在点按当下，只拆 **已经出去的第一发**。  
巨大发是 15f 之后才 `sys_4F(0, 0x5, CDA9F55C/D)`，不会被这次 `sys_4E(0)` 提前吃掉。

进巨大发之前不要再 `sys_4E(0)`，否则会拆第二发。  
巨大发播完、回到真正 recovery 时，再走原来的 `sys_4E(0)`。

---

## 4. 第二发转向：在哪转、为什么只改速率会失灵、为什么会一直跟

### 4.1 禁止整段照抄 `hiv_lock_aim`

`rebellion_hiv_lock_aim()`（Hi-ν 侧副）每帧：

1. `func_121()` → `sys_48(0x5)` 刷新 / 换当前锁  
2. `func_102(..., 0x3e8, 0x2)` 每帧上限约 1000  
3. `sys_46(0, yaw_step)` 一步把身体掰到敌人  

旧第二发还在 `677` 里时，`func_596` 另外每帧 `func_300`。叠在一起就是「整身瞬间对准」。  
若第一发梁还活着，梁跟枪口走，墙黏段会扫到锁敌。

本招 followup **禁止** 调用 `rebellion_hiv_lock_aim()`。

### 4.2 软转必须在「梁已死 + 还在停顿」里做

函数：`rebellion_alt2_followup_aim()`  
调用点：只在 `rebellion_alt2_big_followup == 1`（停顿）每帧一次。巨大发出去后不要再转，否则第二发梁也会扫。

当前实机配方：

| 时刻 | 做什么 | 为什么 |
|------|--------|--------|
| 停顿第一帧 | `func_121()` 一次，把 `0x40000/3` 存进 `rebellion_alt2_followup_yaw_remain` | 离开 `677` 后必须先刷新锁，再拍快照 |
| 停顿每一帧 | 只对 **快照** `func_102(..., 0x190, 0x2)` + `sys_46(0)`，并减去已转角度 | 不要重读活锁，否则敌人一动就跟 |
| 开火那一帧 | remain=0，`global693=0`，`global689=0xffffffff`，`global79=0`，`func_300(0)`，再打 C/D | 掐掉 593 默认对锁 |
| 巨大发持续 | 再清 remain / `693` / `79` / `func_300(0)` | 防止残留 |

### 4.3 实机踩过的坑

**只改 `0x190`、停顿里又不读锁：完全不转。**  
进 `925` 后要在停顿入口 `func_121` **一次**，把当时的 `sys_0(0x40000, 0x3, lock)` 存下来。

**`func_300(0x5c)` 不是「一直跟锁」的主因。**  
用户注释掉 `func_300(0x5c)` 后身体照样追敌人。真正的跟随是：停顿每帧再读 **活的** `0x40000/3`（锁敌当前朝向误差），敌人一动误差就变，身体就跟。

正确做法：入口把误差拍进 `rebellion_alt2_followup_yaw_remain`，之后只对这个快照 `func_102` + `sys_46(0)`，减到 0 就停。不要每帧重读锁。

**开火后还要掐掉 593 默认对锁。**  
`func_586` 默认 `global693 = 1`、`global689 = 0xa`。鸟形态主射关对锁的配方是 `global689 = 0xffffffff`、`global693 = 0`、`global79 = 0`。开火帧一并写上，避免巨大发 / recovery 还在跟。

`func_121` 只在停顿入口调一次。每帧调等于一直刷新锁位置。

### 4.4 微调只动这两个数

| 数 | 位置 | 变大 | 变小 |
|----|------|------|------|
| `func_102(..., 0x190, 0x2)` 的 `0x190` | `rebellion_alt2_followup_aim` | 转得更快；`0x3e8` 就是旧瞬转 | 转得更慢 |
| `global244 = 0xf * 0x64` 的 `0xf` | `rebellion_alt2_run_big_followup` 停顿 | 停更久，同样速率能转完更大角度 | 停更短，可能还没对准就开火 |

不要靠把 `0x190` 改回 `0x3e8` 来「修好不转」。不转先查停顿入口有没有 `func_121` + 快照。  
不要靠每帧读活锁或一直开着 `func_300` 来「修好对准」。对准用快照；开火后清 `693/689/79`。

### 4.5 首段原生瞄准窗口：`global689`

`ACTION_AC_SPECIAL_SHOT_ALT_2` 参数块中，首段身体对准时长不是
`global681/682/683/686/698`，而是 `global689`：

```text
ACTION_AC_SPECIAL_SHOT_ALT_2: global689
  -> func_594: global715 = global689 * 0x64
  -> func_595: func_102(global265, global715, 0) + sys_46(0)
  -> every tick: global715 -= func_274()
  -> global715 <= 0: global722 = 1
  -> global252 && global722: enter shoot/677 (func_923)
```

参数职责：

| 参数 | 本招含义 |
|------|----------|
| `global681 = 0x2` | ammo slot |
| `global682/683 = 1` | shoot/no-ammo 段次数门 |
| `global686 = 0x100` | 特射输入 bit |
| `global689` | **首段原生身体 yaw 瞄准帧数** |
| `global698 = 0x14` | driver 后续状态时长 |

2026-08-21 调整：`global689 = 0xa`（10f）改为 `0x19`（25f），即原生
瞄准窗口增加 15 帧。它会推迟进入 `func_923` 的自制 15f hold；不会在
hold 内额外写 live yaw，也不改变第二发 followup 的快照瞄准。

硬规则：要调“进入 15f hold 前还能对准多久”，只改本 action 的
`global689`。不要在 `func_921` / `func_923` 后写 `func_103`，该绕过
`func_593` driver 的方案已按用户反馈撤销。

## 5. 点按窗：运动帧 34–50，不是 14–50

第一发 `func_308(..., 0x7d0)` seek 到运动 f20 再播。  
开窗用 **当前 motion 时间**，不是墙钟，也不是 start 的 f14（那是接枪）。

```text
3400 <= sys_47(0, sys_4B(0x1)) < 5000     // 帧 34 .. 50
```

不要只用 `func_309(global20, 3400)`。  
`func_309` 是 **单帧边沿**。seek 到 f20 之后有可能跨过 3400，锁存永远不置位，整段窗都是死的。

键位：

| bit | 含义 | 为什么要听 |
|-----|------|------------|
| `0x1` | 主射 / 射击键 | 玩家说的「射击按键」 |
| `0x100` | 特射 | 进这招时按住的就是它；旧第二发靠松手再点它 |

两边都要 **先松开再按下**（`global87` 无该 bit 后再看 `global48` / `global87`）。  
进特射时 `0x100` 是按住的，不先松会误触。

`func_123(0x220)` 只放行特格 / 后格 cancel，**不会** 把主射 `0x1` 派成新 action。  
点按是招内读输入，不是 `0.c` 换招。

---

## 6. 代码锚点（Rebellion `2.c`）

| 符号 | 作用 |
|------|------|
| `rebellion_alt2_big_followup` | 切段后仍活着的 followup 锁存（`0/1/2`） |
| `rebellion_alt2_followup_yaw_remain` | 点按时拍下的朝向误差；只对这个数软转 |
| `rebellion_alt2_followup_aim()` | 对快照 `func_102` + `sys_46(0)`，减 remain；不读活锁 |
| `rebellion_alt2_run_big_followup()` | `925`：杀梁、一次 `func_121`、开/关 `func_300`、雷、打 C/D |
| `func_923` phase 2 | 34–50 点按，`0x12` + `sys_4E(0)`，`global252 = 1` |
| `func_924` | 空弹段，不要当第二发宿主 |
| `func_925` | 先 followup，再原来的 `trs_end` / `func_887` |
| `rebellion_hiv_lock_aim()` | 已删除。自制副射用自己的 `rebellion_sub_shot_custom_*`，见 [sub-shot-custom-start-only-aim](./sub-shot-custom-start-only-aim.md) |

停顿默认 `0xf` 帧（`global244 = 0xf * 0x64`），和第一发前的冻帧同长度，可调。

---

## 7. 给后续 Agent 的硬规则

1. **拆墙黏照射 = `sys_4F(0x12, 开火槽)` + `sys_4E(0)`，而且要在任何 yaw / 切段之前。**  
   只 `0x12` 不够。  
2. **`sys_4E(0)` 的 native 名还没钉死。** 脚本侧把它当「当前射击段收口」；不要写成「已证实的销毁投射物 opcode」。  
3. **`678` 不是 cancel。** 点按第二发走 `679`，空弹才走 `678`。  
4. **followup 锁存不要放进 `global240`–`253`。** `func_73` 会清。  
5. **followup 不要整段调用 `hiv_lock_aim`。** `func_121` 只在停顿入口一次；yaw 用 `0x190` 这类软转，不要 `0x3e8`。  
6. **进 `925` 之后只改 `func_102` 速率不会转。** 停顿入口必须 `func_121` 一次并快照 yaw。  
7. **不要每帧读活的 `0x40000/3`。** 那才会「敌人移动到哪身体跟到哪」。`func_300` 不是这个跟随的主因。开火后清 `remain`、`global693`、`global689`、`global79`。  
8. **点按窗用 motion 时间区间，不要只靠 `func_309` 边沿。**  
9. **主射 `0x1` 和特射 `0x100` 都要能点按。**  
10. **不要 `func_81` 后觉醒 hash，也不要把第二发做成 3 圈重进。**

---

## 8. 仍开放

| ID | 项 | 状态 |
|----|----|------|
| O1 | 巨大发是否改成后觉醒单发 `0x756ddf5d` | 当前用 `CDA9F55C/D` |
| O2 | 停顿是否短于 15f | 当前 `0xf` |
| O3 | `sys_4E(0)` native 究竟清哪些 depiction entry | 未钉；只确认脚本侧能拆墙黏照射 |
| O4 | `func_71`→`func_73` 在 `global24 & 0x2` 时会不会额外改朝向 | 去掉 `hiv_lock_aim` 后实机已不再瞬转 |
| O5 | 软转速率 | 用户已改成 `0x190`，实机转速可接受 |
| O6 | 开火后清 `693/689/79` 是否足够 | 已写进开火帧；若还跟再查引擎其它对锁位 |
