# 自制副射：只在 start 对锁，shoot 起就停

**Date:** 2026-08-17  
**Status:** 脚本已改；实机待确认  
**Kind:** MSC `2.c` `SUB_SHOT_CUSTOM`  
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c`

**Related:** N 特射 followup 是另一套，见 [alt2-gerobi-stop-and-followup](./alt2-gerobi-stop-and-followup.md)。**不要复用** `rebellion_alt2_*`。

---

## 一句话

旧实现把 `hiv_lock_aim` 挂在 `sub_shot_custom_tick` 上，`func_593` 每一帧（start / shoot / end）都会猛跟锁。  
现在只在 `sub_shot_custom_start` 里瞄准；进 shoot 立刻 `rebellion_sub_shot_custom_stop_aim()`。

---

## 为什么 shoot 也会跟

`func_593` 的 tick 每帧先跑当前段，再跑 `func_596` 里的 `func_300(...)`。  
旧代码还在 tick 末尾 `rebellion_hiv_lock_aim()`（`0x3e8` 活锁），shoot / recovery 一起跟。

`func_596` 每帧：

```c
func_300((0x64 - global714) * (0x64 - func_274()) / 0x64 + global714);
```

只从 start 拿掉瞄准不够。进 shoot 必须把混合掐死，否则 `func_300` 继续对锁。

---

## 当前做法（独立符号，不碰特射）

| 符号 | 作用 |
|------|------|
| `rebellion_sub_shot_custom_aim()` | 仅 start 每帧：刷新锁 + 活 yaw（`sys_46(0)` + `0x40000/3`）+ 活 pitch（`func_105` + `func_609(1)` / `0x40001/5`） |
| `rebellion_sub_shot_custom_stop_aim()` | `global693=0`，`global689=-1`，`global79=0`，`global714=0x64`，`global722=1`，`func_300(0)` |

调用：

- `sub_shot_custom_tick`：只 `func_593()`  
- `sub_shot_custom_start`：每帧 `aim()`；start 结束置 `252` 前 `stop_aim()`  
- `sub_shot_custom_shoot` 入口再 `stop_aim()` 一次  
- 禁止调用 `rebellion_alt2_followup_aim` / `rebellion_alt2_followup_yaw_remain`

`global714 = 0x64` 让 `func_596` 里那次 `func_300` 变成 0，shoot 段不再被 driver 掰向锁。

## 垂直对准

`sys_46(0, …)` **只改水平 yaw**。`func_593` / `func_595` 默认也不写俯仰。

垂直走另一套（`func_601` 近战 driver 同款，不是特射 `rebellion_alt2_*`）：

```c
// 水平
sys_46(0, func_102(sys_0(0x40000, 0x3, lock), 0x3e8, 0x2));
// 垂直：0x40001/5 经 func_609 夹紧，func_105 累加到 global268
func_105(func_102(func_609(0x1) - global268, 0x3e8, 0x2), 0, 0);
```

`func_104` / `func_105` 写的是 `sys_47(0x10, handle, 1, x, y, z, 0)` 的瞄准偏移，第一分量是俯仰。

`stop_aim` **不要** `func_104(0,0,0)`，否则进 shoot 时俯仰会被清掉。停的是继续跟踪，不是清掉已经转好的角。

---

## 和 N 特射的差别

特射第二发用的是 **点按瞬间的 yaw 快照**，因为照射不能边转边扫。  
自制副射 start 仍用活锁猛转（原 Hi-ν 侧副手感），只是时间窗收成 start。若 start 也要改成快照，另开变量，不要去改 `rebellion_alt2_*`。
