# MSC Research 入口：以真实 `.c` 与 raw Param 为证据

> Provenance warning：本目录多数早期深挖文档基于 BDBE patch 前快照；当前 `E:\XB\解包\com\file\0xBDBE6FEA\2.c/2.dscex` 已含 2026-06-19 Delta Kai AI patch。旧 generated analysis/overlay/resolved-label 工作流已删除并废弃；除非有明确必要，不再用 generated JSON 作为研究输入。当前研究直接读取 `.c`、原始 Param 与资源二进制；真实 OB v27 Delta Plus 证据改用 `0x04AD9F33 + 0x5556A52B`。

这组笔记用于继续研究 EXVS MSC 系统，当前样本是：

```text
E:\XB\解包\com\file\0xBDBE6FEA\2.c
```

它来自 `2.dscex`，按项目现有 MSC 工作区约定属于 Depiction / 表现脚本层。这里不要把 `2.c` 当作游戏原始 C 源；它是 MSC bytecode 反编译出的 C 风格中间表示。

当前目标不是一次性给 1,047 个函数全部取完名字，而是先建立稳定的研究入口：

- 用全文件结构理解 `func_1`、`func_4`、`func_877`、`func_1042` 等高层入口。
- 把 `func_887` / `func_888` 放回启动、注册、动作分发、shell 控制的完整链路里。
- 把 Notion MSC 页里的 syscall 经验和仓库已有 syscall 研究文档合并到同一套术语。
- 为后续 offset / `func_N` 变化准备动态命名方案，避免靠一次反编译的函数编号硬命名。

## 阅读顺序

如果只想先读一份，先看 [MSC 模组开发操作手册：从 29664 行 `2.c` 读到可改点](./msc-modder-operating-manual.md)。它把 `func_1`、`func_4`、action registry、dispatch、runtime setup、segment output、BD / movement、镜头、射击、格斗、shell 放进同一套操作协议。

如果当前问题是“AI 帮我改了 MSC `X.c`，怎么标记哪些代码是 AI patch”，先看
[MSC AI 修改块注释规范](./msc-ai-edit-block-rule.md)。任何 AI 新增或修改过的
MSC `X.c` 代码都必须用 `// AI decision ...` 和 `// End, origin is ...` 成对包住。
AI 新增符号还必须使用逆向语义名，不能新建 `global777` 这类无意义名字。

如果当前问题是“这个玩家系统到底在哪一层控制，应该改资源、脚本 segment 还是 native syscall”，看 [MSC 系统控制面矩阵：BD / 移动 / 镜头 / 动作 / 射击 / 格斗怎么改](./system-control-surface-matrix.md)。它把每个系统拆成玩家语义、`2.c` 控制面、资源层、syscall 层、patch 点和实机验证。

如果当前问题是“我怎么从真实 `2.c` 行号证明这些结论”，看 [2.c 源码证据走读：从 `func_1` 证明到可改点](./2c-source-proof-walkthrough-for-modders.md)。它按 `main/func_1/func_4/func_44/func_1043/ACTION_*` 的真实代码形状，逐步追到主射 `sys_4F`、特射 `sys_51`、特格 `sys_46`、格斗 `func_532/535/536` 和镜头 `sys_53`。

如果当前问题是“玩家按键、方向、BD / step 怎么变成 `2.c` 里的 action hash”，看 [0.c 到 2.c：输入、action hash、BD / step 边界怎么串起来](./0c-to-2c-input-action-boundary.md)。它说明 `0.c func_143` 如何把输入和资源状态选成 action hash，再由 `2.c func_44/1043/ACTION_*` 消费并输出表现。

如果当前问题是“普通 BD、step、boost、射击伤害、弹体 hitbox、格斗追踪这些该改脚本还是资源”，看 [MSC 资源层 patch 指南：BD / step / boost / 射击 / 格斗该改哪些表](./resource-control-surface-for-modders.md)。它把 `speed_param`、`arms_param`、`bullet_param`、`character_param` 和 `0.c/2.c` 调用链对齐。

如果当前问题是“Delta Plus 主射为什么 2 连射、为什么空弹后手动换弹，以及怎样改成 RX-78-2 那样单发 + 自动回弹”，看 [Delta Plus 主射调用链与 RX-78-2 风格自动回弹方案](./delta-plus-main-shot-rx78-style-auto-reload.md)。它把 wiki 行为、`0.c` 空弹分支、`2.c` 主射/换弹 action、RX 对比和 patch 步骤放在同一页。

Delta Plus 当前 OB v27 的独立机体页见 [15004001 Delta Plus MSC 研究](./units/15004001-delta-plus/README.md)。该页直接读取 `0x04AD9F33` 的 `0.c/1.c/2.c` 与 `0x5556A52B` raw Param，证明 classic selector 下主射、手动装填、CS、副射、Jesta assist、Waverider rush、变形主射/副射/特射与速度行的代表闭环；不使用 generated analysis JSON。

Hyaku Shiki 当前 OB v27 的独立机体页见 [2002001 Hyaku Shiki MSC 研究](./units/2002001-hyaku-shiki/README.md)。该页直接读取 `0x43BB8719` 的 `0.c/1.c/2.c` 与 `0x1240BD01` raw Param，证明 classic selector 下 Dodai flight mode 的 `0.c` 进入 gate、common transform controller、百式 slot callback、Dodai loadout/release projectile 与复活态禁变形闭环；不使用 generated JSON。

RX-78-2 当前 OB v27 的独立机体页见 [1001001 RX-78-2 Gundam MSC 研究](./units/1001001-rx-78-2/README.md)。该页从 Character ID Table 定位 `0xF22E425D + 0xA3D57845`，重新抽取并直接读取三份 `.c`，把主射、CS、Bazooka、assist、Hammer、Beam Javelin 三段和 Last Shooting projectile 段连到原始 arms/bullet Param row。

G-Self 当前 OB v27 的独立机体页见 [42001001 G-Self MSC 研究](./units/42001001-g-self/README.md)。该页直接读取 `0x72CD747F` 的 `0.c/1.c/2.c` 与 `0x23364E67` raw Param，证明 classic selector 下 Space / Reflector stored/deployed / Assault 四状态候选、主射、CS 与 Assault Pack 多段 projectile family；不使用 generated analysis JSON。

Mack Knife（Mask）当前 OB v27 的独立机体页见 [42002001 Mack Knife MSC 研究](./units/42002001-mack-knife-mask/README.md)。该页直接读取 `0xC33AA885` 的 `0.c/1.c/2.c` 与 `0x92C1929D` raw Param，证明 classic selector 下 normal / Long-Range Booster 两个本地状态、slot 1/2 loadout bridge，以及 Beam Vulcan、Plasma Claw、Grenade Launcher 候选链；不使用 generated analysis JSON。

真正的 Aerial 是 `66001001`。独立机体页见 [66001001 Gundam Aerial MSC 研究](./units/66001001-gundam-aerial/README.md)。该页直接读取 `0x19CE466D` 的 `0.c/1.c/2.c` 与 `0x48357C75` raw Param，证明 46-action external Param table、动态 action/phase registry、slot-1/slot-5 多弹体族与 raw bullet rows；不使用 generated analysis JSON。

Gundam Pharact 是 `66002001`。独立机体页见 [66002001 Gundam Pharact MSC 研究](./units/66002001-gundam-pharact/README.md)。该页直接读取 `0x33BAAE59` 的 `0.c/1.c/2.c` 与 `0x62419441` raw Param，证明 32-action external Param table、Corax/Beakfoot/方向特殊移动候选弹体族、无 assist summon，以及动作内临时超远 `characterparam` 状态；不使用 generated analysis JSON。

Darilbalde 是 `66003001`。独立机体页见 [66003001 Darilbalde MSC 研究](./units/66003001-darilbalde/README.md)。该页直接读取 `0x39DD42B7` 的 `0.c/1.c/2.c` 与 `0x682678AF` raw Param，证明 43-action external Param table、四枚 Gusser Ishvara deployment/manual/auto-release 状态机、scatter/mine 分槽、Daya Ambicar detach/restore 屏障链与格斗派生图；不使用 generated JSON。

Unicorn 当前 OB v27 的独立机体页见 [15001001 Unicorn MSC 研究](./units/15001001-unicorn/README.md)。该页直接读取 `0x0B180D9E` 的 `0.c/1.c/2.c` 与 `0x5AE33786` raw Param，证明 Unicorn/Destroy 主形态轴、两套 loadout、代表射击/援护、NT-D 和觉醒技强制换装链；不使用 generated analysis JSON。

Kshatriya 当前 OB v27 的独立机体页见 [15002001 Kshatriya MSC 研究](./units/15002001-kshatriya/README.md)。该页直接读取 `0x3724E360` 的 `0.c/1.c/2.c` 与 `0x66DFD978` raw Param，证明普通态/Besserung 状态轴、5-to-3 arms loadout、character/speed 双行切换，以及 98 个 projectile literal 全量命中；不使用 generated JSON。

Sinanju 当前 OB v27 的独立机体页见 [15003001 Sinanju MSC 研究](./units/15003001-sinanju/README.md)。该页直接读取 `0xCF8FC16A` 的 `0.c/1.c/2.c` 与 `0x9E74FB72` raw Param，证明 classic selector 下主射、CS、格斗 CS、四向 Bazooka、Rozen Zulu assist、Meteor Kick 与 `赤い彗星の再来` 时限强化的代表闭环；不使用 generated analysis JSON。

如果当前问题是“右边第三槽为什么红、特射援护/浮游炮怎样扣槽、Delta Kai clone 后 slot 2 为什么不可用、背包浮游炮怎么发射和锁定”，看 [Delta Kai 浮游炮 / 援护 slot 2 调用链研究](./delta-kai-funnel-assist-slot2.md)。它把 `0.c` 输入 gate、`2.c` 特射 `sys_51`、slot 2 armsparam、HUD 红槽维护和 `connect funnel to backpack` 的风险放在同一页。

如果正在盯着某个 `func_N` 不知道能不能改，看 [2.c 关键函数职责表：给模组 patch 用的工作名](./2c-key-function-atlas-for-patching.md)。它按可改性 A/B/C/D/N 标记关键函数，告诉你哪些是 action-local patch 点，哪些只是 init / dispatch / shared runtime。

如果当前问题是“`func_1044` 里的 callback 应该怎样重命名”，先看
[`func_1044` slot callback 全链路逆向](./func1044-slot-callback-atlas.md)，再看
[`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)。前者保存调用链证据，
后者给出 Auto Rename 的期望显示名、置信度和动态匹配条件。

如果当前问题是“`ACTION_A_SHOT); //射击` 这种命名应该记在哪里”，看
[MSC Auto Rename Mapping](./msc-auto-rename-mapping.md)。这是 TestEditor MSC
专属的 action / slot 命名入口，不是 `command_mapping.md`。

如果想建立整体路线，再看 [MSC 逆向模组开发总览：从玩家动作追到 `2.c` 可改点](./modder-human-flow-overview.md)。如果已经知道自己要改什么，直接看 [MSC 模组开发 worked traces：从目标到 patch 点](./modder-worked-traces.md)。它把 `func_1`、主射、BDC / BRズンダ、援护、N 格、特格横移、变形突进、镜头、shell 写成可跟读的证据链。

1. [逆向者第一小时：打开 `2.c` 后怎么读到可改点](./2c-first-hour-source-reading-roadmap.md)
   - 最适合现在先看。按入口、初始化、每帧、registry、ACTION runtime、最终 syscall 六层讲清楚，告诉你怎样证明 `func_1` 是 init、怎样从 action hash 追到射击 / 格斗 / 移动 / 镜头 / shell。
2. [2.c 源码证据走读：从 `func_1` 证明到可改点](./2c-source-proof-walkthrough-for-modders.md)
   - 当前最适合放在真实 `2.c` 旁边跟读。它按行号展示 `func_1` 为什么是初始化、`func_44` 为什么是 action commit、`func_1043` 为什么是 action registry，以及主射、特射、特格、格斗、镜头如何从 wrapper 追到 segment output。
3. [0.c 到 2.c：输入、action hash、BD / step 边界怎么串起来](./0c-to-2c-input-action-boundary.md)
   - 用真实 `0.c` 证据说明 input bit、action selector、pending action writer、`2.c` depiction registry 的边界。适合解决“这个 hash 是不是按钮”“为什么 `2.c` 不直接控制普通 BD / step”这类问题。
4. [MSC 资源层 patch 指南：BD / step / boost / 射击 / 格斗该改哪些表](./resource-control-surface-for-modders.md)
   - 把 `speed_param`、`arms_param`、`bullet_param`、`character_param`、`commandlist` 放回 `0.c -> 2.c` 链路，适合判断“这个目标该改资源还是改脚本”。
5. [Delta Plus 主射调用链与 RX-78-2 风格自动回弹方案](./delta-plus-main-shot-rx78-style-auto-reload.md)
   - 专门回答 Delta Plus 主射 2 连射、空弹手动 reload 和 RX-78-2 常时 reload 对比；给出要改的 `0.c` 空弹分支、`2.c` 连射投递点和资源层 slot0 reload 方向。
6. [2.c 线性调用链 walkthrough：从 `func_1` 到可改点](./2c-entry-to-action-output-walkthrough.md)
   - 按真实执行顺序把 `main -> func_1 -> func_877 -> func_1043 -> func_4 -> func_44/52 -> ACTION_* -> runtime -> segment -> syscall` 串成一条线，并用主射、N 格两个跟读练习说明怎样落到可改点。
7. [2.c 函数职责证明手册：从 `func_N` 读到模组可改点](./2c-function-responsibility-proof-handbook.md)
   - 用“谁调用、读什么、写什么、输出什么、是否复用”五个问题证明一个函数属于 init、loop、dispatch、driver、segment 还是 cleanup；再用主射、援护、N 格、特格横移、镜头示范如何落到可改点。
8. [MSC 调用链快速决策树：从问题到可改点](./modding-decision-tree-system-cards.md)
   - 最适合打开 `2.c` 前先看。按“我要改动作 / 射击 / 格斗 / BD / 镜头 / shell”反推入口、调用链、可改点和验证场景。
9. [MSC 模组开发系统卡片手册](./modding-system-cards-handbook.md)
   - 把启动、action registry、射击、援护、格斗、BD / boost、动作内移动、镜头、shell、动态命名拆成固定卡片：玩家语义、脚本入口、可改点、不要先碰、验证矩阵。
10. [2.c 逐帧生命周期：从玩家动作到 MSC 输出](./2c-frame-lifecycle-human-trace.md)
   - 按“启动一次 + 每帧流水线”解释 `func_1`、`func_4`、`func_21/24/25`、`func_44/52`、`ACTION_*`、runtime segment 和最终 syscall 输出，适合建立整条调用链的直觉。
11. [2.c 函数角色地图：把 `func_N` 翻成人话](./2c-function-role-map-for-modders.md)
   - 把 `func_N`、关键 `global`、runtime、syscall 按 init、状态读取、action dispatch、射击、格斗、移动、镜头、shell 等角色归类，适合给函数起稳定工作名。
12. [MSC 模组实战 walkthrough：从玩家目标追到可改点](./modding-walkthroughs-action-to-patch-points.md)
   - 用主射、特射援护、特格突进、N 格派生、镜头、shell 六个目标演示从 action hash 一路追到可改参数、风险和验证点。
13. [从 `2.c` 读到可改点：人类可读的 MSC 模组开发导览](./2c-human-readable-modding-field-guide.md)
   - 适合接着读。按“打开 `2.c` 后怎么判断函数层级、怎么从 `func_1` 追到可改点”组织，适合逆向者快速建立整图。
14. [2.c 运行时系统地图：给逆向和模组开发看的整链路说明](./2c-runtime-system-map-for-modding.md)
   - 从 `main -> func_1 -> func_4 -> func_44/52 -> ACTION_* -> runtime -> syscall` 解释整套流程，并把 BD / 移动 / 镜头 / 射击 / 格斗 / 换装分别落到系统层。
15. [逆向 / 模组开发实操导览](./modder-practical-callchain-guide.md)
   - 按“我要改主射、特射援护、特格、觉醒技、镜头、BD/移动”反查 `ACTION_* -> callback -> syscall` 链路。
16. [MSC 模组开发 cookbook：按改动目标反查 `2.c`](./modding-cookbook-action-editing.md)
   - 更偏动手，按主射、副射、特射援护、特格、普通格斗、镜头、BD / 移动、换装列出入口、可改点、风险和验证方式。
17. [BD / 移动 / `sys_46` 模组开发工作簿](./movement-bd-modding-workbook.md)
   - 面向实际改参数：把普通 BD / step 的 `speed_param`、全局 `func_11` gate、动作段 `sys_46`、`func_532/535/536` 派生窗口拆成三层，按“我要改什么”给出入口、风险和测试表。
18. [2.c 移动 / BD / `sys_46` / `func_11` 地图](./movement-boost-sys46-func11-map.md)
   - 专门解释 BD 边界、`func_11` boost / cancel gate、`sys_46` 子命令形态、特格横移和 N 格突进怎么落到脚本。
19. [`sys_46` 脚本侧参数地图：动作内移动怎么读、怎么改](./sys46-script-parameter-atlas.md)
   - 把 `sys_46` 按动作清场、倍率包装器、格斗推进、特殊移动、直接突进、稀有控制分家，说明每类哪里能改、哪里不该先碰。
20. [`func_11` / `0xc000*` boost gate 状态槽地图](./func11-c000-boost-gate-map.md)
   - 把 `global23/43/45/46/54`、`0xc0001/3/5/6/7/8/9/b/c/e/f`、`speed_param` 和 `sys_52/sys_4C/sys_46` 串成脚本侧 gate 流程。
21. [2.c 调用链与运行时流程](./2c-call-chain-runtime-flow.md)
   - 用“人话”串起 `main -> func_1 -> func_4 -> func_44 -> ACTION_* -> runtime -> syscall`，并解释移动、BD、镜头、动作、射击、格斗分别落在哪些链上。
22. [跨机体 MSC 研究总览](./cross-unit-msc-research-overview.md)
   - 当前跨机体入口。优先记录真实 `0.c / 1.c / 2.c`、Param row、函数行号、syscall/resource 输出，不把机器缓存当正文证据。
23. [59001001 NEXA-N MSC 研究](./units/59001001-nexa-n/README.md)
   - external Param action-table 样本；已经开始按 `0.c -> chrsysparam row -> 2.c group callback` 直接追代码。
24. [1001001 RX-78-2 Gundam MSC 研究](./units/1001001-rx-78-2/README.md)
   - classic local selector 样本；直接按 `0.c input -> action hash -> 2.c callback -> arms/bullet row` 追代码。
25. [RX-78-2 legacy 1011 与 OB v27 跨版本对比](./units/1001001-rx-78-2/legacy-1011-vs-ob-v27.md)
   - 直接读取旧 `.c` 的 29 x 128 embedded B4AC、113-key resolver 与 OB selector/Param；明确旧文件是 MBON-derived、FB-compatible 且混入 XB Burst 的人工改造样本。
26. [15002001 Kshatriya MSC 研究](./units/15002001-kshatriya/README.md)
   - classic local selector 样本；普通态/Besserung runtime field、5-to-3 arms loadout、双 Param 行和 98/98 projectile literal bridge 已直接读 `.c` 与 raw Param。
27. [2002001 Hyaku Shiki MSC 研究](./units/2002001-hyaku-shiki/README.md)
   - classic local selector 样本；Dodai flight mode 的进入 gate、持续飞行控制、riding bit、flying loadout、Dodai release projectile 与复活禁变形已直接读 `.c` 和 raw Param。
28. [42001001 G-Self MSC 研究](./units/42001001-g-self/README.md)
   - classic local selector 样本；四个 `global39` 状态、`func_1125/1127/1128/1130` loadout bridge 与 Assault Pack 多弹体族已直接读 `.c` 和 raw Param。
29. [42002001 Mack Knife (Mask) MSC 研究](./units/42002001-mack-knife-mask/README.md)
   - classic local selector 样本；`global39 == 0/1`、normal / Long-Range Booster loadout bridge、Beam Vulcan、Plasma Claw 与 Grenade Launcher 候选链已直接读 `.c` 和 raw Param。
30. [66001001 Gundam Aerial MSC 研究](./units/66001001-gundam-aerial/README.md)
   - external Param action-table 样本；46 个非空 action rows、141-key phase resolver、动态 registry 与代表性 `sys_4F -> bulletparam` 链已直接读 `.c` 和 raw Param。
31. [66002001 Gundam Pharact MSC 研究](./units/66002001-gundam-pharact/README.md)
   - external Param action-table 样本；32 个非空 action rows、101-case resolver、方向特殊移动、82 个 literal bullet hashes 命中与临时超远锁定态已直接读 `.c` 和 raw Param。
32. [66003001 Darilbalde MSC 研究](./units/66003001-darilbalde/README.md)
   - external Param action-table 样本；43 个非空 action rows、132-case resolver、四机 drone timer/action gate、scatter/mine 分槽与双侧 barrier proxy 已直接读 `.c` 和 raw Param。
33. [MSC 代际与 Param Action Bridge 对比](./msc-generation-param-bridge-comparison.md)
   - 区分 external Param action-table、classic local selector、legacy embedded B4AC，并记录后续读 `.c` 的顺序。
34. [2.c 全文件地图](./2c-whole-file-map.md)
   - 当前样本的行数、函数数、启动流、注册表、syscall 热区、`global170/global143` 证据。
35. [2.c 函数群与区段索引](./2c-function-clusters.md)
   - 把 1,047 个函数按区段、热点和研究优先级拆开，解决“整份文件太乱”的问题。
36. [func_887 / func_888 shell loadout 研究](./shell-loadout-func-887-888.md)
   - 你正在看的换装 / 组件挂接系统，已经放回高层流程中解释。
37. [Notion MSC 页交叉索引](./notion-msc-cross-reference.md)
   - 把 MCP 读取到的 Notion 记录映射到当前样本和项目文档。
38. [2.c 函数角色地图](./2c-function-role-map-for-modders.md)
   - 用当前 `.c` 的 action hash、callback shape、syscall/resource 输出建立工作名，避免把 `func_N` 当跨样本真名。
39. [MSC Auto Rename Mapping](./msc-auto-rename-mapping.md)
   - 专门记录 `ACTION_*`、`SLOT_CB_*` 和中文注释的 TestEditor 显示规则，避免误改 `command_mapping.md`。
40. [`func_1044` slot callback 全链路逆向](./func1044-slot-callback-atlas.md)
   - 从输入、action hash、handler、slot、resource index 证明基础移动、step、BD、防御、变形和 result callback 的职责。
41. [`func_1044` 模拟重命名稿](./func1044-simulated-renames.md)
   - 把证据转换成完整的 Auto Rename 模拟结果，并为低置信项保留 `LIKELY` / `UNCONFIRMED`。
42. [MSC research 覆盖度与下一步缺口](./msc-research-gap-map.md)
   - 记录当前哪些已经足够指导模组开发，哪些还只是工作模型，下一轮应该继续拆哪里。

历史上的局部笔记仍保留在 [../exvs-msc-func-887-888-shell-loadout-notes.md](../exvs-msc-func-887-888-shell-loadout-notes.md)。后续讨论优先在本目录继续。

## 当前全局判断

`2.c` 的主干应先按下面几层理解：

```text
main
  -> sys_2(... func_3/26/27)        注册 VM callback
  -> func_1                         初始化全局状态、注册基础 action handler、进入 depiction 初始化
  -> callFunc3(func_4)              主 action update loop

func_1
  -> func_386                       初始化动作、输入、武装、镜头、换装、runtime callback 槽
  -> func_877                       active shell、HUD / ammo 资源、loadout、注册表初始化

func_877
  -> sys_4B(0, 0xab9c3043)          激活基础 shell entry
  -> global20 = sys_4B(1)           保存 active shell entry id
  -> global170 = 0
  -> func_887                       根据形态组应用默认 shell loadout
  -> func_1042                      注册 action hash、slot callback、slot resource hash 表
  -> global1 = func_878             每帧维护回调

func_4
  -> func_20/21/22/23               从 engine 读输入、动作、weapon slot、特殊状态
  -> func_5                         从 action queue 选择 pending action
  -> func_11/12/13                  处理 boost/cancel/外部转移/强制中断
  -> func_44                        commit pending action 并调度 callback

func_44
  -> sys_0(0x10002, 0x2, actionHash)
  -> sys_2(0, 0x2, callback/scriptPointer)

ACTION_* functions
  -> 设置 ranged runtime(global676..681) 或 melee runtime(global602/608/609/610)
  -> runtime driver 调 func_71/72 执行动作段 callback
  -> func_79/308 播放 motion，func_309 判断时间线
  -> sys_4F 射击 / ammo，sys_46 移动，sys_53 镜头，sys_4B/47 模型，sys_4A/58 表现
```

## 需要统一的术语

| 原始符号 | 当前建议术语 | 理由 |
|---|---|---|
| `func_877` | base depiction shell initializer | 初始化 active shell、`global20`、`global170`、`sys_4F(0xb)`、注册表 |
| `func_887` | default shell loadout selector | 只根据 `global170` 选择 `func_888(0/1)` |
| `func_888` | shell loadout dispatcher | `0..8` 分发到不同 shell 组合或大模式进出 |
| `func_1042` | registration coordinator | 聚合 `func_1043` 到 `func_1046` |
| `func_1043` | action hash registry | `func_241(hash, callback)` action 表 |
| `func_1044` | slot callback registry | `sys_1(0x10001, 0x2, slot, func)` |
| `func_1045` | stance resource hash registry | `sys_1(0x10001, 0x3/0x4, slot, hash)` |
| `func_1046` | effect / extra resource registry | `sys_1(0x10001, 0xb, slot, hash)` |
| `global170` | stance resource group selector | `func_887` 选择外观，同时 `func_79` 用它选择 group `0x3 + global170` |
| `global143` | alternate shell mode flag | `func_1037` 置 `1`，`func_1038` 归 `0`，多处分支读取 |
| `global20` | active shell entry id | 来自 `sys_4B(1)`，大量传给 `func_308` / `sys_47` |

这些名字先作为研究术语，不代表已经可以直接改源码或批量重命名。

## 当前最重要的方法约束

不要用 `func_887 == 换装系统` 这种局部结论代替完整链路。更稳的方式是：

1. 先看 `main -> func_1 -> func_877 -> func_1042` 的启动和注册结构。
2. 再看 `func_51/52 -> func_241/1043 -> ACTION_*` 的 action 分发结构。
3. 最后把 `ACTION_*` 中的 `global170/global143/func_887/func_888/sys_4B` 放回 shell / loadout 层解释。
4. 命名时优先使用证据角色，不优先使用 `func_N`、line、offset。
