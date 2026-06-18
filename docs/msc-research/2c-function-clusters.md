# `2.c` 函数群与区段索引

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

本页解决一个实际问题：整份 `2.c` 有 29,664 行、1,047 个函数，如果只盯着 `func_887/888`，很容易把底层 loadout 分支误当成系统入口。

这里按当前反编译函数编号和 syscall 热区建立第一版地图。函数编号不作为跨版本稳定主键；它只是当前样本里的导航坐标。跨版本命名应参考 [动态命名与 JSON Overlay 方案](./dynamic-naming-overlay.md)。

## 扫描口径

当前扫描识别：

- 函数定义：1,047 个。
- `void` 函数：921 个。
- `int` 函数：126 个。
- `ACTION_*` 命名函数：21 个。
- 当前文件行数：29,664。

统计项含义：

- `sys0/sys1`: registry 与状态读写核心。
- `sys4B`: shell entry / component attach-clear。
- `sys47`: object query / TRS / shell-object control。
- `sys4F`: weapon resource / ammo / HUD / charge-like control。
- `func308`: motion / animation resource playback helper。
- `func309`: motion timeline check helper。

## 区段总览

| 区段 | 函数数 | 行数 | 行号范围 | 主要热点 | 当前理解 |
|---|---:|---:|---|---|---|
| `main` | 1 | 10 | 779-788 | `sys_2`, `callFunc3` | entry callback 注册与主循环入口 |
| `func_1..99` | 99 | 2,904 | 789-3692 | `sys0=128`, `sys1=124`, `sys47=32`, `sys4F=23` | 初始化、主 action loop、action hash 推进、基础 helper |
| `func_100..199` | 100 | 1,595 | 3693-5287 | `sys1=61`, `sys47=21` | 通用战斗状态、hit/cancel/flag 类 helper |
| `func_200..299` | 100 | 1,947 | 5288-7234 | `sys0=71`, `sys1=26` | action binding、motion helper、`func_241` action hash binder |
| `func_300..399` | 100 | 1,510 | 7235-8744 | `sys47=15` | motion state 和大型 reset 初始化，含 `func_386` |
| `func_400..499` | 100 | 4,402 | 8745-13146 | `sys0=265`, `sys4B=37`, `sys47=40` | 方向/阶段/对象状态分支，大量 action 子系统 |
| `func_500..599` | 100 | 3,159 | 13147-16305 | `sys0=68`, `sys4B=12`, `sys47=12` | 武装状态 helper、阈值触发、表现同步 |
| `func_600..699` | 100 | 3,665 | 16306-19970 | `sys0=112`, `sys4B=27`, `sys47=31` | timing、route、动作阶段 helper |
| `func_700..799` | 100 | 3,228 | 19971-23198 | `sys0=197`, `sys4B=63`, `sys47=89` | 大型状态机与 shell/object 查询密集区 |
| `func_800..849` | 50 | 1,674 | 23199-24872 | `sys0=251`, `sys1=184` | resource table 读取/写入，含 `func_835/836` |
| `func_850..899` | 50 | 816 | 24873-25688 | `sys4B=54`, `sys47=25` | slot callbacks、shell loadout 起点、`func_877/887/888/896..899` |
| `func_900..999` | 84 | 2,264 | 25689-28204 | `sys4B=41`, `sys47=31`, `sys4F=65` | ACTION 实现区 A，主射/副射/特格/近战早段 |
| `func_1000..1046` | 42 | 1,382 | 28205-29664 | `sys1=173`, `sys4F=29` | ACTION 实现区 B、alternate shell、注册表尾部 |
| `ACTION_*` | 21 | 330 | 25765-29207 | 主要是函数指针设置 | action setup wrapper，真正行为在后续 `func_9xx/10xx` |

## 最该先看的区段

### 1. 启动和 action 分发：`func_1..99`

核心函数：

| 函数 | 行号 | 当前角色 |
|---|---:|---|
| `main` | 779 | 入口，注册 `func_3/26/27` 并进入 `func_1/func_4` |
| `func_1` | 789 | 初始化全局状态、基础 action handler、进入 `func_877` |
| `func_3` | 859 | 每帧 callback runner，调用 `global1/global2` |
| `func_4` | 873 | 主 action update loop |
| `func_5` | 1004 | 大量 `sys_0(0x10000, ...)`，action/input 状态读取区 |
| `func_51` | 2724 | `pendingActionHash -> activeActionHash` 推进 |
| `func_52` | 2765 | 通过 `sys_0(0x10002/0x10003)` 找 action callback 并 `sys_2` 调度 |
| `func_79` | 3402 | 用 `0x3 + global170` 选择 motion/resource hash 后调用 `func_308` |

这一段的价值：

- 能解释 action hash 怎么进入 `ACTION_*`。
- 能解释为什么 `global170` 影响动作资源，而不只是外观。
- 能把后面的注册表和 ACTION wrapper 接起来。

### 2. Action binding 与 motion helper：`func_200..299`

核心函数：

| 函数 | 行号 | 当前角色 |
|---|---:|---|
| `func_241` | 6225 | `sys_1(0x10002, 0x2, hash, callback)` action hash binder |
| `func_242` | 6243 | action hash callback query |
| `func_296/297` | 7158 / 7182 | 常见 action setup helper，多个 ACTION 区函数会调用 |

这一段的价值：

- `func_241` 是理解 `func_1043` 的钥匙。
- Notion 页提到“在 MSC 文件里面找 function / 找按键 func”，实际稳定入口就是这类注册表，而不是肉眼搜函数名。

### 3. State-heavy 区：`func_300..399`

核心函数：

| 函数 | 行号 | 当前角色 |
|---|---:|---|
| `func_386` | 7969 | 506 行长函数，大型状态初始化 / reset 候选 |
| `func_395` | 8658 | `sys_47/sys_4B` 热点，读取 active shell 状态 |
| `func_400` | 8745 | 方向 / 阶段状态机，被 `func_396..399` 包装 |

`func_400` 的关键证据：

```c
var9 = var10 = sys_47(0, sys_4B(0x1)) / 0x64;
...
if (func_309(global20, arg3 * 0x64) || sys_47(0x7, sys_4B(0x1)))
{
    func_75(arg5);
}
```

当前解释：

- `sys_4B(1)` 返回 active shell entry id。
- `sys_47(0/7/8, activeShell)` 是动作状态量 / 阈值 / 条件查询组合。
- 这里不是换装本体，但它解释 shell object 状态如何驱动动作阶段。

### 4. Branch/action subsystem 区：`func_400..799`

这 400 个函数是最容易迷路的区域，因为它们不是一张简单表，而是大量动作状态机和 helper。

优先级建议：

| 优先级 | 函数 / 区间 | 理由 |
|---|---|---|
| 高 | `func_400` | `sys_4B/sys_47` 组合最集中，解释动作阶段切换 |
| 高 | `func_493` | `sys_4B=6`, `sys_47=6`，像 shell/object 控制 helper |
| 中 | `func_574` | 多个 `sys_47(0, sys_4B(1)) >= threshold`，像阶段阈值事件 |
| 中 | `func_657` | `func_309` 与 `sys_4A/sys_47` 混合，像动作时间线 helper |
| 中 | `func_701/707/755/778/779` | `sys_4B/sys_47` 热点，建议按调用方反查 |

这一段当前不要急着逐个命名。更好的做法是从 ACTION 函数反向追调用方，确定它们服务哪个 action family。

### 5. Resource table 区：`func_800..849`

核心函数：

| 函数 | 行号 | 当前角色 |
|---|---:|---|
| `func_825` | 23878 | 大量读 `sys_0(0x10001, 0x7, slot)`，按状态选择资源集合 |
| `func_826` | 24041 | 类似 `func_825` 的较小资源选择器 |
| `func_835` | 24226 | 172 条 `sys_1(0x10001, 0x7, slot, hash)` |
| `func_836` | 24402 | 7 条 group `0x9` 映射 |

当前解释：

- group `0x7` 是大型资源 hash 表。
- `func_825/826` 是读表并把多组资源 hash 写入 `global752..global759` 一类变量。
- Notion 页里“找各种按键 func / 胜利 pose 的 func / sys_1(0x10001, 0x2, 0x34, ...)”对应的是注册表思路；这里的 group `0x7` 是另一类 resource table。

### 6. Slot callback + shell loadout 起点：`func_850..899`

核心函数：

| 函数 | 行号 | 当前角色 |
|---|---:|---|
| `func_850..876` | 24873-25307 | slot callback 区，来自 `func_1044` group `0x2` |
| `func_877` | 25407 | base depiction shell initializer |
| `func_878` | 25431 | 每帧转发到 `func_1040` |
| `func_879` | 25436 | 每帧转发到 `func_1039` |
| `func_884/885` | 25477 / 25506 | 回基础状态、重建 loadout |
| `func_887` | 25522 | 默认 loadout selector |
| `func_888` | 25534 | loadout dispatcher |
| `func_889..899` | 25574-25688 | shell component bundle |

这一段是当前“换装系统”的直接所在区，但它前面依赖 `func_877`，后面被 ACTION 区反复调用。

### 7. ACTION region A：`func_900..999`

这一段包含主射、蓄力射击、副射、特格、特射、觉醒技、近战早段等 action 实现。

重要现象：

- `ACTION_*` 命名函数自身几乎不直接调用 syscall。
- 它们主要设置 runtime callback，例如 `global677 = func_914`、`global680 = func_915`。
- 真正调用 `sys_4B/sys_47/sys_4F/func_308/func_309` 的是后续 `func_914`、`func_918`、`func_921`、`func_922` 等。

例子：

| Wrapper | 后续函数 | 当前解释 |
|---|---|---|
| `ACTION_A_SHOT` | `func_914`, `func_915` | 主射启动与 fire/resource trigger |
| `ACTION_A_SHOT_STATE_0` | `func_918` | 主射状态 0，包含 shell 临时挂接 / 清理 |
| `ACTION_CHARGE_SHOT_LOCK_SWITCH` | `func_921`, `func_922`, `func_923` | 蓄力射击换锁分支，`func_922` 是 `sys_4F` 热点 |
| `ACTION_AB_SUB` | 后续 `func_926...` | 副射 family |
| `ACTION_BC_SPECIAL_MELEE` | 后续 `func_940...` | 特格 family |

`func_922` 是最强热点：

- 位置：`2.c:25983-26227`
- `sys_4F`: 52 次。
- `func_309`: 54 次。

当前解释：

```text
动作时间线检查 func_309(global20, time)
  -> 到指定时间点触发 sys_4F(0, slot, hash)
  -> 同时可能用 sys_47(0x10/0x12, ...) 做模型 TRS 控制
```

这与 Notion 页里 `sys_4F(0, slot, ammo/resource hash)` 的经验直接对应。

### 8. ACTION region B + 注册表尾部：`func_1000..1046`

核心函数：

| 函数 | 行号 | 当前角色 |
|---|---:|---|
| `func_1020` | 28739 | `sys_4F=7`, `func_308=3`，特射换锁附近的重型 action function |
| `func_1030` | 29117 | `func_308=2`, `func_309=6`, 近战换锁附近 |
| `func_1037` | 29304 | enter alternate shell mode |
| `func_1038` | 29324 | return base shell mode |
| `func_1039` | 29346 | 检查 `0x6baa794a` 是否存在，控制 `func_184` |
| `func_1040` | 29366 | 每帧 `sys_4F(0x15/0x16, ...)` 维护 |
| `func_1042` | 29405 | registration coordinator |
| `func_1043` | 29413 | action hash registry |
| `func_1044` | 29472 | slot callback registry |
| `func_1045` | 29530 | group `0x3/0x4` stance resource registry |
| `func_1046` | 29646 | group `0xb` extra resource registry |

这一区的关键是：末尾注册表反过来定义了前面很多 ACTION 和 slot callback 的入口。

## 长函数优先级

长函数不是一定重要，但在反编译 MSC 中通常代表大型状态机、注册表或复杂 action timeline。

| 函数 | 行号 | 长度 | 当前优先级 | 理由 |
|---|---:|---:|---|---|
| `func_386` | 7969 | 506 | 中 | 大型 reset / state init，先看调用点 |
| `func_56` | 2885 | 289 | 高 | `sys_4F=11`，早期 action core helper |
| `func_630` | 17203 | 262 | 中 | `sys0=51`，状态读取密集 |
| `func_38` | 2071 | 253 | 中 | `sys1=8`，早期状态设置 |
| `func_922` | 25983 | 245 | 高 | `sys_4F=52`，典型时间线触发函数 |
| `func_1020` | 28739 | 215 | 高 | 后段 ACTION 重型函数 |
| `func_5` | 1004 | 210 | 高 | action/input 状态读取 |
| `func_239` | 6002 | 209 | 中 | `sys_4B/sys_47` 混合，需追调用方 |
| `func_835` | 24226 | 176 | 高 | group `0x7` resource table |
| `func_825` | 23878 | 163 | 高 | group `0x7` resource selector |

## 研究路线建议

### 第一轮：主链

先看：

```text
main
  -> func_1
  -> func_877
  -> func_1042
  -> func_1043 / func_1044 / func_1045 / func_1046
```

目标：

- 确认启动顺序。
- 确认 action hash 注册表。
- 确认 slot callback 和 stance resource table。

### 第二轮：action 分发

再看：

```text
func_5 / func_51 / func_52
  -> func_241 / func_242
  -> ACTION_*
```

目标：

- 把 `pendingActionHash`、`activeActionHash`、`previousActionHash` 这类 role 稳定下来。
- 不直接猜按钮，而是通过 hash table 和 wrapper 函数确认 action family。

### 第三轮：shell/loadout

再看：

```text
func_877
  -> func_887 / func_888
  -> func_889..899
  -> func_1037 / func_1038
```

目标：

- 把 `global170`、`global143`、`global20` 的角色固化。
- 把 `sys_4B(2/3/4)` 组件挂接和清理路径梳理清楚。

### 第四轮：ACTION 时间线

按 `func_1043` 的 action hash 表逐个进入：

```text
ACTION_A_SHOT
ACTION_CHARGE_SHOT_LOCK_SWITCH
ACTION_AB_SUB
ACTION_BC_SPECIAL_MELEE
ACTION_B_MELEE
...
```

每个 action family 记录：

- wrapper 设置了哪些 callback。
- 哪个 callback 调 `func_308` 播 motion。
- 哪个 callback 用 `func_309` 检查时间点。
- 哪个 callback 调 `sys_4F(0, slot, hash)` 触发资源。
- 哪个 callback 改 `global170` 或调 `func_887/888`。

### 第五轮：资源表和动态命名

最后把：

```text
func_835 / func_825 / func_826
func_1044 / func_1045 / func_1046
```

整理成 JSON overlay 的输入。

目标：

- 不再靠 `func_N` 硬记。
- 对每个 function role 给出可重复匹配证据。

## 当前结论

1. `2.c` 不是一团平铺函数，而是明显有“启动区 -> action core -> helper/state machine -> resource table -> slot callback -> ACTION implementation -> registry tail”的结构。
2. `func_887/888` 处在 `func_850..899` 的 shell loadout 起点区，不能单独看。
3. `func_1043..1046` 是理解整份 `2.c` 的索引表；它们比任意单个 ACTION 更适合作为研究入口。
4. Notion 页的 `sys_4B/sys_47/sys_4F` 经验在当前样本中都有直接落点，其中 `func_896/901/922/1037/1038/1040` 是最好的验证点。

