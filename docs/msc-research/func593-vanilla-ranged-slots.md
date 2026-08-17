# `func_593` 旧版 / 正常班 ranged 四槽

**Date:** 2026-08-16  
**Status:** 已用 `func_593` / `func_595` 源码钉死  
**Kind:** MSC 2.c ranged runtime 规范  
**Supersedes:** older notes that call `global678` a cancel / branch / mid callback

## 一句话

旧版（正常班、非 `func_587` 新主射写法）多阶段射击是：

```c
func_586();
global676 = start;     // 起手
global677 = shoot;     // 有弹时的开火段
global678 = no_ammo;   // 没子弹走这里；不是 cancel
global679 = end;       // 收尾
callFunc3(tick);       // tick 里只调 func_593()
```

`start` / `shoot` / `end` 这三个名字是对的。  
**`global678` 不是 cancel。** driver 在 start 结束、准备进入开火段时读 `sys_0(0x90000, global681, 0)`：有弹调 `677`，没弹调 `678`。

真正的 BD / 派生取消看动作里的 `func_123` / `func_125`，不要写进 `678`。

## 和另一套 driver 的边界

| 写法 | Driver | 槽 | 用途 |
|------|--------|----|------|
| **旧版 / 正常班** | `func_593` | `676/677/678/679` | 副射、特射照射等：start →（有弹 shoot / 没弹 no_ammo）→ end |
| **新版 / 简单主射** | `func_587` | `677` + `680` fire | 主射常见：motion 段 + 单独 fire callback；**没有** `678` 空弹槽 |

不要把 `func_587` 的 `global680` fire 和 `func_593` 的 `global677` shoot 当成同一张表。

`678 = 0` 或 `0xffffffff` 是合法的：表示这个动作不实现空弹段。 Rebellion 鸟形态主射就是 `678 = 0`。

## `func_593` 阶段（证据）

样本：`E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c` 的 `func_593`–`func_598`。

```text
func_593
  global184 == 0 -> func_594  进入：func_71(global676)     start
  global184 == 1 -> func_595  start 结束后分流：
                      sys_0(0x90000, global681, 0) != 0
                        -> func_71(global677)               shoot
                      else
                        -> global184 = 3
                           func_71(global678)               no_ammo
  global184 == 2 -> func_596  shoot 后再决定是否连射 677，
                              然后 func_71(global679)       end
  global184 == 3 -> func_597  空弹段播完：func_71(global679) end
  global184 == 4 -> func_598  真正退出
```

`func_595` 原文形状（缩写）：

```c
if (global252 && global722)
{
    var1 = 0x1;
    if (global681 != 0x5)
    {
        if (sys_0(0x90000, global681, 0) == 0)
            var1 = 0;
    }
    if (var1 == 0x1)
        func_71(global677);   // has ammo
    else
        func_71(global678);   // no ammo
}
```

`global681 == 0x5` 时跳过空弹检查（蓄力槽特例），不要当成普通副射/特射。

## 两层“空弹”，不要混

| 层 | 谁决定 | 典型结果 |
|----|--------|----------|
| `0.c` `func_143` | 按键当下槽里有没有弹 | 派发另一个 action hash（例如 EW 零式弹尽副射 `ACTION_AB_SUB_ALT_2` 格斗反击） |
| `2.c` `func_593` `global678` | **已经进了这个 action**，start 结束后再查一次槽 | 同一 action 内走空弹段，再进 `679` end |

改空弹手感先分清是换整招（`0.c`）还是招里换段（`678`）。

## 空弹段里常见写什么

旧版特射/副射的 `678` 回调经常是：

- `sys_4F(0x12, global681)` 收掉已发出去的武器 handle
- 短 motion / 急停
- 置 `global252` 让 driver 进 `679`

这看起来像“取消”，所以旧文档会误写成 cancel。调用条件是 **没弹药**，不是玩家 BD cancel。

招内「点按后停掉当前照射、再打下一发」不要塞进 `678`。`func_596` 从 shoot 置 `global252` 只会进 `679`。  
照射停法、点按窗、以及为什么 `0x12` 不够，见
[alt2-gerobi-stop-and-followup](./alt2-gerobi-stop-and-followup.md)。

## 命名

新写 `func_593` 动作时用：

```text
*_start
*_shoot
*_no_ammo     // 不要叫 cancel
*_end
```

仓库里已有的 `startup` / `fire` / `recovery`（例如 `ACTION_A_SHOT_BIRD`）可以保留；不要再把 `678` 命名成 `cancel` / `branch` / `mid`。

不要和这些混：

- 百式反编译里 `global678` 有时是 start（全局编号漂移，见 Gyan Dodai 移植笔记）。
- `docs/exvs-msc-input-action-weapon-pipeline.md` 的 BDBE 试验名 `global678 -> actionInitCallback` 不是这套 `func_593` 四槽。
