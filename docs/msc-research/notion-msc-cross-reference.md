# Notion MSC 页交叉索引

来源：MCP Notion 读取的 `MSC` 页面。

页面 URL：

```text
https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd
```

本页不是复制 Notion 内容，而是把其中的研究经验映射到当前 `0xBDBE6FEA/2.c` 样本和仓库文档。

## 与当前样本直接相关的 Notion 线索

### `sys_47`

Notion 记录：

```text
sys_47(0x12, modelId, boneId, x, y, z)
0x10 rotate
0x11 平移
0x12 scale
```

仓库文档对应：

- [../exvs-msc-syscall-47-notes.md](../exvs-msc-syscall-47-notes.md)

当前 `2.c` 对应证据：

- `func_901`: `sys_47(0x12, 0x6baa794a, 0x69261cfb, 0x64, 0x64, 0x64, 0)`
- `func_901`: `sys_47(0x10, 0x6baa794a, 0x5d76bbc3, 0, 0, 0, 0x3e8)`
- `func_895`: 对 `0x6baa794a` 的多个 scale key 清零。
- `func_922`: 在 action 时间线中用 `sys_47(0x10, 0x689c17f5, ...)` 做旋转。

当前结论：

- `sys_47(0x10/0x11/0x12)` 可以在研究文档里直接命名为 rotate / translate / scale。
- 仍需注意 `modelId` 在 native 层可能是 shell entry / object id，不一定是裸模型资源名。

### `sys_4B`

Notion 记录：

```text
sys_4B(0x2, entry, bone/index, resource, optional_target)
模型接上模型
sys_4B(0x3) 解除全部装备
sys_4B(0x3, entry) 解除该模型的全部装备
```

仓库文档对应：

- [../exvs-msc-syscall-4b-notes.md](../exvs-msc-syscall-4b-notes.md)

当前 `2.c` 对应证据：

- `func_877`: `sys_4B(0, 0xab9c3043)` 激活基础 shell。
- `func_896`: 连续 `sys_4B(0x2, ...)` 挂接 backpack / funnel components。
- `func_889..895`: 先 `sys_4B(0x3)`，再重建 loadout。
- `func_1037`: `sys_4B(0x3)` 后激活 `0xcb05586`。
- `func_1038`: 回到 `0xab9c3043`。

当前结论：

- `func_887/888` 的核心行为就是 `sys_4B` shell entry 清空和重建。
- `sys_4B(1)` 返回 active shell entry id，后续经常作为 `sys_47` 的对象参数。

### `sys_4F`

Notion 记录：

```text
sys_4F(0, slot, hash) 射击 / 消耗栏位 / 弹药 id
sys_4F(0x7, index, 0x1) 主动扣减子弹
sys_4F(0xa, index) 清空蓄力条
sys_4F(0x11, index, 0) 移除蓄力条
```

仓库文档对应：

- [../exvs-msc-syscall-4f-notes.md](../exvs-msc-syscall-4f-notes.md)
- [../exvs-msc-syscall-4f-native-handler.md](../exvs-msc-syscall-4f-native-handler.md)

当前 `2.c` 对应证据：

- `func_915`: `sys_4F(0, 0, 0xcc9f6df0)`，主射资源触发候选。
- `func_922`: 52 次 `sys_4F`，按时间点触发多个 hash。
- `func_877`: `sys_4F(0xb, 0/1/2, ...)` 初始化基础资源槽。
- `func_1037/1038`: 切 alternate/base shell 时重写 `sys_4F(0xb, ...)`。
- `func_1040`: 每帧写 `sys_4F(0x15/0x16, 0x2, ...)`，像 HUD / ammo visibility/state。

当前结论：

- `sys_4F` 不是单一“射击函数”，而是武装 / ammo / charge / resource presentation 的多 subcmd 控制入口。
- `sys_4F(0, slot, hash)` 是 ACTION 时间线里最像“触发武装资源”的调用。
- `sys_4F(0xb, ...)` 与 shell mode 资源组同步相关。

### `sys_4A`

Notion 记录：

```text
sys_4A(0, aleoId, modelId, boneId?, duration/control, ...)
生成 aleo / effect
args5 改成 0x2 变成持续效果，不会被打断；0xa 是永久持续
sys_4A(0x15, 0, 0x5a) 场景变暗
sys_4A(0x16, 0, 0) 或 sys_4A(0x15, 0, 0) 恢复正常
```

当前 `2.c` 对应证据：

- `func_14`: 强制中断 / 状态重置时连续写 `sys_4A(0xb,...)` 清理表现。
- `func_243`: `sys_4A(0, 0x88b70e6a, global20, 0x2, 0x1, 0x6)`，动作状态中挂接表现效果。
- `func_359..376`: 集中封装多种 `sys_4A` effect / cut-in / 场景效果。
- `ACTION_ABC_FINAL_ATTACK` 相关 callback 中大量出现 `sys_4A`，符合觉醒技表现层特征。

当前结论：

- `sys_4A` 应先命名为 effect / aleo controller，不要简单叫“特效播放”。
- `0xb` 子命令在当前样本常用于清理或切换已有 effect group。
- 场景暗化相关 `0x15/0x16` 需要在觉醒技或 cut-in 函数里继续验证。

### `sys_4E`

Notion 记录：

```text
sys_4E(0x8, 0x1) reset funnel
sys_4E(0x8) 浮游类武器回收指令
```

当前 `2.c` 对应证据：

- `func_14`: 强制中断 / 状态 reset 中调用 `sys_4E(0)`。
- `func_588`: ranged weapon runtime start 阶段在 `global529 == 1` 时调用 `sys_4E(0)`。

当前结论：

- `sys_4E` 在本样本和 funnel / 回收 / 清理 weapon object 有关。
- `func_586/587` 启动射击动作时可能先回收或复位旧 weapon object，避免上一个动作残留。

### `sys_51`

Notion 记录：

```text
sys_51(0x20000, 0, 0x2, assistIndex, type)
召唤援护
```

当前 `2.c` 对应证据：

- 生成 JSON 统计 `sys_51` 静态调用 36 次。
- `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` 和 lock-switch special shot family 是优先检查区域，因为 OverBoost wiki 的デルタプラス特射是ジェスタ呼出。

当前结论：

- `sys_51` 很可能是特射 / assist summon 链的核心 syscall。
- 后续分析特射时，应从 `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL`、`ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH` 反查 `sys_51` 所在 callback，而不是只看 `sys_4F`。

### `sys_53`

Notion 记录：

```text
sys_53(0, strengthA, strengthB, duration, flag) 画面震动
sys_53(0x2, x, y) 缩放镜头
sys_53(0x4, cameraHash, duration) camera preset 候选
```

当前 `2.c` 对应证据：

- `func_14/17/57`: 状态 reset / 强制中断时调用 `sys_53(0x5)`。
- `func_320/321`: 封装 `sys_53(0x4, hash, 0x4650)`。
- `ACTION_CHARGE_SHOT_LOCK_SWITCH`、`ACTION_ABC_FINAL_ATTACK` family 中有 camera zoom / shake 类调用。

当前结论：

- 普通动作不一定碰镜头；重武装、cut-in、觉醒技和强制中断更常碰 `sys_53`。
- `sys_53(0x5)` 在当前样本更像 camera reset / release，需要继续和 native handler 对照。

### `sys_57`

Notion 记录：

```text
sys_57(0, ropeIndex) 召唤牵线
sys_57(1, ropeIndex) 回收
sys_57(3, ropeIndex, attr, ...) 设定属性
```

当前 `2.c` 对应证据：

- 当前静态扫描没有把 `sys_57` 列为热点，说明 Delta Plus `2.c` 不是牵线武装样本。

当前结论：

- `sys_57` 先保留在通用 syscall 术语里。
- 如果后续研究 whip / rope / tether 类机体，优先搜索 `sys_57(` 和 `0x3` 子命令配置段。

### `func_309`

Notion 记录：

```text
func_309 判断动作做到多少帧
新版脚本控制按键对应 func
arg0 == 0 主射
arg0 == 0x3 CSA
arg0 == 0x5 特殊格斗
arg0 == 0x7 后格斗
arg0 == 0x1f 副射
```

当前 `2.c` 对应证据：

- `func_309(arg0,arg1)` 实际实现为 `sys_47(0xf, sys_4B(0x1), arg1)`，也就是对当前 body/motion 时间线检查 `arg1`。
- `func_922` 大量使用 `if (func_309(global20, time)) { sys_4F(0, 0x5, hash); }`，完全符合“到帧触发武装”的模式。
- `func_1036` 中 `if (func_309(global20, func_248() * 0x64)) { func_123(0x3bf); }`，说明它也能用于取消路线开放时机。

当前结论：

- 在当前 `2.c` 中，`func_309` 的强证据是 motion timeline marker。
- Notion 中“arg0 对应按键”的解释可能来自另一版脚本或封装层；在当前样本里 `arg0` 基本被传 `global20`，不能直接套用为按钮编号。

### 输入与 global 经验

Notion 记录：

```text
global172 / global175 可能有 offset 导致不同，最好搜索 & 0x10
global200 == 1 表示按着方向键
global172 & 0x4 前
global172 & 0x8 后
global172 & 0x10 左
global172 & 0x20 右
```

当前 `2.c` 对应证据：

- `func_52` 中有 `global172 = global87 & 0x3c`。
- 多个 ACTION 分支通过 `global170` 与方向 / 派生状态耦合。

当前结论：

- 对方向类 global 不应该直接按数字编号命名，应该以位运算形态和读取来源命名。
- 如果 offset 变化，搜索 `& 0x10`、`& 0x20`、`0x3c` 比搜索固定 global 编号更稳。

## Notion 内容如何进入本目录

当前采用三层引用：

1. Notion 页面保留实验经验和临时观察。
2. 仓库 `docs/exvs-msc-syscall-*.md` 保留 syscall native / VM 级稳定结论。
3. 本目录把这些结论应用到当前 `0xBDBE6FEA/2.c` 样本。

这样做的原因：

- Notion 适合快速记录。
- 仓库文档适合保留可复用事实。
- `docs/msc-research/` 适合围绕一个样本建立持续讨论入口。

## 当前可复用搜索策略

### 找 shell / 换装

优先搜索：

```text
sys_4B(0x3)
sys_4B(0x2,
sys_4B(0,
sys_4B(0x4,
```

再看其所在函数是否：

- 先清空再挂接。
- 修改 `global20`。
- 修改 `global170` / `global143`。
- 同时调用 `sys_47(0x10/0x12)`。

### 找武装资源触发

优先搜索：

```text
sys_4F(0,
func_309(global20,
```

典型模式：

```c
if (func_309(global20, time))
{
    sys_4F(0, slot, hash);
}
```

### 找 stance resource group

优先搜索：

```text
0x3 + global170
sys_1(0x10001, 0x3,
sys_1(0x10001, 0x4,
```

当前核心函数：

- `func_79`: 读取 group `0x3 + global170`。
- `func_1045`: 写入 group `0x3` 和 `0x4`。
