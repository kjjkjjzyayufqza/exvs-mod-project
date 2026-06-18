# `0xBDBE6FEA/2.c` 全文件地图

样本路径：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前扫描时间：2026-06-17。

## 样本体量

| 项 | 数值 | 说明 |
|---|---:|---|
| 行数 | 29,664 | 当前文件系统读取结果 |
| 函数定义 | 1,047 | `void` 921 个，`int` 126 个 |
| 第一个函数 | `main` at line 779 | 前面是 global / declaration 区 |
| 最后一个函数 | `func_1046` at line 29646 | 注册表尾部 |

你提到“整个 c 文件有 28,665 行”，当前实际读取是 29,664 行。这个差异可能来自编辑器显示、旧文件版本、或是否包含空行 / 头部声明的统计口径。后续笔记按当前磁盘文件为准。

## 顶层生命周期

### `main`：注册 callback，进入初始化和主循环

位置：`2.c:779-788`

```c
void main()
{
    sys_2(0, 0x8, func_3);
    sys_2(0, 0x6, func_26);
    sys_2(0, 0x7, func_27);
    func_1();
    global0 |= 0x1;
    callFunc3(func_4);
}
```

当前解释：

- `sys_2(0, 0x8, func_3)` 把 `func_3` 注册为帧级或域级 callback。
- `func_1()` 是真正初始化入口。
- `callFunc3(func_4)` 进入主循环 / action update loop。

### `func_1`：全局初始化 + depiction 初始化入口

位置：`2.c:789-842`

关键行为：

- 清零 `global1..global19` 等初始状态。
- 调 `func_61()`、`func_62()`、`func_386()`、`func_272()` 做大块 runtime 初始化。
- 用 `sys_1(0x10002, 0x2, hash, callback)` 注册少量基础 action handler。
- 调 `func_835()`、`func_836()` 注册 group `0x7/0x9` 资源表。
- 调 `func_877()` 进入表现层 shell 初始化。

当前命名建议：`initializeDepictionScriptRuntime`。

### `func_3`：每帧 callback runner

位置：`2.c:859-872`

```c
void func_3()
{
    if (global1)
    {
        (*global1)();
    }
    func_41();
    func_42();
    if (global2)
    {
        (*global2)();
    }
}
```

当前解释：

- `global1` 和 `global2` 是函数指针槽。
- `func_877` 会设置 `global1 = func_878`，而 `func_878` 调 `func_1040()`。
- 因此 `func_1040()` 不是孤立尾部函数，而是通过 `global1` 每帧参与维护 HUD / ammo / alternate mode 状态。

### `func_4`：主 action loop

位置：`2.c:873-1003`

开头调用：

```c
func_19();
func_879();
func_5();
func_11();
...
```

然后读取 `sys_0(0x10000, ...)` 的 action / input 状态。它不是直接的按钮读取层，而是消费更低层已经写好的 action 状态槽。

当前命名建议：`runDepictionActionUpdateLoop`。

## Action 分发主链

### `func_51`：推进当前 action hash

位置：`2.c:2724-2763`

关键语句：

```c
global8 = global4;
global4 = global6;
...
if (global4 == 0xffffffff || global4 == 0xfffffffe)
{
    func_53();
}
else
{
    func_52();
}
```

当前解释：

- `global6` 是 pending action hash。
- `global4` 是 active action hash。
- `global8` 是 previous action hash。

这些名字与已有 `docs/exvs-msc-input-action-weapon-pipeline.md` 的模型一致。

### `func_52`：由 action hash 查 callback 并调度

位置：`2.c:2765-2830`

关键语句：

```c
var4 = sys_0(0x10003, 0x2, global4);
if (var4)
{
    var5 = sys_0(0x10002, 0x2, global4);
}
sys_2(0, 0x3, var5);
```

当前解释：

- `sys_0(0x10003, 0x2, global4)` 检查 action hash 是否注册。
- `sys_0(0x10002, 0x2, global4)` 取 callback。
- `sys_2(0, 0x3, var5)` 调度 callback。

这条链说明 `func_1043` 里的 `func_241(hash, callback)` 是后续 ACTION 函数入口的来源。

## 注册表层

### `func_241`：action hash handler binder

位置：`2.c:6225-6253`

```c
void func_241(int arg0, int arg1)
{
    int var2;
    sys_1(0x10002, 0x2, arg0, arg1);
    var2 = sys_0(0x1000a, 0x2, arg0);
    if (arg1 != 0)
    {
        if (var2 == 0)
        {
            sys_1(0x10004, 0x2, arg0, 0x1);
        }
    }
    else if (var2 == 0x1)
    {
        sys_1(0x10005, 0x2, arg0);
    }
}
```

当前解释：

- `0x10002/0x2` 保存 action hash 到 callback 的映射。
- `0x10004/0x2` 像是注册存在标记。
- `func_242` 是对应 query helper。

### `func_1042`：注册表聚合入口

位置：`2.c:29405-29412`

```c
void func_1042()
{
    func_1043();
    func_1044();
    func_1045();
    func_1046();
}
```

当前解释：

- `func_1043`: action hash -> ACTION callback。
- `func_1044`: slot -> slot callback。
- `func_1045`: slot -> stance resource hash，group `0x3` / `0x4`。
- `func_1046`: group `0xb` extra/effect resource hash。

### `func_1043`：action hash registry

位置：`2.c:29413-29471`

当前样本里已经有部分人为注释，最重要的 ACTION 项：

| Hash | Callback | 当前语义 |
|---|---|---|
| `0xf48d2d49` | `ACTION_A_SHOT` | 射击 |
| `0x7158fa47` | `ACTION_A_SHOT_STATE_0` | 射击状态 0 |
| `0x700bb2c6` | `ACTION_CHARGE_SHOT_LOCK_SWITCH` | 蓄力射击换锁分支 |
| `0x31f61d6c` | `ACTION_AB_SUB` | 副射 |
| `0x6ab85f0d` | `ACTION_AB_SUB_DIRECTIONAL` | 副射方向分支 |
| `0x23df217e` | `ACTION_AC_SPECIAL_SHOT_DIRECTIONAL` | 特射方向分支 |
| `0x193fe550` | `ACTION_BC_SPECIAL_MELEE` | 特格 |
| `0x178d1109` | `ACTION_B_MELEE` | 近战 |
| `0x8ae55bb1` | `ACTION_ABC_FINAL_ATTACK` | 觉醒技 |

这说明 `2.c` 下半段不是随机函数堆，而是明显存在 action authoring table。

### `func_1044`：slot callback registry

位置：`2.c:29472-29529`

形态：

```c
sys_1(0x10001, 0x2, slot, func_xxx);
```

当前统计：48 条 group `0x2` 注册。

当前解释：

- group `0x2` 是 slot -> callback 表。
- `func_74/75/76/77/79` 这类动作播放 helper 会间接使用这些 slot 表。

### `func_1045`：stance resource hash registry

位置：`2.c:29530-29645`

形态：

```c
sys_1(0x10001, 0x3, slot, hash);
sys_1(0x10001, 0x4, slot, hash);
```

当前统计：

- group `0x3`: 55 条。
- group `0x4`: 55 条。

它和 `func_79` 的关系非常关键：

```c
var4 = sys_0(0x10001, 0x3 + global170, arg0);
if (var4 == 0)
{
    var4 = sys_0(0x10001, 0x3, arg0);
}
...
func_308(global20, var4, global171, arg1 * 0x64, arg2 * 0x64, arg3);
```

这证明 `global170` 不只是外观开关，它也会改变动作资源 hash 解析。

### `func_1046`：group `0xb` resource registry

位置：`2.c:29646-29664`

当前统计：15 条。

当前解释：

- group `0xb` 与 `sys_4F(0xb, ...)` 的资源设置很可能有关。
- `func_877`、`func_1037`、`func_1038` 都会写 `sys_4F(0xb, ...)`，说明这里属于 HUD / ammo / resource presentation 的一层。

## Depiction / shell 初始化层

### `func_877`：base shell initializer

位置：`2.c:25407-25430`

关键语句：

```c
sys_4B(0, 0xab9c3043);
global20 = sys_4B(0x1);
global142 = 0xc2b19d12;
sys_1(0x60008, 0x1b12ae7d);
sys_4F(0xb, 0, 0x1486a84f);
sys_4F(0xb, 0x1, 0x10b251b4);
sys_4F(0xb, 0x2, 0xa8e202bf);
...
global170 = 0;
func_887();
sys_4A(0xb, 0xb, 0);
func_1042();
func_183(0);
global1 = func_878;
func_1041();
```

当前解释：

- 激活基础 active shell `0xab9c3043`。
- 保存 active shell id 到 `global20`。
- 初始化 `sys_4F(0xb, ...)` 三个资源槽。
- 设置 `global170 = 0` 并应用默认 shell loadout。
- 调 `func_1042` 注册所有 action / slot / resource 表。
- 设置 `global1 = func_878`，让 `func_1040` 进入每帧维护链。

## `global170` 和 `global143`

### `global170`

当前赋值位置覆盖多类 ACTION：

- 初始化 / 回基础：`8145`、`25301`、`25313`、`25378`、`25422`、`25795`、`25878`、`25946` 等。
- 近战 / 变体切到 group `1`：`27369`、`27419`、`27479`、`27565`、`27628`、`27728`、`27957`、`28081`、`28431` 等。
- alternate shell 返回：`29341`。

当前结论：

- `global170 == 0`: 使用 group `0x3` 资源，同时 `func_887 -> func_888(0)`。
- `global170 == 1`: 使用 group `0x4` 资源，同时 `func_887 -> func_888(1)`。
- 因为 `func_79` 会用 `0x3 + global170`，所以它是 stance resource group selector。

### `global143`

关键赋值：

- `func_1037` at `2.c:29317`: `global143 = 0x1`
- `func_1038` at `2.c:29338`: `global143 = 0`
- `func_885` at `2.c:25513`: `global143 = 0`

关键读取：

- `func_882` / `func_883` 会读 `global143 == 1`。
- `func_921` 在 charge shot lock switch 里，如果 `global143 == 1`，会先 `func_888(0x8)` 回基础 shell。
- `func_1040` 只有 `global143 == 0` 时才执行部分 `sys_4F(0x16, ...)` 分支。

当前结论：

- `global143` 更像 alternate shell / ride / deploy mode flag。
- 不宜只叫“飞行状态”，因为它也影响 shell active entry 和 `sys_4F` 资源状态。

## Syscall 使用概览

### 全文件 syscall/subcmd 热点

| Syscall | 最高频 subcmd | 当前解释 |
|---|---|---|
| `sys_4B` | `0x1=221`, `0x2=37`, `0x3=17`, `0=3`, `0x4=1` | shell active entry 查询最多，其次是挂接 / 清空 |
| `sys_47` | `0x7=119`, `0=45`, `0x1=28`, `0x10=12`, `0x12=10` | 对象状态查询很频繁，TRS 控制是重点 |
| `sys_4F` | `0=77`, `0xd=17`, `0xb=11`, `0x16=4` | 武装 / ammo / resource trigger 高度相关 |

### 热点函数

| 类别 | 热点函数 | 说明 |
|---|---|---|
| `sys_4B` / `sys_47` 混合 | `func_395` / `func_400` | 通过 `sys_47(0/7/8, sys_4B(1))` 驱动阶段切换和动作状态 |
| `sys_4B` / `sys_47` 混合 | `func_574` | 多个阈值点触发 `func_910/911`，像时间/动作量阶段事件 |
| `sys_4F` | `func_922` | 52 次 `sys_4F`，按 `func_309(global20, time)` 多帧触发资源 |
| `sys_1` | `func_835` | 172 条 group `0x7` 资源注册 |
| `sys_1` | `func_1045` | 106 条 group `0x3/0x4` stance resource 注册 |
| `sys_0` | `func_825` / `func_824` | 大量读取 group `0x7`，像按状态选择资源集合 |

## `func_395` / `func_400` 为什么重要

`func_395` 是 `sys_4B/sys_47` 热点。它读取 active shell 状态：

```c
if (sys_47(0x7, sys_4B(0x1)))
{
    global159 = 0x1;
}
```

并通过 `func_396..399 -> func_400` 处理方向 / 阶段切换：

```c
var9 = var10 = sys_47(0, sys_4B(0x1)) / 0x64;
...
if (func_309(global20, arg3 * 0x64) || sys_47(0x7, sys_4B(0x1)))
{
    func_75(arg5);
}
if (sys_47(0x8, sys_4B(0x1)))
{
    ...
}
```

当前解释：

- 这里不是换装本体，但它证明 `sys_4B(1)` 返回的 active shell entry id 会作为 `sys_47` 对象 API 的目标。
- `sys_47(0/7/8, activeShell)` 是动作状态量 / 阈值 / 条件查询的重要组合。

## `func_922` 为什么重要

`func_922` 是 `sys_4F` 最高热点，位置 `2.c:25983-26227`。

它按一系列 `func_309(global20, time)` 时间点触发：

```c
if (func_309(global20, 0x898))
{
    sys_4F(0, 0x5, 0x574865f4);
}
...
if (func_309(global20, 0x8fc))
{
    sys_4F(0, 0x5, 0xb3cdf465);
}
```

当前解释：

- 这是典型的“动作时间线 -> 武装 / 表现资源触发”函数。
- `sys_4F(0, slot, hash)` 与 Notion 页面中“射击，args2 消耗哪个栏位弹药，args3 弹药 id”的经验一致。
- 后半段还出现 `sys_47(0x10, 0x689c17f5, ...)`，说明同一个 action timeline 可以同时触发武装资源和模型骨骼旋转。

## 当前分层地图

```text
文件层
  2.dscex / CDepictionScript domain

VM 层
  sys_0 / sys_1 / sys_2: registry, state query, callback scheduling
  sys_4B: active shell entry / shell component attach-clear
  sys_47: object query / TRS / shell-object control
  sys_4F: weapon-resource / ammo / HUD / charge-ish control

启动层
  main -> func_1 -> func_877

注册层
  func_1042 -> func_1043/1044/1045/1046
  func_835/836 -> group 0x7/0x9 large tables

分发层
  func_51/52 -> action hash callback
  func_241/242 -> bind/query action hash

动作层
  ACTION_* -> setup action runtime callbacks
  func_586/587/593/... -> common action runtime helpers

表现 / 换装层
  func_887/888 -> shell loadout selector / dispatcher
  func_896..908 -> shell component bundles
  func_1037/1038 -> alternate shell enter/return
```

更细的函数编号区段、热点函数和建议阅读路线见 [2.c 函数群与区段索引](./2c-function-clusters.md)。

## 当前研究结论

1. `func_887/888` 是 shell loadout 层，但不是最高层入口。
2. `func_877` 是当前样本最重要的表现层初始化入口。
3. `func_1042` 到 `func_1046` 解释了大量 action / slot / resource hash 的来源。
4. `global170` 同时影响外观 loadout 和动作资源 hash 解析，必须作为形态资源组 selector 看待。
5. `sys_4B(1)` 与 `sys_47(...)` 的组合是理解 active shell object 状态的关键。
6. `sys_4F(0, slot, hash)` 主要出现在 ACTION 时间线中，是武装 / 表现资源触发的核心线索。
