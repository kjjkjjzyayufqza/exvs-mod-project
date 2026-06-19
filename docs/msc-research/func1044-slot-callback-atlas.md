# func_1044 slot callback 全链路逆向

本文分析 `E:\XB\解包\com\file\0xBDBE6FEA\2.c` 中 `func_1044` 注册的
slot callback，重点是 `func_850..876` 在游戏里具体负责什么。

更新时间：2026-06-18。

## 配套文档

- [MSC Research 阅读入口](./README.md)
- [`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)：把本文证据转换成
  TestEditor Auto Rename 的完整期望显示结果。
- [动态命名与 JSON overlay 方案](./dynamic-naming-overlay.md)：说明为什么不能把
  `func_N` 当作跨版本主键。
- [MSC Auto Rename Mapping](./msc-auto-rename-mapping.md)：记录 `ACTION_*` /
  `SLOT_CB_*` 显示规则，以及为什么这类命名不写进 `command_mapping.md`。
- [MSC Auto-Rename 外部文件分析](../agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md)：
  记录现有 rename utility、action hash 来源和外部 mapping 边界。

## 结论摘要

`func_1044` 不是输入表，也不是动作 hash 表。它是动作系统的第二级
表现回调表：

```text
0.c 读取玩家输入和当前状态
  -> 选择 action index
  -> action index 映射到 action hash
  -> 2.c 的 action hash registry 选择 action handler
  -> action handler 控制速度、状态、持续时间和取消
  -> action handler 用 slot id 请求表现 callback
  -> func_1044 将 slot id 映射到 func_850..876
  -> slot callback 选择 motion resource index
  -> resource registry 将 index 映射到 motion hash
  -> engine 播放 motion
```

因此：

- `func_850..876` 大多只负责选择动画、blend 和少量表现状态。
- 真正的移动速度、boost 消耗、方向修正、落地硬直等主要在它们的上级
  action handler 中。
- 不能只看 `func_850` 的函数体猜动作名，必须同时追踪输入 gate、action
  hash、action handler、slot 和 resource。
- 函数编号和文件 offset 会随 MSC 版本变化；action hash、slot、输入条件和
  speed_param field hash 才适合作为 Auto Rename 的动态证据。

本轮 deep research 修正了两项重要误判：

1. `global24 & 0x1000000` 是空中动作状态，不是德尔塔 Plus 的飞机形态。
   德尔塔 Plus 的真实形态变量是 `global143`。
2. `func_866..868` 是全机体通用的防御开始、维持、解除 motion，不是
   德尔塔 Plus 专属攻击。

## 证据等级

本文使用以下置信度：

| 等级 | 含义 |
|---|---|
| 高 | 输入序列、action、handler、slot 和运行逻辑互相闭环，并有跨机体证据。 |
| 中高 | 调用链闭环，游戏语义基本唯一，但个别 native syscall 尚未命名。 |
| 中 | 动作族可确认，细分名称仍可能是相邻阶段。 |
| 低 | 只有注册或 motion 证据，缺少可靠选择路径。 |

## 核心 dispatch 结构

### Action registry

`2.c func_1043` 使用：

```c
func_241(actionHash, actionHandler);
```

例如：

```text
0x6d00aeaa -> func_390   地面待机
0xff098547 -> func_423   step
0x86d45295 -> func_437   BD 开始
0xdabb0543 -> func_427   防御开始
0x9475130e -> func_450   变形进入
```

### Slot callback registry

`2.c func_1044` 使用：

```c
sys_1(0x10001, 0x2, slotId, slotCallback);
```

action handler 中的 `func_69(slotId)` 会读取该表并间接调用 callback。

### Motion resource registry

`2.c func_1045` 将 resource index 映射到 motion hash。slot callback 中：

```c
func_74(resourceIndex, blend);
func_76(resourceIndex, blend, startTime);
```

最终会查 resource registry 并请求 engine 播放 motion。

## 跨机体验证

RX-78-2 的文件：

```text
E:\XB\解包\com\file\0xF22E425D\0.c
E:\XB\解包\com\file\0xF22E425D\2.c
```

其输入层和 action registry 同样包含：

```text
0x6d00aeaa  基础待机
0x86d45295  BD 开始
0x910f3fa7  BD 持续
0xb28c1647  BD 结束
0xdabb0543  防御开始
0x68790b03  防御维持
0xeee34191  防御解除
```

这些 hash 还出现在大量其他机体的 `2.c` 中，并通常绑定同构 handler。
这说明待机、走行、跳跃、step、BD、防御是共通角色控制层，不应根据
德尔塔 Plus 的武装表解释成专属攻击。

RX-78-2 还提供了函数编号漂移的直接样本：

```text
Delta Plus:
  registry func_1044
  slot 0x1  -> func_850
  slot 0x1d -> func_863
  slot 0x2b -> func_866

RX-78-2:
  registry func_1059
  slot 0x1  -> func_859
  slot 0x1d -> func_872
  slot 0x2b -> func_875
```

两者的 action hash、slot id 和 resource index 结构保持一致，但函数编号整体
发生移动，部分 callback 还存在很小的表现差异。这是不能使用
`func_850 = idle` 这类固定 mapping 的直接证据。

RX-78-2 的变形扩展则明确被禁用：

```text
0x9475130e -> 0
0x77b100ff -> 0
0xa02d57dc -> 0

slot 0x23 -> 0
slot 0x24 -> 0
slot 0x25 -> 0
```

也就是说，输入/action 框架预留了共通位置，但不可变形机体不会安装对应
handler 和 slot callback。

部分机体会将通用 handler 替换为自己的变体，或者把某个 hash 绑定为 `0`。
Auto Rename 因此必须允许：

- 同一 action hash 对应不同函数编号。
- 同一 action hash 被机体覆盖。
- handler 被禁用。
- 共通语义不变，但 motion resource hash 因机体而异。

## 关键状态变量

| 当前变量 | 可确认语义 | 证据 |
|---|---|---|
| `0.c global20` / `2.c global24` | 动作状态 bitfield。`0x1000000` 表示空中状态。 | `0.c` 从共享 slot `0x6` 读取；`2.c` 将 `global24` 写回同一 slot。空中 fallback 固定选择 action `0xa`。 |
| `2.c global143` | 德尔塔 Plus 当前是否处于飞机形态。 | 进入/退出变形时被置 `1/0`，与模型及飞行控制一起切换。 |
| `0.c global78` | boost 键二次按下后的 8 帧 BD 输入窗口。 | `func_108` 在 boost 新按下时检查前一次计时，第二次按下置 `global78=8`。 |
| `0.c global76` | 方向重复输入缓存，用于 step。 | `func_55/56` 经 `func_121()` 检查方向二次输入。 |
| `0.c global83 & 0x40000000` | 防御输入事件。 | `func_110` 检测方向键下后快速输入上；`func_67` 消费该位并进入防御 action。 |
| `2.c global37` | 防御状态及其子状态。 | 防御开始置位，防御维持保持，防御解除清零；受击处理也读取该值。 |
| `2.c global238` | 当前 slot motion 已到可结束边界。 | 多数 slot callback 在 motion 完成时置 `1`，上级 handler 随后退出或转阶段。 |
| `2.c global226` | slot callback 的内部阶段计数。 | 首帧为 `0`，播放 motion 后递增；部分 callback 用它实现多阶段。 |
| `2.c global267/global503` | step 的方向象限。 | `func_423` 根据输入角度归一为 `0..3`，用来选择四方向 motion。 |

## 输入层重建

### 地面移动

```text
地面无输入
  -> action 0x2 / 0x6d00aeaa
  -> func_390
  -> slot 0x1
  -> func_850

地面按方向
  -> action 0x3 / 0x9cf36e1b
  -> func_392
  -> slot 0x2
  -> func_851

起步 motion 完成
  -> action 0x4 / 0x868ec571
  -> func_394
  -> slot 0x3
  -> func_852

松开方向
  -> action 0x5 / 0xa8ab2ac9
  -> func_401
  -> slot 0x4
  -> func_853
```

`0.c func_43/44` 明确要求地面且方向 held；`func_45/46` 明确要求没有方向
输入。由此可以排除“攻击前摇”等解释。

### 跳跃、上升、空中调整、下落和着地

```text
地面按 boost
  -> action 0x6 / 0x4de2206b
  -> func_403
  -> slot 0x5
  -> func_854

空中按 boost
  -> action 0x7 / 0x41443ba0
  -> func_406
  -> slot 0x6
  -> func_855

前段完成后进入持续上升
  -> action 0x8 / 0x901c3623
  -> func_408
  -> slot 0x7
  -> func_856

松开 boost 或结束持续上升
  -> action 0x9 / 0x679f48c2
  -> func_410
  -> slot 0x8
  -> func_857

空中默认下落
  -> action 0xa / 0xf5f21169
  -> func_412
  -> slot 0x9
  -> func_858

接触地面
  -> action 0xb / 0x14b0aea3
  -> func_414
  -> slot 0xa
  -> func_859
```

这里最可靠的锚点是：

- `0.c func_15` 在 `global20 & 0x1000000` 时把 action `0xa` 作为空中
  fallback，因此 `func_858` 是下落/空中 neutral motion。
- `func_414` 的恢复时间由当前 boost 剩余量计算；boost 越少，着地恢复越长，
  boost 耗尽时走固定最大恢复值。这就是 EXVS 的 landing recovery。
- `func_408/409` 持续写竖向移动并继承 action `0x6/0x7` 的来源，属于上升段。

### Step

```text
方向键二次输入
  -> 0.c global76
  -> action 0xc / 0xff098547
  -> func_423
  -> ground slots 0xd..0x10
  -> air slots    0x15..0x18
  -> func_861

step 主段结束
  -> action 0xd / 0x506ac760
  -> func_425
  -> ground slots 0x11..0x14
  -> air slots    0x19..0x1c
  -> func_862
```

`global24 & 0x1000000` 在这里选择的是地面/空中 motion 组，不是普通/飞机
形态组。

### Boost Dash

```text
boost 键二次按下
  -> 0.c func_108
  -> global78 = 8
  -> func_63/64
  -> action 0xe / 0x86d45295
  -> func_437
  -> slot 0x1d
  -> func_863

BD 持续
  -> action 0xf / 0x910f3fa7
  -> func_439
  -> slot 0x1e
  -> func_864

BD 收尾
  -> action 0x10 / 0xb28c1647
  -> func_441
  -> slot 0x1f
  -> func_865
```

`func_437` 直接读取以下 speed_param 字段：

```text
0xA49287B9  boost_dash_duration_frame
0x6C640897  fall_speed
0x5481CCF4  boost_dash_distance
0x84043A2D  fall_type
```

输入层和速度字段双重证明该动作族是 BD。

### 防御

EXVS 的防御输入是方向键快速 `下 -> 上`。本地输入层完全复现该序列：

```text
0.c func_110
  下方向新按下 -> 开始短计时
  计时内上方向新按下 -> global83 |= 0x40000000

0.c func_67/68
  消费 0x40000000
  -> action 0x1d / 0xdabb0543
  -> func_427
  -> slot 0x2b
  -> func_866

继续防御
  -> action 0x1e / 0x68790b03
  -> func_430
  -> slot 0x2c
  -> func_867

解除防御
  -> action 0x1f / 0xeee34191
  -> func_433
  -> slot 0x2d
  -> func_868
```

`func_151/153/154` 分别建立、维持、清除 `global37` 防御状态，并同步
`global24` 的 `0x800` 状态位。这一链路是通用 guard 状态机。

### 变形

```text
空中、boost 可用、按住 boost 并触发方向二次输入
  -> action 0x17 / 0x9475130e
  -> func_450
  -> slot 0x23
  -> func_870

飞机形态持续
  -> action 0x18 / 0x77b100ff
  -> func_452
  -> slot 0x24
  -> func_871

变形解除
  -> action 0x19 / 0xa02d57dc
  -> func_464
  -> slot 0x25
  -> func_872
```

这一动作族是德尔塔 Plus 的机体专属扩展。它与共通 step、BD、防御动作族
并列注册，而不是覆盖它们。

## Action hash 总表

| action index | action hash | handler | 游戏语义 | 置信度 |
|---:|---|---|---|---|
| `0x2` | `0x6d00aeaa` | `func_390` | 地面待机/neutral | 高 |
| `0x3` | `0x9cf36e1b` | `func_392` | 地面走行起步 | 高 |
| `0x4` | `0x868ec571` | `func_394` | 地面走行循环和转向 | 高 |
| `0x5` | `0xa8ab2ac9` | `func_401` | 松开方向后的走行停止 | 高 |
| `0x6` | `0x4de2206b` | `func_403` | 地面 boost/起跳前段 | 中高 |
| `0x7` | `0x41443ba0` | `func_406` | 空中 boost/再上升前段 | 中高 |
| `0x8` | `0x901c3623` | `func_408` | boost 上升持续段 | 中高 |
| `0x9` | `0x679f48c2` | `func_410` | 松开 boost 后的空中调整 | 中 |
| `0xa` | `0xf5f21169` | `func_412` | 空中 neutral/下落 | 高 |
| `0xb` | `0x14b0aea3` | `func_414` | 着地恢复/landing recovery | 高 |
| `0xc` | `0xff098547` | `func_423` | 地面或空中 step 主段 | 高 |
| `0xd` | `0x506ac760` | `func_425` | step 收尾/恢复段 | 高 |
| `0xe` | `0x86d45295` | `func_437` | BD 开始 | 高 |
| `0xf` | `0x910f3fa7` | `func_439` | BD 持续 | 高 |
| `0x10` | `0xb28c1647` | `func_441` | BD 收尾 | 高 |
| `0x17` | `0x9475130e` | `func_450` | 变形进入 | 高 |
| `0x18` | `0x77b100ff` | `func_452` | 变形飞行持续 | 高 |
| `0x19` | `0xa02d57dc` | `func_464` | 变形解除 | 高 |
| `0x1d` | `0xdabb0543` | `func_427` | 防御开始 | 高 |
| `0x1e` | `0x68790b03` | `func_430` | 防御维持 | 高 |
| `0x1f` | `0xeee34191` | `func_433` | 防御解除 | 高 |
| `0x24` | `0xf32aa1ba` | `func_480` | result pose A | 高 |
| `0x25` | `0x900ab393` | `func_482` | result pose B | 高 |
| `0x28` | `0x27786a84` | `func_486` | result pose C/特殊结果动作 | 中高 |

## func_850..876 逐项分析

### `func_850`: 地面待机 motion

注册：

```text
slot 0x1 -> func_850
```

行为：

```c
func_74(0, 0xa);
```

它只在首帧播放 resource index `0`。上级 `func_390` 清除移动量和多数临时
动作状态，然后进入该 slot；输入层的地面 fallback 也固定回到该 action。

建议名：

```text
SLOT_GROUND_IDLE_MOTION
```

置信度：高。

### `func_851`: 地面走行起步 motion

注册：

```text
slot 0x2 -> func_851
```

它按当前相对方向选择三种 motion：

```text
global266 < 0x1b58 -> index 0x2
global265 < 0      -> index 0x4
else               -> index 0x3
```

这对应前向/侧向/后向起步中的三类表现。上级 `func_392` 同时负责朝向旋转和
起步速度，motion 完成后进入走行循环。

建议名：

```text
SLOT_GROUND_WALK_START_DIRECTIONAL
```

置信度：高。

### `func_852`: 地面走行循环和转向 blend

注册：

```text
slot 0x3 -> func_852
```

每帧调用 `func_396(...)`，根据相对移动方向在 resource index `5/6/7`
之间动态切换。它不是一次性 motion，而是走行中的方向 blend controller。

建议名：

```text
SLOT_GROUND_WALK_LOOP_DIRECTIONAL
```

置信度：高。

### `func_853`: 走行停止

注册：

```text
slot 0x4 -> func_853
```

首帧播放 index `8`，motion 完成后置 `global238=1`。输入 gate
`0.c func_45/46` 只在没有方向输入时选择它。

建议名：

```text
SLOT_GROUND_WALK_STOP
```

置信度：高。

### `func_854`: 地面 boost/起跳前段

注册：

```text
slot 0x5 -> func_854
```

行为：

```text
设置表现 channel
播放 index 0xe，blend 2
motion 完成后通知上级
```

上级 action `0x6` 只从地面 boost 输入进入；完成后会转 action `0x8`
的持续上升段。

建议名：

```text
SLOT_GROUND_BOOST_JUMP_START
```

置信度：中高。可以确认是地面按 boost 的前段，但“膝部起跳”或“喷口点火”
之类更细的动画名仍需实际预览 motion。

### `func_855`: 空中 boost/再上升前段

注册：

```text
slot 0x6 -> func_855
```

与 `func_854` 使用同一个 motion hash，但 blend 参数不同：

```text
index 0xf，blend 6
```

上级 action `0x7` 只在空中 boost 路径进入，随后同样汇入 action `0x8`。

建议名：

```text
SLOT_AIR_BOOST_RISE_START
```

置信度：中高。

### `func_856`: boost 上升持续 motion

注册：

```text
slot 0x7 -> func_856
```

`global516` 记录它来自地面 boost 还是空中 boost，分别选择 index
`0x10/0x11`。两个 index 在当前机体映射到同一 motion hash，但保留两个
resource slot 说明其他机体可以提供不同表现。

上级 `func_408/409` 持续写竖向移动速度和空中方向修正。

建议名：

```text
SLOT_BOOST_ASCENT_LOOP
```

置信度：中高。

### `func_857`: 松开 boost 后的空中调整

注册：

```text
slot 0x8 -> func_857
```

首帧播放 index `0x12`。上级 `func_410/411` 根据方向输入维护少量水平
空中移动，并在没有方向时逐步衰减。该 action 通常出现在持续上升结束或
松开 boost 后、进入稳定下落前。

建议名：

```text
SLOT_AIR_BOOST_RELEASE_TRANSITION
```

置信度：中。它可能在游戏资源命名中叫 air brake、float 或 jump end，
但可以排除地面移动和攻击。

### `func_858`: 空中 neutral/下落 motion

注册：

```text
slot 0x9 -> func_858
```

播放 index `0x13`。如果从特定空中阶段进入则 blend 为 `0`，否则 blend
为 `0x1e`。它没有自行结束，而是由空中状态持续驱动。

输入层在空中无其他动作可选时固定 fallback 到其上级 action `0xa`。

建议名：

```text
SLOT_AIR_FALL_LOOP
```

置信度：高。

### `func_859`: 着地恢复 motion

注册：

```text
slot 0xa -> func_859
```

首帧播放 index `0x14`，完成后通知上级。上级 `func_414`：

- 清空移动。
- 进入 landing 状态。
- 根据 boost 剩余量计算恢复时间。
- boost 耗尽时使用最大恢复时间。
- 恢复结束后重新开放普通 action。

建议名：

```text
SLOT_LANDING_RECOVERY
```

置信度：高。

### `func_860`: 未确认的基础恢复备用 motion

注册：

```text
slot 0xb -> func_860
```

播放 index `0x15` 并在结束后置 `global238=1`。当前德尔塔 Plus `2.c`
未找到可靠的直接 `func_69(0xb)` 选择点。

建议名：

```text
SLOT_BASIC_RECOVERY_VARIANT_UNUSED
```

置信度：低。自动命名时应保留 `UNCONFIRMED`，不能直接叫 landing B。

### `func_861`: 地面/空中四方向 step 主段

注册：

```text
ground slots 0xd..0x10
air slots    0x15..0x18
```

选择：

```text
ground -> index 0x16 + direction
air    -> index 0x1e + direction
```

`direction` 为 `0..3`。同一个 callback 被多个 slot 复用，因为上级已经把
方向编码进 slot 和 `global267`。

建议名：

```text
SLOT_STEP_START_DIRECTIONAL
```

置信度：高。

### `func_862`: 地面/空中四方向 step 收尾

注册：

```text
ground slots 0x11..0x14
air slots    0x19..0x1c
```

选择：

```text
ground -> index 0x1a + direction
air    -> index 0x22 + direction
```

上级 `func_425/426` 维护短恢复时间，motion 完成后退出 step 状态。

建议名：

```text
SLOT_STEP_RECOVERY_DIRECTIONAL
```

置信度：高。

### `func_863`: BD 开始 motion

注册：

```text
slot 0x1d -> func_863
```

按相对方向选择：

```text
正面/低夹角 -> index 0x26
一侧        -> index 0x28
另一侧      -> index 0x27
```

在时间点 `0x3e8` 后通知上级进入下一阶段。其上级 action 由 boost 二次按下
触发，并读取 boost dash 的持续时间、速度和距离参数。

建议名：

```text
SLOT_BOOST_DASH_START_DIRECTIONAL
```

置信度：高。

### `func_864`: BD 持续 motion

注册：

```text
slot 0x1e -> func_864
```

它从 index `0x26` 的指定时间开始播放，起步段结束后切到 index `0x29`。
每帧还会根据动作状态切换表现 channel，因此它是 BD hold/loop，而不是新的
输入动作。

建议名：

```text
SLOT_BOOST_DASH_LOOP
```

置信度：高。

### `func_865`: BD 收尾 motion

注册：

```text
slot 0x1f -> func_865
```

播放 index `0x2c`，结束后通知上级。上级 action `0x10` 是 BD 释放或速度
衰减后的收尾阶段。

建议名：

```text
SLOT_BOOST_DASH_END
```

置信度：高。

### `func_866`: 防御开始 motion

注册：

```text
slot 0x28
slot 0x2b
```

选择：

```text
ground -> index 0x46
air    -> index 0x49
```

通常 `func_427` 选择 slot `0x2b`。slot `0x28` 是相同表现 callback 的备用
入口，说明不同 guard 进入路径可复用同一套 motion。

建议名：

```text
SLOT_GUARD_START_GROUND_OR_AIR
```

置信度：高。

### `func_867`: 防御维持 motion

注册：

```text
slot 0x29
slot 0x2c
```

选择：

```text
ground -> index 0x47
air    -> index 0x4a
```

motion 到边界后会重播同一 index，符合 guard hold loop。上级 `func_430/431`
持续保持防御状态，并设有最长维持时间。

建议名：

```text
SLOT_GUARD_HOLD_GROUND_OR_AIR
```

置信度：高。

### `func_868`: 防御解除 motion

注册：

```text
slot 0x2a
slot 0x2d
```

选择：

```text
ground -> index 0x48
air    -> index 0x4b
```

到时间点 `0x5dc` 后切回基础 index `1`，然后等待结束。上级 `func_433`
在进入时清除 guard 状态。

建议名：

```text
SLOT_GUARD_RELEASE_GROUND_OR_AIR
```

置信度：高。

### `func_869`: 防御命中反冲/特殊 interaction reaction

注册：

```text
slot 0x2e -> func_869
```

播放 index `0x4c`。它不在普通玩家 action hash registry 中直接选择，而是：

```text
interaction type 0x258
  -> func_635
  -> global328 = 0x1b
  -> damage/interaction dispatcher
  -> func_781/782
  -> slot 0x2e
  -> func_869
```

`func_782` 会读取攻击方向和击退量，保持或检查 guard 子状态，并施加反向
移动。结合它紧邻 guard action、读取 `global37`、以及 `func_427` 对
`global328==0x1b` 的特殊衔接，可以判断这是 guard hit recoil 或非常接近的
防御 interaction reaction。

建议名：

```text
SLOT_GUARD_HIT_RECOIL
```

置信度：中高。`0x258` 的 engine 枚举原名尚未恢复，所以 overlay 中应保留
evidence，而不是把该英文名当成已恢复的原始符号。

### `func_870`: 变形进入表现

注册：

```text
slot 0x23 -> func_870
```

首帧：

- 切换到飞机形态装配状态。
- 设置飞行姿态 channel。
- 播放 index `0x37`。
- 初始化飞机表现资源和特效。
- 每帧维持姿态及方向补正。

建议名：

```text
SLOT_TRANSFORM_ENTRY
```

置信度：高。

### `func_871`: 变形飞行循环

注册：

```text
slot 0x24 -> func_871
```

播放并循环 index `0x38`，不设置普通的 motion 完成退出标志。上级
`func_452` 负责飞行速度、方向、俯仰、boost 消耗和变形维持条件。

建议名：

```text
SLOT_TRANSFORM_FLIGHT_LOOP
```

置信度：高。

### `func_872`: 变形解除表现

注册：

```text
slot 0x25 -> func_872
```

流程：

```text
播放 index 0x3b
  -> 在固定时间点切换表现资源
  -> 关闭变形阶段的临时状态
  -> motion 结束
  -> 恢复普通形态装配
  -> 转入空中下落 motion
```

建议名：

```text
SLOT_TRANSFORM_RELEASE
```

置信度：高。

### `func_873`: result pose A，普通配置

条件注册到 slot `0x34`。它：

- 恢复普通装配。
- 播放 index `0x4e`。
- 启动专用镜头。
- 在多个时间点触发同一表现资源。
- 在后段触发音效。

建议名：

```text
SLOT_RESULT_POSE_A_NORMAL
```

置信度：高。

### `func_874`: result pose A，条件配置

当 `func_186()==1` 时替代 `func_873` 注册到 slot `0x34`。它播放同一
resource index `0x4e`，但切换另一套装配、镜头、特效和音效。

建议名：

```text
SLOT_RESULT_POSE_A_VARIANT
```

置信度：高。

### `func_875`: result pose B

注册：

```text
slot 0x35 -> func_875
```

它重建部分组件，设置三组表现参数，播放 index `0x4f` 并启动专用镜头。

建议名：

```text
SLOT_RESULT_POSE_B
```

置信度：高。

### `func_876`: result pose C/简单结果 motion

注册：

```text
slot 0x36 -> func_876
```

只播放 index `0x50`，生命周期由上级 `func_486/487` 控制。上级在特定结果
状态下还会复用 BD motion 片段，因此它不是普通战斗动作。

建议名：

```text
SLOT_RESULT_POSE_C
```

置信度：中高。它很可能对应败北或特殊结果姿势，但仅靠脚本不能把具体
result label 完全锁死。

## Auto Rename 设计

不要增加 `--exvsMapping` 之类依赖固定版本的外部开关。应在 TestEditor
现有 Auto Rename 流程中增加动态 semantic overlay。

### 识别顺序

1. 识别 `action index -> action hash` registry。
2. 识别输入 candidate/gate callback。
3. 识别 `action hash -> action handler` registry。
4. 从 action handler 抽取 slot、speed_param field hash、状态位和阶段跳转。
5. 识别 `slot -> slot callback` registry。
6. 从 slot callback 抽取 resource index、方向分支、地面/空中分支。
7. 识别 `resource index -> motion hash` registry。
8. 合并跨文件证据并按置信度显示名称。

### 建议 overlay 结构

```json
{
  "semanticId": "common.boost_dash.start",
  "displayName": "ACTION_BOOST_DASH_START",
  "confidence": "high",
  "match": {
    "actionHash": "0x86d45295",
    "inputEvidence": {
      "doubleTapState": "boost",
      "windowFrames": 8
    },
    "requiredSpeedParamFields": [
      "0xA49287B9",
      "0x5481CCF4"
    ],
    "slotIds": ["0x1d"]
  },
  "slotCallback": {
    "displayName": "SLOT_BOOST_DASH_START_DIRECTIONAL",
    "resourceIndices": ["0x26", "0x27", "0x28"]
  }
}
```

防御的规则可写成：

```json
{
  "semanticId": "common.guard.start",
  "displayName": "ACTION_GUARD_START",
  "confidence": "high",
  "match": {
    "actionHash": "0xdabb0543",
    "inputSequence": ["direction_down", "direction_up"],
    "inputEventMask": "0x40000000",
    "slotIds": ["0x2b"]
  },
  "slotCallback": {
    "displayName": "SLOT_GUARD_START_GROUND_OR_AIR",
    "resourceIndices": ["0x46", "0x49"]
  }
}
```

### 命名策略

- 高置信度：直接显示语义名。
- 中高置信度：显示语义名，并在详情中保留 evidence。
- 中置信度：名称加 `LIKELY_` 或在 UI 显示置信度。
- 低置信度：不覆盖函数名，只显示 suggestion。
- 函数编号只能作为当前文件内引用，不能写入持久 mapping 的主键。
- motion hash 只能证明资源身份，不能单独证明玩家操作。

## 尚未完全恢复的部分

1. `func_860` 的 slot `0xb` 在当前机体中的真实选择路径。
2. interaction type `0x258` 的 engine 原始枚举名。
3. `func_857` 在原始资源命名中是 jump end、air brake 还是 float。
4. result pose C 对应的精确比赛结果标签。
5. `func_351` 各 channel 数值的 engine 原始枚举名。

这些未知项不影响当前共通动作状态机、BD、防御和变形链的结论，但 Auto
Rename 应保留置信度，避免把推测伪装成原始符号。

## 来源

### 本地源码

- `E:\XB\解包\com\file\0xBDBE6FEA\0.c`
- `E:\XB\解包\com\file\0xBDBE6FEA\2.c`
- `E:\XB\解包\com\file\0xF22E425D\0.c`
- `E:\XB\解包\com\file\0xF22E425D\2.c`
- `docs/command_mapping.md`
- `docs/msc-research/movement-bd-modding-workbook.md`
- `docs/msc-research/movement-boost-sys46-func11-map.md`
- `docs/msc-research/0c-to-2c-input-action-boundary.md`

### 外部操作资料

- [EXVS2OB wiki 初心者指南](https://w.atwiki.jp/exvs2ob/pages/559.html)
- [EXVS2OB wiki Delta Plus](https://w.atwiki.jp/exvs2ob/pages/416.html)
- [MBON Movement Guide](https://sites.google.com/view/mbon-guide/movement)
- [Mobile Suit Gundam EXVS Full Boost Guide](https://grantpatterson.com/portfolio/mobile-suit-gundam-exvs-full-boost-guide-part-one/)

外部资料仅用于校准 step、BD、防御和变形的玩家操作术语。具体 hash、函数、
slot 和状态机结论均以本地反编译证据为准。
