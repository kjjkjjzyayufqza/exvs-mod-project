# MSC Auto Rename Mapping

这份文档是 TestEditor 里 MSC 专属 Auto Rename 的 mapping 记录入口。

它负责记录类似下面这种显示层改写：

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
```

这里的目标不是修改原始游戏符号，也不是给 `mscdec.py` 增加外部开关，而是让
TestEditor 在打开当前 MSC workspace 时，按可验证证据把 `func_N` 和 hash
叠加显示成更可读的 action / slot 名称。

## 文档边界

不要把这类内容写进 `docs/command_mapping.md`。

`command_mapping.md` 更适合记录 native command、param field、资源字段这类
通用映射；MSC Auto Rename 是脚本图谱层的语义显示规则。它需要同时看
`0.c` 输入层、`2.c` action registry、slot callback registry、resource
registry 和人工确认 overlay，不能只靠一个命令字段表。

这套规则也不走 `--exvsMapping`。`--exvsMapping` 属于反编译 / 重编译时的
native-truth 辅助层；TestEditor 的 Auto Rename 应该在编辑器自己的 utility
中完成。

当前相关入口：

| 入口 | 角色 |
|---|---|
| `src/page/TestEditor/utils/mscActionRename.ts` | 当前已实现的旧 action-mask rename utility。 |
| `renameScript2CallbacksByActionMask(script0Content, script2Content)` | 从 `0.c func_143` 的 mask 路由推导 `ACTION_*` 名称，再改写 `2.c` 的 `func_241` 绑定显示。 |
| `docs/msc-research/dynamic-naming-overlay.md` | 解释为什么不能持久绑定 `func_N`，以及 overlay / resolved view 的总体方案。 |
| `docs/msc-research/func1044-simulated-renames.md` | `func_1044` slot callback 的 Auto Rename 期望输出。 |

## 三层 Mapping

MSC Auto Rename 至少要区分三张表。

| 层 | 典型形态 | 推荐符号前缀 | 说明 |
|---|---|---|---|
| action hash registry | `func_241(actionHash, callback)` | `ACTION_*` | 玩家输入 / 状态选择后的 action handler。 |
| slot callback registry | `sys_1(0x10001, 0x2, slot, callback)` | `SLOT_CB_*` | action handler 内部请求的表现 slot callback。 |
| motion/resource registry | `sys_1(0x10001, 0x3/0x4, slot, hash)` | `RESOURCE_*` 或仅保留 hash | slot callback 最终选择的 motion / resource hash。 |

不要把 slot callback 直接命名成 action。一个 action handler 可能经过多个阶段，
也可能复用同一个 slot callback；反过来，同一个 slot callback 也可能被多个
slot 或多个 action 复用。

## 当前旧 Rename 规则

当前 `mscActionRename.ts` 的旧路径是从 `0.c func_143` 里的 `global48 & mask`
和 `func_95(hash, ...)` 推导武装输入语义。

现有固定 mask 语义包括：

| mask | symbol stem | 中文注释 |
|---|---|---|
| `0x1` | `A_SHOT` | 射击 |
| `0x2` | `B_MELEE` | 近战 |
| `0x80` | `AB_SUB` | 副射 |
| `0x100` | `AC_SPECIAL_SHOT` | 特射 |
| `0x200` | `BC_SPECIAL_MELEE` | 特格 |
| `0x400` | `ABC_FINAL_ATTACK` | 觉醒技 |
| `0x800` | `CHARGE_SHOT` | 蓄力射击 |

输出应保持这种风格：

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
func_241(0x12345678, ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH); //特射 换锁分支
```

这一层仍然有价值，但它不能覆盖德尔塔 Plus 变形这种不经过旧
`func_143/func_95` 路由的 action 族。

## 新 Rename 规则

新规则应从证据图谱生成候选名，而不是只查字典。

推荐顺序：

1. 扫描 `0.c` 的 `sys_1(0x10000, 0x1, actionIndex, actionHash)`，得到
   `actionIndex -> actionHash`。
2. 扫描 `2.c` 的 `func_241(actionHash, callback)`，得到
   `actionHash -> actionHandler`。
3. 追踪 action handler 内部调用的 `func_69(slot)` / 等价 slot 请求。
4. 用 `sys_1(0x10001, 0x2, slot, callback)` 找到 slot callback。
5. 从 slot callback 里提取 `func_74/76(resourceIndex, ...)`、状态位、
   direction branch、shell / boost / guard / camera / ammo 证据。
6. 按 overlay 中的 `semanticId`、置信度、证据规则决定显示名。

## 建议 JSON 结构

后续如果要把这份文档落成实际数据文件，可以使用类似结构：

```json
{
  "schema": "exvs.msc.auto_rename_mapping.v0",
  "sample": {
    "packHash": "0xBDBE6FEA",
    "scriptIndex": 2
  },
  "actions": [
    {
      "actionHash": "0x9475130e",
      "semanticId": "action.transform.entry",
      "symbol": "ACTION_TRANSFORM_DASH_ENTRY",
      "displayNameCn": "变形突入 / 飞机模式入口",
      "confidence": "high",
      "evidence": {
        "actionIndex": "0x17",
        "handler": "func_450",
        "slotIds": ["0x23"],
        "slotCallbacks": ["func_870"],
        "resourceIndices": ["0x37"]
      }
    }
  ],
  "slotCallbacks": [
    {
      "registry": "0x10001/0x2",
      "slot": "0x23",
      "semanticId": "depiction.slot.transform.entry",
      "symbol": "SLOT_CB_TRANSFORM_ENTRY",
      "displayNameCn": "变形进入表现",
      "confidence": "high",
      "evidence": {
        "callback": "func_870",
        "resourceIndices": ["0x37"],
        "stateWrites": ["global143"]
      }
    }
  ]
}
```

注意：`handler`、`callback` 里的 `func_N` 只能作为当前样本定位信息。
真正可复用的是 `actionHash`、registry 形态、slot、resource index、
常量集合和行为证据。

## 当前确认示例

### 通用武装输入

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
```

这类名称来自旧 action-mask route。它适合武装按钮输入，但仍然要以当前
`0.c` 和 `2.c` 的实际绑定为准。

### 德尔塔 Plus 变形 action 族

| action hash | 建议 symbol | 中文注释 | 证据 |
|---|---|---|---|
| `0x9475130e` | `ACTION_TRANSFORM_DASH_ENTRY` | 变形突入 / 飞机模式入口 | `0.c` action index `0x17`，`2.c` handler 进入 slot `0x23`，slot callback 切飞机形态。 |
| `0x77b100ff` | `ACTION_PLANE_FLIGHT_LOOP` | 飞机模式持续飞行控制 | handler 进入 slot `0x24`，slot callback 循环飞机飞行动作。 |
| `0xa02d57dc` | `ACTION_TRANSFORM_RELEASE` | 变形解除 / 恢复普通形态 | handler 进入 slot `0x25`，slot callback 恢复普通装配并转入空中下落。 |

对应的 slot callback 显示层可以写成：

```c
sys_1(0x10001, 0x2, 0x23, SLOT_CB_TRANSFORM_ENTRY); //变形进入表现
sys_1(0x10001, 0x2, 0x24, SLOT_CB_TRANSFORM_FLIGHT_LOOP); //飞机模式持续飞行表现
sys_1(0x10001, 0x2, 0x25, SLOT_CB_TRANSFORM_RELEASE); //变形解除表现
```

### 禁用 action

如果当前机体把某个 action hash 绑定为 `0`，不要强行显示成可执行函数：

```c
func_241(0x9475130e, 0); //disabled: 变形突入 / 飞机模式入口
```

这对 RX-78-2 这类不可变形机体很重要：它们可能保留相同输入 / action
框架位置，但没有安装对应 handler 和 slot callback。

## 维护规则

新增命名时按这个顺序写证据：

1. 当前样本里的注册行：action hash、slot、resource index。
2. 上游输入或状态证据：按钮、方向、boost、guard、result、shell 等。
3. 下游行为证据：speed_param、syscall、motion resource、ammo、camera、shell。
4. 跨机体验证：启用、禁用、相同 hash 不同 callback、相同 slot 不同 callback。
5. 置信度：`high`、`medium`、`low`，低置信名称必须带 `LIKELY` 或 `UNCONFIRMED`。

禁止事项：

- 不把 `func_N` 作为跨版本主键。
- 不把 `command_mapping.md` 当成 MSC action / slot 命名表。
- 不用 `--exvsMapping` 承担 TestEditor rename 职责。
- 不因为某个 hash 有一个猜测名，就跳过输入、handler、slot、resource 的闭环验证。

## 相关文档

- [MSC Research 阅读入口](./README.md)
- [动态命名与 JSON overlay 方案](./dynamic-naming-overlay.md)
- [`func_1044` slot callback 全链路逆向](./func1044-slot-callback-atlas.md)
- [`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)
- [MSC Auto-Rename 外部文件分析](../agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md)
