# `func_158`：射击后坐力（自然后退）

**Date:** 2026-08-28
**Status:** E3 operator-confirmed (2026-08-28) recoil / natural backward; E1 wrapper is `sys_46(0x2, 0x3, heading, pitch, arg0)`
**Kind:** MSC 2.c movement helper used from ranged shoot
**Sample:** Rebellion `2.c` `func_158`; call `func_158(0xfa)` on homemade `SUB_SHOT_CUSTOM` shoot and ALT_2

**Related:**

- 通道表：[sys46-script-parameter-atlas](./sys46-script-parameter-atlas.md)
- 子命令索引：[movement-boost-sys46-func11-map](./movement-boost-sys46-func11-map.md)（`0x2` 曾标「插值 / 惯性续接」；后坐力走同一子命令）
- 四槽：[func593-vanilla-ranged-slots](./func593-vanilla-ranged-slots.md)

---

## 一句话

`func_158(arg0)` 是**后坐力**：让机体沿当前朝向**自然后退**。`arg0` 是后退量（常见射击 `0xfa` = 250；cookbook 主射样本 `0xc8`；觉醒 `0x12c`）。

不要把它当成 `sys_46(0x1)` 锁冲 / BD 通道，也不要每 tick 重打。

---

## 源码形状（E1）

Rebellion `func_158`：

```c
// air (global174 == 1): heading from sys_47(0x46)+0x4650, pitch -global268
sys_46(0x2, 0x3, var2, -var1, arg0);

// else if global180: heading from sys_47(0x44)+0x4650
sys_46(0x2, 0x3, var2, var1, arg0);
```

- Last arg is `arg0` (the recoil amount).
- If `global174 != 1` and `global180 == 0`, the call is a **no-op**.
- Ground vs air picks heading/pitch sources; both write **subcmd `0x2` channel `0x3`**.

---

## 用法

Call **once** on shoot ENTER, next to `sys_4F` fire (Zeong 后副射 / Rebellion homemade sub / cookbook `func_927`).

| 调用 | 谁 |
|------|----|
| `func_158(0xfa)` | Rebellion `SUB_SHOT_CUSTOM` shoot, ALT_2, other shot recoveries |
| `func_158(0xc8)` | cookbook 主射 `func_927` |
| `func_158(0x12c)` | Rebellion awakening fire |

Do **not**:

- Write raw `sys_46(0x1, …)` for this feel (dash / mag channel; registry D).
- Call it every tick (re-arms the interpolator).
- Expect it to replace `func_351` 足止 or analog.

Exact native unit of `arg0` (velocity vs fade length) is not pinned; treat it as the recoil strength knob.
