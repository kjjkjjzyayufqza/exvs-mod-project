# EXVS MSC Syscall 53 Investigation Notes

## 概述

这份文档记录当前针对 `sys_53`（`0x53`）的阶段性分析结果，目标是给后续实机验证提供一套可直接执行的参数语义假设。

建议结合以下文档一起阅读：

- `docs/exvs-msc-analysis.md`
- `docs/exvs-msc-syscall-4e-notes.md`
- `docs/exvs-msc-syscall-4f-notes.md`
- `docs/exvs-msc-syscall-47-notes.md`

---

## 当前最强结论

基于 `CDepictionScript` 的 handler table 挂载函数 `sub_140664F70`：

- `a1[87] = sub_140682BF0`（data xref: `0x140665088`）
- 映射模型：`syscall_id = slot_index - 4`
- 因此：`slot 87 -> syscall 83 -> sys_53 -> sub_140682BF0`

这说明 `sys_53` 属于 `CDepictionScript` 这条 depiction/shell family，而不是通用底层 math syscall。

进一步结合字段消费链可以收敛到更具体结论：

- `sys_53` 主要控制的是 **第三人称相机参数层（camera parameter layer）**
- 次级上会联动 depiction preset（按 hash 选择）
- 不直接改角色状态机数值（HP/弹药/动作状态位）

---

## Native Handler 形态

`sub_140682BF0` 特征如下：

- 签名：`__int64 __fastcall(__int64, __int64, int, _DWORD *)`
- 入口检查：`*(_QWORD *)(a2 + 40)` 非空且 `a3 >= 1`
- 分发方式：`switch (*a4)`，第一个脚本参数即 subcmd
- case 范围：`0x0 ~ 0x6`（共 7 个子命令）
- 函数尺寸：`0x47C`（中等复杂度）

与 `sys_4E` 相比，`sys_53` 更聚焦“局部状态插值参数 + 一次性触发/停止 + preset 选择”，不属于巨型状态总线接口。

---

## “它到底控制了什么”的证据链

### 证据 1：字段偏移与 `CCameraThirdPerson` 构造一致

`sys_53` 的 `subcmd 0x1/0x2/0x3` 会写入：

- `[+152..+176]`
- `[+180..+204]`
- `[+208..+232]`
- `[+236..+260]`
- `[+264..+288]`
- `[+292..+316]`

并调用 `sub_14030B900` 计算插值。

而 `sub_14063F5E0`（已命名为 `VDK::GAM::CCameraThirdPerson` 构造）初始化的正是同一批偏移段，并逐段调用同一个 `sub_14030B900`。

这说明 `sys_53` 写入的是相机对象内部插值参数，而不是任意通用结构。

### 证据 2：`subcmd 0x4/0x5` 是相机 preset 模式切换

`subcmd 0x4` 调用：

- `sub_14063F210`（取相机相关上下文）
- `sub_14063F270(v7, 3)`（切到模式 3）
- `sub_140646AD0(ctx, hash, strength, 0)`（按 hash 安装 preset）

`subcmd 0x5` 只调用：

- `sub_14063F270(v7, 0)`（回到模式 0）

这是一组非常典型的“启用 preset / 停用 preset”控制对。

### 证据 3：外围调用函数出现 CrossAwakening 相机类型

`sub_140896760` 内部出现：

- `VDK::GAM::CCameraParameterForCrossAwakening::vftable`
- 多组 hash 列表 + `sub_140646AD0` 批量应用

说明 `sub_140646AD0` 确实处于“相机参数资源”语义空间，和 `sys_53(0x4, hash, ...)` 的行为一致。

### 证据 4：脚本调用时机是“演出窗口”

在 `2.c` 中，`sys_53(0x4, func_479())` 往往出现在状态机进入演出阶段时，退出分支紧跟 `sys_53(0x5)`。

这符合“演出期切相机参数，结束后还原”的规律。

---

## 结论（当前版本）

`sys_53` 在游戏内主要控制：

- 第三人称相机参数的插值与切换（主控制面）
- 基于 hash 的相机/depiction preset 启停（次控制面）
- 一部分即时向量参数写入（`subcmd 0x6`）

换句话说，`sys_53` 更像 “camera behavior/preset bus”，不是角色行为主总线，也不是纯特效发射器。

---

## 子命令语义（当前版本）

下面是按稳定程度给出的语义分级：`高置信` / `中置信` / `待实测`。

### `subcmd 0x0`（中置信）

调用形态（脚本）：

- `sys_53(0, var1, 0x190, var2, 0x1)`
- `sys_53(0, 0x32, 0x384, 0x10cc, 0x1)`

native 行为：

- 调用 `sub_14063F2C0(v7, 0x40000000u, v6, (_DWORD)a4, a4[4] or 0)`
- 向 `v7 + 32` 区段写入参数并置 `state=1`

结论：

- 更像“启动一种全局权重/强度通道”的初始化触发。
- `arg4`（第 5 参）作为附加模式或 flag 被透传。

---

### `subcmd 0x1`（高置信）

native 行为（关键点）：

- 默认值：`scaleA=1.0`, `scaleB=1.0`, `duration=5.0`, `curve=2`
- 参数缩放：整数参数统一 `* 0.01f`
- 写入两组插值结构：
  - `[+180..+204]`
  - `[+208..+232]`
- 每组写入后调用 `sub_14030B900(...)` 计算插值系数

结论：

- “双通道插值配置”接口。
- 常用于设置两个相关视觉参数（例如强度与附属量）并指定同一持续时间和曲线类型。

---

### `subcmd 0x2`（高置信）

调用形态（脚本）：

- `sys_53(0x2, 0x64, 0x64)`
- `sys_53(0x2, 0x64, 0x64, 0xbb8)`
- `sys_53(0x2, 0xb4, 0x78, 0x7d0)`

native 行为（关键点）：

- 默认值：`a=1.0`, `b=1.0`, `c=1.0`, `duration=5.0`, `curve=2`
- 可选参数同样按 `0.01f` 缩放
- 连续写入三组插值结构：
  - `[+236..+260]`
  - `[+264..+288]`
  - `[+292..+316]`
- 每组都调用 `sub_14030B900(...)`

结论：

- “三通道插值配置”接口。
- 参数格式和 `0x1` 一致，但扩展为三组量，常用于阶段开场时批量设定三维视觉通道。

---

### `subcmd 0x3`（高置信）

native 行为：

- 仅写一组插值结构 `[+152..+176]`
- 参数格式同前：`value * 0.01f` + `duration` + `curve`

结论：

- “单通道插值配置”接口，可视为 `0x1/0x2` 的简化版本。

---

### `subcmd 0x4`（高置信）

调用形态（脚本）：

- `sys_53(0x4, 0x7394523c, 0x4650)`
- `sys_53(0x4, 0xa9b8761f, 0x9c40)`
- `sys_53(0x4, 0xb7ce8347)`
- `sys_53(0x4, global555)`

native 行为：

- `v26 = a4[1]` 作为资源/预设 ID（hash）
- 第三个参数可选，若存在则 `arg2 / 100.0f`，否则默认 `-1.0f`
- 调用链：
  - `sub_14063F210(v7)` 取上下文对象
  - `sub_14063F270(v7, 3)` 切换模式
  - `sub_140646AD0(ctx, hash, strength, 0)` 应用 preset

结论：

- 这是 `sys_53` 最常见入口：按 **clip BST key**（`02winlose` / `01waza` / `00system` word25，`0x980ABFA6`）安装战斗镜头，不是 row id，也不是 nuanmb 名。
- `sub_140646AD0` 把 hash 填进 `player+5952` 的 `entryBase`；第三参 `strength` 写在 `player+576`。`647290` 只在 `strength > 0` 时用它当整段 clip-clock 上限；省略第三参时 native 默认 `-1.0f`，这条截止不生效。
- 单 shot 时长是编译行 `+28` 的 `0x42ACFE7D`，不是 word40。完整 0x134 / `5DC150` 布局见 [camera-clip-bst-loader.md](msc-research/camera-clip-bst-loader.md)。

---

### `subcmd 0x5`（高置信）

调用形态（脚本）出现频率极高：

- `sys_53(0x5)`

native 行为：

- 仅调用 `sub_14063F270(v7, 0)`

结论：

- 清理/停用 `0x4` 启动的模式，是最典型的“stop/reset”配对命令。

---

### `subcmd 0x6`（中置信）

native 行为：

- 将 `a4[1..3] * 0.01f` 组装为 `float3`
- 写到 `*(_QWORD *)(*(_QWORD *)(v6 + 10680) + 1072)`

结论：

- 这是直接写入 depiction 子结构中的三维向量参数接口。
- 可能用于方向偏移/轴向权重/颜色向量一类“即时设置”，不走插值 helper。

---

## 与脚本调用模式的对应关系

从 `2.c` 的高频使用看，`sys_53` 呈现出明确的“启动-停止”形态：

- `sys_53(0x4, hash, optional)`：启动特定 preset
- `sys_53(0x5)`：停止/复位 preset
- `sys_53(0x2, ...)`：开场或状态切换时批量写入 3 组插值参数
- `sys_53(0, ...)`：较少见，像是额外权重通道初始化

这与其 native 结构高度一致：`0x4/0x5` 操作模式状态，`0x1/0x2/0x3` 操作插值参数块，`0x6` 写瞬时向量。

---

## 建议的实机验证顺序

1. 先在固定脚本点验证 `sys_53(0x4, hash)` 与 `sys_53(0x5)` 的可逆性（是否稳定启停同一效果）。
2. 再对同一个 `hash` 分别测试 `sys_53(0x4, hash, 0x7530)` / `0x2710` / `0x03E8`，观察强度或时间尺度变化。
3. 最后测试 `sys_53(0x2, a, b, duration)`，仅改单一参数，确认三通道各自对应的视觉维度。

## Gyan transform flight camera (2026-07-11)

User-validated pull-back during flight:

```text
sys_53(0x2, 0x15e, 0x118, 0xbb8);   // pull farther
sys_53(0x2, 0x64, 0x64, 0xbb8);     // restore
```

Placement recommendation for Gyan N2 rocket mod:

- Prefer `GYAN_TRANSFORM_ENTRY_SLOT` / `GYAN_TRANSFORM_RELEASE_SLOT` (or `GYAN_TRANSFORM_CAMERA_PULL/RESTORE` helpers).
- Avoid long-term patches on common `func_452` / `func_464` once validated.
- Do not put zoom only in `GYAN_TRANSFORM_MOUNT_*` unless Dodai special-shot mount should share zoom (those helpers are also called from special-shot START/RELEASE).

See `docs/msc-research/gyan-session-2026-07-11-handoff.md` §4.

---

## 仍待确认的问题

- `0x0` 与 `0x1/0x2/0x3` 在实际渲染链中的优先级关系。
- `subcmd 0x6` 对应的三维向量到底是“方向/位移/色彩权重”哪一类语义。
- `sub_140646AD0` 内部 `hash -> 节点` 查找命中的具体资源类型（特效、后处理、镜头参数或混合体）。Battle `sys_53(0x4)` clip hashes are `02winlose` word25 keys into a runtime BST compiled from `vgsht2` rows, not loose `*.nuanmb`. Loader note: `docs/msc-research/camera-clip-bst-loader.md`.
