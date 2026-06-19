# Delta Plus 主射调用链与 RX-78-2 风格自动回弹方案

样本：

```text
Delta Plus:
E:\XB\解包\com\file\0xBDBE6FEA\0.c
E:\XB\解包\com\file\0xBDBE6FEA\2.c

RX-78-2:
E:\XB\解包\com\file\0xF22E425D\0.c
E:\XB\解包\com\file\0xF22E425D\2.c
```

本页只分析主射。目标是回答：

```text
Delta Plus 主射为什么可以快速 2 连射？
为什么打空后会进换弹动作？
如果要做成 RX-78-2 那样只能单发、结束后不做换弹动作而自动恢复弹药，应该改哪几层？
```

## 0. 一句话结论

Delta Plus 主射分成三层：

```text
0.c 输入/action selector
  A 键 + slot0 有弹 -> 0xf48d2d49
  A 键 + slot0 空弹 -> 0x7158fa47

2.c 主射 action
  0xf48d2d49 -> ACTION_A_SHOT
  ACTION_A_SHOT -> func_914 起手 / 连射窗口
                -> func_915 发射 sys_4F(0,0,0xcc9f6df0)

2.c reload action
  0x7158fa47 -> ACTION_A_SHOT_STATE_0
  ACTION_A_SHOT_STATE_0 -> reload motion / magazine shell / sys_4F(0x5,0,0)
```

所以 RX-78-2 风格改法不是改 common `0.c`。`0.c` 只当证据；实际 patch 面优先放在 Delta 自己的 `2.c`：

1. 关掉 Delta 主射动作里的再投递同一 action，也就是去掉 `func_914 -> func_81(0xf48d2d49, ...)` 这条 2 连射入口。
2. 保留 `0.c` 空弹派发 `0x7158fa47`；在 `2.c` 把 `ACTION_A_SHOT_STATE_0` 改成无换弹动画 / 短 no-op。
3. 真正“自动回弹”仍看 slot 0 的 weapon/ammo resource reload 语义；保留 Delta 的 projectile hash `0xcc9f6df0`，否则会变成换弹体而不是改弹药系统。

## 1. Wiki / 游戏语义

外部玩法语义只当作行为锚点，不直接当脚本命名来源。

| 机体 | Wiki 记录 | 对脚本分析的约束 |
|---|---|---|
| Delta Plus | OverBoost wiki `メイン射撃`：弹数 4，`2連射可能。手動リロード式。` | 应该能在脚本里找到 4 发资源槽、2 连射上限、空弹 reload action |
| Delta Plus | wiki 说明普通时最多 2 连射，打空时按主射会进入装填动作 | 2 连射和 reload action 应该是两个不同机制 |
| RX-78-2 / ガンダム | OverBoost wiki `メイン射撃`：弹数 8，`常時/3秒` | RX 主射不应该有 Delta 那种空弹手动 reload action |
| 系统页 | `常時リロード` 是发射后自动开始回弹；`手動リロード` 是 ammo 为 0 后再输入同一 command 才装满 | Delta 的空弹 branch 应在 input/action selector；RX 的恢复应主要在资源层 |

来源：

- Delta Plus wiki: https://w.atwiki.jp/exvs2ob/pages/416.html
- ガンダム wiki: https://w.atwiki.jp/exvs2ob/pages/78.html
- OverBoost 系统页 reload 说明: https://w.atwiki.jp/exvs2ob/pages/593.html

## 2. Delta Plus 完整调用链

### 2.1 输入层：A 键先变成 action hash

`0.c func_143` 是当前样本最直接的主射 action selector。

关键代码：

```text
0xBDBE6FEA/0.c:3471-3479
else if (global48 & 0x1)
{
    if (sys_0(0x90000, 0) == 0)
    {
        func_95(0x7158fa47, 0, 0x401, 0);
    }
    else
    {
        func_95(0xf48d2d49, 0, 0x1, 0);
    }
}
```

当前读法：

| 条件 | action hash | 人话 |
|---|---:|---|
| `global48 & 0x1` | - | A / 主射输入 |
| `sys_0(0x90000, 0) == 0` | `0x7158fa47` | slot 0 空弹，进入主射状态 0，也就是手动 reload action |
| `sys_0(0x90000, 0) != 0` | `0xf48d2d49` | slot 0 有弹，进入普通主射 |

`func_95` 只是写候选，不是执行动作：

```text
0xBDBE6FEA/0.c:2365-2379
func_95(arg0,arg1,arg2,arg3)
  -> global25 = arg0
  -> global23 = arg1
  -> global24 = arg2
  -> global26 = arg3
```

随后这组候选被整理到 shared action slot：

```text
0xBDBE6FEA/0.c:2051-2061 / 2101-2105
global51 = global25
global52 = ...
global62 = global26
global61 = global23
global43 = global24

0xBDBE6FEA/0.c:483-494
sys_1(0x10000, 0, 0x11, global51)
sys_1(0x10000, 0, 0x14, global52)
sys_1(0x10000, 0, 0x1c, global61)
sys_1(0x10000, 0, 0x1d, global43)
sys_1(0x10000, 0, 0x1a, global62)
```

### 2.2 2.c action 分发：hash 查 callback

`2.c` 从 shared slot 读回 action hash：

```text
0xBDBE6FEA/2.c:1872-1882
global6 = sys_0(0x10000, 0, 0x11)
global10 = sys_0(0x10000, 0, 0x14)
global67 = sys_0(0x10000, 0, 0x1c)
global52 = sys_0(0x10000, 0, 0x1d)
global50 = sys_0(0x10000, 0, 0x1a)
```

action registry 在启动时绑定：

```text
0xBDBE6FEA/2.c:6225-6241
func_241(hash, callback)
  -> sys_1(0x10002, 0x2, hash, callback)

0xBDBE6FEA/2.c:29443-29444
func_241(0xf48d2d49, ACTION_A_SHOT);        // 射击
func_241(0x7158fa47, ACTION_A_SHOT_STATE_0); // 射击 状态0
```

action commit 时再查表调 callback：

```text
0xBDBE6FEA/2.c:2615-2667
global3 = global5
...
var1 = sys_0(0x10002, 0x2, global3)
sys_2(0, 0x2, var1)
```

这里的关键点：

```text
0xf48d2d49 不是 A 键本身。
它是 0.c 在当前状态下给 2.c 的“主射 action hash”。
```

### 2.3 slot 0 资源初始化：Delta 和 RX 已经不同

Delta Plus 初始化 slot 0：

```text
0xBDBE6FEA/2.c:25407-25415
sys_4F(0xb, 0, 0x1486a84f)
sys_4F(0xb, 1, 0x10b251b4)
sys_4F(0xb, 2, 0xa8e202bf)
```

RX-78-2 初始化 slot 0：

```text
0xF22E425D/2.c:25538-25546
sys_4F(0xb, 0, 0xe4fab738)
sys_4F(0xb, 1, 0x57611139)
sys_4F(0xb, 3, 0)
```

当前工作解释：

- `sys_4F(0xb, slot, resourceHash)` 是给 ammo / weapon slot 绑定表现和弹药资源的入口。
- Delta slot 0 resource 是 `0x1486a84f`，行为上配合 `0.c` 空弹 branch 成为手动 reload。
- RX slot 0 resource 是 `0xe4fab738`，行为上是常时 reload；脚本没有空弹 reload action。

注意：不要直接把 `0xe4fab738` 硬拷到 Delta，除非确认这个 resource 在 Delta 的资源包 / param 表里有效。更稳的是改 Delta 自己 slot 0 resource 对应的 `arms_param` reload 语义。

### 2.4 Delta 普通主射 action：`0xf48d2d49`

主射 wrapper：

```text
0xBDBE6FEA/2.c:25765-25782
ACTION_A_SHOT()
  -> func_586()
  -> global677 = func_914
  -> global680 = func_915
  -> global681 = 0
  -> global682 = 1
  -> global683 = 1
  -> callFunc3(func_913)

func_913 -> func_587()
```

当前读法：

| 字段 | 作用 |
|---|---|
| `func_586()` | ranged runtime reset |
| `global677 = func_914` | 起手 / motion / 输入窗口 callback |
| `global680 = func_915` | 真正 fire output segment |
| `global681 = 0` | ammo slot 0 |
| `func_587()` | ranged runtime driver |

### 2.5 Delta 2 连射：不是弹体参数，是脚本再投递 action

关键代码：

```text
0xBDBE6FEA/2.c:25790-25833
func_914()
  first enter:
    global170 = 0
    func_887()
    func_610(0x91351d9e, 0xd, -1)
    if global4 != global8:
      global773 = 0
    if global773 > 0:
      func_123(0x280)

  later:
    if func_232(0x100):
      global774 = 1

  if motion time in [0x64, 0xfa0]:
    if slot0 has ammo && global773 < 2:
      global82 |= 1
      if global774 == 1:
        func_81(0xf48d2d49, 0x2, 0x1, 0)
```

关键变量：

| 符号 | 当前工作名 | 理由 |
|---|---|---|
| `global773` | main-shot chain count | `func_915` 每发后 `global773++`，`func_914` 用 `< 2` 限制最多 2 发 |
| `global774` | reinput accepted flag | `func_232(0x100)` 后置 1，并作为 `func_81` 的门 |
| `func_81(0xf48d2d49,...)` | queue same main-shot action | 写入 `global25/global67/global52/global50`，形态类似 0.c 的 action candidate writer |

`func_81` 本体：

```text
0xBDBE6FEA/2.c:3433-3457
global67 = arg1
global52 = arg2
global25 = arg0
global50 = arg3
```

所以 Delta 的 2 连射链路是：

```text
第一发 ACTION_A_SHOT 正在执行
  -> func_914 检测主射再输入
  -> slot0 还有弹，并且 global773 < 2
  -> func_81(0xf48d2d49, ...)
  -> 同一个主射 action 再次进入
  -> func_915 再发一次
  -> global773++ 后达到 2，上限关闭
```

这解释了为什么不是无限连射：

```text
不是 input 层不让你再按，而是 action-local 计数 global773 把同一串主射限制到 2 发。
```

### 2.6 Delta 真正发射点

```text
0xBDBE6FEA/2.c:25835-25848
func_915()
{
    if (sys_0(0x90000, 0, 0) != 0)
    {
        func_123(0x280);
        if (global773 == 0)
        {
            sys_58(0x9, 0x4c9a9d5b);
        }
    }
    sys_4F(0, 0, 0xcc9f6df0);
    global773++;
    func_123(0xc00000);
}
```

当前读法：

| 调用 | 作用 |
|---|---|
| `sys_0(0x90000,0,0)` | 检查 slot 0 是否可用 / 有弹 |
| `sys_4F(0,0,0xcc9f6df0)` | 请求 slot 0 发射 Delta 主射 projectile / weapon resource |
| `global773++` | 本串主射发数计数 |
| `func_123(0x280)` / `func_123(0xc00000)` | cancel / route mask，具体语义要实机验证 |

如果只想保留 Delta 的弹体，不要改 `0xcc9f6df0`。

### 2.7 Delta 空弹 reload action：`0x7158fa47`

空弹时 `0.c` 进入 `0x7158fa47`，`2.c` 绑定到 `ACTION_A_SHOT_STATE_0`：

```text
0xBDBE6FEA/2.c:25850-25908
ACTION_A_SHOT_STATE_0()
  -> func_488()
  -> global609 = func_918
  -> callFunc3(func_917)

func_917 -> func_507()

func_918()
  first enter:
    func_308(... 0x71fbec32 ...)
    global170 = 0
    func_887()
    magazine shell attach / detach
    sys_58(...)
    sys_4F(0x5, 0, 0)
    global29 |= 0x10000

  at 0x64:
    sys_4F(0, 0x5, 0xd6073737)
    magazine shell detach

  at 0x4b0:
    sound / magazine shell attach

  at 0x5dc:
    func_123(0xc00000)

  end:
    global252 = 1
    func_887()
```

当前工作解释：

- `ACTION_A_SHOT_STATE_0` 是 Delta 手动 reload 动作，不是普通主射。
- `func_308(...0x71fbec32...)` 是 reload motion。
- `sys_4B` attach/detach 明确在处理 magazine / 武装外观。
- `sys_4F(0x5,0,0)` 在当前样本只在这里出现，强烈指向 slot 0 手动 reload / ammo slot reset 的触发点，但 native 最终名还需要继续验证。
- `sys_4F(0,0x5,0xd6073737)` 更像 reload 过程中的表现资源，不是主射弹体。

## 3. RX-78-2 对比

### 3.1 RX 输入层没有空弹 reload action

RX 的主射 selector：

```text
0xF22E425D/0.c:3427-3436
else if (global48 & 0x1)
{
    if (func_97(0x71))
    {
        func_95(0xae6d509d, 0x1, 0x1, 0);
    }
    else
    {
        func_95(0xf48d2d49, 0, 0x1, 0);
    }
}
```

区别很关键：

```text
RX 这里没有：
if (sys_0(0x90000,0) == 0) -> reload action
```

`0xae6d509d` 是另一个射击状态分支，不是空弹 reload 分支。RX 的 `0.c` 不会因为 slot 0 空弹把 A 键改派到一个 reload motion action。

### 3.2 RX 主射 action 只发一发，不自我再投递

RX registry：

```text
0xF22E425D/2.c:29851-29852
func_241(0xf48d2d49, func_915);
func_241(0xae6d509d, func_919);
```

RX 普通主射：

```text
0xF22E425D/2.c:25911-25968
func_915()
  -> func_586()
  -> global677 = func_917
  -> global680 = func_918
  -> global681 = 0
  -> callFunc3(func_916)

func_917()
  -> startup / shell / motion
  -> no func_81(0xf48d2d49, ...)

func_918()
  -> if slot0 usable: func_123(0x3a4), sound
  -> func_123(0xc00000)
  -> sys_4F(0,0,0x93459d29)
  -> global29 |= 0x10000
```

也就是说 RX 的普通主射没有 Delta 的：

```text
global773
global774
global773 < 2
func_81(0xf48d2d49, ...)
0x7158fa47 reload action
```

### 3.3 RX 的自动回弹更像资源层负责

RX 初始化 slot 0：

```text
0xF22E425D/2.c:25544
sys_4F(0xb, 0, 0xe4fab738)
```

普通发射：

```text
0xF22E425D/2.c:25967
sys_4F(0, 0, 0x93459d29)
```

输入层不做空弹 reload action，主射段也不手动回弹。这说明 RX 的 ammo 回弹主要来自 slot 0 的 resource / param reload 配置，而不是 MSC action 自己播放装填动作。

## 4. 要做成 RX 风格，推荐改法

目标：

```text
Delta Plus 主射：
- 仍然用 Delta 的主射弹体 / 命中资源。
- 每次按 A 只发一发。
- 快速连点不再在同一动作中自动接第二发。
- 弹药归 0 后不进入手动 reload motion。
- 弹药随后按资源层规则自动恢复。
```

### 4.1 脚本层改 1：关掉 2 连射自我投递

首选 patch 点：

```text
0xBDBE6FEA/2.c:25816-25825
if (slot0 has ammo && global773 < 2)
{
    global82 |= 1;
    if (global774 == 1)
    {
        func_81(0xf48d2d49, 0x2, 0x1, 0);
    }
}
```

推荐做法：

```text
删除或跳过 func_81(0xf48d2d49, 0x2, 0x1, 0)
```

不要只优先改 `global773 < 2` 为 `< 1`，原因是它依赖 runtime 时序：第二次输入是否发生在 `func_915` 已经 `global773++` 之后，需要实机确认。最稳定的是直接让主射动作不再 queue 同一个 `0xf48d2d49`。

可以保留：

- `func_123(0x280)`
- `func_123(0xc00000)`
- `sys_4F(0,0,0xcc9f6df0)`

这些仍然服务于主射取消和发弹。

### 4.2 脚本层改 2：不改 `0.c`，只改 `0x7158fa47` 的 2.c callback

不要改这个 `0.c` 分支。它是 common action selector，跨机体基本一致，后续更新/对比成本高：

```text
0xBDBE6FEA/0.c:3471-3480
if (sys_0(0x90000, 0) == 0)
{
    func_95(0x7158fa47, 0, 0x401, 0);
}
else
{
    func_95(0xf48d2d49, 0, 0x1, 0);
}
```

正确方向：保留 `0x7158fa47` 这个空弹 action hash，让它继续进 Delta `2.c`：

```text
0xBDBE6FEA/2.c:29444
func_241(0x7158fa47, ACTION_A_SHOT_STATE_0); // 射击 状态0
```

然后改 `ACTION_A_SHOT_STATE_0 / func_918`。目标是删掉 reload 演出，不删 action hash。

原本 reload 证据：

```text
0xBDBE6FEA/2.c:25850-25908
ACTION_A_SHOT_STATE_0()
  -> func_488()
  -> global609 = func_918
  -> callFunc3(func_917)

func_918()
  -> func_308(...0x71fbec32...)     reload motion
  -> sys_4B(...)                    magazine attach / detach
  -> sys_4F(0x5,0,0)                slot0 manual reload/reset candidate
  -> sys_4F(0,0x5,0xd6073737)       reload visual/resource event
  -> func_123(0xc00000)
  -> func_887()
```

最小 2.c patch 思路：

```c
void ACTION_A_SHOT_STATE_0()
{
    global252 = 0x1;
    global29 = global29 | 0x10000;
}
```

更稳版本：保留 runtime 结构，但把 `func_918` 改短，只做结束标记，不播放 motion，不挂弹匣，不调 `sys_4F(0x5,0,0)`：

```c
void func_918()
{
    global252 = 0x1;
    global29 = global29 | 0x10000;
    func_887();
}
```

注意：

- 如果保留 `sys_4F(0x5,0,0)`，更像“无动画瞬间手动装填”，不是 RX 风格常时 reload。
- 现在已经读出 `0x1486a84f` 的真实 `arms_param` 行：自动 reload 计时字段全为 `0`。因此只删除 `sys_4F(0x5,0,0)`、不改 param，slot0 高概率会永久空弹，不会自己恢复。

### 4.3 资源层改 3：slot 0 改成自动回弹语义

Delta 当前 slot 0：

```text
sys_4F(0xb, 0, 0x1486a84f)
```

RX 当前 slot 0：

```text
sys_4F(0xb, 0, 0xe4fab738)
```

这两个 hash 可以直接在对应机体的 `arms_param.entry_id` 中命中：

```text
Delta Plus:
E:\XB\解包\vs2\x64\041cpm\arms_param\armsparam_015gndmuc_004deltpl_001.vgsht2
entry index 1 = 0x1486a84f

RX-78-2:
E:\XB\解包\vs2\x64\041cpm\arms_param\armsparam_001gundam_001gundam_001.vgsht2
entry index 2 = 0xe4fab738
```

解析使用项目 `param_bin_format.rs` 的同一套 LE 布局：

```text
header 0x20
field hash table
field descriptors
entry id table
entry rows
```

两个主射 entry 的 reload 字段：

| 字段 hash | 当前工作名 | Delta `0x1486a84f` | RX `0xe4fab738` |
|---:|---|---:|---:|
| `0x4961274C` | `ammo_count` | `4` | `8` |
| `0x11DEE0C8` | `reload_type` | `1` | `2` |
| `0x04A2CFD6` | `reload_start_frame` | `0` | `120` |
| `0x103171AE` | `reload_time_total` | `0` | `40` |
| `0xA502BCF2` | `reload_per_shot_frame` | `0` | `180` |
| `0xA635CFC2` | `reload_lock_frame` | `60` | `120` |
| `0xEDC16AE3` | `ammo_reload_wait_frame` | `0` | `40` |
| `0x67364138` | `cooldown_frame` | `0` | `120` |

最重要的交叉验证：

```text
RX wiki: 常时 / 3 秒
RX param: 0xA502BCF2 = 180 frame
180 / 60 fps = 3 秒
```

所以针对这两个样本，可以确认：

1. `sys_4F(0xb, slot, hash)` 的 hash 是 `arms_param.entry_id`。它负责把 ammo slot 绑定到一行武装参数。
2. `sys_4F(0, slot, hash)` 的第三参不是这行 `arms_param.entry_id`。Delta 的 `0xcc9f6df0` 和 RX 的 `0x93459d29` 是发射请求资源，不负责定义弹匣 reload 方式。
3. Delta 主射 `reload_type=1`，所有自动计时字段为 `0`；补满弹匣依赖 `2.c` reload action 内的 `sys_4F(0x5,0,0)`。
4. RX 主射 `reload_type=2`，`0xA502BCF2=180`；结合 wiki，type 2 在这个样本里是常时逐发恢复，不是当前 UI 写的 `Overheat`。

当前 `src/lib/gameAlgorithms/reloadSystem.ts` 把 type 2 写成 `Overheat`，但 RX 主射的 `overheat_frame=0`。这与真实样本和 wiki 都冲突。该 UI enum 不能拿来指导 patch；在 native 分支完全拆出前，只把下面两条作为已验证映射：

```text
Delta main: reload_type 1 + zero timer fields -> manual reload
RX main:    reload_type 2 + 0xA502BCF2=180 -> constant 3-second per-round reload
```

推荐分阶段修改：

1. 不要先替换 `func_915` 的 projectile hash；保留 `sys_4F(0,0,0xcc9f6df0)`。
2. 在 Delta `arms_param` 编辑 `entry_id=0x1486a84f`，保留 `ammo_count=4`。
3. 第一轮最小实验只改：
   - `0x11DEE0C8`: `1 -> 2`
   - `0xA502BCF2`: `0 -> 180`
4. 同时让 `2.c` 的空弹 action 不再调用 `sys_4F(0x5,0,0)`，否则自动 reload 还没发生就会被瞬间补满。
5. 如果最小实验没有按 3 秒逐发恢复，再把 RX reload cluster 的其余值复制到 Delta，但仍保留 Delta 的 entry id、ammo count 和 projectile hash：

```text
0x04A2CFD6:   0 -> 120
0x103171AE:   0 -> 40
0xA635CFC2:  60 -> 120
0xEDC16AE3:   0 -> 40
0x67364138:   0 -> 120
```

这一步必须分字段实机测。原因：这些字段名仍是统计推定名；值虽然真实，但每个值在 native reload state machine 中的精确职责尚未完全证明。

项目字段入口：

- `docs/command_mapping.md` 的 `arms_param` 字段表：
  - `reload_start_frame`
  - `reload_time_total`
  - `reload_type`
  - `ammo_count`
  - `reload_per_shot_frame`
  - `reload_lock_frame`
  - `ammo_reload_wait_frame`
- `src/lib/gameAlgorithms/reloadSystem.ts` 里有当前 UI/算法层对 reload type 的解释，但它不等于官方命名；最终以实机验证为准。

### 4.4 不推荐方案

| 做法 | 问题 |
|---|---|
| 只改 `sys_4F(0,0,0xcc9f6df0)` | 这是弹体 / weapon request，不解决 2 连射和 reload action |
| 直接把 Delta `0xf48d2d49` callback 换成 RX 的 `func_915` | 函数编号和全局依赖跨样本不稳定，且会丢 Delta motion / shell / cancel |
| 改 `0.c` 空弹 branch | `0.c` 是 common selector，跨机体复用，后续维护成本高 |
| 只删 `0x7158fa47` registry | `0.c` 仍会空弹派发这个 hash，可能变成 fallback / 无动作 |
| 保留 `sys_4F(0x5,0,0)` 但删 motion | 行为更像瞬间手动 reload，不是常时自动 reload |
| 只改 `ammo_count=1` | 会更容易触发手动 reload action，不会变成 RX 风格 |
| 直接用 RX `0xe4fab738` 覆盖 Delta slot 0 | 可能引用 Delta 包里不存在的 resource，或带来 RX 武装 HUD / reload 配置副作用 |

## 5. 预期 patch 后行为

正确目标行为应该是：

```text
按 A：
  -> 0.c common selector 保持不变
  -> 有弹：0xf48d2d49 -> 2.c ACTION_A_SHOT
  -> func_914 不再通过 func_81 接第二发
  -> func_915 只执行一次 sys_4F(0,0,0xcc9f6df0)
  -> slot0 ammo 被 resource 系统扣 1
  -> 空弹：0x7158fa47 -> 2.c ACTION_A_SHOT_STATE_0
  -> ACTION_A_SHOT_STATE_0 不播 reload motion，不挂弹匣
  -> ammo 用常时 reload 规则自动恢复
```

不应该发生：

```text
快速点两次 A -> 同一动作内 2 连射
slot0 = 0 后按 A -> 0x7158fa47 reload motion / magazine shell
reload 时 magazine shell 重新挂接 / 卸下
```

## 6. 验证矩阵

必测：

| 场景 | 期望 |
|---|---|
| 有弹单点 A | 只发 1 发 Delta projectile |
| 有弹快速双点 A | 不在同一动作内自动接第二发 |
| A 后 BD cancel 再 A | 仍能通过新动作射击，不能误判成完全禁连 |
| slot0 变 0 后按 A | `0.c` 仍进 `0x7158fa47`，但 `2.c` 不播放 Delta reload motion |
| 等待 reload 时间 | ammo 自动恢复 |
| 空弹期间按 A | 不生成空弹、不崩、不残留 magazine shell |
| BDC / step / OH | cancel 和落地行为没有被误改 |
| 死亡复归 / 换锁 / 觉醒 | slot0 和 shell 状态能恢复 |

## 7. 当前置信度与缺口

高置信：

- `0xf48d2d49` 是 Delta / RX 的普通主射 action hash。
- Delta 的空弹主射会由 common `0.c` 转到 `0x7158fa47`；patch 不建议改这里。
- Delta 的 2 连射来自 `func_914 -> func_81(0xf48d2d49,...)` 和 `global773 < 2`。
- Delta 真正主射发射点是 `func_915 -> sys_4F(0,0,0xcc9f6df0)`。
- RX 普通主射没有 Delta 这条自我再投递链，也没有空弹 reload action branch。
- Delta slot0 的 `0x1486a84f` 直接命中 Delta `arms_param.entry_id`，其 `ammo_count=4`、`reload_type=1`、自动 reload 计时值为 `0`。
- RX slot0 的 `0xe4fab738` 直接命中 RX `arms_param.entry_id`，其 `ammo_count=8`、`reload_type=2`、`0xA502BCF2=180`；与 wiki 的常时 3 秒回弹一致。

中等置信：

- `sys_4F(0x5,0,0)` 是 Delta 手动 reload / slot0 reset 的关键触发点。它只在 reload action 中出现，结合 motion / magazine shell 证据很强，但 native 最终命名仍需继续拆。
- `sys_4F(0xb,slot,resourceHash)` 是 ammo / weapon slot 资源绑定入口，resource hash 决定 reload 行为的大部分基础语义。
- 将 Delta `reload_type` 从 `1` 改为 `2` 并把 `0xA502BCF2` 改为 `180`，应能复现 RX 的常时 3 秒逐发恢复；仍需实机验证 state machine 是否还依赖同 cluster 的其他字段。

未完成：

- `reload_type` 的四个 enum 还没有全部对齐到 wiki 术语；当前只证明本问题涉及的 type 1 / type 2 样本。
- `0x04A2CFD6`、`0x103171AE`、`0xA635CFC2`、`0xEDC16AE3`、`0x67364138` 在 native reload state machine 中各自的精确职责仍需实机或 IDA 证明。

## 8. Auto Rename 建议

不要把这些直接写死成跨样本 `func_N` 名。建议加入 `msc-auto-rename-mapping.md` / overlay 的 semanticId：

```json
{
  "semanticId": "action.mainShot.deltaPlus.setup",
  "currentSample": "0xBDBE6FEA/2.c:ACTION_A_SHOT",
  "evidence": [
    "registered by func_241(0xf48d2d49, ...)",
    "sets global677 = func_914",
    "sets global680 = func_915",
    "sets global681 = 0"
  ]
}
```

```json
{
  "semanticId": "action.mainShot.deltaPlus.chainWindow",
  "currentSample": "0xBDBE6FEA/2.c:func_914",
  "evidence": [
    "checks sys_0(0x90000,0,0)",
    "checks global773 < 2",
    "calls func_81(0xf48d2d49,...)"
  ]
}
```

```json
{
  "semanticId": "action.mainShot.deltaPlus.fireSegment",
  "currentSample": "0xBDBE6FEA/2.c:func_915",
  "evidence": [
    "emits sys_4F(0,0,0xcc9f6df0)",
    "increments global773"
  ]
}
```

```json
{
  "semanticId": "action.mainShot.deltaPlus.manualReloadAction",
  "currentSample": "0xBDBE6FEA/2.c:ACTION_A_SHOT_STATE_0",
  "evidence": [
    "registered by func_241(0x7158fa47, ...)",
    "0.c selects it only when sys_0(0x90000,0)==0",
    "plays reload motion and magazine shell operations",
    "calls sys_4F(0x5,0,0)"
  ]
}
```

这样 offset / `func_N` 变化后，可以用 action hash + syscall shape + resource hash 重新定位，而不是靠当前反编译编号。
