# `func_593` 旧版 / 正常班 ranged 四槽

**Date:** 2026-08-16  
**Status:** E1 `func_593` / `func_595` 源码钉死（阶段流程）；E2 四槽形状跨机体一致；
`callFunc*` native 语义 **E0 未知**（见文末「callFunc 系列」）  
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

---

## 这是通用范式，模组必须跟随

**用户约束（2026-08-27）：** EXVS2 MSC 的动作脚本是**一个 action 函数 + 四个阶段函数**
（start / shoot / no_ammo / end）。每台机体这四个函数的**内容**不同，
但**结构必须跟随**。不要为了实现新招式自创另一套阶段机。

标准形状：

```c
void ACTION_X()            // func_241 注册的 depiction 入口，只跑一次
{
    func_586();            // 复位整张 ranged 参数表
    global676 = X_start;
    global677 = X_shoot;
    global678 = X_no_ammo; // 0 / 0xffffffff = 本招不实现空弹段
    global679 = X_end;
    callFunc3(X_tick);     // 恰好一次，目标必须是本动作主 tick
}

void X_tick()              // 每帧
{
    func_593();            // driver 自己按 global184 推进四槽
}
```

阶段推进**不由你写**：`func_593` → `func_594/595/596/597/598` 用
`func_71(globalNNN)` 换阶段（`func_73` 复位 + 写 `global225` + `func_72` 立即派发一次），
tick 内的 `func_72()` 每帧重跑当前阶段函数。
你只负责四个阶段函数的**内容**，以及在合适时机置 `global252` 让 driver 往下走。

### 禁止（每条都实机失败过，见负面登记表 E 组）

| 禁止 | 后果 |
|------|------|
| 自建 phase 状态机（`callFunc3(my_tick)` 里自己跑 `phase == 0/1/2`）替代四槽 | 与 driver 用法相反，拿不到原生阶段所有权 |
| `callFunc3` 挂非 tick 的东西（如 `transform_start`、`func_1073` 这类每帧状态机） | 只被调一次，停在第一段 |
| 一个 ENTER 里多次 `callFunc3` | 未知行为，corpus 里没有先例 |
| 把 `func_71` 当 `callFunc3` 用，或反过来 | 两者层不同：`func_71` 写 `global225`（阶段），`callFunc3` 是 VM opcode |
| 在 `677` 函数体里写 `sys_46` 锁冲 | `func_596` 随后 `func_300(global714)`，453/454=0 时倍率 0，原地不动 |
| 把 `678` 当 cancel | 它是空弹段，调用条件是没弹药 |

---

## `callFunc` 系列：只抄形状，不要推测语义

### 已钉死（E1，工具链）

`tools/msclang_msc.py` / `tools/mscdec_msc.py` 的 opcode 表：

| 源码名 | opcode |
|--------|--------|
| `callFunc` | `0x2f` |
| `callFunc2` / 编译器暴露为 `set_main` | `0x30` |
| `callFunc3` | `0x31` |

`tools/msclang.py` 的下降形式（`callFunc3` 与 `set_main` 相同）：
先压参数，再压函数指针，最后 `Command(0x31, [N])`，**N 不含函数指针**。
`tools/mscdec.py` 反向解码时把参数逆序还原。

### 实测分布（E2，跨约 180 台机体 `040msc/**/*.c`）

| 形式 | 出现情况 |
|------|----------|
| `callFunc3(...)` | 每台 `2.c` 约 50–120 处；`0.c` / `1.c` 各恰好 1 处（主循环安装） |
| `set_main(...)` | **稀有**。Rebellion `2.c` 仅 2 处，都在 `func_296(0x3e8, 0)` + `func_169(0x1000000)`（关飞行电机 + 清空中位）之后 `set_main(func_446)` |
| `callFunc(...)` | 抽样机体中未见 |

### 未知（E0，native 侧，**禁止基于推测写代码**）

- VM 收到 `0x31` 之后把函数指针写进哪个槽、和 `sys_2(0, 0x2/0x3, cb)` 的动作层回调是什么关系
- 同一动作内调用两次是替换还是叠加
- 能否从 tick 内部调用
- 参数 `a1..aN` 传到哪里（corpus 里全部只传函数指针，N=0）
- `set_main`(0x30) 与 `callFunc3`(0x31) 的差别；上面那个「关电机后 `set_main`」只是**观察到的位置**，不是已知语义

在 IDA 把 `0x2f/0x30/0x31` 的 native handler 钉死之前，
**唯一安全做法是照抄 vanilla 形状**：一个 ENTER 末尾恰好一次 `callFunc3(本动作 tick)`，
N=0，其余一律不动。
