# MSC Agent 执行过程自审计

日期：2026-08-22

## 目标

审计 Codex 在 Wing Zero Rebellion MSC、motion 与 armsparam 联调中反复遗漏
跨阶段状态的原因，并把预防措施写入所有 MSC 请求必经的规则与技能。

## Failure Capture

- Session / task：Rebellion 变形、飞行武装栏、单阶段鸟特格。
- Goal in progress：安全接入 form、motion、armsparam 与 HUD 状态。
- Failure：局部修改通过静态检查后，后续阶段出现崩溃、Zero System 状态重置、
  CS 蓄能条丢失。
- Last successful evidence：单个 Runtime ID/Param row/函数映射可被静态证明。
- Repeated pattern：只审计用户当前报告的方向；ENTER 修复后遗漏 EXIT，资源存在
  后遗漏状态继承，roundtrip 后遗漏 native 排序。
- Environment assumption failure：把文档中的计划值当成当前 target 事实；把重新
  绑定同一 row 当成继承状态。

## 关键失误

1. **字节序近失误**：曾把 raw structure `unk1=1ee99211` 与 MSC Runtime
   `0x1192E91E` 方向判断反；后由当前 structure 的已知 enter/loop/end 对照纠正。
2. **用途混线**：看到 TV N 空中动作名后先按 landing `ALT_7` 推断，未先利用
   target seed `trans_te_motion...out` 与实际用户目标区分 transform/weapon 链。
3. **资源存在性不足**：motion Folder 存在并不证明 ENTER 安全；首帧在播放 motion
   前已经读取 armsparam，三个缺失 row 才是崩溃根因。
4. **native invariant 遗漏**：11-row Param 可解析且 byte-identical roundtrip，仍因
   entry ID 无序导致 native 查表崩溃。
5. **状态所有权遗漏**：bird bank 把 Zero System 从 slot 4 移到 slot 3，并冻结
   `func_1033/876/879`，同时破坏 loading→ready 与 CS presentation。
6. **反向路径遗漏**：ENTER 改为继承 slot 3/4 后，EXIT 仍调用 `func_1034(0)`，
   会把 slot 4 重新绑定到 loading row。审计后 source 已改为只恢复 slot 0–2；
   compile/repack 与实机回归仍待执行。

## Root Cause

### Policy failure

项目把通用 GPT fast rules 无差别应用到 MSC。单发现路径、跳过额外 audit、单命令
验证和首个 pass 即停止，适合普通局部修改，但不适合具有 form/action/motion/
Param/HUD 多所有者的 MSC 状态机。

### Skill gap

`msc-research-index` 只负责文档 cluster 路由，没有强制：

- ENTER / ACTIVE / EXIT / INTERRUPT / RESPAWN-REINITIALIZE 生命周期；
- state ownership matrix；
- preserve / inherit / reset / restore 策略；
- 当前 target 资源与 native invariant 证明；
- 正向与反向 transition 对称审计。

### Verification gap

静态 checker 只能证明 AI block/opaque pointer 等局部不变量，不能证明游戏运行时
状态。把 checker pass 当成 gameplay fix 完成，是证据范围错误。

## Skill Stocktake

| 入口 | 结论 | 具体问题 | 修订 |
|------|------|----------|------|
| `AGENTS.md` fast path | Improve | 无 MSC exclusion | 增加硬排除与多阶段验证 |
| `custom-rules.mdc` | Improve | 7d 对所有 GPT 强制 fast | 新增 7e MSC 禁用 fast rules |
| `gpt-fast-verification.mdc` | Improve | alwaysApply 未路由 MSC 退出 | 增加 MSC inactive 规则 |
| `gpt-fast-path` | Improve | description 会触发所有 GPT work | 改为仅 non-MSC 并加 hard exclusion |
| `gpt-fast-verify` | Improve | 单命令门槛覆盖 MSC | 改为仅 non-MSC |
| `msc-research-index` | Improve | 只有文档路由 | 增加生命周期、所有权、资源与反向审计 |
| `systematic-debugging` | Keep | 能强制根因调查；此前触发太晚 | MSC skill 现在要求编辑前使用同类矩阵 |
| `exvs2-body-wing-fbx-export` | Keep | body/wing 分离与 ATH 边界明确 | 无需修改 |

## Recovery Action

- Diagnosis chosen：流程约束不足导致局部最优、全链错误。
- Smallest action taken：不新建重叠 skill；修改现有 fast 与 MSC 必经入口。
- Why safe：只改 agent 规则/技能，不改变游戏资产；MSC exclusion 范围明确。
- Evidence required：静态合规测试必须从全失败变为全部通过；后续 MSC 修改必须
  产出 lifecycle/state ownership matrices 与分阶段验证证据。

## Pressure Scenarios

### Form bank hotfix

给出“进入 bird 后第五栏错误，只改 ENTER”的压力请求。合规 Agent 必须追
ENTER→ACTIVE→EXIT→INTERRUPT→RESPAWN，并指出 EXIT 的 `func_1034(0)` 也会
重置状态；不得在 ENTER pass 后停止。

### Runtime ID wiring

给出 raw `unk1` 与动作名。合规 Agent 必须用当前 target 中至少一个已知
raw/runtime 对照确认字节序，并验证 Folder children/files；不得只算 CRC。

### Param append

给出可 roundtrip 的新增 rows。合规 Agent 必须同时验证 unsigned ID 顺序、当前
schema、row 存在性与 MSC 引用；不得把 byte identity 等同于 native validity。

## Agent Self-Debug Report

- Session / task：Rebellion MSC multi-state integration。
- Failure：多次遗漏反向路径与共享 HUD/Param 状态。
- Root cause：fast policy 与 MSC skill gap。
- Recovery action：MSC 硬排除 fast rules；新增 lifecycle/state ownership 自审计。
- Result：process recovery complete；Zero System EXIT source fix 已落地，仍待 compile/repack 与实机验证。
- Token / time burn risk：此前重复局部修复导致高 burn；矩阵审计应减少返工。
- Follow-up needed：compile/repack，并验证 normal→bird→normal、loading/ready 两种入口状态与 CS charge。
- Preventive change：已编码到 AGENTS、Cursor rules、fast skills、MSC skill/rule。
