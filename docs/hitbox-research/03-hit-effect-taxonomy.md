# EXVS2 命中效果 —— 正常伤害 / 强制倒地 / 麻痹 / 绑住

**Date:** 2026-07-26
**Kind:** Binary-proven + wiki cross-validated
**前置:** [01-melee-hitbox-architecture.md](./01-melee-hitbox-architecture.md) ·
[02-hitbox-volume-engine.md](./02-hitbox-volume-engine.md)

---

## 0. 先说结论

| 目标效果 | 状态 | 一句话 |
|---|---|---|
| **正常伤害** | ✅ 纯数据可编辑 | `0x00C57BA3` 就是显示伤害，1:1，可直接填 |
| **强制倒地** | ✅ 纯数据可编辑（机制与社区口径不同） | 没有专用标志位；`0x2A6A7D8F` 是**递减**受害者的倒地预算，一次扣光即强制倒地；`knockback_type` 权重（1000=最强）叠加受击反应剧烈度 |
| **电击麻痹** | ✅ 数据可编辑 | `interact_id`（0x6A0CCB8A）= **407** → 受击方 stun state 0x16；时长 = `0xFA03CBDA` × 100（floor 500）。电击"连段"本身是 `interact_id = 1` 的中性追击 |
| **绑住 / 拘束** | ✅ 数据可编辑（hold 需配套） | `interact_id` = **500/501** → bind state 0x1A（func_634）。进入拘束状态是这个数据字段；hold 动画由攻击方 automata 驱动 |

**一句话总览：** 四效果**全部由 interactionid 字段数据编码**。关键机制（两个独立 verify 证实）：
interactionid 字段不由引擎 C++ 的 hash 访问器读取，而由 **MSC receiver template**
`sys_0(0x60007, rowHash, fieldHash)` 读取，再由 **`func_629` 按 `interact_id` 分发受击反应**——
这解释了为何 exe 里搜不到这些 hash（与 grapparam 同一盲区）。所以先前"这些是死字段 / 绑住电击是
automata-only"的判断被推翻。绑住的"进入状态"是数据字段，"hold 动画"仍需攻击方配套。

**func_629 反应分发（proven）：**

```
interact_id  200-212 → func_631 （基础反应：よろけ 等）
             300-317 → func_632
             400-410 → func_633 （timed states；407 → stun 0x16，时长 = 0xFA03CBDA×100）
             500/501 → func_634 （grab/bind state 0x1A，gated on 攻击方 hold 检查）
             604/607 → func_639 （罕见 anchor-hold 家族）
             < 2     → 无新反应 （中性追击，如電流 tick）
```

**诚实交代：** 本研究一路被自己推翻多次——早期误判 `type24+prop4+dmg0+kb0` 为绑住签名（§5.2 推翻）；
中期又误判电击/绑住为 "automata-only、interact_id 是死字段"（本轮被 C3/B4 的 MSC 层证据推翻）。
真相是 interact_id 经 MSC 间接读取、直接选择受击反应类。保留全部记录以免后人重走。

---

## 1. ★ 字段语义大修正（引擎侧逐条证实）

interactionid 的读取只有一种形态：

```c
v = sub_1405AA780();
hash = <imm32>;
sub_1405B2980(v + 0x268CE0, &out, rowHandle, &hash);
```

（注意：`sub_1405F8C00` 是 **characterparam 专用**变体，只有 3 个调用者，不要混用。）

管线：
`sub_1406860E0`（命中判定，构建 128 字节候选记录）
→ `sub_14060FF80` → `sub_140621B90`（遍历 `charObj+7600` 处 32 条 112 字节命中记录）
→ `sub_140622010`（**伤害/槽位施加器**）与 `sub_140689160`（**视觉效果分发器**）

**31 个字段中 20 个找到了可证的消费者，其中多个现有命名是错的：**

| Hash | 现有命名 | **实际语义** |
|---|---|---|
| `0x154EF1ED` | interact_type | **仅视觉命中特效类别**。索引 `0x141349F60` 处 28 字节步长的特效资源表；**不影响伤害、不影响倒地、不改状态** |
| `0xBB0F3D7F` | knockback_type | 经 `sub_14066CCA0` 的 switch 映射为 `{0→0, 1→25, 2→125, 3→1000, 4→10, 其他→100}`，结果存入一条 544 字节池记录（类型标记 `0x20000002`）的 `+64`，同处还有位置(`+32`)与归一化命中方向向量。**机制已证；把它叫"受击反应严重度"是未证的解读**——该记录的读取方尚未追到 |
| `0x720584BA` | block_level | **是分类枚举，不是量级**。5 个已验证读取点全部只测同一等价类 `value ∈ {0,2}` vs 否；不在集合内的分支才启用 barrier/IF 交互与另一套防御属性。称其为"攻击属性族"是过度命名 |
| `0x66957C67` | attack_property | **目标关系过滤器**（enum 0–7）。决定该 interaction 能否作用于某实体，并门控反射 |
| `0xEFEA436F` | guard_break_level | **单次 interaction 对同一目标的最大命中次数** |
| `0x477C2470` | knockback_force | **再命中间隔 / 记录存活时长**（下限 600）。与上一条由多段命中锁定表 `sub_14062DAC0` 一起消费 |
| `0x55815B3B` | guard_type | **击退方向模式之一**（enum 0–5） |
| `0x18DC6CD1` | priority | **击退方向模式之二**（enum 0–5） |
| `0x161FBB4F` | interact_range | **不是距离**。其值被加到受害者 `slot+56` 的一个 0–100 钳位计量槽 |
| `0x06A06715` | correction_pct | 对受害者 `slot+44` 伤害补正预算做**递减**（钳位 ≥ 0） |
| `0x148C8D49` | receive_mode | 门控一个**全局伤害倍率**（系统 param 表 entryId `0x58427419` 的 f32 字段 `0xE50C0C6F`） |
| `0x90E41A78` | （原标 PHANTOM） | 门控第二个倍率——**引擎确实会读** |
| `0x2EBC0DC3` | （原标 PHANTOM） | 把倒地累积**打折到 1/4**——引擎确实会读 |

> guard / barrier **不是 interactionid 字段**：`sub_140687870` 从 `defenderObj+428`
> 处 16 字节步长的数组读取 barrier 枚举（1–10）并与来袭角度校验；
> `sub_140622010` 随后把伤害导向 `charObj+432` / `charObj+448` 的 barrier HP 池而非本体 HP。

---

## 2. 正常伤害 —— 已完全确定

`0x00C57BA3` (`damage`) 缩放后从受害者 `slot+0` 的 HP 扣除，累计伤害落在 `slot+8`，
累计越过 300 时置位 `charObj+468`。

**数值是 1:1 的显示伤害**，已用 EXVS2OB atwiki 强人页
（`w.atwiki.jp/exvs2ob/pages/136.html`）逐条对账：

| wiki 招式 | wiki 伤害 | interactionid |
|---|---:|---|
| N 格 / 横格 / BD 格 首段 | 65 | `0x22AA2A45`, `0x3BB11B04`, `0x46BD099D` |
| N 格 2 段 | 75 | `0xC2F7D76B` |
| 横格 2 段 | 90 | `0x7A4BB00E` |
| BD 格 2 段（盾殴り） | 70 | `0x29718D19` |
| 前格（每 hit） | 30 | `0x97045408` |
| 百裂突き（每 hit） | 17 | `0xDA4B1BAC` |
| 射击 CS 投掷 | 55 | `0x81048F3C` |
| 突き飛ばし | 105 | `0xADD5C95C` |

连段累计算术亦可复现 wiki 总伤：`65+75×0.8=125`、`65+90×0.8=137`、
`65+70×0.8=121`、前格 `Σ round(30×(1−0.05i)), i=0..4 = 136`。

> 校验前提：盘上 mod 版强人的 grapparam / interactionid / hitgroupiddef 与原版**逐字节相同**
>（md5 一致），对账未被 mod 污染。注意该 mod **其他** param 文件（bulletparam 等）确有差异，
> 所以"整个文件夹与原版相同"的说法是错的，只有近战相关的这几个文件相同。

### 2.0 伤害施加是**截断**，不是社区文档说的进位

社区文档普遍写「ダメージ ＝ 威力 × 加算補正 × 乗算補正（小数点切り上げ）」。
本 build 的实际实现是纯乘法链 + **截断**：

```c
// sub_1405F9480，转换指令 cvttss2si @ 0x1405F94C6（截断，非四舍五入/进位）
value -= trunc( (float)amount × ext_mult[+0xB0] × f[+0x10] × f[+0x1C] × f[+0x18] );
```

社区那条公式来自更早世代的攻略博客，未被本二进制支持。做数值设计时以此处为准。

### 2.1 ⚠️ grapparam 的 damage / correction / down 名字是错的

grapparam 的 `damage`(250–350)、`correction_pct`(96/98)、`down_value`(8–20)、
`down_value_last`(5–20) 在**任何常数缩放下**都无法映射到 wiki 的
伤害 {17…110} / 总伤 {113…234} / 补正 {−20,−15,−5,−4} / ダウン値 {0…5.0}。

**wiki 可见的量存放在 interactionid，不在 grapparam。**
grapparam 是招式级（帧数/行为）参数。改伤害请改 interactionid。

另：**逐击补正率在两个文件里都不存在**——interactionid 的 `correction_pct`
在所有近战行上恒为 100。补正来源在别处，**UNPROVEN**。

---

## 3. 强制倒地 —— 已确定，机制与社区口径相反

**引擎里没有"强制倒地"标志位。**

```
0x2A6A7D8F (down_value) 递减受害者 victimSlot+24 处的倒地预算；
预算归零时钳到 0，同时把 slot+44 的伤害补正槽一并清零。
```

所以是**倒计时预算**，不是累加计量。社区文档说"累积到 5.0 强制ダウン"，
实现上等价但方向相反：预算从满值往下扣，**单发 down_value 大于剩余预算即当场强制倒地**。

数据侧与之吻合：全语料 100 行 `down_value ≥ 500`，取值极"整"（500/600/750/1000），
而 300–499 区间仅 26 行——分布断层支持 500（= ダウン値 5.0）是满预算值。
强人 `0xADD5C95C` 的 600 经 wiki 独立确认为 強制ダウン。

**换算：`down_value` = wiki ダウン値 × 100。**
（1.7→170、1.0→100、0→0，三处独立对上，且与 `damage` 同时对上。）

> 未决：`victimSlot+24` 预算的初始化常量在哪里写入。找到它就能给出"多大的
> down_value 保证一击强制倒地"的精确答案。搜 `charObj+104+80*i+24` 在
> `sub_140622010` 之外的写入者。

---

## 4. 电击 / 麻痹（スタン）—— 机制已定：**`interact_id = 407` 数据编码（纯数据可编辑）**

**结论（2026-07-27，两个独立 IDA+MSC verifier 证实）：**
麻痹是 interactionid 的 `interact_id`（0x6A0CCB8A）字段值 **407**，经 MSC receiver
`func_629` 分发到受击方 **stun state 0x16**；持续时长 = `0xFA03CBDA` × 100（内部单位，floor 500）。
电击的"连续电流"本身是 `interact_id = 1` 的**中性追击**（不产生新反应，故受击方停留在已进入的
スタン/grab 状态）。**纯数据可编辑：填 interact_id 407 + 一个非零时长即可。**

### 4.1 决定性受控对照（强人，三个同伤害同倒地的一段技）

强人有三个 65 伤害、down 170 的一段技。wiki（本轮抓取 pages/136）：N格1段 = よろけ、
横格1段 = よろけ、**BD格1段 斬り抜け = スタン**。三向全字段 diff，唯一稳定区分 スタン 的字段：

| 招式 | interactionid | interact_id | 0xFA03CBDA（时长） |
|---|---|---:|---:|
| N格1段（よろけ） | 0x22AA2A45 | 201 | 0 |
| 横格1段（よろけ） | 0x3BB11B04 | 202 | 0 |
| **BD格1段（スタン）** | 0x46BD099D | **407** | **50** |

跨 25 机体 1361 行：`interact_id = 407` 共 50 行，每个 wiki/doc 锚定的 スタン 行都是 407 且带时长
（强人 CS投擲 407/30、Kshatriya 後格 407/40、飞龙炎上スタン 407/110、古夫引き寄せ 407 …）。

### 4.1b 古夫热鞭「電流追撃」= 中性追击（interact_id 1）

古夫 サブ「スレイヤーウィップ」的電流追撃 `0x0C4ADDF4`（dmg 13、down 0、**无 hitgroupiddef 外键**）
是 `interact_id = 1`：不产生新反应，只对**已被缠住/已麻痹**的目标追加伤害。スタン 状态本身来自
另一条 407 行（在缠绕→拉近时触发）。这就是"电击不需要再命中"的数据学解释。

### 4.2 曾判"真死"的 11 字段 —— **实为 exe-dead 但 MSC-alive，语义已全部恢复**

上一版（C1/C2）判定这 11 字段"真死"，依据是其 hash 在整个 exe 映像零出现。**该判定被 C3/B4 推翻**——
正是 C1 自己标注的残余风险：这些字段**不由引擎 C++ 的 hash 访问器读取，而由 MSC receiver template**
`sys_0(0x60007, rowHash, fieldHash)` 读取（古夫 2.c:17404-17414）。hash 在 MSC 字节码里，
故 exe 扫描看不到——**与 grapparam 完全相同的盲区**。`func_630` 把这 11 个字段一次性加载到
global g543..g554，`func_629` 据此分发反应。语义（两个独立 verifier 逐行证实）：

| Hash | 现字段名 | proven 语义 |
|---|---|---|
| `0x6A0CCB8A` | interact_id | **受击反应 ID**（func_629 分发；407→stun 0x16，500/501→bind 0x1A） |
| `0xFA03CBDA` | untechable_frame | **反应状态持续帧**（存 ×100，-100/帧，floor 500，觉醒 override 0xBB8） |
| `0x22C412CA` / `0x3626F732` | stun_value / stun_frame | 受击方**屏幕震动**（近战/射击进入反应时，func_834 公式） |
| `0xD5D4F8DB` / `0xC1361D23` | hit_level / can_tech | 受击 **hitstop 帧**（近战 / 射击，global464 max 机制） |
| `0xB69B7051` | ground_bounce | 入射方向 **yaw 偏移**（×100，扇区分类到击退象限） |
| `0xAD173242` | knockback_distance | **击退行程量**（sys_46；默认 300；射击分支 override） |
| `0xFABCA946` | interact_category | special-interaction **子类型 tag**（0x66 在 stun 态通知攻击方等） |
| `0x8029185D` | wall_bounce_type | 受击方**循环 VFX 选择器**（200→func_364 … 203→func_367） |
| `0x50BC9332` | unk_barrier_hash | 受击方**相机预设触发**（sys_53(0x4,v) 若非零；数据中恒 0，休眠） |
| `0xA1A98180` | hitstop_frame | pitch 偏移相关（±45°/135° 扇区，strong） |

> ⚠️ 这些字段的**后端命名仍是纠错前的推测名**（interact_id/untechable_frame/…），语义现已 proven，
> 值得后续重命名（interact_id → victim_reaction_id、untechable_frame → reaction_duration_frames 等）。

### 4.2b grapparam 的 `stun_value` (0x465D80C6) 是另一回事 —— **通用硬直，非电击**

interactionid 的死 `stun_value`(0x22C412CA)与 grapparam 的 `stun_value`(0x465D80C6)
**是 hash 不同的两个字段**，C2 的死字段判定不覆盖后者。但数据侧交叉验证证明它也不是电击：
**无电击无缠绕的强人基线，10 条近战 grapparam 行的 stun_value 全部非零**（值 5/8/10），
所有机体近乎每行非零。所以它是**每个近战招式都有的通用硬直/よろけ量**，不是电击专属开关。
（注：grapparam 字段 hash 不以 imm32 出现在 exe——经 MSC `func_219` + `sys_0(0x60002,…)`
间接读取，hash 在 MSC 字节码里，故 exe 扫描无法分类 grapparam 字段，只能靠数据+MSC。）

### 4.3 受击反应等级：`knockback_type` (0xBB0F3D7F) —— **事件链已证实到 +64 存储 + 提交**

`sub_14066CCA0` 把 knockback_type switch 映射出权重阶梯：

```
0 → 0     1 → 25     2 → 125     3 → 1000     4 → 10     其他 → 100
```

两个命中反应事件生成器 `sub_14066CFC0`（点）/ `sub_14066D190`（段）把该权重写入
命中反应事件 `+64`，事件结构已还原：`+32` 命中位置、`+48` 击退方向单位向量、
`+64` knockback_type 权重、`+72` 受击方指针；随后经 `sub_1401AA810` 入队到全局反应系统
`qword_1421158A0+372856`（排序键 `+44`），再由 `sub_140689160` 出视觉特效。
去重门控 `sub_14066CC60` 读的是 `rehit_interval`(0x477C2470)——是防重复命中，非反应类型。
**强证：knockback_type = 受击反应严重度 / 击退强度（1000 = 最强，对应强制倒地/击飞）。**
仍差最后一跳：反应系统消费 `+64` 转成具体 のけぞり/よろけ/ダウン 的处理器。

### 4.4 `hit_effect_id` (0x270D2FD5) 是活字段但**仅视觉**

它不在 4.2 的死字段名单里——`find_bytes D5 2F 0D 27` 命中 2 处，都在 getter
`sub_1406895F0` 内，唯一调用者是**命中视觉特效 spawner** `sub_140689160`（由
`visual_effect_class` 0x154EF1ED 索引 28 字节步长特效表 0x141349F60）。hit_effect_id
只用于选特效变体（`(v-10)<=1`、`!=5`）。**它可能控制电火花的视觉，但不驱动受击 gameplay 状态。**

---

## 5. 绑住 / 拘束（つかみ）—— 机制已定：**`interact_id = 500/501` 数据编码（进入状态可编辑）**

**结论（2026-07-27，两个独立 verifier 证实）：** 绑住是 interactionid 的 `interact_id`（0x6A0CCB8A）
字段值 **500**（变体 501），经 MSC `func_629` 分发到受击方 **bind state 0x1A**（专用抓取处理器
`func_634`，gated on 攻击方 hold 检查）。跨 25 机体 1361 行：`interact_id ∈ {500,501}` 共 59 行、
分布在 16 个机体，**全部是 grab/anchor/wire/sticker RTTI 家族**（Makituki/Sticker/Anchor…），
基线无缠绕机体一行都没有。**进入拘束状态是这个数据字段**；`interactType 20`（视觉）是伴随标记，
不是因果。绑住的完整 hold 动画由攻击方 automata（Sticker/投射物）驱动，需配套。

> 修正：先前（本轮早些）判"grab 由 automata 实现、不在任何 interactionid 字段"是**错的**——
> C3/B4 的 MSC 层证据显示 interact_id 500/501 正是进入 bind state 的数据选择器。

下面 §5.1/§5.2 是更早被证伪的候选（type24+prop 签名，保留以免重走），§5.3/§5.4 是锚定证据。


### 5.1 曾经的候选（数据上真实存在）

全语料 `knockback_type == 0` 仅 **11 行 / 1401**。叠加"零伤害 + 有硬直"后得到：

```
interact_type = 24  且  attack_property ∈ {2,4}  且  damage = 0  且  knockback_type = 0
```

| interactionid | 机体 | prop | type | kb | dmg | stun | hitstop | recv |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `0x2E50472D` | **G-Self**（charId 42001001） | 4 | 24 | 0 | 0 | 20/20 | 0 | 0 |
| `0x50C83B78` | **G-Self** | 2 | 24 | 2 | 0 | 25/25 | 110 | 0 |
| `0x6743BDBE` | **Aerial**（charId 66001001） | 4 | 24 | 0 | 0 | 2/1 | 0 | 1 |
| `0xEE1AA9A8` | **Aerial** | 4 | 24 | 0 | 0 | 3/3 | 0 | 1 |

（机体身份来自本次一并逆向的 `012list/character_id_table.bin`：
0x10=entryCount、0x14=entrySize=24，行内 `+0xC`=param 包哈希、`+0x10`=msc 包哈希。）

当时的理由：Aerial 的 GUND-Bit 在原作中正是抓住并固定敌机，且它同时有攻/受两侧成对的行。

### 5.2 推翻它的证据

1. **`0x66957C67` 不是"攻击属性"**，而是**目标关系过滤器**（enum 0–7），
   决定该 interaction 能否作用于某实体。所以 `attack_property ∈ {2,4}`
   表达的是"作用于哪类目标"，不是"造成何种效果"。签名的核心支柱塌了。
2. **`0x154EF1ED` 只是视觉特效类别**，不改状态。所以 `interact_type = 24`
   只说明"播放第 24 号命中特效"。
3. **引擎中找不到任何"由攻击方逐帧写入受害者 transform"的代码路径。**
   最接近的只是命中位置的一次性快照，不是逐帧位置锁定。

`knockback_type = 0 → 权重 0`（完全不推开）与 `damage = 0` 仍然是真实的、
有意义的观察——但它们只能说明"这一击不推开也不掉血"，
**不足以证明它就是拘束**。

### 5.3 ★ 突破口：引擎自带的英文类名里就写着 Bind

`docs/exvs2-unit-rtti-hierarchy.csv`（前期会话产物，2.2 MB）是从二进制 RTTI 提取的
**逐机体、逐招式英文类名表**。在里面搜拘束相关词，直接命中：

**① 引擎级确实存在 "Bind" 概念**

```
000COMMON / 000COMMON / ThrowSaberRollingNoBindHit
```

`000COMMON` 是引擎共用层。类名里显式写着 **NoBindHit**——
说明存在与之相对的 **BindHit**，拘束是一等公民行为，不是某机体的特例。

**② `Makitsuki` / `Makituki`（巻き付き＝缠绕）家族 —— 全部 7 个**

| 机体 | 类名 | 备注 |
|---|---|---|
| `021DESTNY_011GFIGNT` | **`StickerHeatRodMakituki`**, `StickerHeatRodMakitukiHissatsu` | **古夫·点燃的热鞭**——高达系列"缠住+电击"的经典武器，同时覆盖你要的麻痹与绑住 |
| `018GGUNDM_003MASTER` | `MasterClothMakitsuki` | 大师高达 マスタークロス |
| `018GGUNDM_002DRAGON` | `DragonclawAnchorMakituki`, `DragonclawAnchorStick` | 龙爪 |
| `042GRECON_004GARCAN` | `StickerBeamWireMakitsuki` | |
| `042GRECON_005MNTERO` | `StickerBeamWireMakitsuki` | |
| `051BUILDF_006SENGOK` | `YoyoMakitsuki` | |

**③ 相关检索键**

- 前缀 **`Sticker`**（くっつく＝附着）标记"贴住目标"类武装。
- **`Capture`**：`014GNDM00_014TITAOZ` 的 `AssistTierenNormalCapture` / `AssistTierenSmirnovCapture`。
- **`Anchor` / `Wire`** 家族约 20 个机体（Dark Hound、Blitz、Strike Rocket Anchor、
  Gerbera Doga Wire、Zeta ZZ 的 ShotWireAnchor 等）。

### 5.4 ★ 已锚定并证实的机制（古夫·点燃热鞭定点差分完成）

**wrap（捕縛）锚点**（B2：MSC + wiki + bulletparam 三证）:

| interactionid | dmg | interactType | down | interactionClass | hitgroupiddef FK | 判定 |
|---|---:|---:|---:|---:|---|---|
| `0x0D80A0CA` | 10 | **20** | 10 | 2 | 有 | 捕縛（wrap 命中），精确匹配 wiki 10，出现在**两条 bulletparam 投射物行**（normal+必杀） |

递送方式:wrap **不由 `func_148` 武装**（近战 arm），而由 spawned **Sticker 投射物**递送——
`0x0D80A0CA` 作为 interactionid 出现在 bulletparam.bin 的两条投射物行里，对应两个 RTTI Sticker 类
（`StickerHeatRodMakituki` / `…Hissatsu`）。

**因果字段 = `interact_id`（0x6A0CCB8A），不是 `interactType`：**

- **`interact_id = 500`（wrap 行）→ bind state 0x1A**（MSC `func_634`）。这是 proven 的 gameplay 因果。
  跨 25 机体 59 行 id∈{500,501}，全在 grab 家族机体，基线为空。
- `interactType 20`（=0x154EF1ED）**只控制视觉**：全二进制唯一读取点在特效 spawner `sub_140689160`。
  它与 grab 相关是因为"抓取招式配抓取视觉"，是**伴随标记不是因果**——先前误把它当因果，现已纠正。
- 递送方式:古夫 wrap **不由 `func_148` 武装**，而由 spawned **Sticker 投射物**递送
  （`0x0D80A0CA` 出现在 bulletparam.bin 两条投射物行）。所以：**进入 bind state = interact_id 数据**，
  **hold 动画 = 攻击方 Sticker automata**（gated on 攻击方 hold 检查）。

**结论**：绑住的"进入拘束状态"由 interactionid 的 `interact_id = 500/501` 数据编码（可编辑）；
完整的"固定+拉近"动画需要攻击方一条配套的 Sticker/投射物 automata 链。自定义光剑要做绑住，
填 interact_id 500 能触发 bind state，但要真正的抓取表现需复用一条现成的 Sticker 投射物链。

### 5.5 Dragon 反例（诚实保留）

飞龙的龙爪缠绕 `0xA589B7AC`（30 dmg、type 20、**id=607**，wiki 标 スタン）没有 id-500 行——
`interact_id ∈ {604,607}` 是第三个极罕见家族（func_639，anchor-hold）。是否也算 bind 尚未定论，
勿把 6xx 当 bind 编码。（B4 已核：604/607 共 4 行。）

> 附：上一版猜"拘束在 grapparam"的方向也已否定——grapparam `stun_value` 是通用硬直（§4.2b），
> 且 grapparam 字段经 MSC 间接读取、承载的是招式帧数/优先级，不是攻受配对的抓取状态。

---

## 6. 自定义光剑编辑配方

| 想要的 | 改哪里 | 怎么改 |
|---|---|---|
| 判定形状 | hitgroupiddef（`collision_flags = 0`） | 球心 = (`0x8B1AA53F`, `0xFC1D95A9`, `0x6514C413`)，半径 = `0xDC8AC901`。加长刀身 → 增大第三分量(Z)，或多写几行同外键的球 |
| 静态球 or 扫掠 | hitgroupiddef `0x7395D184` | `0` = 静态球，`1` = 沿动画逐帧扫掠（引擎内即 DetectorSphere / DetectorRay 两种形状） |
| 判定归属 | hitgroupiddef `0xC3656A99` | 填目标 interactionid 的 entryId |
| 何时生效 | MSC `func_148(id)` / `func_149()` | 用 `func_309` 门控开关窗口 |
| **伤害** | interactionid `0x00C57BA3` | 直接填显示伤害（1:1） |
| **强制倒地** | interactionid `0x2A6A7D8F` | ダウン値 × 100；填 ≥ 500 基本保证一击倒地 |
| 单招最大命中数 | interactionid `0xEFEA436F` | 多段技必调 |
| 再命中间隔 | interactionid `0x477C2470` | 下限 600 |
| 受击反应等级 | interactionid `0xBB0F3D7F` | 权重阶梯 {0,10,25,100,125,1000}，先照抄同类招式 |
| 击退方向 | interactionid `0x55815B3B` + `0x18DC6CD1` | 两个 0–5 的方向模式 |
| 招式帧数/行为 | grapparam，`func_219(hash)` 绑定 | 注意 `grap_priority` 与 `down_value_last` 装载时 **×100** |
| **电击 / 麻痹（スタン）** | interactionid `interact_id`(0x6A0CCB8A) + `0xFA03CBDA` | 填 **`interact_id = 407`** → 受击方 stun state 0x16；`0xFA03CBDA` = 持续帧（装载 ×100，floor 500）。**纯数据可编辑**。电击"连续电流"另用 `interact_id = 1` 的 0-反应追击行叠加 |
| **绑住 / 拘束（つかみ）** | interactionid `interact_id`(0x6A0CCB8A) + 攻击方 automata | 填 **`interact_id = 500`**（或 501）→ bind state 0x1A（func_634）。**进入拘束是数据字段**；完整"固定+拉近"动画需攻击方一条配套 Sticker/投射物 automata（gated on hold 检查） |

**别做的事：**

- 别改 `0x42EE5CA2` / `0x458398BB` / `0x3284A82D` / `0xACE03D8E` / `0xDBE70D18`
  ——引擎从不读这 5 个 hitgroupiddef 字段（02 号文档 §7）。这 5 个是**唯一真死**的字段；
  interactionid 侧曾判死的 11 个字段其实经 MSC 读取（§4.2），别与之混淆。
- 别改 grapparam 的 `damage` 指望改显示伤害——它不是那个量。
- 别改 `damage_mult_gate = 1`（旧 receive_mode）的行——那是受击侧条目。
- 别把 `interact_type`(0x154EF1ED，现名 visual_effect_class) 当效果开关——它只选特效视觉。
  电击/绑住的因果字段是 **`interact_id`(0x6A0CCB8A)**（407=stun、500/501=bind），不是 interact_type。

### 6.1 现成空插槽（不必新增行）

- interactionid `1139576405`（dmg 95, type 17）与 `3672498159`（dmg 18, type 18）：
  **几何已就绪、外键已连好，只差一个 `func_148` 调用**。
- grapparam `0x9EC6E4A0`：10 行中唯一从未被 `func_219` 绑定的行。

---

## 7. 待办（按价值排序）

已完成/已证伪：

- ~~找"按描述符索引批量拷贝 interactionid 行"的上游例程~~ —— **不存在**（C1）。命中记录存 16 字节行句柄。
- ~~stun 等 11 字段是真死字段~~ —— **推翻**（C3/B4）。它们 exe-dead 但 MSC-alive，经
  `sys_0(0x60007)` + `func_629/func_630` 读取，语义已全部恢复（§4.2）。
- ~~电击/绑住是 automata-only、非数据~~ —— **推翻**。`interact_id` 407/500/501 是数据编码（§4/§5）。
- ~~拘束在 grapparam~~ —— 否定；grapparam `stun_value` 是通用硬直。

仍开放（不影响自定义光剑编辑）：

1. 把 `interact_id` 各反应态（0x16 stun / 0x17 / 0x1A bind / 4xx 兄弟态 401/406/408/410）
   逐一映射到游戏内行为（受身不可/強よろけ/砂埃…），当前只 407=stun、500/501=bind 完全确定。
2. 逆向 `func_634` 攻击方 hold 状态机，弄清绑住"hold 检查"对攻击方 automata 的确切要求。
3. 找 `victimSlot+24` 倒地预算的初始化常量（给出"多大 down_value 保证一击倒地"的精确阈值）。
4. **后端字段重命名**：interact_id → victim_reaction_id、untechable_frame → reaction_duration_frames 等
   （语义现已 proven，见 §4.2 表）。
