# 德尔塔 Plus 变形与飞机模式调用链研究

本文记录 `E:\XB\解包\com\file\0xBDBE6FEA\2.c` 中德尔塔 Plus 从普通形态进入飞机形态的当前定位。重点不是某两个底层局部函数，而是完整链路：输入检测、动作 hash、动作入口、形态切换、模型/资源切换、飞行控制循环、动态命名方案。

## 当前结论

德尔塔 Plus 的“按住喷气按键 + 某方向连按两次”不是在 `2.c` 里直接检测原始按键。原始输入先在 `0.c` 被整理成“方向双击”和“动作事件位”，再通过动作索引 `0x17` 转成动作 hash `0x9475130e`。`2.c` 把 `0x9475130e` 注册到 `func_450`，它进入变形突入/飞行过渡状态。

飞机模型本身不是 `func_450` 直接切的。模型与资源切换由形态分发的 case `0x7` 进入：它调用 `func_1037`，写入飞机模型 hash `0xcb05586`，把 `global143` 设为 `1`，并改写若干 `0x10001` 动作/动画映射。退出飞机形态走 case `0x8`，由 `func_1038` 恢复普通模型 hash `0xab9c3043`、普通移动参数行 `0xc2b19d12`、普通模式标志。

持续飞行控制主要集中在 `func_452 -> func_453 -> func_454 -> func_455/456/458/459/460/463`。这些函数读取 `global87`、`global48`、`global93` 等输入缓存，读取 `global142` 指向的 `0x60006` 移动参数表，并通过 `sys_46` 写入旋转、速度、位移、俯仰等运动控制。

## 输入到动作 hash

### 跨机体对比：RX-78-2 的 0.c

对比 `E:\XB\解包\com\file\0xF22E425D\0.c` 后，下面这些输入层代码块与德尔塔 Plus 的 `0.c` 逐字一致：

- `func_13` 动作 hash 表，`0x17 -> 0x9475130e`。
- `func_71 -> func_72` 的变形输入 gate。
- `func_106` 的方向双击缓存。
- `func_119/func_124` 的事件位和方向双击 helper。
- `func_134` 的输入共享区写出。

这说明 `0.c` 里的“变形输入判定”更像共用输入框架：只要机体处于允许状态，输入层都会产出动作 hash `0x9475130e`。机体是否真的执行变形，取决于该机体 `2.c` 是否把这个 hash 绑定到有效动作。

RX-78-2 的 `2.c` 正好给了反证：它保留了同名动作函数体，但动作注册表把相关 hash 绑定为 `0`：

```c
func_241(0x9475130e, 0);
func_241(0x77b100ff, 0);
func_241(0xa02d57dc, 0);
```

证据：`0xF22E425D\0.c:541-573`，`0xF22E425D\0.c:1852-1891`，`0xF22E425D\0.c:2745-2828`，`0xF22E425D\2.c:29838-29840`。

### 方向双击检测

`0.c func_106` 负责把方向输入整理成双击/快速重复方向：

- `global4 & 0x3c` 表示本帧方向按下边沿。
- `global70` 保存最近一次方向。
- `global74 = global70 & global4`，表示短时间内同方向再次按下。
- `global76 = global72`，表示另一类方向重复/释放后再按下缓存。
- 计时窗口分别是 `0xe` 和 `0x8` 帧级别。

证据：`0.c:2745-2828`。

### 变形输入判定

`0.c func_71 -> func_72` 是当前最像“喷气 + 方向双击进入飞机模式”的入口：

- 要求动作槽 `0x17` 可用：`func_82(0x17)`。
- 要求 `global20 & 0x1000000`，可理解为当前状态允许变形/飞行类控制。
- 要求 `sys_0(0x60000) > 0`，也就是 boost/资源槽还有量。
- 要求 `func_119(0x20000000)`，这是输入系统整理出的某个喷气/BD相关事件位。
- 要求 `func_124()`，也就是 `global74 & 0x3c` 非零，方向双击成立。
- 成功后返回 `sys_0(0x10000, 0x1, 0x17)`。

证据：`0.c:1852-1891`，`0.c:3208-3251`。

`0.c func_13` 把动作索引 `0x17` 注册为 hash `0x9475130e`：

```c
sys_1(0x10000, 0x1, 0x17, 0x9475130e);
```

证据：`0.c:541-573`。

`0.c func_134` 会把输入整理结果写到共享区，`2.c func_21` 每帧读回：

- `0.c` 写 `0x2c = global76`。
- `2.c` 读 `global93 = sys_0(0x10000, 0, 0x2c)`。
- `2.c` 读 `global87 = sys_0(0x10000, 0, 0x7)`，作为 held input bitmask。
- `2.c` 读 `global48 = sys_0(0x10000, 0, 0x8)`，作为 pressed edge。

证据：`0.c:3299-3304`，`2.c:1767-1779`。

## 动作入口：0x9475130e

`2.c func_1043` 把 hash `0x9475130e` 注册到 `func_450`：

```c
func_241(0x9475130e, func_450);
```

证据：`2.c:29413-29438`。

`func_450` 做的事：

- `func_167(0x1008000)`：进入一个变形突入/飞行过渡用的动作状态位。
- `func_99(global9, 0xa)`：根据当前输入/方向计算朝向或动作方向。
- `func_69(0x23)`：设置动作/动画槽位 `0x23`。
- 从 `sys_0(0x60006, global142, 0x5e8caf43)` 读移动参数。
- `func_296(0x3e8, 1)` 设置动作时间/阶段。
- 转入 `func_451` 循环。

证据：`2.c:10775-10785`。

### `func_1037` 是怎么被调用的

`func_1037` 不是 `0x9475130e -> func_450` 直接调用的。真正链路是：

```text
输入层产生 action hash 0x9475130e
  -> 2.c 动作表绑定到 func_450
  -> func_450 调 func_69(0x23)
  -> func_69 从 sys_0(0x10001, 0x2, 0x23) 取动作槽回调
  -> 动作槽 0x23 绑定到 func_870
  -> func_870 首帧进入 formDispatch(0x7)
  -> formDispatch 的 arg0 == 0x7 分支调用 func_1037
```

也就是说，`func_450` 只是“变形突入动作入口”。它通过 `func_69(0x23)` 选择了动作/动画槽 `0x23`，而 `0x23` 的回调才是进入飞机形态资源层的地方。

关键证据：

```c
// 2.c:10775-10785
void func_450()
{
    func_167(0x1008000);
    func_99(global9, 0xa);
    func_69(0x23);
    global507 = sys_0(0x60006, global142, 0x5e8caf43);
    ...
    callFunc3(func_451);
}

// 2.c:3270-3279
void func_69(int arg0)
{
    ...
    global222 = arg0;
    global223 = sys_0(0x10001, 0x2, global222);
    func_72();
}

// 2.c:3306-3318
void func_72()
{
    if (sys_2(0x3) == 0x2)
    {
        if (global223 != 0)
        {
            (*global223)();
        }
    }
    else if (global225 != 0)
    {
        (*global225)();
    }
}

// 2.c:29512
sys_1(0x10001, 0x2, 0x23, func_870);

// 2.c:25231-25236
if (global226 == 0)
{
    global226++;
    global238 = 0;
    formDispatch(0x7);
    ...
}

// 2.c:25564-25566
else if (arg0 == 0x7)
{
    func_1037();
}
```

这里的 `formDispatch(0x7)` 是语义名：源码当前仍是反编译临时函数名。为了后续自动 mapping，不应该把逻辑绑定到这个临时 offset，而应该绑定到更稳定的结构特征：

- `func_69(0x23)` 选择动作槽 `0x23`。
- `sys_1(0x10001, 0x2, 0x23, callback)` 注册槽回调。
- 回调首帧进入形态 case `0x7`。
- case `0x7` 调用 `func_1037`，写 `global20 = 0xcb05586` 与 `global143 = 1`。

同一个形态 case `0x7` 还被其它动作复用，例如特格、觉醒技、若干派生动作会在自己的阶段函数里进入飞机/变形外观资源层。因此 `func_1037` 更准确的角色是“进入飞机形态资源层”，不是“变形输入判定”本身。

`func_451` 是突入/转向阶段：

- 如果不是某个特定模式位，则 `global75 |= 0x40000`。
- 调用 `func_72()`，这在 `2.c` 中更像每帧通用状态维护，不是 `0.c` 的输入判定函数。
- 根据 `global162` 计时、`global264/sys_0(0x40005)` 计算目标角。
- 用 `sys_46(0, var0)` 和 `sys_46(0x1, 0x2, ...)` 写入转向/角速度。
- 完成后若 `global238` 成立则结束当前动作。

证据：`2.c:10788-10809`。

## 飞机形态写入

形态进入的核心写入点是 `func_1037`：

- `sys_4B(0, 0xcb05586)`：切到飞机模型/形态资源。
- `global20 = 0xcb05586`：当前模型/形态 hash 也同步为飞机。
- `sys_1(0x10001, 0x3/0x4, 0x1/0x13, 0xa8c15086)`：把若干动作槽改写成飞机模式用 hash。
- `sys_4F(0xb, ...)`：切换武装/资源槽。
- `sys_4F(0x16, 0x2, 0)`：调整另一个系统槽位。
- `global143 = 1`：当前形态状态设为飞机。

证据：`2.c:29304-29317`。

### `sys_1(0x10001, 0x3/0x4, 0x1/0x13, 0xa8c15086)` 的当前解释

这四行不是输入判定，也不是把 action hash 直接改掉。它们是在飞机形态进入时临时改写 `0x10001` 下的 motion resource registry：

```c
sys_1(0x10001, 0x3, 0x1, 0xa8c15086);
sys_1(0x10001, 0x4, 0x1, 0xa8c15086);
sys_1(0x10001, 0x3, 0x13, 0xa8c15086);
sys_1(0x10001, 0x4, 0x13, 0xa8c15086);
```

四个参数的人话含义：

| 参数 | 当前解释 | 证据 |
|---|---|---|
| `0x10001` | Delta Plus 的动作/表现 registry namespace。它下面至少有 callback 表、motion hash 表、其它资源表。 | `func_69` 用 `sys_0(0x10001,0x2,slot)` 取 callback；`func_79` 用 `sys_0(0x10001,0x3+global170,motionSlot)` 取 motion hash。 |
| `0x3` / `0x4` | 两个 motion hash bank。`func_79` 实际读取 `0x3 + global170`，所以 `global170=0` 读 bank `0x3`，`global170=1` 读 bank `0x4`。 | `2.c:3402-3420`。 |
| `0x1` / `0x13` | motion resource slot，不是 callback slot。`func_74(slot, blend)` 最终把这个 slot 解析成 motion hash，再交给 `func_308` 播放。 | `func_74 -> func_79 -> sys_0(...0x3+global170,slot) -> func_308`，`2.c:3377-3420`。 |
| `0xa8c15086` | 飞机形态用的 motion hash。普通表里它原本只挂在 motion slot `0x37`，进入飞机时被临时复制到 `0x1` 和 `0x13`。 | `2.c:29578`、`2.c:29628`、`2.c:29309-29312`。 |

这组覆盖的意义是：飞机模型已经由 `sys_4B(0,0xcb05586)` 激活后，某些基础 motion slot 不能再播放人形 MS 的普通动作，否则会出现“飞机壳播放人形待机/下落/恢复 motion”的错位。因此脚本把两个常用基础槽同时指向飞机 motion hash `0xa8c15086`。

和普通表对比：

| motion slot | 普通 bank `0x3` | 普通 bank `0x4` | 飞机进入后 |
|---|---:|---:|---:|
| `0x1` | `0x0d2b43c0` | `0xe244d122` | `0xa8c15086` |
| `0x13` | `0xc0ef4b31` | `0x2f80d9d3` | `0xa8c15086` |
| `0x37` | `0xa8c15086` | `0xa8c15086` | 不改，作为普通表里的飞机进入 motion slot 保留 |

游戏角度的推断：

- motion slot `0x1` 会在基础状态切换中被使用，例如 `func_48/50` 在 `global24 & 0x1000000` 成立时播放 `func_74(0x1, ...)`。这很像“当前特殊移动/空中状态下的基础姿态槽”。
- motion slot `0x13` 是空中 fallback / fall loop 相关资源。`func1044-slot-callback-atlas.md` 已把 callback `func_858` 归到空中 neutral/下落 motion，并指出它播放 resource index `0x13`。
- 变形解除 callback `func_872` 在恢复普通装配后也会立刻 `func_74(0x13, 0x1e)`，这说明 `0x13` 是飞机模式退出后最容易接回的空中落点槽。
- 进入飞机形态时把 `0x1` 和 `0x13` 都改成 `0xa8c15086`，最像是在保证“基础姿态”和“空中下落/回落姿态”都落到飞机模式 motion，而不是普通 MS motion。

这组覆盖可以理解成一个“飞机形态安全网”：

```text
active model 已经切成飞机壳
  -> 任意上级动作如果请求 base/special posture slot 0x1
  -> 或请求 air neutral/fall slot 0x13
  -> 都会得到同一个飞机 motion hash 0xa8c15086
```

如果不做这件事，持续飞行、变形解除、被中断后的空中 fallback 都可能通过共通动作逻辑请求到普通 MS 的 `0x1` 或 `0x13`，造成飞机模型接人形 idle/fall motion。这里不是在创建新 action，而是在飞机形态期间改写“已有动作槽的资源答案”。

逆向角度的关键点：

- `0x10001/0x2` 是 slot callback 表，`0x10001/0x3` 和 `0x10001/0x4` 是 motion hash 表。不能因为第三个参数数字相同就把它们混成一张表。
- `func_1038` 退出飞机时调用 `func_1045()`，说明 `func_1037` 的四个 `sys_1` 是临时覆盖，不是永久初始化。
- `func_79` 如果当前 bank 查不到 hash，会 fallback 到 bank `0x3`。所以 `func_1037` 同时写 `0x3` 和 `0x4`，是在避免 `global170` 处于任意 bank 时读回普通 motion。
- 跨机体证据也支持这个模式。`0x0888D09D/2.c` 的形态切换函数同样会在进入形态时改写 `0x10001/0x3` 的 `0x1` 和 `0x13`，退出时再改回普通 hash。德尔塔 Plus 多写了 `0x4`，是因为它的 `func_1045` 明确维护了两套 motion bank。

当前建议命名：

```text
sys_1(0x10001, motionBank, motionSlot, motionHash)

0x10001 = depiction/action registry namespace
0x3     = normal stance motion bank
0x4     = alternate stance motion bank selected by global170
0x1     = base/special posture motion slot, exact official name unknown
0x13    = air neutral/fall-loop motion slot
0xa8c15086 = plane-form fallback/flight posture motion hash
```

### `func_1037` 里的四个 `sys_4F`

`func_1037` 的四个 `sys_4F` 和上面的 motion registry 覆盖是同一阶段发生的，但控制面不同：`sys_1` 改“模型要播放哪个 motion hash”，`sys_4F` 改“表现/武装/HUD resource entry 如何配置”。

```c
sys_4F(0xb, 0, 0x377d1397, 0x1486a84f, 0x4);
sys_4F(0xb, 0x1, 0xf100a0da);
sys_4F(0xb, 0x2, 0x1799c911);
sys_4F(0x16, 0x2, 0);
```

当前拆解：

| 调用 | 当前解释 | 对照证据 |
|---|---|---|
| `sys_4F(0xb,0,0x377d1397,0x1486a84f,0x4)` | 把 presentation/resource entry `0` 切到飞机资源 `0x377d1397`，并携带普通资源 `0x1486a84f` 与 mode `0x4` 做成对切换。 | 出生/普通模式初始化为 `sys_4F(0xb,0,0x1486a84f)`；退出飞机时反向写 `sys_4F(0xb,0,0x1486a84f,0x377d1397,0x4)`。 |
| `sys_4F(0xb,0x1,0xf100a0da)` | 把 entry `1` 直接切到飞机形态资源。 | 普通模式 entry `1` 是 `0x10b251b4`，退出时恢复。 |
| `sys_4F(0xb,0x2,0x1799c911)` | 把 entry `2` 直接切到飞机形态资源。 | 普通模式 entry `2` 是 `0xa8e202bf`，退出时在 `global775==0` 时恢复。 |
| `sys_4F(0x16,0x2,0)` | 对 entry `2` 写一个布尔 flag 为 `0`。native 侧已确认 `0x16` 写 byte `322`。游戏侧更像禁用/隐藏 entry `2` 的某种 HUD 或资源状态。 | `func_1040` 在普通形态下每帧按 `0xd0001/0xd000b` 状态重算 `sys_4F(0x16,0x2,0/1)`；飞机形态 `global143==1` 时跳过该重算。 |

其中 `sys_4F(0xb,...)` 的 native 资料已经把 subcmd `0x0B` 收窄为“带 mode 映射的 entry 配置动作”，不是实际开火。脚本侧也支持这个结论：`func_877` 出生初始化、`func_1037` 进入飞机、`func_1038` 退出飞机都会写 `sys_4F(0xb,...)`，而真正发射武装更常见的是 `sys_4F(0, slot, weaponHash)`。

`mode=0x4` 的模式名还没有恢复，但脚本形态很清楚：它在多个机体中成对出现，并且进入 / 退出时第三、第四参数反向交换。例如：

```text
Delta Plus:
  enter: sys_4F(0xb, 0, 0x377d1397, 0x1486a84f, 0x4)
  exit:  sys_4F(0xb, 0, 0x1486a84f, 0x377d1397, 0x4)

0x0888D09D:
  enter: sys_4F(0xb, 0, 0xd55d6f97, 0x4e28047f, 0x4)
  exit:  sys_4F(0xb, 0, 0x4e28047f, 0xd55d6f97, 0x4)

0x878E6255:
  enter: sys_4F(0xb, 0, 0x81edb193, 0xc871f33d, 0x4)
  exit:  sys_4F(0xb, 0, 0xc871f33d, 0x81edb193, 0x4)
```

所以当前更稳的解释不是“播放某个武装”，而是“把某个 presentation / weapon entry 从旧资源切到新资源，同时告诉 native 旧资源是谁”。`0x4` 很可能是这种双 hash 切换的模式编号；至于是 crossfade、replace-with-pair、还是 alternate-resource transition，需要 native 或实机继续证实。

entry `2` 的证据更像特射 / assist / 武装槽维护：

- 普通初始化把 entry `2` 设为 `0xa8e202bf`。
- `func_1026` 会 `sys_4F(0x7, 0x2, 0x1)`，native 侧已把 `0x7` 收窄为 slot gauge / ammo count 主动扣减；同一个函数又恢复 `sys_4F(0xb, 0x2, 0xa8e202bf)`。
- `func_1040` 用 `sys_0(0x90000,0x2,0)`、`0xd0001/0xd000b` 维护 `sys_4F(0x15/0x16,0x2,...)`。
- RX-78-2 没有飞机变形，但它的 `func_1055` 仍然用同一组 `0x15/0x16, entry 2` 逻辑维护 `0xd0001/0xd000b` 与 `0x90000`。这说明 `0x15/0x16` 是通用武装/assist entry 状态维护，不是德尔塔 Plus 飞机专属。

`global775` 是 entry `2` 的一个特殊恢复保护。`func_1025` 设置 `global775=1` 后调用形态退出，并在自己的流程里保持 `sys_4F(0x16,0x2,0)`；后续 `func_1026` 又显式扣 entry `2` 计量并恢复 `0xa8e202bf`。因此 `func_1038` 只有在 `global775==0` 时才自动恢复 entry `2`，避免打断这个特殊武装/换锁/派生流程。

这四条的游戏侧合并解释：

```text
进入飞机模式
  -> 切 active shell 到飞机模型
  -> 把基础/空中 fallback motion slot 改成飞机 motion
  -> 把 0/1/2 三个 presentation/resource entry 改成飞机模式资源
  -> entry 0 使用双 hash mode=0x4 做普通/飞机资源对切
  -> entry 1/2 直接替换为飞机形态资源
  -> 固定关闭 entry 2 的 byte322 flag，暂停普通形态下的通用 entry 2 状态维护
```

仍不确定的部分：

- `0x377d1397 / 0xf100a0da / 0x1799c911` 的原始资源名还没有从资源表恢复。
- `sys_4F(0xb,...,mode=0x4)` 的 mode `0x4` 在 native 层只知道会经过 `sub_140684EC0()` 映射，还不能命名为具体的“crossfade/replace/alternate”。
- `sys_4F(0x15,0x2,...)` 写 byte `318`，`sys_4F(0x16,0x2,...)` 写 byte `322`。两者都是 entry flag；游戏侧很像 HUD / ammo / assist availability 状态，但真实 UI 名还不能硬定。

退出飞机形态的核心写入点是 `func_1038`：

- `sys_4B(0, 0xab9c3043)`：恢复普通模型/形态资源。
- `global20 = 0xab9c3043`。
- `global142 = 0xc2b19d12`：恢复普通移动参数行。
- `global122 = 0x201`：恢复普通动作状态位组合。
- `func_1045()`：重建普通动作/动画映射表。
- `sys_4F(0xb, ...)`：恢复普通武装/资源槽。
- `global143 = 0`：当前形态状态回普通。

证据：`2.c:29324-29344`。

`global143` 会被 `func_41` 写到共享区 `0x10000,0,0x17`，`0.c` 也能读到这个形态状态。因此它更适合命名为 `formState` 或 `isPlaneForm`，不要只按函数 offset 命名。

证据：`2.c:2560-2566`，`0.c:240`。

## 飞行控制循环

持续飞机飞行的主入口是 `func_452`：

- `func_167(0x1004000)`：进入持续飞行/MA控制状态。
- 从 `0x60006, global142` 读取三组移动参数：
  - `0x5e8caf43`
  - `0xff7a9c8b`
  - `0x459455ea`
- 初始化姿态、侧倾、俯仰、速度衰减等临时变量。
- `func_69(0x24)` 设置动作/动画槽。
- 转入 `func_453`。

证据：`2.c:10812-10844`。

`func_453` 每帧维护飞行：

- 根据状态位选择 `func_461`、`func_462` 或 `func_454`。
- 根据 `global168/global169/global605` 写 `sys_1(0xe0001, 0x9, var0)`，这像是给外部系统/动画层的飞行姿态标志。
- 逐帧更新 `global507`，再用 `sys_46(0x1, 0x1, 0, global167, global507)` 写前进/俯仰方向的速度。
- 用 `sys_46(0x1, 0x2, global601, 0, global598)` 写侧向/快速转向速度。

证据：`2.c:10846-10905`。

`func_454` 是飞行控制调度：

- 先调用 `func_463` 检查飞行中方向双击/快速转向。
- 如果不是某个飞行模式位，走 `func_455` 与 `func_458`。
- 如果是另一种飞行模式位，走 `func_456` 与 `func_459`。
- 最后按 `global167/global166` 调 `func_104(...)` 和 `func_360(...)` 同步姿态/碰撞/动画。

证据：`2.c:10907-10959`。

`func_455/456` 处理左右/方向保持：

- `global87 & 0x3c` 是方向 held。
- `func_99(global87, 0xa)` 重新计算方向。
- `sys_46(0, var1)` 写 yaw/转向。
- `func_457` 根据方向调整 `global166`，即侧倾/滚转类姿态。

证据：`2.c:10961-11050`。

`func_458/459/460` 处理上升/下降或俯仰：

- `global48 & 0x80` 检测某个按键按下边沿。
- `global87 & 0x80` 检测该按键保持。
- `global87 & 0x4/0x8` 检测前后方向保持。
- `func_460` 把 `global168` 转成 `global167`，并读取 `0x60006, global142` 的 `0xf8b9b46e`、`0xf3b9ad85` 参数做平滑。

证据：`2.c:11052-11142`。

`func_463` 是飞行中方向双击/快速转向的关键点：

- 先用 `global162` 做冷却，未达到 `0x3e8` 不允许再次触发。
- 如果 `global122 & 0x200` 且 `global93 & 0x4`，进入一种前向/特殊机动。
- 如果 `global122 & 0x2` 且 `global93 & 0x3c`，说明飞行中检测到方向双击。
- 左右双击会分别设置：
  - `global168 = 3/4`
  - `global601 = 0x2328` 或 `0xffffdcd8`
  - `func_168(0x20000)`
  - `global598 = 0x12c`
  - `global599 = 0x61`
  - `func_69(0x26/0x27)`
  - `func_296(0x3e9, 0)`
  - `sys_46(0x5, 0, 0xa, 0)`
  - `sys_4C(0x8, 1)`
- 最后清掉 `global93`，避免重复触发。

证据：`2.c:11238-11299`。

## 移动参数与喷气消耗

当前能明确的是，飞机形态大量移动参数都从 `sys_0(0x60006, global142, fieldHash)` 读取。普通形态初始化和退出时使用：

```c
global142 = 0xc2b19d12;
```

证据：`2.c:25407-25421`，`2.c:29324-29330`。

另一个飞行相关流程会把 `global142` 改成：

```c
global142 = 0x577ef6d;
```

并同时进入 `0x1004000` 飞行控制状态。这个参数行很可能是某些飞机动作/特殊飞行武装的移动参数表。

证据：`2.c:27140-27167`。

### 重要反思：`0x60006` 必须跨到 speedparam 解释

`sys_0(0x60006, global142, 0x5e8caf43)` 这类调用，单看 MSC 只能知道“脚本在通过 `sys_0` 读取一个系统表”。真正知道它是 speedparam，以及第三个参数是什么字段，必须跨查资源字段映射：

- `docs/command_mapping.md` 把 `0x60006` 对应的字段组解释到 speedparam 语义。
- `0x5E8CAF43` 在 `command_mapping.md` 中映射为 `air_dash_duration_frame`。
- `0x5E8CAF43` 在 `param_field_analysis.md` 中也被归类为 frame 类字段，范围约 `[0,500]`。

所以这句更准确的读法是：

```c
global507 = sys_0(0x60006, global142, 0x5e8caf43);
```

```text
global507 = readSpeedParam(global142, air_dash_duration_frame)
```

三个参数的人话含义：

| 参数 | 角色 | 当前解释 |
|---|---|---|
| `0x60006` | 参数表 selector | speedparam / 移动参数表 |
| `global142` | entry key | 当前使用哪一套移动参数行，例如 `0xc2b19d12 = SKL_MOVE` |
| `0x5e8caf43` | field hash | `air_dash_duration_frame`，空中 dash / 飞行类移动持续帧参数 |

这是一条很重要的方法论结论：MSC 里的 `sys_0` 只暴露“查了哪个系统号、哪个 row、哪个 field hash”。字段名和真实用途来自资源层，不来自反编译 C 本身。后续做自动命名时，应把 `sys_0(0x60006, rowHash, fieldHash)` 渲染成 `readSpeedParam(rowName, fieldName)` 这种跨资源视图，而不是只在 C 里手动猜。

“喷气消耗减少”目前在 `2.c` 中还没有直接定位到扣减公式。最可靠的判断是：消耗差异可能来自两个地方：

- `global142` 指向不同 `0x60006` 参数行，飞行状态读取到不同速度/衰减/消耗相关参数。
- `sys_0(0x60000)` 只是入口处检查资源是否大于 0，真正扣减可能在系统层或资源表里，不一定在这份 C 里直接出现。

后续应优先追 `0x60000`、`0x60006`、`sys_46` 与资源表字段 hash 的实际含义。

## 动态命名建议

不要把命名绑死在 `func_450` 这种 offset 名上。建议建立 JSON overlay，把“证据”和“行为名”分开：

```json
{
  "unit": "delta_plus",
  "script": "2.c",
  "state": {
    "global143": {
      "name": "formState",
      "values": {
        "0": "normal",
        "1": "plane"
      },
      "evidence": ["2.c:29317", "2.c:29338", "2.c:2565"]
    },
    "global142": {
      "name": "movementParamRow",
      "values": {
        "0xc2b19d12": "normalMoveParams",
        "0x577ef6d": "planeOrSpecialFlightMoveParams"
      },
      "evidence": ["2.c:25411", "2.c:27142", "2.c:27166", "2.c:29329"]
    }
  },
  "actions": {
    "0x9475130e": {
      "name": "ACTION_TRANSFORM_DASH_ENTRY",
      "entry": "func_450",
      "meaning": "direction double-tap plus boost/resource gate starts transform/flight transition",
      "evidence": ["0.c:1852-1891", "0.c:560", "2.c:29430", "2.c:10775-10809"]
    },
    "0x77b100ff": {
      "name": "ACTION_PLANE_FLIGHT_LOOP",
      "entry": "func_452",
      "meaning": "continuous plane/flight control state",
      "evidence": ["2.c:29431", "2.c:10812-10905"]
    }
  },
  "forms": {
    "enterPlane": {
      "entry": "func_1037",
      "modelHash": "0xcb05586",
      "sets": {"global143": 1},
      "evidence": ["2.c:29304-29317"]
    },
    "exitPlane": {
      "entry": "func_1038",
      "modelHash": "0xab9c3043",
      "sets": {"global143": 0, "global142": "0xc2b19d12"},
      "evidence": ["2.c:29324-29344"]
    }
  }
}
```

这样后面 MSC offset 变化时，只要重新跑静态分析，把 hash、全局变量写入点、`sys_1/sys_0` 表项重新匹配，就能继续沿用“行为名”。真正稳定的锚点应该是 hash、系统调用、状态写入、模型 hash、参数行 hash，而不是 C 反编译出来的函数编号。

## 建议的下一步验证顺序

1. 以 `0x9475130e` 为入口，确认实机/日志中它是否只由“喷气 + 方向双击”触发，还是也被其它动作复用。
2. 追 `func_450 -> func_451` 完成后如何转入持续飞行入口 `func_452` 或形态 case `0x7`。
3. 给 `global143/global142/global87/global93/global122/global24` 建 overlay 名称。
4. 把 `0x60006` 参数字段 hash 列成表，优先标注 `0x5e8caf43`、`0xff7a9c8b`、`0x459455ea`、`0x6f6f1bf6`、`0x4d4b65ea`、`0x2d28cc4b`、`0x18895a55`、`0xf8b9b46e`、`0xf3b9ad85`、`0x9fd06227`。
5. 追 `sys_0(0x60000)` 的扣减位置，判断飞机模式“喷气消耗减少”是脚本参数造成，还是引擎系统根据形态状态处理。
