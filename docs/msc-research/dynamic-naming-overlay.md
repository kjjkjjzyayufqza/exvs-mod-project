# 动态命名与 JSON Overlay 方案

问题背景：

- `2.c` 是反编译结果。
- `func_887`、`func_888`、`global170` 这类名字不是原始源码名字。
- 后续 MSC 系统、offset、反编译切分方式变化后，`func_N` 很可能变化。
- 如果我们直接把 `func_888 = 换装系统` 写死，下一份样本就可能失效。

因此命名系统应该分成三层：

```text
generated analysis JSON     机器扫描出来的事实，不手改
user semantic overlay JSON  人工确认的语义标签，可维护
resolved view               每次对当前样本重新匹配后的可读结果
```

## 具体案例与相关入口

- [MSC Research 阅读入口](./README.md)
- [MSC Auto Rename Mapping](./msc-auto-rename-mapping.md)：专门记录
  `ACTION_A_SHOT); //射击` 这类 TestEditor MSC Auto Rename 显示规则。
- [`func_1044` slot callback 全链路逆向](./func1044-slot-callback-atlas.md)：保存
  slot callback 的输入、action、handler、resource 证据。
- [`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)：展示同一批证据在
  TestEditor Auto Rename 中应产生的函数名和置信度。
- [MSC Auto-Rename 外部文件分析](../agent-sessions/msc-workspace-redesign/auto-rename-external-file-analysis.md)：
  区分旧 action-mask rename、新 hash-dispatch rename 和外部资源边界。

## 不稳定 ID 与稳定证据

### 不稳定

这些只能作为弱证据：

- `func_N`
- global 编号
- 行号
- byte offset
- 当前反编译器生成的局部变量名

它们方便讨论，但不能作为跨版本主键。

### 稳定得多

这些可以作为强证据：

- 函数内部 syscall 形态：例如 `sys_4B(0x3)` 后接多条 `sys_4B(0x2, ...)`。
- 注册表形态：例如 `func_1043` 有大量 `func_241(hash, callback)`。
- 调用关系形态：例如 `func_1042 -> func_1043/1044/1045/1046`。
- 常量集合：例如 `0xab9c3043`、`0xcb05586`、`0x8311e848`。
- 表结构数量：例如 group `0x3/0x4` 各 55 条。
- 角色上下文：例如 `global170` 同时被 `func_887` 和 `func_79` 使用。

## 当前已落地目录结构

当前已经落地：

```text
tools/
  msc_c_static_analyzer.py

docs/msc-research/
  README.md
  2c-call-chain-runtime-flow.md
  generated-analysis-workflow.md
  2c-whole-file-map.md
  shell-loadout-func-887-888.md
  notion-msc-cross-reference.md
  dynamic-naming-overlay.md
  msc-auto-rename-mapping.md
  generated/
    0xBDBE6FEA-2.analysis.json
  overlays/
    0xBDBE6FEA-2.semantic-overlay.json
  resolved/
    0xBDBE6FEA-2.resolved-labels.md
```

其中：

- `generated/0xBDBE6FEA-2.analysis.json` 是机器扫描事实，不手改。
- `overlays/0xBDBE6FEA-2.semantic-overlay.json` 是当前样本第一批人工确认 semanticId。
- `resolved/0xBDBE6FEA-2.resolved-labels.md` 是给人读的当前样本解析视图。

后续如果要扩展成可批量处理多个 MSC 样本，可以再增加统一输出目录：

```text
analysis/msc/
  overlays/
    0xBDBE6FEA.2.dscex.labels.json
  resolved/
    0xBDBE6FEA.2.dscex.resolved.md
```

## Generated analysis JSON

机器扫描产物只记录事实。

当前生成命令：

```powershell
python tools\msc_c_static_analyzer.py 'E:\XB\解包\com\file\0xBDBE6FEA\2.c' --output docs\msc-research\generated\0xBDBE6FEA-2.analysis.json
```

当前样本快照：

```json
{
  "lineCount": 29664,
  "functionCount": 1047,
  "voidFunctionCount": 921,
  "intFunctionCount": 126,
  "actionFunctionCount": 21,
  "sha256": "1BE5DACB24FC6565680CC15C4B4045FEC80229E958D690E5AE8BABE973224589"
}
```

示例：

```json
{
  "schema": "exvs.msc.analysis.v0",
  "sample": {
    "packHash": "0xBDBE6FEA",
    "scriptIndex": 2,
    "domain": "dscex",
    "sourcePath": "E:\\XB\\解包\\com\\file\\0xBDBE6FEA\\2.c"
  },
  "stats": {
    "lineCount": 29664,
    "functionCount": 1047,
    "voidFunctionCount": 921,
    "intFunctionCount": 126
  },
  "functions": [
    {
      "id": "func_877",
      "startLine": 25407,
      "endLine": 25430,
      "calls": ["func_887", "func_1042", "func_183", "func_1041"],
      "syscalls": {
        "sys_4B": [
          {"subcmd": "0", "args": ["0xab9c3043"]},
          {"subcmd": "0x1", "args": []}
        ],
        "sys_4F": [
          {"subcmd": "0xb", "args": ["0", "0x1486a84f"]},
          {"subcmd": "0xb", "args": ["0x1", "0x10b251b4"]},
          {"subcmd": "0xb", "args": ["0x2", "0xa8e202bf"]}
        ]
      },
      "writes": [
        {"symbol": "global20", "value": "sys_4B(0x1)"},
        {"symbol": "global170", "value": "0"},
        {"symbol": "global1", "value": "func_878"}
      ],
      "constants": ["0xab9c3043", "0xc2b19d12", "0x1486a84f", "0x10b251b4", "0xa8e202bf"]
    }
  ]
}
```

注意：

- `id` 可以先放 `func_877`，但它只是当前样本内 ID。
- 真正跨版本匹配要靠 `syscalls`、`calls`、`writes`、`constants`、`tableShape`。

## Semantic overlay JSON

人工维护的语义标签只记录“如何识别一个角色”。

当前样本已经落地第一份实际 overlay：

- [0xBDBE6FEA-2.semantic-overlay.json](./overlays/0xBDBE6FEA-2.semantic-overlay.json)
- [0xBDBE6FEA-2.resolved-labels.md](./resolved/0xBDBE6FEA-2.resolved-labels.md)

这份 overlay 不是把 `func_1`、`func_888` 直接当成稳定名字，而是同时保存：

- `semanticId`：跨样本讨论时使用的稳定语义 ID。
- `currentSymbol/currentRange`：当前 `0xBDBE6FEA/2.c` 的临时定位。
- `match`：将来重新匹配时应该使用的 syscall、registry、call shape、constant set。
- `evidence`：为什么这个语义成立。
- `moddingUse`：模组开发时应该怎么用、哪里不该先改。

示例：

```json
{
  "schema": "exvs.msc.semantic_overlay.v0",
  "labels": [
    {
      "semanticId": "depiction.baseShellInitializer",
      "displayName": "base depiction shell initializer",
      "confidence": "high",
      "match": {
        "mustContainCalls": ["func_887", "func_1042"],
        "mustWrite": [
          {"symbolRole": "activeShellGlobal", "valuePattern": "sys_4B(0x1)"},
          {"symbolRole": "stanceGroupSelector", "constant": "0"}
        ],
        "mustContainSyscalls": [
          {"name": "sys_4B", "subcmd": "0", "constantArgs": ["0xab9c3043"]},
          {"name": "sys_4F", "subcmd": "0xb"}
        ],
        "constantSetAny": ["0xab9c3043", "0xc2b19d12"]
      }
    },
    {
      "semanticId": "depiction.shellLoadoutDispatcher",
      "displayName": "shell loadout dispatcher",
      "confidence": "high",
      "match": {
        "dispatchArgument": "arg0",
        "branchConstants": ["0", "0x1", "0x2", "0x3", "0x4", "0x5", "0x6", "0x7", "0x8"],
        "mustCallSemanticAny": [
          "depiction.enterAlternateShellMode",
          "depiction.returnBaseShellMode"
        ]
      }
    }
  ]
}
```

这类 overlay 的重点是：

- `semanticId` 稳定。
- `displayName` 可调整。
- `match` 是证据规则，不绑定单一 offset。

## Resolved view

每次对新样本运行分析后，生成一份 resolved view：

```json
{
  "schema": "exvs.msc.resolved_labels.v0",
  "sample": "0xBDBE6FEA/2.dscex",
  "resolvedAt": "2026-06-17",
  "matches": [
    {
      "semanticId": "depiction.baseShellInitializer",
      "currentFunction": "func_877",
      "confidence": "high",
      "evidence": [
        "calls func_887 and func_1042",
        "activates sys_4B(0, 0xab9c3043)",
        "writes global170 = 0",
        "writes global1 = func_878",
        "initializes sys_4F(0xb, 0/1/2, ...)"
      ]
    },
    {
      "semanticId": "depiction.shellLoadoutDispatcher",
      "currentFunction": "func_888",
      "confidence": "high",
      "evidence": [
        "arg0 dispatch 0..8",
        "branches 7 and 8 call alternate shell enter/return",
        "branches 0..6 call shell clear/rebuild loadout helpers"
      ]
    }
  ]
}
```

这个输出可以给 UI 或文档使用：

- UI 显示 `func_888 (shell loadout dispatcher)`。
- 文档引用 `semanticId`，而不是只写 `func_888`。

## 当前样本第一批 semantic labels

| semanticId | 当前函数 | 置信度 | 识别依据 |
|---|---|---|---|
| `depiction.entryPoint` | `main` | high | 注册 `func_3/26/27`，调用 `func_1`，`callFunc3(func_4)` |
| `depiction.initializer` | `func_1` | high | 全局初始化、基础 action 注册、调用 `func_877` |
| `depiction.frameCallbackRunner` | `func_3` | high | 调 `global1/global2` 函数指针和 `func_41/42` |
| `depiction.actionUpdateLoop` | `func_4` | medium | 主循环，读取 `sys_0(0x10000, ...)` action 状态 |
| `depiction.actionAdvance` | `func_51` | high | `global8=global4; global4=global6` |
| `depiction.actionDispatch` | `func_52` | high | `sys_0(0x10003/0x10002, 0x2, global4)` 后 `sys_2(..., var5)` |
| `depiction.actionHashBinder` | `func_241` | high | `sys_1(0x10002,0x2,hash,callback)` |
| `depiction.baseShellInitializer` | `func_877` | high | active shell、`global20`、`global170`、`func_887`、`func_1042` |
| `depiction.defaultShellLoadoutSelector` | `func_887` | high | `global170` -> `func_888(0/1)` |
| `depiction.shellLoadoutDispatcher` | `func_888` | high | `arg0` dispatch `0..8` |
| `depiction.baseBackpackBundle` | `func_896` | medium | 多条 `sys_4B(0x2, ..., parent 0x8311e848)` |
| `depiction.enterAlternateShellMode` | `func_1037` | high | active shell `0xcb05586`，`global143=1` |
| `depiction.returnBaseShellMode` | `func_1038` | high | active shell `0xab9c3043`，`global143=0`，`global170=0` |
| `depiction.registrationCoordinator` | `func_1042` | high | 调 `1043/1044/1045/1046` |
| `depiction.actionHashRegistry` | `func_1043` | high | 55 条 `func_241` |
| `depiction.slotCallbackRegistry` | `func_1044` | high | 48 条 group `0x2` slot callback |
| `depiction.slotCallbackLookup` | `func_69/70/72` | high | `sys_0(0x10001,0x2,slot)` 取函数指针后 `(*global223)()` |
| `depiction.stanceResourceRegistry` | `func_1045` | high | group `0x3/0x4` 各 55 条 |
| `depiction.extraResourceRegistry` | `func_1046` | medium | group `0xb` 15 条 |

上表是早期核心 label 列表。实际 JSON 目前已经扩展到启动、dispatch、shell、主射、援护、N 格、特格、branch、camera 等 31 个 label。阅读当前样本时优先看 resolved 视图；要新增跨样本规则时改 overlay JSON。

## Action hash 自动 Mapping

`func_241(hash, callback)` 是 `2.c` 里最适合自动 mapping 的入口。它把 action hash 绑定到表现脚本 callback：

```c
func_241(0xf48d2d49, ACTION_A_SHOT); //射击
```

`func_1044` 这类 slot callback 的重命名不写在 `command_mapping.md`。它属于 MSC
Auto Rename / semantic overlay 这条链，具体模拟结果见
[`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)。

MSC 专属 mapping 的维护入口是 [MSC Auto Rename Mapping](./msc-auto-rename-mapping.md)。
`command_mapping.md` 只作为 param/native command 字段参考，不负责 action hash 或
slot callback 的语义命名。

这种改写方式应该分成两层处理：

| 层 | 来源 | 作用 |
|---|---|---|
| 事实层 | 扫描 `func_241(hash, callback)` | 得到 hash、当前 callback、是否启用 |
| 语义层 | overlay / 人工确认 | 给 hash 命名成 `ACTION_*`，并生成中文注释 |

不要直接把某个 `func_N` 永久改名成语义名。正确做法是让 TestEditor 的 action rename 后处理生成/读取 action mapping，再由编辑器展示层把它渲染成 `ACTION_*` 和中文注释。

## Slot callback 自动 Mapping

`0x10001/0x2` 是另一张表，和 `func_241(actionHash, callback)` 不是同一层。当前德尔塔 Plus 样本中，`func_1044` 用 `sys_1(0x10001, 0x2, slot, callback)` 注册动作/动画槽回调；`func_69` 和 `func_70` 用 `sys_0(0x10001, 0x2, slot)` 取回调，并由 `func_72` 间接调用。

最小证据：

```c
// 注册：slot 0x23 -> func_870
sys_1(0x10001, 0x2, 0x23, func_870);

// 选择：当前动作把 slot 写成 0x23
global222 = 0x23;
global223 = sys_0(0x10001, 0x2, global222);

// 执行：sys_0 只是取函数指针，真正调用在这里
(*global223)();
```

因此命名时要区分两级：

| 层 | 表 | 例子 | 语义 |
|---|---|---|---|
| action hash 表 | `0x10002/0x2` | `0x9475130e -> func_450` | 输入/状态最终选择哪个 action callback |
| slot callback 表 | `0x10001/0x2` | `0x23 -> func_870` | action callback 内部选择哪个表现槽/形态槽回调 |

批判点：现在还不能把 `0x10001/0x2` 简化成“动画表”。它至少会触发表现回调、形态切换、资源/挂件处理；slot 名称需要由回调行为决定，例如 `0x23` 暂命名为 `TRANSFORM_ENTRY_SLOT` 比直接命名为“飞机动画”更稳。

当前德尔塔 Plus 样本的完整 slot callback 模拟命名表已经拆到
[`func1044-simulated-renames.md`](./func1044-simulated-renames.md)。后续 TestEditor
实现 Auto Rename 时，应把那份文档中的 `SLOT_CB_*`、`LIKELY`、`UNCONFIRMED` 规则
转成 overlay 条目，而不是扩展 command hash 表。

### 实现边界：不走 `--exvsMapping`

这套 action hash 自动 mapping 不使用 `mscdec.py` / `msclang.py` 的 `--exvsMapping` 参数。

`--exvsMapping` 是 native-truth / relocation 实验层，用于反编译、重编译时的原生符号和重定位辅助；它不应该承担 TestEditor 里的 action 命名职责。

当前 TestEditor 已经有独立的 action rename 入口：

```text
src/page/TestEditor/utils/mscActionRename.ts
  renameScript2CallbacksByActionMask(script0Content, script2Content)

src/page/TestEditor/components/msc-editor/MscWorkspaceView.tsx
  Rename Actions 按钮
  convertScriptCore() 反编译 2.c 后的 action-rename post pass
```

后续扩展变形 action 族时，应该改这里或新增同级 utility，例如：

```text
renameScript2CallbacksByActionMask
  + 内置/overlay action hash 表
  + 禁用 action 注释
  + 跨机体 action family 证据
```

而不是让用户在 MSC 编译/反编译命令里提供 `--exvsMapping`。

现有实现需要注意一个边界：它主要从 `0.c func_143` 的 `func_95(...)` 路由推导按键类 action。德尔塔 Plus 的变形输入来自 `0.c func_71 -> func_72 -> action index 0x17`，不一定经过 `func_143/func_95`。因此这组 hash 应作为 TestEditor rename utility 的第二类输入源：`action index table + func_241 registry + overlay confirmed names`。

### 自动提取规则

对每个 `2.c` 样本扫描 action registry：

```text
func_241(actionHash, callback)
```

生成事实记录：

```json
{
  "actionHash": "0x9475130e",
  "rawCallback": "func_450",
  "enabled": true,
  "source": "2.c:29430"
}
```

如果 callback 是 `0`，表示该机体没有启用这个 action：

```json
{
  "actionHash": "0x9475130e",
  "rawCallback": "0",
  "enabled": false,
  "source": "2.c:29838"
}
```

自动 mapping 时优先级建议：

1. 如果 callback 已经是 `ACTION_*`，直接保留，并读取行尾中文注释作为 `displayNameCn`。
2. 如果 callback 是 `0`，标记为 disabled，不生成可执行 action 名。
3. 如果 callback 是 `func_N`，不要直接改源码；先匹配 hash、相邻 action 族、跨机体启用差异、上游 `0.c` action index、函数 syscall/状态位形状。
4. 高置信度后，在 overlay 中给这个 hash 一个稳定 `semanticId` 和 `ACTION_*` 展示名。

### 建议 JSON 结构

```json
{
  "schema": "exvs.msc.action_mapping.v0",
  "actions": [
    {
      "actionHash": "0x9475130e",
      "semanticId": "action.transformDashEntry",
      "symbol": "ACTION_TRANSFORM_DASH_ENTRY",
      "displayNameCn": "变形突入 / 飞机模式入口",
      "confidence": "high",
      "enabledIn": {
        "0xBDBE6FEA": {
          "script": "2.c",
          "callback": "func_450",
          "evidence": ["2.c:29430", "2.c:10775-10809"]
        }
      },
      "disabledIn": {
        "0xF22E425D": {
          "script": "2.c",
          "evidence": ["2.c:29838"]
        }
      },
      "upstreamInput": {
        "script": "0.c",
        "actionIndex": "0x17",
        "evidence": ["0.c:560", "0.c:1852-1891"]
      }
    }
  ]
}
```

展示层可以把当前样本的注册表渲染成：

```c
func_241(0x9475130e, ACTION_TRANSFORM_DASH_ENTRY); //变形突入 / 飞机模式入口
func_241(0x77b100ff, ACTION_PLANE_FLIGHT_LOOP); //飞机模式持续飞行控制
func_241(0xa02d57dc, ACTION_TRANSFORM_RELEASE); //变形解除 / 恢复普通形态
```

如果当前机体禁用了 action，则保留禁用事实，不要强行替换成可执行 `ACTION_*`：

```c
func_241(0x9475130e, 0); //disabled: 变形突入 / 飞机模式入口
func_241(0x77b100ff, 0); //disabled: 飞机模式持续飞行控制
func_241(0xa02d57dc, 0); //disabled: 变形解除 / 恢复普通形态
```

### 当前确认的变形 action 族

这组 hash 的输入层在德尔塔 Plus 与 RX-78-2 中一致：`0.c` 都把 action index `0x17` 映射为 `0x9475130e`，并通过“资源可用 + 喷气/BD事件位 + 方向双击”判定返回该 action。差异在 `2.c` 的 `func_241` 注册表。

| action hash | 建议 symbol | 中文注释 | 德尔塔 Plus `0xBDBE6FEA/2.c` | RX-78-2 `0xF22E425D/2.c` | 置信度 |
|---|---|---|---|---|---|
| `0x9475130e` | `ACTION_TRANSFORM_DASH_ENTRY` | 变形突入 / 飞机模式入口 | `func_450` | `0` disabled | high |
| `0x77b100ff` | `ACTION_PLANE_FLIGHT_LOOP` | 飞机模式持续飞行控制 | `func_452` | `0` disabled | high |
| `0xa02d57dc` | `ACTION_TRANSFORM_RELEASE` | 变形解除 / 恢复普通形态 | `func_464` | `0` disabled | high |

证据：

- 德尔塔 Plus：`func_241(0x9475130e, func_450)`、`func_241(0x77b100ff, func_452)`、`func_241(0xa02d57dc, func_464)`。
- RX-78-2：`func_241(0x9475130e, 0)`、`func_241(0x77b100ff, 0)`、`func_241(0xa02d57dc, 0)`。
- 两者 `0.c` 都有 `sys_1(0x10000, 0x1, 0x17, 0x9475130e)` 与 `return sys_0(0x10000, 0x1, 0x17)`。

因此这组命名不能只靠 `0.c` 输入层判断。自动 mapping 必须同时看：

```text
0.c action index -> action hash
2.c func_241(actionHash, callback)
callback 是否为 0
callback 函数行为证据
跨机体启用 / 禁用对比
```

## 命名工作流

后续每次打开新的 MSC 反编译文件，建议流程是：

1. 扫描函数定义、调用关系、syscall 使用、常量集合。
2. 生成 analysis JSON。
3. 用 semantic overlay 匹配角色。
4. 生成 resolved view。
5. 只把高置信度 label 显示到 UI 或用于批量重命名。
6. 中低置信度 label 只作为文档假设，不写入源文件。

## 为什么 JSON 比直接改名更合适

直接改名的问题：

- 只适合当前 `2.c`。
- 一旦重新反编译，`func_N` 可能变化。
- 人工改名会混入代码文本，难以区分事实和猜测。

JSON overlay 的优势：

- 可以跨样本复用。
- 可以记录证据和置信度。
- 可以保留多套命名风格，例如中文讨论名、英文 UI 名、内部 semantic id。
- 可以把“函数编号变化”变成一次重新匹配，而不是人工重做命名。
