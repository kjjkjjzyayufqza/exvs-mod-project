# EXVS MSC `func_887` / `func_888` 换装流程笔记

## 背景

样本路径：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

当前分析对象是 `2.c` 中的 `func_887` / `func_888` 一组函数。按照本项目 MSC 工作区约定，`2.c` 来自 `2.dscex`，属于 Depiction / 表现脚本层。因此这组逻辑优先理解为：

- shell entry / 表现组件切换
- 模型挂接与卸下
- 动作表现状态同步
- 与武装 HUD、弹药、特效、骨骼控制联动

而不是底层输入判定或玩法核心逻辑本身。

## 当前一句话结论

`func_887()` 是默认形态选择器；`func_888(arg0)` 是真正的换装 / 外观组件分发表。

`global170` 同时影响：

- 当前外观组件组合
- 动作资源 hash 表选择：`sys_0(0x10001, 0x3 + global170, slot)`

所以 `global170` 不应只理解成显示开关，更像“当前动作/形态资源组”。

## 核心函数

### `func_887`

位置：

```text
2.c:25522
```

逻辑：

```c
void func_887()
{
    if (global170 == 0)
    {
        func_888(0);
    }
    else
    {
        func_888(0x1);
    }
}
```

当前命名建议：

```text
applyDefaultShellByStance
```

含义：

- `global170 == 0` 时应用基础外观组合
- `global170 != 0` 时应用另一套外观组合

### `func_888`

位置：

```text
2.c:25534
```

逻辑：

```c
func_888(0) -> func_889()
func_888(1) -> func_890()
func_888(2) -> func_891()
func_888(3) -> func_892()
func_888(4) -> func_893()
func_888(5) -> func_894()
func_888(6) -> func_895()
func_888(7) -> func_1037()
func_888(8) -> func_1038()
```

当前命名建议：

```text
applyShellLoadout
```

## `sys_4B` 在这里的含义

当前项目文档已记录 `sys_4B` 属于 `CDepictionScript` / `CShellAbstract` 侧的 shell entry 控制入口。

当前可用解释：

| 调用形式 | 暂定语义 |
|---|---|
| `sys_4B(0, entry_id)` | 激活 / 选择 shell entry |
| `sys_4B(1)` | 返回当前 active shell entry id |
| `sys_4B(2, entry_id, ..., resource_id, optional_parent)` | 配置或创建 shell entry |
| `sys_4B(3)` | 清空全部 shell entries |
| `sys_4B(3, entry_id)` | 清空指定 shell entry |
| `sys_4B(4, entry_id)` | 判断 shell entry 是否存在 |

2026-07-05 修正：`sys_4B(0x2, model_id, bone_hash, action_hash[, parent])`
里的 `bone_hash` 来自目标模型自己的 `.jnttbl`，不是 `.shl` 的 `model_type`。跨机体
移植时不能直接复用另一个模型的 bone hash；目标模型没有对应 bone 证据时，先用 `0`
或重新从目标模型 `.jnttbl` 取值。

因此 `func_889` 到 `func_895` 中反复出现的模式：

```c
sys_4B(0x3);
...
sys_4B(0x2, ...);
```

可以读成：

```text
先清空旧组件，再按当前形态重建一组 shell entries。
```

## `func_889` 到 `func_895` 的当前理解

这些函数是不同 loadout 组合。

### `func_889`

特征：

- 清空全部 shell entry
- 打开 `sys_4A(0x1, 0x8, 0, 0x1)` 与 `sys_4A(0x1, 0x8, 0x1, 0x1)`
- 调用：
  - `func_896()`
  - `func_899()`
  - `func_907()`
  - `func_141(0x7e)`

暂定语义：

```text
基础形态 loadout 0。
```

### `func_890`

特征：

- 清空全部 shell entry
- 打开 `sys_4A(0x1, 0x8, 0x1, 0x1)`
- 调用：
  - `func_897()`
  - `func_904()`
  - `func_907()`
  - `func_141(0)`

暂定语义：

```text
基础形态 loadout 1，和 global170 != 0 的默认外观相关。
```

### `func_891` 到 `func_895`

这些分支多用于动作中特定姿态或武装状态。

需要继续确认：

- `arg0 == 2` 是否对应某个近战派生状态
- `arg0 == 3` 是否对应近战派生或特殊格斗状态
- `arg0 == 6` 是否是大型武装展开状态
- `arg0 == 7 / 8` 是否是大模式进入 / 退出

## 小组件包

### `func_896`

位置：

```text
2.c:25643
```

特征：

```c
sys_4B(0x2, 0x8311e848, ...);
sys_4B(0x2, 0x220c9959, ..., 0x8311e848);
sys_4B(0x2, 0xbb05c8e3, ..., 0x8311e848);
sys_4B(0x2, 0xd2a2e195, ..., 0x8311e848);
sys_4B(0x2, 0x4babb02f, ..., 0x8311e848);
sys_4B(0x2, 0x10B0AAAA, 0xD50F498E, 0x4094b0f4);
sys_4B(0x2, 0x11B0AAAA, 0x2F0074ED, 0x4094b0f4);
```

原代码已有注释：

```text
connect funnel to backpack
```

暂定语义：

```text
挂接基础 backpack / funnel 组件组。
```

### `func_897`

类似 `func_896`，但少了 `0x220c9959` 这一路主组件。

暂定语义：

```text
基础组件组的变体 A。
```

### `func_898`

类似 `func_896`，但进一步减少组件。

暂定语义：

```text
基础组件组的变体 B。
```

### `func_899`

特征：

```c
sys_4B(0x2, 0xe712a8e6, 0x19, 0x4094b0f4);
sys_4B(0x2, 0xa0eb8445, 0xf7cfb1f8, 0x4094b0f4, 0xe712a8e6);
```

暂定语义：

```text
挂接一组额外武装 / 附属部件。
```

### `func_900`

逻辑：

```c
sys_4B(0x3, 0xe712a8e6);
```

暂定语义：

```text
卸下 / 清空 entry 0xe712a8e6。
```

### `func_901`

特征：

```c
sys_4B(0x2, 0x6baa794a, 0x19, 0x4094b0f4);
sys_47(0x12, 0x6baa794a, 0x69261cfb, 0x64, 0x64, 0x64, 0);
sys_47(0x10, 0x6baa794a, 0x5d76bbc3, 0, 0, 0, 0x3e8);
```

暂定语义：

```text
挂接 entry 0x6baa794a，并设置其骨骼缩放 / 旋转参数。
```

## `func_1037` / `func_1038`

### `func_1037`

位置：

```text
2.c:29304
```

特征：

```c
sys_4B(0x3);
sys_4B(0, 0xcb05586);
global20 = 0xcb05586;
...
global143 = 0x1;
```

暂定语义：

```text
进入另一个大模式 / alternate shell mode。
```

### `func_1038`

位置：

```text
2.c:29324
```

特征：

```c
sys_4B(0, 0xab9c3043);
global20 = 0xab9c3043;
...
global143 = 0;
global170 = 0;
func_887();
```

暂定语义：

```text
回到基础 active shell，并重建默认 loadout。
```

## `global170` 的双重作用

`global170` 不只用于 `func_887()` 选择外观。

`func_79()` 中存在：

```c
var4 = sys_0(0x10001, 0x3 + global170, arg0);
if (var4 == 0)
{
    var4 = sys_0(0x10001, 0x3, arg0);
}
```

这说明：

- `global170 == 0`：使用 group `0x3`
- `global170 == 1`：使用 group `0x4`
- group `0x4` 没有值时回退到 group `0x3`

当前理解：

```text
global170 是动作资源组 / 形态组 selector。
```

它会让同一个动作 slot 解析到不同的动作 hash 或资源 hash。

## 与动作系统的关系

当前项目旧研究里已经确认一条动态链：

```text
action hash
  -> action callback
  -> slot callback
  -> func_74 / func_79
  -> sys_0(0x10001, 0x3 + global170, slot)
  -> final action/resource hash
```

所以 `func_887` / `func_888` 应放在这条链的“状态 / 外观 / 资源组同步层”理解。

## 典型场景

### 基础射击

`ACTION_A_SHOT` 相关初始化中：

```c
global170 = 0;
func_887();
```

当前理解：

```text
射击动作启动时强制回基础形态 loadout。
```

### 普通近战

普通近战入口附近：

```c
if (global170 == 0)
{
    sys_58(0, 0x28040319);
}
global170 = 0x1;
func_887();
```

当前理解：

```text
近战动作进入时切到 global170 = 1 的形态资源组，同时更新外观组件。
```

### 特殊形态进入 / 退出

`func_888(7)` 和 `func_888(8)` 分别进入 `func_1037` / `func_1038`。

当前理解：

```text
7 / 8 不是普通小组件状态，而是更大的 active shell 模式切换。
```

## 当前工作模型

```text
action hash
  -> ACTION_* callback
  -> 设置 global170 / global20 / global143
  -> func_887 或 func_888(n)
  -> sys_4B 清空并重建 shell entries
  -> sys_47 / sys_4A / sys_4F 调整骨骼、特效、武装表现
```

## 临时命名建议

| 原名 | 暂定名 |
|---|---|
| `func_887` | `applyDefaultShellByStance` |
| `func_888` | `applyShellLoadout` |
| `func_896` | `attachBaseBackpackAndFunnels` |
| `func_897` | `attachBaseBackpackVariantA` |
| `func_898` | `attachBaseBackpackVariantB` |
| `func_899` | `attachExtraShellParts` |
| `func_900` | `detachExtraShellParts` |
| `func_901` | `attachScaledShellPart_6baa794a` |
| `func_1037` | `enterAltShellMode` |
| `func_1038` | `returnBaseShellMode` |

这些名字只是讨论用，不是最终可提交命名。

## 待验证问题

1. `func_888(2)` 到 `func_888(6)` 分别对应哪些游戏内状态？
2. `0x8311e848`、`0x220c9959`、`0xbb05c8e3`、`0xd2a2e195`、`0x4babb02f` 对应的实际模型 / 部件名称是什么？
3. `0x10B0AAAA`、`0x11B0AAAA` 是否为人工改出来的 funnel entry id，还是原始资源里就存在？
4. `func_1037()` 中的 `0xcb05586` 和 `func_1038()` 中的 `0xab9c3043` 分别对应什么 active shell？
5. `global143` 是否稳定表示 alternate shell / ride / deploy 状态？
6. `sys_4A(0x1, 0x8, ...)`、`sys_4A(0xb, 0xb, ...)` 这些在当前换装流程中具体控制什么？
7. 哪些动作一定会把 `global170` 改回 `0`，哪些动作会保持 `1`？

## 后续讨论记录

后续我们可以按下面格式追加：

```text
日期：
观察：
证据位置：
结论：
置信度：
下一步：
```
