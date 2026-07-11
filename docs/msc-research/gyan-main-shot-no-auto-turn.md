# Gyan 主射不自动转身（飞行普通射击）

**Date:** 2026-07-11  
**Kind:** Mod recipe（已实机可用）  
**Primary MSC tree:** `E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\2.c`  
**Related:** [gyan-dodai-throw-aim-at-enemy-analysis.md](./gyan-dodai-throw-aim-at-enemy-analysis.md)（多段/Dodai 瞄准用 `global689`，与主射不同）  
**Session:** [gyan-session-2026-07-11-handoff.md](./gyan-session-2026-07-11-handoff.md)

---

## 一句话

想主射**不要自动拧向敌人**时：在 `ACTION_A_SHOT` 里把 **`global693 = 0`**（关掉 `func_592`）。  
想**只在飞行中**不转身、地面仍转：在 `func_586()` 之后判断 **`global24 & 0x4000`**，成立再置 `global693 = 0`。

---

## 1. 机制（不要搞错层）

### 1.1 主射不是第二个 action

`0.c` 主射输入始终提交 hash **`0x519D49CE`** → `2.c` **`ACTION_A_SHOT`**。  
背向/有锁时“先转过去再打”是**同一 action 内**的自动对锁转向，不是另一条 `func_241`。

### 1.2 调用链

```text
ACTION_A_SHOT
  → func_586()                 // 默认 global693 = 1
  → callFunc3(func_895)
  → func_587() 每帧
       if (global693 == 1)
         → func_592(0)         // ★ body yaw 自动对准目标
  → global677 = func_896       // 起手 / shell
  → global680 = func_897       // 发弹 sys_4F
```

`func_592` 读相对目标偏航 `sys_0(0x40000, 0x5)`，用 `global688` 作阈值、`sys_46(0, …)` 改朝向。

### 1.3 控制面

| 职责 | Gyan 字段 | 说明 |
|------|-----------|------|
| **是否调用 `func_592`** | **`global693`** | `1` = 自动转身；`0` = 不转（普通朝向射击） |
| 转角阈值 | `global688` | 主射常写 `0x71`；仅在 `global693==1` 时有意义 |
| 转身时间相关 | `global689` | 在 `func_592` 软转路径里用；**不是**主射总开关 |
| 骑乘/飞行状态位 | **`global24 & 0x4000`** | `func_168(0x4000)` 置位；`func_169` 清 |

### 1.4 与多段瞄准的区别（易混）

| 路径 | 典型动作 | 关“转向/瞄准”的字段 |
|------|----------|---------------------|
| **`func_587` + `func_592`** | **主射 `ACTION_A_SHOT`** | **`global693 = 0`** |
| `func_599` + `func_601` | Dodai 特射等多段 | `global689 = 0xffffffff` |

主射不要改 `global689` 当总开关。

### 1.5 百式对照（字段编号不同）

| 职责 | 百式 Hyaku | 强人 Gyan |
|------|------------|-----------|
| 启用 `func_592` | `global695` | **`global693`** |
| 阈值 | `global690` | `global688` |
| 转窗 | `global691` | `global689` |
| 飞行分支 | `if (global24 & 0x4000) global695 = 0` | 同形：`global693 = 0` |

---

## 2. 改哪里（实装配方）

**文件：** `…\001gundam_005gyan00_001_N2_rocket_mod\2.c`  
**函数：** `ACTION_A_SHOT`（约 L25679）

在 `func_586()` 与所有主射参数赋值之后、**`callFunc3(func_895)` 之前**：

```c
void ACTION_A_SHOT()
{
    func_586();
    global677 = func_896;
    global678 = 0xffffffff;
    global680 = func_897;
    /* ... 其余 global681/688/699 等保持原样 ... */

    // Flight / riding: normal main shot (no auto turn-to-target).
    if ((global24 & 0x4000) != 0)
    {
        global693 = 0;
    }
    // Ground: leave global693 as func_586 default (1) → still auto-turns.

    callFunc3(func_895);
}
```

### 变体

| 目标 | 写法 |
|------|------|
| 仅飞行不转、地面仍转 | 上表 `if (global24 & 0x4000) global693 = 0` |
| 主射永远不自动转 | 无条件 `global693 = 0`（调试或全形态禁转） |

**不要**在这里改 `func_896` / `func_897` 来“关转向”——那是 shell 与发弹。

---

## 3. 坑（已踩过）

### 3.1 禁止用 `global20 & 0x4000`（2.c）

| 脚本 | `global20` 含义 |
|------|-----------------|
| **0.c** | 引擎状态槽，可含 `0x4000` 类 flag |
| **2.c** | **`sys_4B(0x1)` 当前 shell entry id** |

2.c 里应用 **`global24 & 0x4000`**。

### 3.2 `0x4000` 会被 `func_167` 清掉

```c
// func_167
global24 = (global24 & 0x3d000003) | arg0;
```

`0x4000` 不在保留掩码内。飞行 loop `func_452` 若 `func_167(0x1004000)`，会清掉 ENTRY 上的骑乘位。

若实机出现「飞行主射仍转」：

1. 在 **`GYAN_TRANSFORM_LOOP_SLOT`** 或 **`func_452` 的 `func_167` 之后**再 `func_168(0x4000)`，保持飞行期 bit 有效；或  
2. 用专用 global：ENTRY 置 1 / RELEASE 清 0，主射读该 flag。

RELEASE 结束已有 `func_169(0x14000)`，离脱后应回到地面转向行为。

### 3.3 关了 `global693` 仍像“在转”

可能是 **motion 层**（`global699` / `global700` → `func_610` → `func_315`），不是 body yaw。  
先强制 `global693 = 0` 验证 yaw 是否停；若 yaw 停、动画仍像转身，再动 motion 参数。

---

## 4. 验证清单

1. **地面**背向有锁主射 → 仍应自动转向（`global693` 保持 1）。  
2. **飞行**（`global24 & 0x4000` 有效）主射 → 机体不拧向敌人，按当前朝向打。  
3. **离脱后**再主射 → 恢复地面转向。  
4. 调试：临时无条件 `global693 = 0` → 确认控制面就是 `func_592` 开关。

---

## 5. 当前树中的落点（N2 rocket mod）

| 位置 | 内容 |
|------|------|
| `ACTION_A_SHOT` | `if ((global24 & 0x4000) != 0) global693 = 0;` |
| `GYAN_TRANSFORM_ENTRY_SLOT` | 进动作结束后 `func_168(0x4000)` |
| `GYAN_TRANSFORM_RELEASE_SLOT` | 结束 `func_169(0x14000)` |
| `func_586` | 默认 `global693 = 1` |
| `func_587` | `global693 == 1` 时调 `func_592(0)` |

改完后重新编译/打包 MSC 再测。
