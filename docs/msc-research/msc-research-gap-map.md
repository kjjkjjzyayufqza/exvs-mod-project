# MSC research 覆盖度与下一步缺口

这页是当前 `docs/msc-research/` 的进度账本。它不重复解释整套系统，而是回答：

- 哪些内容已经足够支撑逆向者进行模组开发。
- 哪些内容还只是工作模型。
- 下一轮最值得继续拆哪里。

## 当前要求拆解

用户的实际目标可以拆成这些交付项：

| 要求 | 当前证据 | 状态 |
|---|---|---|
| 建立 `msc research` 文件夹，并在中文 md 中继续讨论 | `docs/msc-research/` 已建立，README 作为入口 | 已覆盖 |
| 不只分析 common/syscall，要解释 `2.c` 整体调用链 | `msc-modder-operating-manual.md`、`system-control-surface-matrix.md`、`2c-source-proof-walkthrough-for-modders.md`、`0c-to-2c-input-action-boundary.md`、`2c-key-function-atlas-for-patching.md`、`modder-human-flow-overview.md`、`modder-worked-traces.md`、`2c-first-hour-source-reading-roadmap.md`、`2c-entry-to-action-output-walkthrough.md`、`2c-function-responsibility-proof-handbook.md`、`modding-decision-tree-system-cards.md`、`2c-frame-lifecycle-human-trace.md`、`2c-function-role-map-for-modders.md`、`modding-walkthroughs-action-to-patch-points.md`、`2c-human-readable-modding-field-guide.md`、`2c-runtime-system-map-for-modding.md`、`2c-call-chain-runtime-flow.md`、`2c-whole-file-map.md` | 已覆盖主干，并新增一页式操作手册、系统控制面矩阵、源码证据走读、`0.c -> 2.c` 输入/action 边界、关键函数 patch 职责表、实战总览、第一小时读码路线、线性执行链 walkthrough、函数职责证明手册、worked trace 操作链 |
| 解释 `func_1` 做了什么、初始化了什么系统 | `2c-source-proof-walkthrough-for-modders.md`、`msc-modder-operating-manual.md`、`modder-human-flow-overview.md`、`modder-worked-traces.md`、`2c-function-responsibility-proof-handbook.md`、`2c-entry-to-action-output-walkthrough.md`、`2c-frame-lifecycle-human-trace.md`、`2c-human-readable-modding-field-guide.md` 和 runtime map 中 `main -> func_1 -> func_386/877/1042` | 已覆盖，并新增真实行号和代码形状证明 |
| 把 `func_887/888` 放回完整流程，而不是局部“换装系统” | `shell-loadout-func-887-888.md`、README 主链、cookbook Recipe 8 | 已覆盖 |
| 解释动作、射击、格斗、镜头、移动、BD 等复杂系统 | `0c-to-2c-input-action-boundary.md`、`resource-control-surface-for-modders.md`、`system-control-surface-matrix.md`、`2c-source-proof-walkthrough-for-modders.md`、`msc-modder-operating-manual.md`、`2c-key-function-atlas-for-patching.md`、`modder-human-flow-overview.md`、`modder-worked-traces.md`、`2c-function-responsibility-proof-handbook.md`、`modding-system-cards-handbook.md`、`modding-walkthroughs-action-to-patch-points.md`、`2c-frame-lifecycle-human-trace.md`、runtime map、cookbook、practical guide、`movement-bd-modding-workbook.md`、movement / BD 文档、`sys_46` 参数地图、`func_11` / `0xc000*` 状态槽地图 | 脚本侧已能指导实战，新增 `0.c -> 2.c` 边界、资源层 patch 指南、控制面矩阵和源码证据走读，把每个系统落到真实行号、输入/action selector、资源层、脚本层、syscall 层和验证点；movement / gate native 仍需深化 |
| 使用 Notion MCP 记录的经验 | `notion-msc-cross-reference.md`，本轮重新 fetch Notion 页面并用于 `sys_46/global172` 说明 | 已覆盖 |
| 使用 OverBoost wiki 熟悉游戏操作系统 | cookbook 和 movement 文档引用系统页、初心者指南、用语集 | 已覆盖外部语义 |
| 解决 offset / `func_N` 变化后命名失效 | `2c-function-role-map-for-modders.md`、`dynamic-naming-overlay.md`、`generated-analysis-workflow.md`、`generated/0xBDBE6FEA-2.analysis.json`、`overlays/0xBDBE6FEA-2.semantic-overlay.json`、`resolved/0xBDBE6FEA-2.resolved-labels.md` | 当前样本已落地第一批 semantic overlay，仍需跨样本验证 |

## 目前已经能支撑模组开发的部分

### 1. 从入口到 action callback

当前已经可以稳定描述：

```text
main
  -> func_1
  -> func_386
  -> func_877
  -> func_1042 / func_1043
  -> callFunc3(func_4)
  -> func_44 / func_52
  -> ACTION_* callback
```

模组意义：

- 想找某个动作，不应该从 `func_887/888` 开始，而应该从 `func_1043` action registry 开始。
- `func_44/52` 是 action hash 到 callback 的桥。
- `func_1` 是系统初始化，不是某个武装动作。
- 新增的第一小时路线图把入口、初始化、每帧、registry、ACTION runtime、最终 syscall 六层压成一条可执行读码路径，适合刚打开 `2.c` 时使用。
- 新增的系统卡片手册把启动、registry、射击、援护、格斗、BD / boost、动作内移动、镜头、shell、动态命名拆成统一格式，适合实际改动前逐项检查。
- 新增的决策树页把“我要改动作 / 射击 / 格斗 / BD / 镜头 / shell”映射到入口、可改点和验证场景，适合作为实际改动前的第一张检查表。
- 新增的逐帧生命周期页把 `main -> func_1 -> func_4 -> func_21/24/25 -> func_11 -> func_44/52 -> ACTION_* -> runtime segment -> syscall` 连成一个故事，适合判断某个 `func_N` 处在 init、读状态、调度、runtime 还是输出层。
- 新增的函数角色地图把丑函数名、关键 `global`、runtime family、syscall family 映射到工作名和证据，适合在真正改动作前先建立本地命名 overlay。
- 新增的函数职责证明手册把“谁调用、读什么、写什么、输出什么、是否复用”固化成五问法，适合判断一个 `func_N` 到底是 init、loop、dispatch、driver、segment 还是 cleanup。
- 新增的实战 walkthrough 把主射、特射援护、特格突进、N 格派生、镜头、shell 六个目标从 action hash 追到具体 patch 点、风险和验证场景，适合实际开始改机体。
- 新增的实战总览页把 wiki 玩家语义、Notion syscall 经验、当前 `2.c` 调用链和 overlay semanticId 放到一条路线里，适合作为打开 `2.c` 后的第一入口。
- 新增的 worked traces 把 `func_1`、主射、BDC / BRズンダ、援护、N 格、特格横移、变形突进、镜头、shell 写成“目标 -> 证据链 -> 可改点 -> 不要先动 -> 必测场景”，适合作为实际 patch 前的操作清单。
- 新增的操作手册把“目标 -> action hash -> ACTION -> runtime family -> segment output -> cleanup -> 实机测试”固化成一套读码协议，解决文档多但入口不够聚焦的问题。
- 新增的系统控制面矩阵把 BD、移动、镜头、动作、射击、格斗、shell 拆成玩家语义、`2.c` 控制面、资源层、syscall 层、patch 点和验证点，适合回答“这个系统到底该改哪一层”。
- 新增的源码证据走读页直接引用当前 `2.c` 的行号和代码形状，证明 `func_1`、`func_4`、`func_44`、`func_1043` 的职责，并追到主射 `sys_4F`、特射 `sys_51`、特格 `sys_46`、格斗 `func_532/535/536`、镜头 `sys_53` 的实际 patch 入口。
- 新增的 `0.c -> 2.c` 边界页把上游 input bit、action selector、pending action writer 和 `2.c` depiction output 串起来，证明玩家按键不是直接进入 `2.c ACTION_*`，而是先经 `0.c func_143 -> func_95(actionHash,...)` 选择 action。
- 新增的资源层 patch 指南把 `speed_param`、`arms_param`、`bullet_param`、`character_param`、`commandlist` 和 `0.c/2.c` 调用链对齐，解决普通 BD / step、boost、射击伤害、弹体 hitbox、格斗追踪到底改资源还是改脚本的问题。
- 新增的关键函数职责表把 `main/func_1/func_4/func_11/func_44/func_52/func_1043/ACTION_*` 和核心 segment 标成 A/B/C/D/N 可改性，适合打开 `2.c` 时直接判断眼前函数是不是 patch 点。

### 2. 射击和援护

当前已经可以稳定描述：

- `ACTION_A_SHOT -> func_586 -> func_587 -> func_588/589/590/591`
- `sys_4F(0,slot,weaponHash)` 是发射 / weapon resource 请求。
- `sys_4F(0x7,slot,1)` 是主动扣 ammo。
- `sys_51(0x20000,0,0x2,index,type)` 是援护召唤。

模组意义：

- 改主射 / 副射弹种优先改 `sys_4F(0,slot,hash)` 的 hash。
- 改扣弹和 ammo slot 需要同时看 `global681`、`sys_0(0x90000,slot,0)`、`sys_4F(0x7,slot,1)`。
- 改援护类型优先看 `sys_51` 的 assist index / type。

### 3. 格斗和派生

当前已经可以稳定描述：

- `func_488()` 清 melee / special runtime。
- `func_219(row)` 加载动作参数 row。
- `func_489()` 是普通格斗 / 一部分特殊格斗 runtime。
- `func_502()` 是特殊移动 runtime。
- `func_532/535/536` 和 `func_239` 构成派生 / 输入窗口系统。

模组意义：

- 改格斗动作 motion：看 segment callback 里的 `func_308`。
- 改格斗派生时间：看 `func_536(mask,time,callback)`。
- 改追踪 / 突进手感：先看 `func_219(row)`、`func_532/535`、再看 `sys_46`。

### 3.5. BD / movement 参数工作流

当前已经可以按三层指导改动：

```text
普通 BD / step 基础性能 -> docs/command_mapping.md 的 speed_param
全局 boost-cancel gate -> func_11 + 0xc000* + global23/43/45/46/54
动作局部移动 / 派生 -> ACTION_* segment + sys_46 + func_532/535/536 + func_123/125
```

模组意义：

- 普通 BD 更远：优先看 `speed_param.boost_dash_distance`、`boost_dash_duration_frame`、`boost_dash_distance_max`。
- 普通 BD 次数更多：优先看 `speed_param.boost_dash_count`、`boost_gauge_capacity`、boost 消耗相关字段。
- step 更远：优先看 `speed_param.step_distance`、`step_speed`、`step_recovery_frame`。
- 某一招横移更远：回到对应 `ACTION_*` 的 segment，改 `sys_46(0,...)` 这类动作内移动常量和持续时间。
- 某个格斗派生更早：优先看 `func_536(mask,time,callback)` 和 `func_535(start,end)`，不要只改 motion 时间。
- 某个动作能不能 BD cancel：先看该动作段是否通过 `func_123/125` 开窗口，再回到 `func_11` 判断全局 gate。

当前的关键判断：

- 普通机动力不要从单条 `sys_46` 开始改。
- 单个动作手感不要从全局 `func_11` 开始改。
- gate 层只在要改全局 cancel、overheat、落地或特殊移动边界时优先碰。

### 4. 镜头和演出

当前已经可以稳定描述：

- `func_321(hash)` 包装 `sys_53(0x4,hash,0x4650)`。
- `sys_53(0x4,hash,...)` 是相机 preset / depiction preset 启用。
- `sys_53(0x5)` 是相机 preset 清理。

模组意义：

- 改觉醒技、格斗演出镜头时要同时确认进入点和清理点。
- 被打断、命中、空挥、动作自然结束都要测是否清掉相机。

### 5. 换装 / shell loadout

当前已经可以稳定描述：

- `func_877` 初始化 active shell。
- `func_887` 根据 `global170` 选择默认 loadout。
- `func_888` 根据参数进入不同 shell 组合或变形模式。
- `sys_4B` 负责 attach / detach / clear shell。
- `sys_47(0x10/0x11/0x12,...)` 可用于骨骼 rotate / translate / scale。

模组意义：

- 改组件挂接不要只改 `func_888`，还要看动作结束是否通过 `func_887()` 恢复。
- 变形 / 特格 / 格斗中 `global170` 和 `global143` 可能改变外观组。

### 6. 动态 semantic overlay

当前已经落地第一份机器可读 overlay：

```text
generated/0xBDBE6FEA-2.analysis.json
  -> overlays/0xBDBE6FEA-2.semantic-overlay.json
  -> resolved/0xBDBE6FEA-2.resolved-labels.md
```

模组意义：

- 讨论时优先引用 `semanticId`，例如 `depiction.actionHashRegistry`、`action.mainShot.fireSegment`、`action.bcSpecialMelee.directionalMovementSegment`。
- `func_N` 只作为当前样本定位，不作为跨版本主键。
- 当前 overlay 已覆盖启动、初始化、主循环、boost/cancel gate、action registry、dispatch、shell、主射、援护、N 格派生、特格移动、镜头 wrapper。
- 以后换另一个机体样本时，应先重新生成 analysis JSON，再用 overlay 的 evidence shape 匹配当前函数。

当前边界：

- `sys_46` 和 `0xc000*` 仍只记录脚本侧工作模型，不能直接写最终 native 参数名。
- 这份 overlay 还没有第二个机体样本做稳定性验证。

## 当前仍然不够硬的部分

### 1. `sys_46` native case 级语义

新增的 movement 文档和 `sys_46` 参数地图已经整理了脚本侧模式，但还没拆 native handler：

- `sys_46(0,...)` 是 movement delta / steering adjustment 候选。
- `sys_46(0x1,...)` 是 vector / velocity / offset 通道写入候选。
- `sys_46(0x2,...)` 是运动插值 / 惯性过渡候选。
- `sys_46(0x5,...)` 是追踪 / 朝向 / 特殊移动初值候选。

这些足够指导“先改哪里、怎么测”。新增的 `sys46-script-parameter-atlas.md` 已经把 `func_44` 清场、`func_296/298..302` 包装器、`func_489` 格斗推进、`func_502` 特殊移动、`func_937/940` 具体动作段分开记录，但还不足以把每个参数命名成最终 native 名。

下一步需要：

1. 在 `vsac27_Release.exe` 的 `CDepictionScript` syscall table 中定位 `sys_46` handler。
2. 像 `sys_47`、`sys_53` 那样按 case 拆参数解析。
3. 把 `sys_46` case 与脚本调用模式反向对齐。

### 2. `sys_0(0xc000*)` 状态槽

新增的 `func_11` / `0xc000*` 文档已经完成脚本侧状态槽初分型。当前工作模型是：

```text
0xc0001 -> gate continuation permission
0xc0003 -> gate mode selector
0xc0005 -> restricted-state gate permission
0xc0006 -> gate intensity scalar
0xc0007 -> gate phase enum
0xc0008 -> gate continuation / re-entry latch source
0xc0009 -> target validity under gate
0xc000b -> movement correction active
0xc000c -> movement bonus edge source
0xc000e/f -> gate effect parameters
```

这些已经能帮助阅读 `func_11` 和 movement function，但仍不能当作 native 最终命名。原因是 `0xc000*` 的真正读写方在 engine / native 层，当前只从脚本消费侧反推。

下一步需要：

1. 在 native handler 中定位 `0xc000*` 的 dispatch 表。
2. 对照实机状态：地上、空中、overheat、BD、step、落地硬直、特殊动作结束。
3. 用第二个机体样本验证这些槽位和 `global23/46/54` 的关系是否稳定。

### 3. hitbox / damage / 判定资源

当前已经知道：

- `func_532/535/536` 是动作窗口和派生系统的一部分。
- `sys_4F(0,slot,hash)` 能请求 weapon resource。
- `sys_47(0x7,activeShell)` 常用于命中 / 接触 / 动作完成类判断。

但还没有完整拆出：

- 格斗判定如何生成。
- damage / down value / proration 在哪里。
- projectile resource hash 如何映射到具体弹体数据。

下一步需要从 `sys_4A/sys_4F/sys_48/sys_58` 和资源表一起拆。

### 4. 上游原始输入

`2.c` 当前能说明 action hash 如何 dispatch 到 callback，但不能单独证明：

```text
玩家按 A 一定如何变成 0xf48d2d49
玩家跳键二连一定如何变成 BD gate
```

原因是原始输入识别在更上游脚本或 native 层。当前 `2.c` 主要读：

```text
sys_0(0x10000,...)
global87/global172/global200
global48/global49/global92/global140
```

下一步需要把 `0.c`、`1.c` 或 native input/action selector 一起纳入同一张图。

### 5. 动态 overlay 的跨样本验证

当前已有 analyzer 和 JSON 输出，但还需要用另一个机体样本验证：

- `func_N` 改变后，是否能靠 action hash、syscall shape、global family、motion / weapon hash 重新定位。
- `func_887/888` 这类 loadout 函数在不同机体里是否保持同类 shape。
- `sys_46` 子命令分布是否跨机体稳定。

## 下一轮最有价值的研究顺序

1. `sys_46` native handler：补成像 `sys_47/sys_53` 一样的 case 级说明。
2. `0xc000*` native handler：验证当前脚本侧状态槽工作名。
3. 格斗判定 / projectile 数据：把 `func_532`、`sys_4A`、`sys_4F`、`sys_48`、`sys_58` 连到资源。
4. 跨样本动态 overlay：选第二个 `2.c` 样本验证命名方案。
5. 上游输入链：从 `0.c` / native input selector 证明 raw input 到 action hash 的转换。

## 本轮新增证据

本轮新增：

- [MSC 模组开发操作手册：从 29664 行 `2.c` 读到可改点](./msc-modder-operating-manual.md)
- [2.c 关键函数职责表：给模组 patch 用的工作名](./2c-key-function-atlas-for-patching.md)
- [MSC 逆向模组开发总览：从玩家动作追到 `2.c` 可改点](./modder-human-flow-overview.md)
- [MSC 模组开发 worked traces：从目标到 patch 点](./modder-worked-traces.md)
- [MSC 调用链快速决策树：从问题到可改点](./modding-decision-tree-system-cards.md)
- [逆向者第一小时：打开 `2.c` 后怎么读到可改点](./2c-first-hour-source-reading-roadmap.md)
- [2.c 线性调用链 walkthrough：从 `func_1` 到可改点](./2c-entry-to-action-output-walkthrough.md)
- [2.c 函数职责证明手册：从 `func_N` 读到模组可改点](./2c-function-responsibility-proof-handbook.md)
- [MSC 模组开发系统卡片手册](./modding-system-cards-handbook.md)
- [2.c 逐帧生命周期：从玩家动作到 MSC 输出](./2c-frame-lifecycle-human-trace.md)
- [2.c 函数角色地图：把 `func_N` 翻成人话](./2c-function-role-map-for-modders.md)
- [MSC 模组实战 walkthrough：从玩家目标追到可改点](./modding-walkthroughs-action-to-patch-points.md)
- [从 `2.c` 读到可改点：人类可读的 MSC 模组开发导览](./2c-human-readable-modding-field-guide.md)
- [BD / 移动 / `sys_46` 模组开发工作簿](./movement-bd-modding-workbook.md)
- [2.c 移动 / BD / `sys_46` / `func_11` 地图](./movement-boost-sys46-func11-map.md)
- [`sys_46` 脚本侧参数地图：动作内移动怎么读、怎么改](./sys46-script-parameter-atlas.md)
- [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
- [当前样本 semantic overlay JSON](./overlays/0xBDBE6FEA-2.semantic-overlay.json)
- [0xBDBE6FEA / 2.c semantic overlay 解析视图](./resolved/0xBDBE6FEA-2.resolved-labels.md)

本轮复核来源：

- Notion MSC 页：`https://app.notion.com/p/1601ebad394d8027a042df115e61b6dd`
- OverBoost wiki 系统页：`https://w.atwiki.jp/exvs2ob/pages/593.html`
- OverBoost wiki テクニック页：`https://w.atwiki.jp/exvs2ob/pages/683.html`
- OverBoost wiki 初心者指南：`https://w.atwiki.jp/exvs2ob/pages/559.html`
- OverBoost wiki 初心者指南 / BRズンダ页：`https://w.atwiki.jp/exvs2ob/pages/560.html`
- OverBoost wiki 用语集：`https://w.atwiki.jp/exvs2ob/pages/82.html`
- 当前样本：`E:\XB\解包\com\file\0xBDBE6FEA\2.c`

本轮用到的关键源码范围：

- `main`: `2.c:779-788`
- `func_1`: `2.c:789-842`
- `func_4`: `2.c:873-1003`
- `func_11`: `2.c:1325-1517`
- `func_21`: `2.c:1767-1782`
- `func_24`: `2.c:1865-1871`
- `func_25`: `2.c:1872-1884`
- `func_26`: `2.c:1885-1906`
- `func_44`: `2.c:2615-2669`
- `func_52`: `2.c:2765-2831`
- `func_191`: `2.c:5156-5171`
- `func_193`: `2.c:5184-5188`
- `func_239`: `2.c:6002-6210`
- `func_241`: `2.c:6225-6242`
- `func_254`: `2.c:6344-6366`
- `func_260`: `2.c:6420-6443`
- `func_296`: `2.c:7158-7181`
- `func_298..302`: `2.c:7225-7249`
- `func_305`: `2.c:7261-7266`
- `func_306`: `2.c:7267-7274`
- `func_419..422`: `2.c:9602-9653`
- `func_423`: `2.c:9654-9857`
- `func_437`: `2.c:10251-10287`
- `func_439`: `2.c:10320-10349`
- `func_446`: `2.c:10561-10595`
- `func_447`: `2.c:10596-10707`
- `func_474..478`: `2.c:11638-12096`
- `func_484`: `2.c:12192-12240`
- `func_489`: `2.c:12485-12510`
- `func_502`: `2.c:13212-13232`
- `func_532`: `2.c:14064-14069`
- `func_535`: `2.c:14081-14086`
- `func_536`: `2.c:14087-14151`
- `func_877`: `2.c:25407-25430`
- `ACTION_A_SHOT`: `2.c:25765-25784`
- `ACTION_BC_SPECIAL_MELEE_ALT_2`: `2.c:26424-26436`
- `func_937`: `2.c:26520-26585`
- `ACTION_BC_SPECIAL_MELEE`: `2.c:26586-26601`
- `func_940`: `2.c:26607-26727`
- `ACTION_B_MELEE`: `2.c:27343-27350`
- `func_1042`: `2.c:29405-29412`
- `func_1043`: `2.c:29413-29471`
