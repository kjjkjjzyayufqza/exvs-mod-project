# MSC CS 动作必须在入口消费 charge slot

**Date:** 2026-08-22  
**Status:** Rebellion CSA 入口消费 E3（历史）；自制副射出弹 E3 in-game confirmed (2026-08-30) `sys_4F(0, 0x5, CDA9F563/564)` 三参不打正在蓄的 CSA；4th-arg 消费为 OB native E2（`sub_1405BCF00`）；slot-1 三参 / slot-0 四参 E3-  
**Kind:** 可复用的 charge lifecycle 规则

## 一句话

`0.c` 选中 CSA/CSB action，只代表动作被提交，**不代表 native charge slot
已经被消费**。每个 CS action 必须在动作入口一次性清空/消费对应 charge slot；
否则满蓄状态会继续成立，动作结束或被打断后可以无限再次提交。

## Slot 与消费方式

| CS | 输入 bit | Rebellion action | Native slot | 动作入口政策 |
|---|---:|---|---:|---|
| 普通 CSA | `0x800` | `ACTION_CHARGE_SHOT` / `ACTION_CHARGE_SHOT_DIRECTIONAL` | `0` | `sys_4F(0xA, 0)`，再进入 `func_586` |
| 飞行 CSA / 鸟主射三档 | `0x1` 与 `0x800` | `ACTION_A_SHOT_BIRD_CS1` / `CS2`（档 1/2）；档 0 仍是未蓄力 `ACTION_A_SHOT_BIRD` | `0` | 升档脉冲 `sys_0(0x90003,0)==1` 时 `sys_4F(0xA,0)`（TV `func_1074`）；CS1/CS2 **ENTER** 再消费一次。禁止写进未蓄力 `ACTION_A_SHOT_BIRD` |
| Zero System CSB | `0x1000` | `ACTION_MASK_1000` | `4` | 已由入口 `func_1031()` 的 `0x11/0x5/0x3` 链消费并关闭 charge 状态 |

`sys_4F(0xA, slot)` 的 native handler 会把该 entry 的 charge 累计/计时值
归零。Rebellion 普通与飞行主射通过 mode-4 row adapter 共享 charge state，
因此两种 CSA 都清同一个 slot `0`，但各自 ammo 仍保持独立。

## 为什么必须在 action 入口

正确顺序：

```text
0.c release bit
  -> func_95(CS action hash)
  -> 2.c CS action entry
  -> consume/reset native charge slot exactly once
  -> initialize motion/action driver
  -> startup / fire / recovery
```

不能只在 projectile fire callback 清 charge。若起手阶段被打断，fire callback
不会执行，满蓄 slot 会被保留下来，仍然可以再次使用。也不能在 ACTIVE
per-tick callback 每帧清零，这会干扰 native charge state machine。

## 共享 handler 陷阱

鸟形态现在按 TV 三档选 hash，不再用 `ACTION_CHARGE_SHOT_BIRD` 去 alias 未蓄力主射。
`0.c` `0x1` 和 `0x800` 都读场 `0x100`。升档消费（TV `func_1074`）让蓄力条能填第二档；
CS 动作入口消费避免起手被打断后满蓄还能再用。

```c
void ACTION_A_SHOT_BIRD_CS1()
{
    sys_4F(0xa, 0);
    rebellion_bird_cs_stage = 0;
    ...
}
```

禁止把 `sys_4F(0xA,0)` 放进未蓄力 `ACTION_A_SHOT_BIRD`，否则普通鸟主射
也会清掉正在积累的 CSA。地面 `0x800` 仍走 `ACTION_CHARGE_SHOT`。

`sys_4F(0, slot, hash, 1)` 的第 4 参不是“多发一发”，也**不是 CS 槽编号**。
OB `sub_1405BCF00` 在 `bool != 0` 且 `entry+0x7C != 0` 时清掉 **arg2 那个
slot** 的 `+0xF0/+0xF8`，与 `sys_4F(0xA)` 相同。CSA 蓄力在 slot `0`，所以
`sys_4F(0, 0, hash, 1)` 等于开火消费 CSA。CSA `func_899` 对 slot 0 传 `1`
是故意的。未蓄力 `ACTION_A_SHOT` `func_895` 只有三参。

自制 `SUB_SHOT_CUSTOM` 出弹（2026-08-30 **E3**，已打包进游戏）：

```c
sys_4F(0, 0x5, 0xCDA9F563);
sys_4F(0, 0x5, 0xCDA9F564);
```

| `sys_4F(0)` 参数 | 含义 | 自制副射 |
|---|---|---|
| arg1 `0` | 子命令：出弹 | 不变 |
| arg2 slot | 武装 entry。`0` = CSA；`1` = `global681` 弹药槽；`0x5` = `func_589` 跳过 `0x90000` 的虚拟槽 | **必须 `0x5`** |
| arg3 hash | 弹哈希 | `CDA9F563` / `CDA9F564` |
| 第 4 参 | 该 slot 的蓄力消费 bool，不是槽号 | **不要传** |

ENTER 仍写 `global681 = 0x1`，让 `func_593` / `0x90000` 继续扣副射弹药。
不要把 `global681` 改成 `0x5`（那会跳过空弹检查，变成无限副射）。鸟 CS 出弹
也走 slot `0x5`，但它是 CS 动作，入口另外 `sys_4F(0xA, 0)` 清条。

**E3-：** `sys_4F(0, 0, hash, 1)`、`sys_4F(0, 0x1, hash)`、去掉起手
`0x436f1f0a`、去掉 677 `sys_4A(0x1, 0x7)` 都不能保出弹帧的 CSA 条。
登记 K1–K4。早期部分回报混了未进游戏的 `2.dscex`；K4 以打包后实机为准。

## 生命周期与所有权

| Phase | Charge policy |
|---|---|
| ENTER | CS 专用 action 立即消费一次对应 slot |
| ACTIVE | 不再写 charge slot；动作 driver 独立运行 |
| EXIT | 不恢复旧满蓄值；必须重新蓄力 |
| INTERRUPT | 同样不恢复，避免取消后复用 |
| RESPAWN / REINITIALIZE | 由机体原生武装初始化函数重建 slot |

## Rebellion 证据

用户实机发现飞行 CSA 动作完成后仍可无限使用。审计随后确认三个 CSA action
入口都缺少 slot-0 clear；CSB 的 `func_1031()` 则已有独立的 slot-4 消费链。
修复后，普通、方向、飞行三个 CSA 入口均在 continuation 之前调用
`sys_4F(0xA,0)`；`2.dscex` 反编译回读得到三处调用。

相关说明：

- `docs/exvs-msc-syscall-4f-native-handler.md`
- `docs/msc-research/wing-zero-rebellion-bird-form-0c-input-map.md`
- `docs/agent-sessions/2026-08-22-wing-zero-rebellion-flight-armsparam.md`
