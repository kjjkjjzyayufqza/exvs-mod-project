# `func_887` / `func_888` Shell Loadout 研究

样本：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

本文是 [2.c 全文件地图](./2c-whole-file-map.md) 的专题页，只聚焦 `func_887` / `func_888` 及其周边组件挂接逻辑。

## 一句话结论

`func_887()` 是默认 shell loadout selector；`func_888(arg0)` 是 shell loadout dispatcher。

它们本身不是最高层“换装系统入口”。更高层入口是：

```text
main
  -> func_1
  -> func_877
  -> global170 = 0
  -> func_887()
  -> func_1042()
```

后续 ACTION 函数会不断修改 `global170` / `global143`，再调 `func_887()` 或 `func_888(n)` 同步外观和资源组。

## `sys_4B` 背景

来自 Notion MSC 页和项目文档 [../exvs-msc-syscall-4b-notes.md](../exvs-msc-syscall-4b-notes.md) 的当前解释：

| 调用形式 | 当前语义 |
|---|---|
| `sys_4B(0, entry_id)` | 激活 / 选择 shell entry |
| `sys_4B(1)` | 返回 active shell entry id |
| `sys_4B(2, entry_id, ..., resource_id, optional_parent)` | 创建 / 配置 / 挂接 shell entry |
| `sys_4B(3)` | 清空全部 shell entries |
| `sys_4B(3, entry_id)` | 清空指定 shell entry |
| `sys_4B(4, entry_id)` | 判断 shell entry 是否存在 |

因此 `func_889..895` 中的核心模式可以读成：

```text
clear old shell entries
  -> attach component bundle A/B/C
  -> attach effect / weapon / accessory entries
  -> apply sys_47 TRS or sys_4A effect operations
```

## `func_887`

位置：`2.c:25522-25533`

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
applyDefaultShellLoadoutForStance
```

解释：

- `global170 == 0` 时默认应用 `func_888(0)`。
- `global170 != 0` 时默认应用 `func_888(1)`。
- 它只负责默认分支；其他状态可以直接调用 `func_888(2..8)`。

## `func_888`

位置：`2.c:25534-25573`

分发表：

| `arg0` | 目标函数 | 当前解释 |
|---:|---|---|
| `0` | `func_889` | 基础 loadout 0 |
| `1` | `func_890` | 基础 loadout 1 / stance group 1 默认外观 |
| `2` | `func_891` | 减少 backpack 组件的变体 |
| `3` | `func_892` | 基础 backpack + effect 变体 |
| `4` | `func_893` | 基础 backpack + extra parts + 空 effect stub |
| `5` | `func_894` | 基础 backpack + scaled shell part |
| `6` | `func_895` | loadout 5 的进一步缩放清零变体 |
| `7` | `func_1037` | 进入 alternate shell mode |
| `8` | `func_1038` | 回到 base shell mode |

当前命名建议：

```text
dispatchShellLoadout
```

## Loadout 分支

### `func_889`: base loadout 0

位置：`2.c:25574-25583`

行为：

- `sys_4B(3)` 清空全部 shell entries。
- 打开 `sys_4A(0x1, 0x8, 0/1, 0x1)`。
- 调 `func_896()`、`func_899()`、`func_907()`。
- 调 `func_141(0x7e)`。

当前解释：

```text
基础 stance 的完整 backpack / funnel / extra parts loadout。
```

### `func_890`: base loadout 1

位置：`2.c:25585-25593`

行为：

- `sys_4B(3)` 清空全部 shell entries。
- 只打开 `sys_4A(0x1, 0x8, 0x1, 0x1)`。
- 调 `func_897()`、`func_904()`、`func_907()`。
- 调 `func_141(0)`。

当前解释：

```text
global170 != 0 的默认外观组合。
```

### `func_891` 到 `func_895`

| 函数 | 特征 | 当前解释 |
|---|---|---|
| `func_891` | `func_898 + func_905 + func_907` | 缺少若干 backpack component 的 loadout |
| `func_892` | `func_896 + func_907 + func_906` | 基础 backpack，叠加一组 `sys_4A` effect |
| `func_893` | `func_896 + func_899 + func_907 + func_908` | 类似 loadout 0，但尾部 `func_908` 当前为空 |
| `func_894` | `func_896 + func_901 + func_907` | 挂接 `0x6baa794a` 并设置 TRS |
| `func_895` | `func_894` 基础上对三个 key 缩放清零 | 可能是大型武装展开 / 收束中的特殊姿态 |

## 组件包函数

### `func_896`: base backpack and funnels

位置：`2.c:25643-25654`

关键条目：

| Entry | Resource / key | Parent | 说明 |
|---|---|---|---|
| `0x8311e848` | `0xc215da9f`, `0x64a55d6c` | body default | 主 backpack root 候选 |
| `0x220c9959` | `0xa057cc6b`, `0x4094b0f4` | `0x8311e848` | 子组件 |
| `0xbb05c8e3` | `0x5a58f108`, `0x4094b0f4` | `0x8311e848` | 子组件 |
| `0xd2a2e195` | `0x56f55afb`, `0x4094b0f4` | `0x8311e848` | 子组件 |
| `0x4babb02f` | `0xacfa6798`, `0x4094b0f4` | `0x8311e848` | 子组件 |
| `0x10B0AAAA` | `0xD50F498E`, `0x4094b0f4` | none | 注释：connect funnel to backpack |
| `0x11B0AAAA` | `0x2F0074ED`, `0x4094b0f4` | none | 注释：connect funnel to backpack |

当前解释：

```text
挂接基础 backpack root、多个子部件，以及两个 funnel connector entry。
```

### `func_897` / `func_898`: base component variants

- `func_897` 少了 `0x220c9959`。
- `func_898` 少了 `0x220c9959` 和 `0xbb05c8e3`。

当前解释：

```text
它们不是新系统，而是同一 backpack/funnel 组件包的裁剪版。
```

### `func_899` / `func_900`: extra shell parts

`func_899`：

```c
sys_4B(0x2, 0xe712a8e6, 0x19, 0x4094b0f4);
sys_4B(0x2, 0xa0eb8445, 0xf7cfb1f8, 0x4094b0f4, 0xe712a8e6);
```

`func_900`：

```c
sys_4B(0x3, 0xe712a8e6);
```

当前解释：

- `func_899` 挂接额外武装 / 附属部件。
- `func_900` 清掉 `0xe712a8e6` 这一组。

### `func_901`: scaled shell part

位置：`2.c:25694-25699`

```c
sys_4B(0x2, 0x6baa794a, 0x19, 0x4094b0f4);
sys_47(0x12, 0x6baa794a, 0x69261cfb, 0x64, 0x64, 0x64, 0);
sys_47(0x10, 0x6baa794a, 0x5d76bbc3, 0, 0, 0, 0x3e8);
```

结合 [../exvs-msc-syscall-47-notes.md](../exvs-msc-syscall-47-notes.md)：

- `sys_47(0x10, ...)` = rotate。
- `sys_47(0x12, ...)` = scale。

当前解释：

```text
挂接 entry 0x6baa794a，并对其骨骼/部件做缩放和旋转初始化。
```

## Alternate shell enter / return

### `func_1037`: enter alternate shell mode

位置：`2.c:29304-29322`

关键行为：

- 清空 shell entries。
- 激活 `0xcb05586`。
- `global20 = 0xcb05586`。
- 写 group `0x3/0x4` 的 slot `0x1` 和 `0x13` 为 `0xa8c15086`。
- 写 `sys_4F(0xb, ...)` 资源。
- `global143 = 1`。

当前命名建议：

```text
enterAlternateShellMode
```

### `func_1038`: return base shell mode

位置：`2.c:29324-29344`

关键行为：

- `sys_4B(0, 0xab9c3043)` 回到基础 active shell。
- `global20 = 0xab9c3043`。
- `func_1045()` 恢复 stance resource hash table。
- 写回 `sys_4F(0xb, ...)` 基础资源。
- `global143 = 0`。
- `global170 = 0`。
- `func_887()` 重建默认 loadout。
- `func_1040()` 立即刷新 HUD / ammo 状态。

当前命名建议：

```text
returnBaseShellMode
```

## `global170` 在 ACTION 中的证据

`ACTION_A_SHOT` 的初始化链中：

```c
global170 = 0;
func_887();
```

普通近战相关路径中多次出现：

```c
if (global170 == 0)
{
    sys_58(0, 0x28040319);
}
global170 = 0x1;
func_887();
```

这说明：

- 射击类 action 往往回基础 stance。
- 近战类 action 往往切到 stance group 1。
- 切换 stance 后马上 `func_887()`，所以外观和资源组是同步更新的。

## 工作模型

```text
ACTION_* callback
  -> setup runtime callbacks / timing
  -> maybe set global170
  -> maybe set global143 / global20
  -> func_887() or func_888(n)
  -> sys_4B(3) clear entries
  -> sys_4B(2, ...) attach entries
  -> sys_47(0x10/0x12, ...) apply TRS
  -> sys_4A / sys_4F update effect and weapon presentation
```

## 后续优先验证

1. 把 `0x8311e848`、`0x220c9959`、`0xbb05c8e3`、`0xd2a2e195`、`0x4babb02f` 对到实际模型 / 部件名。
2. 确认 `0x10B0AAAA`、`0x11B0AAAA` 是原始 entry id 还是改造时引入的 funnel connector id。
3. 逐个定位 `func_888(2..6)` 的调用 action，给每个 loadout 对上游戏内动作。
4. 用运行时测试确认 `global143` 是否只表示 alternate shell，还是还包含 ride / deploy 状态。

