# 自制 NUANMB：motion 时钟 ≠ 游戏帧时钟

**Date:** 2026-08-27
**Status:** E3 in-game confirmed (2026-08-27) `global244 -= func_274()` on homemade `tks11a` 107f ≈ 1.8s; E3- `func_309` / `sys_47(0x7)` homemade wait; E3- `func_310` / `sys_47(0x5)` as homemade rate; E1 wrappers `func_308` / `func_309` / `func_310` / `func_274` / `func_110` / `func_116`
**Kind:** MSC 2.c + homemade motion ABI（跨机体；Rebellion `SUB_SHOT_CUSTOM` 是第一条 E3 样本）
**Primary tree:** `E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c`
**Motion folder:** `0xa0cd8d56` (`tks11a`, unk1 LE `568dcda0`); children `tks11a_out_body` / `tks11a_out_wing`

**Related:**

- 负面总登记：[msc-falsified-negatives-registry](./msc-falsified-negatives-registry.md) §H
- Cursor rule：`.cursor/rules/msc-homemade-motion-clock.mdc`
- 四槽形状仍是 [func593-vanilla-ranged-slots](./func593-vanilla-ranged-slots.md)；本页只改**阶段时长怎么等**
- 自制副射瞄准：[sub-shot-custom-start-only-aim](./sub-shot-custom-start-only-aim.md)（瞄准，不是时钟）
- 特射时间线对照：Rebellion `func_922`–`func_925` on stock `0x6d149828`（可 `func_309`；不要抄到自制 folder）
- NUANMB 编码：[nuanmb-exvs2-import-in-game-layout](../nuanmb-exvs2-import-in-game-layout.md)（`0x4300` / ATH；不解释 MSC 等待）

---

## 一句话

自制 folder hash 上，**阶段墙钟跟游戏帧走，不跟 stock motion-complete 走。**

- 切段：`global244 -= func_274()`（`func_274` → `global457`，单位 `0x64`，1 帧 = `0x64`）
- 姿势：`func_308` / 9-arg `sys_47(0x2, …)` **只负责 play / seek**
- 禁止：`func_309` / `sys_47(0xf)` / `sys_47(0x7)` 当自制时长门
- 禁止：`func_310` / `sys_47(0x5)` / 每帧 `func_110(0x64)` 当自制速度旋钮
- `func_241(hash, 0)` 已经证明 ACTION 进入时，**不要再猜打包**

Scope：E3 钉死的是 Rebellion homemade `0xa0cd8d56` / `tks11a`。其它自制 folder 在被 E3 证明会吃 stock motion clock 之前，默认走同一条规则。

---

## 两套时钟（不要混）

| 时钟 | 查询 | 单位 | 谁在用 | 自制 `tks11a` |
|------|------|------|--------|----------------|
| **游戏帧** | `func_274()` → `global457` | `0x64`；1 帧 = `0x64` | ALT_2 的 `global244` hold；本页获胜写法 | **E3 107f ≈ 1.8s** |
| **Stock motion** | `func_309` → `sys_47(0xf)`；完成位 `sys_47(0x7)` | 片内时间线 | vanilla / stock hash（ALT_2 `0x6d149828`） | **E3- 墙钟约 3s**；把门从 121→107→81 **墙钟不变** |

磁盘 NUANMB header（body/wing）unk1 ≈ 1.766s、timebase 60、unk2 = 106，和 107 帧游戏钟一致。  
**那不能推出** `func_309` / `sys_47(0x7)` 也会在 1.8s 升起。自制 folder 的 motion-complete 查询跟 header 不是同一件事。为何约 3s：**E0，不要猜 native。**

`2c-runtime-system-map-for-modding.md` 把 `func_308` 最后一参写成 `rate`。那是命名陷阱。本机体获胜用法里最后一参是 **startTime**（`0x64` 单位）。不要改那份旧文档来“纠正索引”；以本页为准。

---

## 获胜阶段写法（E3，2026-08-27）

四槽仍在：`676` start / `677` shoot / `678` no_ammo / `679` end。`func_73` 进段会清 `global240`–`253`（含 `global244` / `global252`）并 `func_110(0x64)`，所以**每段自己的 `global240 == 0` 入口必须重新武装倒计时。**

Blender / FBX 轴：1–26 起手，26–81 开火，81–107 倒放。MSC：`0x1a=26`，`0x51=81`，`0x6b=107`。

```c
// start: play folder from 0; wait 26f on the game-frame clock
sys_47(0x2, global20, 0xa0cd8d56, global276, 0, 0, 0, 0x1, 0x12c);
global244 = 0x1a * 0x64;

// shoot / no_ammo: seek to frame 26; wait 55f
func_308(global20, 0xa0cd8d56, global276, 0, 0x1a * 0x64);
global244 = (0x51 - 0x1a) * 0x64;

// end: MUST seek to frame 81; wait 26f reverse.
// 55 game frames after shoot seek 0x1a do not land blender 81 on this folder.
// Omitting the seek skips body 81-107 recovery (runtime 2026-08-28).
func_308(global20, 0xa0cd8d56, global276, 0, 0x51 * 0x64);
global244 = (0x6b - 0x51) * 0x64;

// every phase tick (after the enter latch)
if (global240 == 0x1)
{
    global244 = global244 - func_274();
    if (global244 <= 0)
    {
        func_116();          // freeze pose; optional on end
        global252 = 0x1;     // let func_593 advance
    }
}
```

26 + 55 + 26 = 107 帧 ≈ 1.78s。用户确认「1.8 就刚好了」。

`func_116()` = `func_310(0)`，只冻姿势，**不是**时长来源。end 段可以不冻、直接 `global252 = 0x1`。

---

## 被证伪（E3-）

| 做法 | 实机 | 不要再做 |
|------|------|----------|
| 自制 folder 上 `if (func_309(global20, N * 0x64))` 或等 `sys_47(0x7)` 切段 | ~3s；改 N 墙钟不变；`func_116` 后再 seek 末帧等 `0x7` → **卡最后一帧** | H1 |
| `func_310(0x64)` / `func_310(1000)` / 每帧 `func_110(0x64)` 当速度或时长 | 墙钟不变。`func_308(..., global276, ...)` 会把 `func_73` 写回的 `0x64` 再打进去 | H2 |
| `func_241(0x23df217e, SUB_SHOT_CUSTOM)` 已进入，仍把根因写成「没打包 / 2.dscex 旧」 | `func_241(..., 0)` 才是「不进 ACTION」对照 | H3 |

Stock ALT_2（`0x6d149828`，`func_922`–`func_925`）**可以** `func_309` + `sys_47(0x7)`，再在 shoot 用 15f `global244` hold。那是 **stock 片时钟**。抄特射时只抄 seek + `global244` hold，**不要抄 complete 等待到自制 hash。**

---

## 包装（E1 源码形状；行为见上表）

Rebellion `2.c` 当前形状：

```text
func_308(obj, hash, global276, blend, startTime)
  -> sys_47(0x2, obj, hash, arg2, arg4, startTime/0x64, 0)

func_309(ignored, time)
  -> sys_47(0xf, sys_4B(1), time)     // first arg discarded

func_310(arg0, arg1)
  -> sys_47(0x5, arg1, arg0)          // stock rate bank, not homemade duration

func_110(x)
  -> write global276; call func_310 only if the value changed

func_116()
  -> func_310(0)                      // freeze

func_274()
  -> return global457                 // game-frame delta, 0x64 units
```

`func_310` 在 stock 片上仍可能有用。本页证伪的是：**把它当自制 folder 的播放速度 / 墙钟旋钮。**

---

## 诊断顺序（下一次不要再绕）

1. `func_241(action_hash, 0)` vs 真 handler：不进 = 没进 ACTION；仍进 = **不是打包问题**。
2. 阶段墙钟像 header / Blender 轴吗？不像 → 先看是不是在等 `func_309` / `0x7`。
3. 改 `func_309` 的帧门墙钟不变 → 那不是游戏帧时钟。改成 `global244 -= func_274()`。
4. 不要开 `func_310` 实验。不要同一 build 里同时改等待机制和 rate。

---

## 未知（保持 E0）

- 自制 folder 的 `sys_47(0x7)` / `0xf` 为什么墙钟约 3s（磁盘 1.77s）。
- 其它自制 hash 会不会碰巧对齐 stock motion clock。对齐之前仍用游戏帧倒计时。
- `func_310` / `sys_47(0x5)` 在 native 里到底改哪条 rate 曲线。
