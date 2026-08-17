# TV Wing Zero：飞行中连按两次前进自动对准

**Date:** 2026-08-17  
**Status:** Rebellion `func_874` 已写 `global122 = 0x200`；实机待确认  
**Kind:** 共通飞行控制器能力位 + 0.c 方向双击缓存  
**Primary trees:**

```text
Source  E:\XB\mod\040msc\028gunwtv_001gunwtv_001\
Target  E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\
```

**Related:**

- 共通飞行职责：[transform-port-plan §7.2](./2026-08-09-wing-zero-rebellion-transform-port-plan.md)
- 方向双击进入变形：`func_124` / slot `0x17`，见 [delta-plus-transform-flight-system](./delta-plus-transform-flight-system.md)
- 鸟形态输入只改 `0.c` `func_143`：[bird-form-0c-input-map](./wing-zero-rebellion-bird-form-0c-input-map.md)
- 飞行打断 ≠ 本机动：[flight-interrupt-form](./wing-zero-rebellion-flight-interrupt-form.md)

---

## 一句话

TV 飞形态「连按两次前进对准敌人」**不是新 action**。  
`0.c` 把方向双击写进共享槽 `0x2c` → 飞行 loop 里 `func_463` 看见 `global93 & 0x4`，且机体能力字 `global122` 带 `0x200`，就 `func_168(0x400)` 把本帧控制切到 `func_462`，对当前锁做一段 yaw+pitch。

Rebellion 的 `func_452..463` 和 `0.c` 双击缓存**已经在**。缺的是 TV `func_881` 那句 `global122 = 0x200`。

---

## 不要和另外两条搞混

| 现象 | 真正入口 | 不是 |
|------|----------|------|
| 连按两次**前进**（方向 `0x4`）对准锁 | `func_463` → `func_462` | 新 `ACTION_*`、副射 `rebellion_sub_shot_custom_aim`、特射 `rebellion_alt2_*` |
| 连按 **0x80**（跳/升） | `func_458` + `global605` 窗口 | 把俯仰切到 `global168=0x1/0x2`（俯冲/拉升），**不对锁** |
| 左右双击横移 | `func_463` 的 `global122 & 0x2` 且 `global93 & 0x10/0x20` | TV WZ **没开** `0x2`，不要为了对准顺手打开 |

---

## 整条链路

```text
0.c func_2
  sys_0(0x20000, 2) -> bit 0x4   // 上 / 玩家说的「前进」
  sys_0(0x20000, 3) -> bit 0x8   // 下
  sys_0(0x20000, 4) -> bit 0x10  // 左
  sys_0(0x20000, 5) -> bit 0x20  // 右
  global4 = 边沿按下
  global6 = 边沿松开

0.c func_106
  松开方向 -> 记住方向，窗口 8 帧
  再按下同一方向 -> 双击位写入 publish 槽
  Rebellion: global76 ; TV: global77   // 只是 0.c 编号差 1

0.c func_134
  sys_1(0x10000, 0, 0x2c, <双击位>)

2.c func_21  每帧
  global93 = sys_0(0x10000, 0, 0x2c)

飞行 loop
  func_452  清状态，callFunc3(func_453)
  func_453
    global24 & 0x20000 -> func_461
    global24 & 0x400   -> func_462   // 对准中
    else               -> func_454 -> func_463  // 手动 + 侦测双击
```

方向 `0x3c = 0x4|0x8|0x10|0x20`。`func_124()` 用的是**另一份** 14 帧「连按」缓存（变形 gate），**不是**飞行对准用的 `0x2c`。

---

## `func_463`：何时点火

Rebellion `2.c`（TV 同构，global 按 [§7.3 对照表](./2026-08-09-wing-zero-rebellion-transform-port-plan.md) 平移）：

```c
if ((global24 & 0x3) != 0 && !((global24 & 0x8) != 0))
    return;                     // 某些动作锁期间不接
global162 += func_274();
if (global162 < 0x3e8)
    return;                     // 触发后冷却，约 0x3e8 / func_274() 帧

if (global122 & 0x200 && global93 & 0x4)
{
    func_168(0x400);            // global24 |= 0x400
    global158 = 0;              // 对准阶段 0 = 还在转
    global162 = 0;              // 重开冷却
    global165 = 0xbb8;          // 对准持续时间
    global168 = 0x5;            // 飞行子状态（引擎旗 0xe0001/9）
    global93 = 0;               // 吃掉双击
}
```

`func_168` / `func_169` 是 `global24` 的置位 / 清位。下一帧 `func_453` 看到 `0x400` 就不再走手动 `func_454`。

冷却：`func_452` 把 `global162` 初值写成 `0x3e8`，进飞行几乎立刻可点；点过一次后要从 0 加回 `0x3e8`。  
时长：`0xbb8` 每帧减 `func_274()`；`func_274()==0x64` 时约 **30 帧**。

---

## `func_462`：怎么对准

```c
if (global158 == 0)
{
    global265 = sys_0(0x40000, 0x1);   // 对当前锁的 yaw
    global499 = sys_0(0x40001, 0x1);   // 对当前锁的 pitch
    // yaw：func_102(..., 0xf, 1) 步进，下限约 0x4b*dt/0x64
    sys_46(0, step);
    // pitch：夹在 [-0xdac, 0xdac]，步进累加到 global167
    if (sys_0(0x40003, 0x1) < 0x7d0)   // 水平距*100 < 2000
        global158++;                   // 够近就停更新，保持姿态
}
func_457(...);                         // 用剩余 yaw 带一点 roll
func_104(...);                         // 视觉俯仰/滚转
global165 -= func_274();
if (global165 <= 0)
    func_169(0x400);                   // 结束，回到手动
```

和副射 / 特射的差别：

| | 本机动 `func_462` | 自制副射 start | ALT_2 第二枪 |
|--|------------------|---------------|--------------|
| yaw 查询 | `0x40000 / 1` | `0x40000 / 3` + `func_121` | 快照 `0x40000 / 3` |
| pitch | `0x40001 / 1` → `global167` | `func_609(1)` + `func_105` | 无 |
| 时长 | `global24&0x400` + `global165` | 只在 676 start | remain 步进到 0 |
| 符号 | 共通 `func_462` | `rebellion_sub_shot_custom_*` | `rebellion_alt2_*` |

`0x40003/1` 已钉死为水平距离 ×100。`0x40000/1` 与射击常用的 `/3`、`/5` 不是同一个参数；这里跟 TV 官方飞行，不要改成 `/3`。

---

## Rebellion 为什么现在没有

| 层 | TV | Rebellion | 结论 |
|----|----|-----------|------|
| `0.c` `func_106` + `0x2c` | 有 | 有（publish `global76`） | 不用改 0.c |
| `2.c` `func_21` 读 `0x2c` → `global93` | 有 | 有 | 不用改 |
| `func_452..463` | 有 | 有（global 已按表平移） | 不用抄 TV 函数 |
| `global122` | `func_386` 清 0 后 **`func_881` 写成 `0x200`** | `func_386` 清 0，**再也没写** | **只缺这一位** |

TV 赋值是整字覆盖，不是 `|=`。TV WZ 的能力字就是 `0x200`：

- 开：前进双击对准
- 关：`0x2` 左右横移、`0x4` 另一套摇杆、`0x8` `func_104` 轴对调

`global122` 每帧还会送到引擎：`sys_1(0xe0000, 7, global122)`、`sys_1(0x10000, 0, 0x2e, global122)`。MSC 侧目前只有 `func_463` 测 `0x200`；native 是否另读这一位未单独跟。

---

## 已落地改法

Rebellion `2.c` `func_874`（`func_1` 在 `func_386` 清零之后调用它，对应 TV `func_881`）末尾：

```c
global122 = 0x200;
```

约束：

1. **不要**为了对准去改 `0.c` / 复制 TV `func_143`。方向双击已经在。
2. **不要** `global122 = 0x200 | 0x2`。左右横移是 T-06，另一件事。
3. **不要**在 `func_462` 里换 `rebellion_sub_shot_custom_aim` / `func_105`。官方已经用 `0x40001/1` + `global167`。
4. **不要**在受击后重排 `0x77b100ff` 来「恢复对准」。打断仍走 [FORCED_RECOVERY](./wing-zero-rebellion-flight-interrupt-form.md)。
5. 若只想鸟形态有：在 Bird enter `|= 0x200`，normal restore 清掉。TV 是出击就写死，飞行 loop 外 `func_463` 本来不跑。

实机门槛：

1. 鸟飞行、有锁、前进松开后再按一次（约 8 帧内）→ 机头转向敌人（含俯仰）。
2. 对准约 30 帧后恢复手动；期间摇杆应被 `func_462` 盖住。
3. 只点一次前进、或左右双击：不应进 `func_462`。
4. 地面 / 非飞行：行为与现在相同。
5. 射击中若 `global24 & 0x3` 且没有 `0x8`，双击会被 `func_463` 开头直接 return。

调参只动 `func_463`/`func_462` 里已有常数：冷却 `0x3e8`、持续 `0xbb8`、步进 `0xf`、停更距离 `0x7d0`。
