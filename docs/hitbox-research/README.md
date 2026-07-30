# EXVS2 近战 Hitbox 系统研究

**Date:** 2026-07-26
**Target:** ギャン / Gyan（强人），交叉验证 19 个去重机体
**Binary:** `vsac27_Release.exe`（OB v27），IDA instance `ida-50652`，base `0x140000000`
**目的:** 支撑「自定义光剑」——自定义 hitbox 形状 + 自定义命中效果

---

## 文档

| # | 文档 | 内容 |
|---|---|---|
| 01 | [melee-hitbox-architecture](./01-melee-hitbox-architecture.md) | 数据层：三张表如何用外键接起来；MSC 如何驱动；强人全招式映射 |
| 02 | [hitbox-volume-engine](./02-hitbox-volume-engine.md) | 引擎层：碰撞体是什么形状、体积怎么算、相交怎么测 |
| 03 | [hit-effect-taxonomy](./03-hit-effect-taxonomy.md) | 效果层：伤害 / 强制倒地 / 麻痹 / 拘束，以及编辑配方 |

---

## 30 秒版本

```
MSC 脚本 ──func_219(hash)──▶ grapparam.bin      招式级：帧数、行为
    │
    └─────func_148(hash)──▶ interactionid.bin   命中后：伤害、倒地、反应
                                   ▲
                                   │ 外键 0xC3656A99
                             hitgroupiddef.bin  碰撞体：球心、半径、挂点
```

`func_148(id)` 同时是**效果**和**选择器**：引擎以该 id 为键，
反查出所有外键指向它的 hitgroupiddef 行，那些就是本帧生效的碰撞球
（`sub_140667740` 的 class-0 FNV-1a 表，已由二进制证实）。

**碰撞体是球**，不是 AABB。球心 = (`0x8B1AA53F`, `0xFC1D95A9`, `0x6514C413`)，
半径 = `0xDC8AC901`。刀光体积由动画**逐帧扫掠**球心生成。
所以横砍只覆盖横向弧线，上下覆盖仅 `r_攻 + r_受` —— 与直觉一致。

---

## 对现有代码库的必要修正

`src-tauri/src/format/hitgroupiddef.rs` 的字段命名**大面积错误**：

| Hash | 现有命名 | 实际语义 |
|---|---|---|
| `0xDC8AC901` | ~~group_id~~ | **球半径** |
| `0x6514C413` | ~~radius~~ | 球心 **Z**（前向偏移） |
| `0x8B1AA53F` | ~~scale_x~~ | 球心 **X** |
| `0xFC1D95A9` | ~~joint_offset~~ | 球心 **Y** |
| `0xC3656A99` | ~~bone_hash~~ | **interactionid 外键** |
| `0xD32D39ED` | ~~parent_bone_hash~~ | **骨骼 ID**（挂载点） |
| `0x7395D184` | ~~enable_state~~ | **形状模式**：0=静态球，1=扫掠 |
| `0x42EE5CA2` `0x458398BB` `0x3284A82D` `0xACE03D8E` `0xDBE70D18` | offset_*/scale_* | **死字段**，引擎从不读 |

`interactionid.rs` 亦有多处错误命名，见 03 号文档 §1。

---

## 关键方法学（后续 param 逆向请直接采用）

param 字段 hash **确实**以 imm32 出现在代码里（访问器被内联成两条 `cmp`），
但 IDA 的 `find(type=immediate)` **查不到**。

> **用 `find_bytes` 搜小端 4 字节。**
> `0x6514C413` → `13 C4 14 65`

访问器：
- 通用：`LookupCommandDescriptorByHash @ 0x1401A8BD0`
- interactionid 专用：`sub_1405B2980(sub_1405AA780() + 0x268CE0, &out, rowHandle, &hash)`
- characterparam 专用：`sub_1405F8C00`

---

## 复现脚本

位于会话 scratchpad，如需长期保留应移入仓库：

| 脚本 | 用途 |
|---|---|
| `paramdump.js` | 解码任意 param `.bin`（magic `0xCDABB8A9`） |
| `crossref.js` | 28 机体的字段-到-表匹配率统计 |
| `selector.js` | `func_148` → interactionid → hitgroupiddef 双向闭合验证 |
| `interstats.js` / `special.js` / `bindscan.js` | 效果字段分布与特殊行提取 |
| `msclink.js` | MSC 中引用 param entryId 的调用点定位 |
| `bonehash.js` / `meleewindows.js` | 两个被证伪假设的记录 |
| `hexcheck.js` | entryId 十六进制换算（**勿手算**） |

---

## 诚实记录：本次被证伪的假设

保留这些是为了避免后来者重走：

| 假设 | 结局 |
|---|---|
| param hash 不以立即数出现在 exe 中 | ❌ 我的错误前提，且写进了各战线简报 |
| hitgroupiddef.entryId = 骨骼名哈希 | ❌ 4 种哈希 × 全部 ID 零命中 |
| `func_572` 第二参 = group_id | ❌ 小整数巧合，跨机体不成立 |
| `func_309` 时间单位 = 1/10 帧 | ❌ DIR_2 反例 |
| hitgroupiddef 只有两类行 | ❌ 实为三类（`collision_flags` 0/1/2） |
| Class A/B 计数 37/8 | ❌ 实为 39/6（我数错了） |
| `interact_id` 的 2xx/3xx/4xx 分段 = 效果类别 | ❌ interact_type 大量重叠 |
| `stun_value` = 麻痹开关 | ❌ 全二进制无读取点；wiki 确认的 スタン 招式该值为 0 |
| `type24+prop4+dmg0+kb0` = 拘束 | ❌ `attack_property` 实为目标关系过滤器 |
| mod 版强人 param 与原版逐字节相同 | ❌ 仅**近战相关**文件相同（grapparam/interactionid/hitgroupiddef），其余有差异 |
| `0xBB0F3D7F` = 受击反应严重度阶梯 | ⚠️ switch 映射机制已证，但 `+64` 记录的读取方未追到，语义解读未证 |
| `0x720584BA` = 攻击属性族 | ⚠️ 实为分类枚举；5 个读取点全部只测 `value ∈ {0,2}` |
| 伤害公式为"进位取整" | ❌ 本 build 是 `cvttss2si` **截断**（`sub_1405F9480 @0x1405F94C6`） |
| プレッシャー 相关的社区引文 | ❌ 幻觉引用——所引 URL 实为 2019 年街机 EXVS.2 页，且不含被引文字。已从文档剔除 |
| 存在"按描述符索引批量拷贝行进命中记录"的上游例程 | ❌ 不存在（C1）；记录存 16 字节行句柄，字段按 hash 现读 |
| grapparam `stun_value`(0x465D80C6) = 电击开关 | ❌ 无电击的强人基线 10 行全非零，是通用近战硬直 |
| `hit_effect_id`(0x270D2FD5) = 受击反应类型 | ❌ 活字段但唯一消费者是视觉特效 spawner，仅选特效变体 |
| `interactType 20` 因果驱动 grab | ❌ 0x154EF1ED 全二进制仅 1 处读取点（视觉 spawner）；type20 只选抓取视觉，**grab 因果是 interact_id 500** |
| stun 等 11 字段"真死"（C1/C2）| ❌ **推翻**（C3/B4）：exe-dead 但 MSC-alive，经 `sys_0(0x60007)`+`func_629/630` 读取；语义已全部恢复 |
| 电击/绑住是 automata-only、非数据 | ❌ **推翻**：`interact_id` 407=stun / 500·501=bind 是数据编码（func_629 分发） |

---

## 拘束（绑住）的突破口

`docs/exvs2-unit-rtti-hierarchy.csv` 是从二进制 RTTI 提取的**逐机体逐招式英文类名表**，
里面直接写着拘束相关词：

- `000COMMON / ThrowSaberRollingNoBindHit` —— 引擎级存在 **Bind** 概念
- **`Makitsuki` / `Makituki`（巻き付き＝缠绕）** 家族 7 个机体，
  首推 **`021DESTNY_011GFIGNT` 的 `StickerHeatRodMakituki`**（古夫·点燃热鞭，缠绕+电击二合一）
- 另有 `Sticker`（附着）、`Capture`、`Anchor`/`Wire` 三组检索键

详见 03 号文档 §5.3。

---

## 四效果的最终机制（2026-07-27 phase 2 收敛）

| 效果 | 机制 | 数据可编辑性 |
|---|---|---|
| 正常伤害 | interactionid `0x00C57BA3`（截断） | ✅ 纯数据 |
| 强制倒地 | interactionid `0x2A6A7D8F` 递减 victim+24 倒地预算 + `knockback_type` 权重（受击反应严重度，事件+64→反应系统） | ✅ 纯数据 |
| 电击麻痹 | `interact_id`(0x6A0CCB8A)=**407** → 受击方 stun state 0x16；时长 = `0xFA03CBDA`×100。电流 tick = `interact_id 1` 中性追击 | ✅ 纯数据 |
| 绑住/拘束 | `interact_id`=**500/501** → bind state 0x1A（func_634）；进入状态是数据，hold 动画需攻击方配套 automata | ✅ 数据（hold 需配套） |

**关键机制（两个独立 verify 证实）：** interactionid 字段不由引擎 C++ hash 访问器读取，而由 MSC
receiver `sys_0(0x60007, rowHash, fieldHash)` 读取，再由 **`func_629` 按 `interact_id` 分发受击反应**
（200-212 基础 / 300-317 / 400-410 timed-states 含 407=stun / 500·501=bind / <2 中性）。
这与 grapparam 是同一个 exe 扫描盲区。

## 关键剧情反转 —— 两次自我推翻

1. **"批量拷贝器"假设**（C1 证伪）：命中记录存 16 字节行句柄（记录+48），不存在按描述符索引的拷贝器。
2. **"11 字段真死"判定**（C1/C2 提出 → C3/B4 推翻）：这些字段 exe 里确实无 hash，但**经 MSC receiver
   读取**——判"死"是 exe 扫描盲区所致。`func_630` 把 11 字段加载到 g543..g554，语义已全部恢复
   （interact_id=反应ID、0xFA03CBDA=时长、stun_value=屏幕震动 …，见 03 §4.2）。这是本轮最大修正，
   也直接解决了电击与绑住：它们**是数据可编辑的**，不是 automata-only。
