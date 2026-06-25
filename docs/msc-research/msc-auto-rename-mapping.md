# MSC Auto Rename Mapping

这份文档是 TestEditor 里 MSC 专属 stable overlay / legacy alias 的记录入口。

旧显示层曾直接把 `2.c` 改写成下面这种样子：

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
```

当前默认目标不是修改原始游戏符号，也不是给 `mscdec.py` 增加外部开关，而是让
TestEditor 生成并维护 `2.resolved.md` sidecar：`2.c` 保持 raw 反编译结果，
overlay 再按可验证证据把 `func_N`、action hash、slot、arms entry hash
叠加显示成更可读的 action / slot 信息。

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
| `src/page/TestEditor/utils/mscActionRename.ts` | legacy alias helper；只从旧 route 提取兼容提示，不再负责改写 raw `2.c`。 |
| `collectLegacyActionAliases(script0Content, script2Content)` | 从 `0.c func_143` 的旧 mask 路由提取 `ACTION_*` working alias。 |
| `src/page/TestEditor/utils/mscStableEvidence.ts` | 从 `0.c` / `2.c` 提取 stable registry evidence。 |
| `src/page/TestEditor/utils/mscParamLabelResolver.ts` | 从 `armsparam.bin` / `characterparam.bin` 解 label， enrich overlay。 |
| `src/page/TestEditor/utils/mscResolvedOverlay.ts` | 把 stable evidence 渲染成 `2.resolved.md`。 |
| `docs/msc-research/2c-function-role-map-for-modders.md` | 解释为什么不能持久绑定 `func_N`，以及怎样用 `.c` evidence shape 建立工作名。 |
| `docs/msc-research/func1044-simulated-renames.md` | `func_1044` slot callback 的 Auto Rename 期望输出。 |

## 多层 Mapping

MSC Auto Rename 至少要区分这些语义层。

| 层 | 典型形态 | 推荐符号前缀 | 说明 |
|---|---|---|---|
| action hash registry | `func_241(actionHash, callback)` | `ACTION_*` | 玩家输入 / 状态选择后的 action handler。 |
| lifecycle / init function | `func_1 -> func_877 -> func_1042` | `INIT_*` | 启动链、机体表现层初始化、注册表铺设；不是玩家动作。 |
| slot callback registry | `sys_1(0x10001, 0x2, slot, callback)` | `SLOT_CB_*` | action handler 内部请求的表现 slot callback。 |
| motion/resource registry | `sys_1(0x10001, 0x3/0x4, slot, hash)` | `RESOURCE_*` 或仅保留 hash | slot callback 最终选择的 motion / resource hash。 |
| weapon slot binding | `sys_4F(0xb, slot, armsEntryHash)` | `WEAPON_SLOT_*` | 当前形态的武装槽位到 `armsparam` entry 的绑定。 |

不要把 slot callback 直接命名成 action。一个 action handler 可能经过多个阶段，
也可能复用同一个 slot callback；反过来，同一个 slot callback 也可能被多个
slot 或多个 action 复用。

同理，不要把启动初始化函数命名成 `ACTION_*`。例如 `func_877` 在
`func_1 -> func_877` 启动链上执行，它不是德尔塔改飞机模式，也不是某个武装输入；
它是本机体 shell、weapon slot、默认 loadout、action/resource registry 的铺设入口。

## ArmsParam Label 证据层

`sys_4F(0xb, slot, armsEntryHash)` 是当前最直接的武装槽位绑定证据。
Auto Rename 不应该只显示裸 hash，而应该在当前 workspace 的 param 包里查
`armsparam.bin`，再解 `kind=7` 的 label 字段：

| armsparam field | hash | 作用 |
|---|---:|---|
| `action_label_offset` | `0xE6213731` | 指向 obfuscated action label，例如 `GUN_..._ASSIST`。 |
| `resource_label_offset` | `0xF3C4CAE9` | 指向 obfuscated resource label，例如 `CHR_...`。 |

解码规则已经存在于项目里：

```text
src-tauri/src/format/obf_string.rs
src/utils/obfString.ts
```

因此 overlay 的实现方向应该是：

1. 扫描 `2.c` 的 `sys_4F(0xb, slot, armsEntryHash)`。
2. 在当前 unit param 包的 `armsparam.bin` 中用 `entry_id == armsEntryHash` 查 row。
3. 读取 `0xE6213731` / `0xF3C4CAE9` 的绝对文件 offset。
4. 用 obfuscated string codec 解出 action/resource label。
5. 在 TestEditor 的 `2.resolved.md` sidecar 里显示 slot 注释或 overlay 名称。

示例输出风格：

```c
sys_4F(0xb, 0x2, WEAPON_SLOT_2_ASSIST); //GUN_015GNDMUC_004DELTPL_001_ASSIST
```

或者在不替换参数名时保守显示：

```c
sys_4F(0xb, 0x2, 0xa8e202bf); //slot2: GUN_015GNDMUC_004DELTPL_001_ASSIST
```

注意：不要把 param 包文件夹 hash 当作 arms entry id。比如：

| 机体 / 包 | param 包 | arms entry | 解码 label | 说明 |
|---|---:|---:|---|---|
| Delta Kai clone | `0x08248A8D` | `0xa8e202bf` | `GUN_015GNDMUC_004DELTPL_001_ASSIST` | 普通形态 slot 2 是 assist。 |
| Sazabi | `0xB9859587` | `0x44e2365f` | `GUN_017GYAKCH_002SAZABI_001_FUNNEL` | 真 funnel 的 arms entry。 |
| RX-78-2 | `0xA3D57845` | `0x8880b9cf` | `GUN_001GUNDAM_001GUNDAM_001_ASSIST` | armsparam 中存在 assist entry，但脚本 slot 绑定仍要以当前 `2.c` 为准。 |

这个 evidence layer 只负责“武装槽位是什么”。它不能直接证明 `sys_51`
最终生成哪个 projectile / UnitTask；当前自动 rename 先停在 MSC 层：
slot 绑定、arms entry label、`sys_4F` 扣槽、`sys_51` type/index。
真实发射实体先用代码注释记录为后续工作，不把 bulletparam 当作当前
auto rename 的输入源。

## `sys_1(0x60008, hash)`：characterparam entry selector

Delta Kai clone 的 slot 2 研究补了一条重要映射：

```c
sys_1(0x60008, 0x1b12ae7d);
```

`0x1b12ae7d` 不应直接当作神秘动作 hash。当前证据显示它是当前 Param 包
`characterparam.bin` 的 entry id。自动 overlay 应该这样解析：

1. 用当前 unit 的 Param 包找到 `characterparam.bin`。
2. 扫描 entry id 列表，找 `entry_id == 0x1b12ae7d`。
3. 读取该 entry 的 `0xE6213731` / `0xF3C4CAE9`。
4. 用 obfuscated string codec 解出 action/resource label。
5. 在 resolved view 中显示角色系统 selector 的含义。

示例：

```c
sys_1(0x60008, CHARACTER_ORDER_0); //ORDER_0 / CHR_015GNDMUC_004DELTPL_001
```

Delta Kai clone 当前 `0x08248A8D/characterparam.bin` 的证据：

| entry id | action label | resource label |
|---:|---|---|
| `0x1b12ae7d` | `ORDER_0` | `CHR_015GNDMUC_004DELTPL_001` |
| `0x6c159eeb` | `ORDER_1` | `CHR_015GNDMUC_004DELTPL_001` |
| `0xf51ccf51` | `ORDER_2` | `CHR_015GNDMUC_004DELTPL_001` |

这条 overlay 对 modding 很重要：外层 custom unit 可以叫
`026gnbelt_003delatkai_001`，但如果 `characterparam` 内部 label 还是
`CHR_015GNDMUC_004DELTPL_001`，native assist gate / 资源身份可能仍按原机体
处理。单看 `2.c` 看不出这个错位。

## Legacy Alias 规则（仅兼容层）

当前 `mscActionRename.ts` 的旧路径是从 `0.c func_143` 里的 `global48 & mask`
和 `func_95(hash, ...)` 推导武装输入语义。它现在只产出 legacy alias hint，
不再直接重写 raw `2.c`。

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

legacy alias 仍可在 overlay 中保留这种显示：

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
func_241(0x12345678, ACTION_AC_SPECIAL_SHOT_LOCK_SWITCH); //特射 换锁分支
```

这一层仍然有价值，但它不能覆盖德尔塔 Plus 变形这种不经过旧
`func_143/func_95` 路由的 action 族；缺失时必须允许 overlay 继续工作。

## 当前默认规则：Stable Overlay

当前默认规则应从证据图谱生成 resolved overlay，而不是只查字典、也不是改写 raw `2.c`。

推荐顺序：

1. 扫描 `0.c` 的 `sys_1(0x10000, 0x1, actionIndex, actionHash)`，得到
   `actionIndex -> actionHash`。
2. 扫描 `2.c` 的 `func_241(actionHash, callback)`，得到
   `actionHash -> actionHandler`。
3. 追踪 action handler 内部调用的 `func_69(slot)` / 等价 slot 请求。
4. 用 `sys_1(0x10001, 0x2, slot, callback)` 找到 slot callback。
5. 从 slot callback 里提取 `func_74/76(resourceIndex, ...)`、状态位、
   direction branch、shell / boost / guard / camera / ammo 证据。
6. 按当前 `.c` 的 action hash、slot、callback shape、置信度和证据决定显示名。

## 当前记录格式

不再为研究单独生成 mapping JSON。用 Markdown 保存可复查证据，按 stable key 优先：

| Kind | Stable key | Current symbol | Working name / legacy alias | Required evidence |
|---|---|---|---|---|
| Lifecycle | called from `func_1` | `func_877` | unit shell/resource initializer | calls `func_887/1042`; writes `global20/170/1`; contains `sys_4B/sys_4F` |
| Action | hash `0x9475130E` | `func_450` | transform dash entry (`ACTION_TRANSFORM_DASH_ENTRY` if kept as legacy alias) | action index `0x17`; slot `0x23`; callback `func_870`; resource `0x37` |
| Slot callback | registry `0x10001/0x2`, slot `0x23` | `func_870` | transform entry depiction | resource `0x37`; writes `global143` |

`func_N` 只能作为当前样本定位信息。真正可复用的是 action hash、registry 形态、
slot、resource index、常量集合和行为证据。

引用顺序固定：

1. `action hash` / registry key
2. `action index` / `slot`
3. 当前 `func_N`
4. legacy alias（如果存在）

## 当前确认示例

### 启动初始化链

`func_877` 的推荐 rename：

```c
void INIT_UNIT_SHELL_RESOURCE_ACTION_TABLES()
```

中文显示：

```text
本机 shell / 武装槽 / 默认外观 / action-resource 表初始化
```

证据：

| 当前符号 | 建议 symbol | semanticId | 中文注释 | 证据 |
|---|---|---|---|---|
| `func_877` | `INIT_UNIT_SHELL_RESOURCE_ACTION_TABLES` | `depiction.unitShellResourceInitializer` | 本机 shell / 武装槽 / 默认外观 / action-resource 表初始化 | `func_1 -> func_877`，`sys_4B(0,0xab9c3043)`，`global20=sys_4B(1)`，`sys_4F(0xb,0/1/2,...)`，`global170=0`，`func_887()`，`func_1042()`，`global1=func_878`。 |

保守短名可以是：

```c
void INIT_UNIT_SHELL_RESOURCE_TABLES()
```

但当前更推荐长名，因为它明确包含 `func_1042()` 注册 action/resource tables，
能避免误读成“只挂模型 shell”。

### 通用武装输入

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
```

这类名称来自旧 action-mask route。它适合武装按钮输入，但现在只算
legacy alias；引用时仍然要先写当前 `action hash`，再补当前 `0.c` / `2.c`
绑定证据。

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
- 不把 `ACTION_*` 当成主键；没有 hash / slot / registry 证据时，不单独引用 alias。
- 不把 `command_mapping.md` 当成 MSC action / slot 命名表。
- 不用 `--exvsMapping` 承担 TestEditor rename 职责。
- 不因为某个 hash 有一个猜测名，就跳过输入、handler、slot、resource 的闭环验证。

## 相关文档

- [MSC Research 阅读入口](./README.md)
- [2.c 函数角色地图](./2c-function-role-map-for-modders.md)
- [`func_1044` slot callback 全链路逆向](./func1044-slot-callback-atlas.md)
- [`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)
- [MSC Auto-Rename 外部文件分析](../agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md)
