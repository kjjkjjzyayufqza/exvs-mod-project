# 结构化分析 JSON 工作流

这个工作流用于解决 `func_N`、行号、offset 变化后研究结论失效的问题。它不替代人工判断，而是把“当前样本里有哪些函数、调用、syscall、global 写入、注册表”先变成可重复生成的事实。

## 当前工具

```text
tools/msc_c_static_analyzer.py
```

当前生成物：

```text
docs/msc-research/generated/0xBDBE6FEA-2.analysis.json
docs/msc-research/generated/0xBDBE6FEA-0.analysis.json
```

重新生成：

```powershell
python tools\msc_c_static_analyzer.py 'E:\XB\解包\com\file\0xBDBE6FEA\2.c' --output docs\msc-research\generated\0xBDBE6FEA-2.analysis.json
python tools\msc_c_static_analyzer.py 'E:\XB\解包\com\file\0xBDBE6FEA\0.c' --output docs\msc-research\generated\0xBDBE6FEA-0.analysis.json
```

## 当前 `2.c` 样本快照

```json
{
  "lineCount": 29664,
  "functionCount": 1047,
  "voidFunctionCount": 921,
  "intFunctionCount": 126,
  "actionFunctionCount": 21,
  "sha256": "1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589"
}
```

如果文件内容改变，`sha256` 会变。讨论调用链时应先确认 JSON 是从当前 `2.c` 重新生成的。

## 当前 `0.c` 样本快照

```json
{
  "lineCount": 3525,
  "functionCount": 145,
  "voidFunctionCount": 99,
  "intFunctionCount": 46,
  "actionFunctionCount": 0,
  "sha256": "9EC31CCB370770863F2FB020A8CFA699DFE53D1ED76636F5BDCC136314AF26C0"
}
```

`0.c` 主要用于研究 input/action selector 边界：从 `sys_0(0x20000,...)` 采样输入 bit，到 `func_143 -> func_95(actionHash,...)` 选择 action，再由 `2.c` 消费 action hash。

## JSON 里有用的字段

- `functions`：每个函数的范围、调用、syscall、global read/write、常量。
- `registries.func241`：`func_241(hash, callback)` action 注册。
- `registries.sys10001`：`sys_1(0x10001, group, slot, value)` 注册。
- `summary.buckets`：按函数区间统计 syscall 热点，方便先定位系统区段。

## 怎么服务“整个调用链”

### 找入口和注册表

先看：

```text
main
func_1
func_1042
func_1043
func_1044
func_1045
func_1046
```

如果 offset 变化，不直接搜行号，而是找：

- 有 `sys_2(0,0x8/0x6/0x7, callback)` 的入口函数。
- 有大量 `func_241(hash, callback)` 的 action registry。
- 有大量 `sys_1(0x10001,0x2,slot,callback)` 的 slot callback registry。
- 有大量 `sys_1(0x10001,0x3/0x4,slot,hash)` 的 motion resource registry。

### 找 runtime family

射击 / 多阶段武装 runtime：

- 匹配 `global676..681` 的 reset 函数。
- 匹配按 `global184 == 0/1/2/3` 分派的 driver。
- 匹配 `global680` 函数指针调用和 `sys_0(0x90000, global681, 0)` ammo slot 检查。

格斗 / 特殊移动 runtime：

- 匹配 `global602/608/609/610` 的 reset 函数。
- 匹配 `func_71(global602)`、`func_71(global609)` 这类 callback 调度。
- 匹配大量 `sys_46`、`func_219` 参数加载、`func_99/100/101` 方向数学。

### 找具体武装

以主射为例，不靠 `ACTION_A_SHOT` 名字也能匹配：

```text
wrapper:
  calls func_586
  writes a startup callback to global677
  writes a fire callback to global680
  writes ammo slot 0 to global681

fire callback:
  contains sys_4F(0, 0, weaponHash)
```

以特格 / 格斗为例：

```text
wrapper:
  calls func_488
  may call func_219(rowHash)
  writes callback to global602 or global609
  enters func_489 / func_507 family

callback:
  uses func_308 or func_79 for motion
  often uses sys_46 for movement
  may change global170 and call func_887
```

## 当前 action registry 摘要

`func_1043` 当前有 55 条 `func_241` 注册，其中 21 个 callback 已被反编译名改成 `ACTION_*`：

| 玩家语义 | action hash | callback |
|---|---|---|
| 主射 | `0xf48d2d49` | `ACTION_A_SHOT` |
| 主射状态 0 | `0x7158fa47` | `ACTION_A_SHOT_STATE_0` |
| 射击 CS / 换锁分支 | `0x700bb2c6` | `ACTION_CHARGE_SHOT_LOCK_SWITCH` |
| 副射 | `0x31f61d6c` | `ACTION_AB_SUB` |
| 方向副射 | `0x6ab85f0d` | `ACTION_AB_SUB_DIRECTIONAL` |
| 方向特射 | `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` |
| 特格 alt | `0x6ab12717` | `ACTION_BC_SPECIAL_MELEE_ALT_2` |
| 特格 | `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` |
| 格斗 | `0x178d1109` | `ACTION_B_MELEE` |
| 方向格斗 1 | `0xa2236f44` | `ACTION_B_MELEE_DIR_1` |
| 方向格斗 2 | `0x0e962048` | `ACTION_B_MELEE_DIR_2` |
| 方向格斗 4 | `0xa1635c24` | `ACTION_B_MELEE_DIR_4` |
| 格斗派生 | `0x3ac14535` | `ACTION_B_MELEE_VARIANT` |
| 觉醒技 | `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` |
| 觉醒技换锁分支 | `0x99a7a777` | `ACTION_ABC_FINAL_ATTACK_LOCK_SWITCH` |
| 主射换锁分支 | `0x91ce1efc` | `ACTION_A_SHOT_LOCK_SWITCH` |
| 特射换锁分支 | `0x9c05b42d` | `ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH` |
| 特格换锁分支 | `0x427fe876` | `ACTION_BC_SPECIAL_MELEE_LOCK_SWITCH` |
| 格斗换锁分支 | `0x1b89c323` | `ACTION_B_MELEE_LOCK_SWITCH` |

这些表项不是最终命名，只是当前样本的 registry 事实和已有注释合并后的读法。

## 当前 syscall 总量

按整个 C 文件静态调用计数：

| syscall | count | 初步用途 |
|---|---:|---|
| `sys_0` | 1196 | 读取 engine 表和参数表 |
| `sys_1` | 590 | 写 engine 表和注册表 |
| `sys_46` | 391 | 移动、速度、惯性、rate、朝向类控制 |
| `sys_47` | 332 | motion、model TRS、时间线 marker |
| `sys_4B` | 283 | shell/model entry、挂接、清除 |
| `sys_4A` | 219 | aleo/effect/cut-in/场景效果 |
| `sys_58` | 168 | 音效或表现资源触发候选 |
| `sys_4F` | 128 | 武装、ammo、charge、resource presentation |
| `sys_53` | 43 | 镜头、震动、camera preset |
| `sys_51` | 36 | 援护 summon |

这个计数是反编译 C 调用计数。旧笔记里某些较小数字可能来自二进制扫描或局部样本，不应混用。

## 后续 overlay 要做什么

下一步应有人工维护的 semantic overlay，例如：

```json
{
  "semanticId": "runtime.rangedWeaponMultiPhaseDriver",
  "displayName": "ranged weapon multi-phase runtime",
  "match": {
    "mustWriteGlobals": ["global676", "global677", "global680", "global681"],
    "mustCall": ["func_71"],
    "mustContain": ["sys_0(0x90000", "(*global680)()"]
  }
}
```

这类规则的目标是：下一次 `func_587` 变成 `func_612` 时，仍能通过结构重新识别它。
