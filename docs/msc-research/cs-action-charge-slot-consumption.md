# MSC CS 动作必须在入口消费 charge slot

**Date:** 2026-08-22  
**Status:** Rebellion source/target MSC 已修并回读；实机复验待完成  
**Kind:** 可复用的 charge lifecycle 规则

## 一句话

`0.c` 选中 CSA/CSB action，只代表动作被提交，**不代表 native charge slot
已经被消费**。每个 CS action 必须在动作入口一次性清空/消费对应 charge slot；
否则满蓄状态会继续成立，动作结束或被打断后可以无限再次提交。

## Slot 与消费方式

| CS | 输入 bit | Rebellion action | Native slot | 动作入口政策 |
|---|---:|---|---:|---|
| 普通 CSA | `0x800` | `ACTION_CHARGE_SHOT` / `ACTION_CHARGE_SHOT_DIRECTIONAL` | `0` | `sys_4F(0xA, 0)`，再进入 `func_586` |
| 飞行 CSA | `0x800` | `ACTION_CHARGE_SHOT_BIRD` | `0` | `sys_4F(0xA, 0)`，再调用鸟主射 alias |
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

飞行 CSA 复用 `ACTION_A_SHOT_BIRD`，但普通飞行主射也调用这个 handler。
因此 charge clear 必须写在 CSA 专用 wrapper：

```c
void ACTION_CHARGE_SHOT_BIRD()
{
    sys_4F(0xa, 0);
    ACTION_A_SHOT_BIRD();
}
```

禁止把 `sys_4F(0xA,0)` 放进 `ACTION_A_SHOT_BIRD`，否则未蓄力的飞行主射
也会错误清除正在积累的 CSA。

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
