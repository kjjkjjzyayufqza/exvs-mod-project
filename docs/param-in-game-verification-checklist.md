# Param 最终实机验证 Checklist（OB）

日期：2026-08-01  
状态：**静态分析已穷尽，可开始执行**  
依据：`docs/param-research/2026-08-01-param-static-exhaustion-audit.md`

本清单只保留静态代码无法给出唯一答案、但可通过可控实机对照判定的
项目。已经由 native/MSC 数据流闭合的字段、以及在所有版本 EXE 中均无
reader 的字段，不要求实机重复验证。

## 统一测试纪律

- [ ] 只在训练/离线模式测试，不进入联网对战。
- [ ] 原始游戏文件只读保存；所有测试包从同一份已校验备份生成。
- [ ] 每个测试包只修改一个 hash；禁止把多个未知变量放进同一包。
- [ ] 每项至少保留 `baseline / low / high` 三组，先录像 baseline。
- [ ] 固定机体、地图、双方耐久、攻击动作、距离、觉醒类型和输入时序。
- [ ] 每个条件重复至少 5 次；记录视频时间戳和逐次原始数值。
- [ ] “没有观察到差异”只能写成“此场景未触发”，不能写成“字段无效”。
- [ ] 崩溃、无法出击、存档异常或资源加载异常时立即停测并回滚。

每次测试记录：

| 字段 | 内容 |
|---|---|
| 测试 ID | 下文编号 |
| 文件 / entryId / hash | 测试文件副本、entry、唯一修改的 hash |
| baseline / low / high | 三个实际写入值 |
| 固定条件 | 双方机体、地图、动作、觉醒、距离、输入序列 |
| 原始观测 | 单次伤害、累计伤害、命中数、倒地时点、觉醒槽、帧数 |
| 结果 | 每组至少 5 次数据与录像时间戳 |
| 判定 | 支持哪一个候选映射；或“未触发/结果混杂” |

## A. 两组运行态容量的最终映射（最高优先级）

静态已证明：

- `0x080AF70C`（`unresolved_018`）配置第一组会逐步恢复到上限的整数状态；
- `0x0911077E`（`unresolved_02c`）配置第二组通过独立事件延迟复位的整数状态；
- 历史 `boost_gauge_max` / `boost_recovery_speed` 名称不成立；
- 尚需区分两组是否分别对应“Down 值剩余容量”和“连段补正初始百分比”。

### A1. `0x080AF70C`

- [ ] `CP-CAP-018-BASE`：原值测试。用同一弱攻击连续命中，记录强制倒地前
  命中数、每击伤害、累计伤害；脱离连段后按固定等待时间再次测试。
- [ ] `CP-CAP-018-LOW`：仅把该值改为 baseline 的约 25%（若 baseline=500，
  优先用 125），完全重复上项。
- [ ] `CP-CAP-018-HIGH`：仅把该值改为 baseline 的约 200%（若 baseline=500，
  优先用 1000），完全重复上项。
- [ ] 判定：若主要改变强制倒地所需命中/Down 累计上限，并呈单调变化，记录为
  第一组=Down 容量；若主要改变第二击起的伤害曲线，记录为第一组=补正状态。
- [ ] 恢复验证：在触发差异后分别等待 30/60/120/180 帧，再重复一次相同攻击，
  测量是否逐步回到 baseline 行为。

### A2. `0x0911077E`

- [ ] `CP-CAP-02C-BASE`：记录同一攻击连段第 1/2/3/4 击的单击伤害、累计伤害、
  强制倒地时点。
- [ ] `CP-CAP-02C-LOW`：仅把该值改为 baseline 的约 25%（若 baseline=100，
  优先用 25），重复完全相同的连段。
- [ ] `CP-CAP-02C-HIGH`：仅把该值改为 baseline 的约 200%（若 baseline=100，
  优先用 200），重复完全相同的连段。
- [ ] 判定：若主要改变后续命中的伤害百分比而不改变 Down 时点，记录为
  第二组=补正状态；若主要改变强制倒地命中数，记录为第二组=Down 容量。
- [ ] 交叉门槛：A1/A2 必须产生互斥、可重复的两种现象，才允许升级字段名；
  两者都影响同一观测量时，不做命名，先提交录像和逐击数据复查。

## B. Burst type-`0x29` 两个事件桶的方向（最高优先级）

静态已证明：

- `0xD01D00DF`（`unresolved_280`）乘入一个事件桶，并先除以
  `base_max_durability`；
- `0xE3E5D41D`（`unresolved_2c4`）线性乘入另一个事件桶；
- 两者都进入 Burst pending accumulator；静态代码无法命名 record
  `+0x10/+0x18` 哪一侧是攻击者或受击者。

测试前关闭会额外改变觉醒槽的技能、僚机或特殊状态。使用固定单发攻击，分别记录
“测试机体打中对方”和“测试机体被对方打中”后的觉醒槽变化。

### B1. `0xD01D00DF`

- [ ] `CP-BURST-D01-BASE`：各执行 10 次“造成固定伤害”和“受到固定伤害”，
  记录每次事件前后觉醒槽差值。
- [ ] `CP-BURST-D01-ZERO`：仅将该值置 0，重复同一矩阵。
- [ ] `CP-BURST-D01-HIGH`：仅将该值设为 baseline 的 2 倍，重复同一矩阵。
- [ ] 方向判定：只有“造成”一侧单调变化则标记 dealt bucket；只有“受到”一侧
  单调变化则标记 received bucket；两侧都变或都不变则标记未触发。
- [ ] 归一化复核：再选一台基础耐久明显不同的机体，使用相同百分比伤害复测；
  检查 `÷ base_max_durability` 的比例效应，而非只比较绝对伤害。

### B2. `0xE3E5D41D`

- [ ] `CP-BURST-E3E-BASE`：执行与 B1 完全相同的造成/受到矩阵。
- [ ] `CP-BURST-E3E-ZERO`：仅将该值置 0，重复矩阵。
- [ ] `CP-BURST-E3E-HIGH`：仅将该值设为 baseline 的 2 倍，重复矩阵。
- [ ] 方向判定同 B1。D01/E3E 应稳定落到不同事件桶；若同时命中同一方向，
  不强行写成 dealt/received，先检查攻击是否同时触发了多个 type-`0x29` record。

## C. Lock band 与 HUD 颜色/攻击 record 的映射

静态公式已经闭合：红锁内边界候选为
`min(Family1, Family2 * scale + offset - 1)`；超出上下俯仰窗口会强制返回
band 1 并设置额外 rejection flag。静态代码没有闭合 band 1/2/3 到 HUD
Red/Yellow/Green 的最后一跳，也没有设计层的 record type 2/3 名称。

### C1. HUD 颜色

- [ ] `CP-LOCK-HUD-BASE`：固定同一目标和攻击 record，在同一高度分别站到
  `inner-20`、`inner+20`、`outer+20`，逐点记录 HUD 颜色和是否可诱导攻击。
- [ ] `CP-LOCK-HUD-F1LOW`：只降低当前命中的 Family-1 字段，使 inner 明显缩小；
  重复三点测试，确认哪个 HUD 颜色切换点跟随 inner。
- [ ] `CP-LOCK-HUD-F2LOW`：恢复 Family-1，只降低对应 Family-2 字段；确认
  `outer-1` 接管 inner 时 HUD 切换点同步移动。
- [ ] `CP-LOCK-VERTICAL`：保持水平距离在 inner 内，把目标移到上限外和下限外；
  记录强制 band 1 对应的 HUD 颜色以及 vertical rejection 的可见行为。
- [ ] 只有多组参数下 HUD 切换距离与 band 边界稳定同步，才写入
  band 1/2/3 的颜色映射。

### C2. Family slot / record 类型

- [ ] 每次只把一个 Family-1 或 Family-2 slot 改成明显但安全的哨兵值；其余
  slot 保持 baseline。
- [ ] 对主射、副射、格斗、特殊格斗、蓄力、变形武装逐项测量 HUD 边界；记录
  哪些攻击 record 跟随该 slot。
- [ ] 分别覆盖 native record type 2 和 3；若只能靠武装类别推测，不写类型名，
  只保留“哪些具体动作命中该 slot”的可复现表。

## D. Burst slot `0..4` 到觉醒字母的映射

静态代码证明四组 5-slot family 的运算用途，但不能证明 gameplay selector
`0..4` 与 F/S/C/V/R 的设计枚举完全相同。

对以下每个 family 执行同一套哨兵法：

- `conditionalIncomingDamageMultiplierSlot0..4`
- `burstMeleeAttackMultiplierSlot0..4`
- `burstRangedAttackMultiplierSlot0..4`
- `burstMobilityMultiplierSlot0..4`

- [ ] 每个测试包只把一个 slot 设为 0.5，其余 slot 保持 1.0。
- [ ] 对游戏实际提供的每种觉醒，分别测固定受击伤害、固定格斗伤害、固定射击
  伤害和固定帧位移。
- [ ] 只有同一个觉醒字母在四个 family 中都稳定命中同一 slot，才建立全局映射。
- [ ] 若 incoming family 与另外三个 family 的 slot 映射不同，分别记录，不合并。

## E. speedparam 中只有玩法上下文才能命名的通道

这些字段的 MSC/syscall 算术已经闭合，当前 canonical key 故意保持中性；实机只需
补“哪种动作使用该通道”，不是重新验证公式。

### E1. movement channel 4

依次单独测试：`0x06D1922D`、`0x3BF9E21E`、`0x7CD3A712`、
`0xB20B67C9`（四个 `movement_channel_4_base_vector_scale_percent_*`）。

- [ ] 每个 hash 分别制作 0.5×/1.5× 包；录制站立、步行、地面 BD、空中 BD、
  上升、下降、变形移动及机体特有移动。
- [ ] 逐动作记录固定 60 帧位移与 Boost 消耗；只给稳定命中的动作加限定词。
- [ ] 相邻 hash 若影响不同阶段，记录进入/循环/退出阶段，不用“前后左右”猜名。

`0x9A378388`（`movement_channel_4_zero_transition_duration_9a378388`）：

- [ ] 只修改该值，重复已确认会命中 channel 4 的动作，测量输入归零后向量衰减至
  0 的帧数；若动作从未命中 channel 4，记为未触发。

### E2. floored movement magnitude 的动作归属

静态已证明 `0x7BF44A41` 是 seed、`0x0CF37AD7` 是 delta、
`0x95FA2B6D` 是 bound/floor；未知的是哪些机体动作使用该 handler。

- [ ] 优先在已知含该 handler 的 Gedlav、Vertigo、GP01Fb、G-Arcane 上测试。
- [ ] 先单改 seed，再单改 delta，最后单改 bound；每包只改一项。
- [ ] 对变形、自由飞行、特殊移动逐项记录进入值、逐帧变化和最低/最高平台。
- [ ] 只有某动作稳定表现出“seed 决定起点、delta 决定逐帧变化、bound 决定平台”
  的三联关系，才给这组三个字段加该动作限定词。

## 不进入纯手测清单的 unresolved 字段

以下字段虽然没有唯一设计名，但缺少可重复、可直接观察的手测触发器：

- runtime scalar tuple：`0x1113F30E`、`0x2698D841`、`0xC6E2AD28`；
- generic selector scalar：`0x5AC06BD2`；
- collision-radius coefficient：`0x6ED37B1F`；
- conditional event coefficient：`0xA6DC5C53`；
- two-record owner state：`0xAEAC01A7`。

这些项目需要运行时 watchpoint/telemetry 来先识别触发事件。仅凭“改值后玩一局”
得到的相关性不足以升级名字，因此本清单不会要求你做无判定标准的盲测。

## 完成后的证据升级门槛

- [ ] 每项包含原文件校验、编辑请求、输出文件校验、录像索引和原始结果表。
- [ ] 至少两个无关机体或 entry 复现同一因果方向；单机体结果只能作为候选证据。
- [ ] 新名称描述直接观测量，不描述推测的设计意图。
- [ ] 改 canonical key 时，同一变更加入旧名 legacy alias，并更新独立证据文档。
- [ ] 最后运行 `python tools/check_param_name_evidence.py` 和对应 Rust real-file tests。
