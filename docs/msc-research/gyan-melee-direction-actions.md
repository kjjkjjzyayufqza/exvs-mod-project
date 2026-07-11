# Gyan 方向格斗 Action 对照（用户验证）

**Date:** 2026-07-11  
**Kind:** Unit-specific action map（**以本页玩家语义为准**）  
**Primary MSC tree:** `E:\XB\mod\040msc\001gundam_005gyan00_001_N2_rocket_mod\`  
**Session:** [gyan-session-2026-07-11-handoff.md](./gyan-session-2026-07-11-handoff.md)

---

## 0. 纠错（重要）

| 错误说法 | 正确说法 |
|----------|----------|
| 后格斗 = `ACTION_B_MELEE_DIR_2` / hash `0xE962048` / motion `0xECE28FD9` | **后格斗 = `ACTION_B_MELEE_DIR_4`** / hash **`0x58CC87CE`** |
| `0xECE28FD9` 是后格起手 motion | **`0xECE28FD9` 是左右格斗**（`ACTION_B_MELEE_DIR_2` 起手段 `func_949`） |

跨机体通用文档里的「`0x4` 前 / `0x8` 后 / `0x10` 左 / `0x20` 右」是 **输入 bit 的常见标签**，**不能**直接当成「Gyan 的 `DIR_1/2/4` 玩家叫法」。  
Gyan 的**玩家侧命名**以本页用户验证为准。

---

## 1. 玩家语义 → Action（Gyan N2 rocket mod）

| 玩家操作 | Action 入口 | Action hash | 注册注释 |
|----------|-------------|--------------|----------|
| N 格 | `ACTION_B_MELEE` | `0x178D1109` | 近战 |
| 前格（候选） | `ACTION_B_MELEE_DIR_1` | `0xA2236F44` | 方向近战 |
| **左右格** | **`ACTION_B_MELEE_DIR_2`** | **`0xE962048`** | （无中文注释） |
| **后格** | **`ACTION_B_MELEE_DIR_4`** | **`0x58CC87CE`** | 方向近战 |
| 派生 | `ACTION_B_MELEE_VARIANT` | `0x3AC14535` | 近战派生 |

### 1.1 后格斗（正确目标）

```text
0.c:  global48 & 0x20  →  func_95(0x58cc87ce, ...)
2.c:  func_241(0x58cc87ce, ACTION_B_MELEE_DIR_4)

ACTION_B_MELEE_DIR_4
  → func_488()
  → func_219(0x7920175e)
  → global602 = func_954
  → callFunc3(func_953) → func_495()

func_954  (起手)
  → func_308(global20, 0x7674b668, ...)   // 后格起手 motion（非 0xece28fd9）
  → func_884()
  → func_531(func_955)

func_955  (后续段)
  → func_308(... 0xabe26fed ...)
  → ...
```

改后格：优先动 **`ACTION_B_MELEE_DIR_4` / `func_954` / `func_955`**，不要改 `DIR_2`。  
**位移机制（追踪 + `sys_46` 推/拉）：** [gyan-back-melee-movement.md](./gyan-back-melee-movement.md)。

### 1.2 左右格斗（曾被误标为后格）

```text
0.c:  global48 & 0x8   →  func_95(0xe962048, ...)   // func_95 第 4 参 0x3
      global48 & 0x10  →  func_95(0xe962048, ...)   // 同一 hash，第 4 参 0x4
2.c:  func_241(0xe962048, ACTION_B_MELEE_DIR_2)

ACTION_B_MELEE_DIR_2
  → func_488()
  → func_219(0x2f7ab0d8)
  → global602 = func_949
  → callFunc3(func_948) → func_489()

func_949  (起手)
  → func_308(global20, 0xece28fd9, ...)   // ★ 左右格 motion
  → func_531(func_950)

func_950  (攻击段 + 派生窗口)
  → func_308(... 0x3174565c ...)
  → func_536(...) → func_951 等
```

**`0xECE28FD9` = 左右格 `func_949` 的 motion hash，不是后格。**

---

## 2. 0.c 输入 → hash（本树 `func_143`）

优先级按 `else if` 链（先匹配先生效）：

| 条件 | Hash | 2.c Action | 玩家语义（本页） |
|------|------|------------|------------------|
| `global48 & 0x40` | `0x3AC14535` | `ACTION_B_MELEE_VARIANT` | 派生 |
| `global48 & 0x4` | `0xA2236F44` | `ACTION_B_MELEE_DIR_1` | 前格（候选） |
| **`global48 & 0x20`** | **`0x58CC87CE`** | **`ACTION_B_MELEE_DIR_4`** | **后格** |
| `global48 & 0x8` | `0xE962048` | `ACTION_B_MELEE_DIR_2` | 左右 |
| `global48 & 0x10` | `0xE962048` | `ACTION_B_MELEE_DIR_2` | 左右（同 hash） |
| `global48 & 0x2` | `0x178D1109` | `ACTION_B_MELEE` | N 格 |

说明：

- 左/右输入在 selector 上 **共用** `0xE962048` / `DIR_2`（仅 `func_95` 第 4 参 `0x3` vs `0x4` 不同）。
- 后格是 **`0x20` → `0x58CC87CE` → `DIR_4`**，不是 `0x8`。

---

## 3. Motion 指纹（防再混）

| Motion / 关键常量 | 出现位置 | 语义 |
|--------------------|----------|------|
| **`0xECE28FD9`** | `DIR_2` → `func_949` | **左右格**起手 |
| `0x3174565C` | `DIR_2` → `func_950` | 左右格攻击段 |
| **`0x7674B668`** | `DIR_4` → `func_954` | **后格**起手 |
| `0xABE26FED` | `DIR_4` → `func_955` | 后格后续段 |
| `0xFC08D30B` | `DIR_1` → `func_945` | 前格起手（候选） |

另：`func_881` 里 `if (global4 == 0x58cc87ce)` 特判的是 **后格 action hash**（`DIR_4`），不是 `DIR_2`。

---

## 4. 2.c 注册（`func_1011` 一带）

```c
func_241(0x178d1109, ACTION_B_MELEE);           // N 格
func_241(0xa2236f44, ACTION_B_MELEE_DIR_1);     // 前格候选
func_241(0xe962048,  ACTION_B_MELEE_DIR_2);     // 左右格
func_241(0x58cc87ce, ACTION_B_MELEE_DIR_4);     // 后格
func_241(0x3ac14535, ACTION_B_MELEE_VARIANT);   // 派生
```

---

## 5. 改什么时打开哪段

| 目标 | 入口 | 第一段 / 第二段 |
|------|------|-----------------|
| **后格** | `ACTION_B_MELEE_DIR_4` | `func_954` / `func_955` |
| 左右格 | `ACTION_B_MELEE_DIR_2` | `func_949` / `func_950` |
| 前格 | `ACTION_B_MELEE_DIR_1` | `func_945` / `func_946` |
| N 格 | `ACTION_B_MELEE` | 见该 ACTION 内 `global602` |

---

## 6. 与通用文档的关系

- [0c-to-2c-input-action-boundary.md](./0c-to-2c-input-action-boundary.md) 的方向 bit 表是**通用输入 mask**，不覆盖本机 `DIR_*` 玩家名。
- 本机格斗命名冲突时：**以本页为准**。
