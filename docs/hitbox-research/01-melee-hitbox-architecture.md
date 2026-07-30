# EXVS2 近战 Hitbox 系统 — 数据层架构与跨文件接线

**Date:** 2026-07-26
**Kind:** System architecture（数据层已证实部分）
**Target:** ギャン / Gyan（强人），交叉验证：百式 Hyaku Shiki、EXVS 原创机 glfunl
**Binary:** `vsac27_Release.exe`（OB v27），IDA instance `ida-50652`，base `0x140000000`
**Param 语料:** `E:\XB\mod\041cpm\` + `E:\XB\解包\com\file\041cpm\`（28 个机体目录）
**MSC 语料:** `E:\XB\mod\040msc\`（1219 个目录）

---

## 0. 一句话结论

近战 hitbox **不是**从某个「hitbox 文件」按动作名读出来的。它是三张表按外键连起来的：

```
MSC 脚本  ──func_219(hash)──▶  grapparam.bin     （这一段格斗的伤害/帧数/追踪）
   │
   └──────func_148(hash)──▶  interactionid.bin （命中后施加什么效果）
                                    ▲
                                    │ 外键 0xC3656A99
                              hitgroupiddef.bin （碰撞体几何：半径/挂点/偏移）
```

**关键点：`func_148` 传的 interaction ID 同时是「效果」和「选择器」。** 引擎拿这个 ID 反查
`hitgroupiddef` 里所有外键等于它的行，那些行就是这一帧生效的碰撞体。这也解释了为什么
MSC 里**从来不出现** hitgroupiddef 的 entryId——它根本不需要出现。

---

## 1. 证据：`func_148` → interactionid → hitgroupiddef 的双向闭合

对每个机体，提取 MSC 全部 `func_148(0x…)` 调用，与该机体 param 表求交集：

| 机体 | MSC 目录 | `func_148` 唯一 hash | 命中 interactionid.entryId | 命中 hitgroupiddef 外键 | Class-A 外键被 MSC 调用 |
|---|---|---:|---:|---:|---:|
| Gyan（N2 mod） | `001gundam_005gyan00_001_N2_rocket_mod` | 15 | **15/15** | **15/15** | 15/17 |
| Gyan（原版） | `001gundam_005gyan00_001` | 15 | **15/15** | **15/15** | 15/17 |
| Hyaku Shiki | `002zgundm_002hyaksk_001` | 19 | **19/19** | **19/19** | **19/19** |

百式达成完全双射：MSC 调用的每个 interaction 都有碰撞体，每个攻击碰撞体也都被 MSC 调用过。
Gyan 剩余的 2 个未被调用的外键属于该 mod 未启用的招式，不构成反例。

复现脚本：`scratchpad/selector.js`（解码器 `paramdump.js`）。

---

## 2. 证据：`0xC3656A99` 不是骨骼哈希，而是 interactionid 外键

项目原 schema（`src-tauri/src/format/hitgroupiddef.rs`）把 `0xC3656A99` 命名为 `bone_hash`，
`0xD32D39ED` 命名为 `parent_bone_hash`。**前者是错的，后者也是错的。**

对全部 28 个机体目录做字段-到-表的匹配率统计：

| hitgroupiddef 字段 | 与 interactionid.entryId 匹配率 | 与 grapparam.entryId 匹配率 |
|---|---|---|
| `0xC3656A99`（原名 bone_hash） | **95–100%**（Gyan 17/18、49/51、45/46、40/41、37/38…） | 0% |
| `0xD32D39ED`（原名 parent_bone_hash） | **0/7 ~ 0/16** | 0% |
| `0xEDD1C108`（原名 model_hash） | **0/1 ~ 0/6** | 0% |
| `entryId` 自身 | 0% | 0% |

每个机体唯一不匹配的那个值都是哨兵 `1`（见 §3 的 Class B）。

**结论：`0xC3656A99` 应改名为 `interaction_id_ref`。** 这是本次研究对现有代码库的第一个必要修正。

### 2.1 被证伪的假设（保留记录，避免重走）

- ❌ **hitgroupiddef.entryId = 骨骼名哈希**。从 Gyan 全部 `.nusktb/.numdlb/.numshb/.nuhlpb/.jnttbl`
  抽出 29883 个字符串，用 CRC32 / FNV-1a / FNV-1 / djb2 四种哈希对 45 个 entryId、18 个外键值、
  7 个 `0xD32D39ED` 值全量比对，**全部 0 命中**。entryId 的来源仍未知（UNPROVEN）。
- ❌ **`func_572(1, G, …)` 的第二参 = group_id**。初看很像（Gyan N 格第一段 `func_572(0x1,0x6,…)`、
  第二段 `func_572(0x1,0x8,…)`，而 Gyan 的 Class-A group_id 正好是 6/7/8）。但全量统计后
  Gyan 第二参取值 `{5,6,7,8,13,18}` 只有 3/6 落在 group 集合，百式 `{6,8,10,13,15,20,1000}`
  只有 2/7 命中。**属于小整数巧合，撤回该推断。**

---

## 3. hitgroupiddef 的两类行

Gyan 的 45 行明确分为两类，跨机体稳定（待跨 28 机体全量复核）：

| | Class A（攻击判定） | Class B（疑似机体被弹判定） |
|---|---|---|
| 行数（Gyan，45 行） | **39** | **6** |
| `0xC3656A99` | 真实 interactionid 外键 | 恒为哨兵 `1` |
| `0xD32D39ED` | 恒为 `1` | 4 / 8 / 12 / 15 / 18 / 22 |
| `radius` | 6 – 20 | 0 |
| `group_id`(f32) | 6 / 7 / 8 | 2 / 2.5 / 3.5 |
| `collision_flags` | 0 | 1 |
| `scale_x` | 多为 0，偶见 ±6/10/11/12 | ±1 / ±1.5 / ±3 |
| `joint_offset` | −10 … +8 | 0 或 −1 |

Class B 恰为 6 行，entryId 为 595264406 / 605472655 / 1417425664 / 3128054316 / 3172963893 / 3390613155。
其 `0xD32D39ED` 按 4→8→12→15→18→22 单调递增（间隔 3–4），对应 `group_id`
3.5→2→2→3.5→2.5→2.5，形状上像一摞沿机体高度堆叠的球（腿细、躯干粗、头部收窄）。
**这只是形状上的观察，尚未由二进制证实，标记为 UNPROVEN。**

支持 Class B 不参与攻击的旁证（强）：这 6 行 `radius = 0`、无 interaction 外键、且
**从未被任何 MSC arming 调用引用**；而 39 行 Class A 全部能 join 到伤害 17–105 的 interaction 行。

---

## 3.5 interactionid 同时存放「我打出的」和「我承受的」

Gyan 的 26 行 interactionid 并非全是攻击。按是否被 Class-A 外键引用 / 被 MSC arming 引用切分后，
出现干净的二分：

| 分组 | 行数 | `receive_mode` (0x148C8D49) | `interact_target_hash` (0x08A3B0DC) |
|---|---:|---|---|
| 被 hitgroup 外键引用（攻击载荷） | 17 | **全部 = 0** | 全部 ∈ {2716254650, 2656180345} |
| 既未被外键也未被 MSC 引用 | 9 | 多为 1 | ∈ {182004997, 4066572034, 0} |

`interact_target_hash` 是子系统选择器（近战 vs 其他），**不是骨骼引用**——这是对现有 schema 的第二个修正提示。

编辑自定义光剑时：**只能改被 hitgroup 外键引用的那 17 行**，否则改到的是别的投放方式。

> ⚠️ **后续修正（见 [03 号文档](./03-hit-effect-taxonomy.md) §1）：**
> 上表的分组现象真实存在，但把 `receive_mode` 读作"攻击侧 / 受击侧"是**错的**。
> 引擎证据显示 `0x148C8D49` 实际是**门控一个全局伤害倍率**的开关
> （系统 param 表 entryId `0x58427419` 的 f32 字段 `0xE50C0C6F`）。
> 该字段与"是否被 hitgroup 引用"高度相关，但不等于攻/受分侧。

### 3.6 休眠资产（改招时的现成插槽）

- interactionid `1139576405`（dmg 95, type 17）与 `3672498159`（dmg 18, type 18）：
  **有几何外键但从未被 MSC arming**——即碰撞体已定义好，只差一个 `func_148` 调用即可启用。
- grapparam `0x9EC6E4A0`（=2663834784）：10 行中唯一**从未被 `func_219` 绑定**的行。

这三个是做自定义招式时最省事的落脚点：不必新增行，直接复用并从 MSC 调用即可。

---

## 4. 一个 interaction 对应「一对球」——扫掠胶囊体的证据

把 `func_148` 调用 join 到碰撞体，形态高度规律。样本：

| 机体 | interaction | 碰撞体 1 | 碰撞体 2 |
|---|---|---|---|
| Gyan | `0xC2F7D76B` | group 7, r=18, jointOffset −3 | group 6, r=10, jointOffset −3 |
| Gyan | `0x0AFCB0BB` | group 6, r=10, jointOffset −3 | group 7, r=20, jointOffset −3 |
| Gyan | `0x22AA2A45` | group 7, r=18, jointOffset −3 | group 7, r=10, jointOffset −4 |
| 百式 | `0x77270493` | group 7, r=17, jointOffset −2 | group 6, r=9, jointOffset −2 |
| 百式 | `0xC943EDB0` | group 7, r=17, jointOffset −2 | group 6, r=9, jointOffset −2 |

**一个攻击 interaction 通常绑定恰好 2 个球体，半径一大一小。** 两球之间的扫掠体
（sphere-swept segment，即两端半径不同的胶囊）就是武器的实际判定形状。这与「大光剑横砍时
判定是横着的一条，上下不在这条胶囊内的东西打不到」的直觉一致。

注意 `0x22AA2A45` 两行 group_id 同为 7，所以 **group_id 不能简单解释为「端点序号」**；
其确切语义待引擎侧证实。

---

## 5. MSC 里一段近战的完整结构（Gyan N 格，`2.c`）

```c
void ACTION_B_MELEE() {
    func_488();
    func_219(0x36618199);      // 绑定 grapparam 行（=entryId 912359833）
    global602 = func_934;
    callFunc3(func_933);
}

void func_935() {              // 第一段
    if (global240 == 0) {
        global240++;
        func_308(global20, 0xee17c609, global276, 0, 0);  // 播放 motion
        func_536(0x1, 0xa, func_936);                     // 派生到第二段
        ...
    }
    if (func_309(global20, 0x12c)) { func_148(0x22aa2a45); }  // t=300 → 开判定
    if (func_309(global20, 0x258)) { func_149(); }            // t=600 → 关判定
}
```

| 调用 | 语义 | 证据强度 |
|---|---|---|
| `func_219(hash)` | 绑定本段的 grapparam 行 | **已证实**（本体反编译，见下） |
| `func_148(hash)` | 开启攻击判定 + 指定 interaction | **已证实**（本体反编译 + 15/15、19/19 双向闭合） |
| `func_149()` | 关闭攻击判定 | **已证实**（本体反编译，见下） |
| `func_309(g, T)` | 动作计时到达 T | 语义已证实，**时间单位未证实**（见 §6） |
| `func_308(g, motionHash, …)` | 播放 motion | 已由既有 msc-research 证实 |
| `func_536(mask, frame, fn)` | 注册派生（按输入 mask 分支到下一段） | **已证实** |

### 5.1 arming / disarming 本体

```c
void func_148(int arg0) {          // 2.c L4749  —— 开判定
    global107 = 0x1;               // armed 标志
    global109 = arg0;              // ★ 当前生效的 interaction id
    global110 = 0;                 // 未 disarm
    if (sys_2(0x3) == 0x3) { sys_1(0xf0000, 0x68, 0x1); }
}

void func_149(void) {              // 2.c L4760  —— 关判定
    global110 = 0x1;
}
```

`global109` 就是引擎侧反查 hitgroupiddef 外键所用的键。

### 5.2 `func_219` 本体独立复证了全部 16 个 grapparam 字段

```c
// 2.c L5713-5757，sys_0(0x60002, entryId, fieldHash) 是 MSC 侧通用 param 取值器
global379 = sys_0(0x60002, arg0, 0x55B8FC51);        // tracking_frame
global380 = sys_0(0x60002, arg0, 0x83E900CD);        // reach
global381 = sys_0(0x60002, arg0, 0xBEC81A41);        // damage_last
global382 = sys_0(0x60002, arg0, 0x35857659);        // grap_total_frame
global383 = sys_0(0x60002, arg0, 0x465D80C6);        // stun_value
global384 = sys_0(0x60002, arg0, 0xB084851E);        // damage_2nd
global385 = sys_0(0x60002, arg0, 0x6906F0F4);        // damage
global386 = sys_0(0x60002, arg0, 0x550BCFAD);        // startup_frame
global387 = sys_0(0x60002, arg0, 0x534643A2) * 0x64; // grap_priority   ← ×100
global388 = sys_0(0x60002, arg0, 0xC21ED1D8) * 0x64; // down_value_last ← ×100
global389 = sys_0(0x60002, arg0, 0x7755981E);        // correction_pct
global390 = sys_0(0x60002, arg0, 0x976F9803);        // cancel_frame
global391 = sys_0(0x60002, arg0, 0x99D42DBB);        // recovery_frame
global392 = sys_0(0x60002, arg0, 0x17A9E2E1);        // down_value
global393 = sys_0(0x60002, arg0, 0xA89F3A61);        // is_multi_hit
// 0x2272E3D6 (charge_frame) 仅在 global173 == 3 || 4（蓄力态）时经 func_538 消费
```

这条证据的价值：**16 个字段哈希全部由二进制自身列出**，不再依赖数据统计推名。
同时揭示 `grap_priority` 与 `down_value_last` 在装载时被 **×100**——编辑时必须注意。

---

## 6. 时间单位换算 —— ⚠️ 未证实

初稿曾断言「`func_309` 的时间参数 = 1/10 帧」，依据是 Gyan N 格绑定
`func_219(0x36618199)`（grapparam `startup_frame = 30`），而判定开启于
`func_309(global20, 0x12c)`，`0x12c = 300`，恰好 300 ÷ 10 = 30。

**该结论在对抗性复核中被推翻**：左右格 `DIR_2` 绑定 grapparam `0x2F7AB0D8`，
`startup_frame` **同样是 30**，但其 arming gate 是 `0xC8 = 200`，而非 300。
一个换算常数无法同时满足两例。

```
N 格   : gate 300, startup_frame 30   → 比值 10
DIR_2  : gate 200, startup_frame 30   → 比值 6.67   ✗ 不自洽
```

因此 gate 值的参照系（是每段 motion 的局部时间、还是整个 action 的累计时间）尚未确定，
**标记为 UNPROVEN**。`func_309` 本体已反编译：

```c
int func_309(int arg0, int arg1) {         // 2.c L7290
    var2 = sys_4B(0x1);
    return sys_47(0xf, var2, arg1);        // arg0 被忽略
}
```

grapparam 绑定关系本身不受影响，仍然成立：

| 玩家操作 | MSC 绑定 | grapparam entryId | 十进制 | 该行关键值 |
|---|---|---|---:|---|
| 左右格 | `func_219(0x2F7AB0D8)` | `0x2F7AB0D8` | 796569816 | dmg 300 / down 12 / startup 30 / reach 5 / charge 150 |
| 后格 | `func_219(0x7920175E)` | `0x7920175E` | 2032146270 | dmg 250 / down 20 / startup 60 / reach 10 / tracking 100 / recovery 20 |
| N 格 | `func_219(0x36618199)` | `0x36618199` | 912359833 | dmg 320 / down 12 / startup 30 / reach 5 |

三处 hash 与 entryId **逐位精确相等**，非近似匹配。

---

## 7. Gyan 的 10 行 grapparam 全表

| entryId (hex) | damage | dmg2nd | dmgLast | down | downLast | stun | startup | tracking | reach | cancel | recovery | total | charge | corr% | multiHit |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `0x2F7AB0D8` | 300 | 300 | 270 | 12 | 16 | 5 | 30 | 170 | 5 | 10 | 43 | 220 | 150 | 98 | 0 |
| `0x36618199` | 320 | 320 | 270 | 12 | 16 | 5 | 30 | 170 | 5 | 10 | 45 | 210 | 0 | 98 | 0 |
| `0x7920175E` | 250 | 250 | 200 | 20 | 5 | 10 | 60 | 100 | 10 | 1 | 20 | 220 | 0 | 98 | 0 |
| `0x83CFFFD4` | 320 | 320 | 270 | 13 | 18 | 8 | 30 | 180 | 6 | 10 | 45 | 170 | 0 | 98 | 1 |
| `0x8B26B11D` | 300 | 340 | 270 | 15 | 20 | 10 | 100 | 170 | 5 | 10 | 40 | 220 | 0 | 98 | 0 |
| `0x9EC6E4A0` | 300 | 340 | 270 | 15 | 20 | 10 | 30 | 170 | 5 | 10 | 47 | 220 | 0 | 98 | 0 |
| `0xAB90F75F` | 320 | 320 | 270 | 8 | 16 | 5 | 30 | 170 | 5 | 10 | 45 | 210 | 0 | 98 | 1 |
| `0xC9CC5CC9` | 350 | 340 | 270 | 13 | 20 | 10 | 30 | 170 | 10 | 10 | 45 | 200 | 0 | 96 | 0 |
| `0xECA73F43` | 300 | 340 | 270 | 8 | 12 | 10 | 30 | 170 | 5 | 4 | 47 | 220 | 0 | 98 | 1 |
| `0xF4933B38` | 300 | 340 | 270 | 8 | 20 | 10 | 30 | 170 | 5 | 10 | 20 | 220 | 0 | 98 | 0 |

> 全部十六进制值由 `scratchpad/hexcheck.js` 生成，未经手工换算。初稿中 5 个手算值有误已修正。

`reach` 取值 5/6/10，与 hitgroupiddef 的 `radius` 6–20 数量级不同，两者**不是同一坐标系**，
其换算关系待引擎侧证实（UNPROVEN）。

---

## 8. 复现工具

均位于 scratchpad（会话级临时目录），必要时可移入仓库：

| 脚本 | 用途 |
|---|---|
| `paramdump.js` | 解码任意 `.bin`（magic `0xCDABB8A9`）为 JSON，pool 名 `hitgroupiddef`/`grapparam`/`interactionid` |
| `crossref.js` | 全 28 机体的字段-到-表匹配率统计（§2 的证据） |
| `selector.js` | `func_148` → interactionid → hitgroupiddef 双向闭合验证（§1 的证据） |
| `msclink.js` | 在 MSC 源码中定位引用 param entryId 的调用点 |
| `bonehash.js` | 骨骼名哈希假设的证伪脚本（§2.1） |
| `meleewindows.js` | `func_572` 假设的证伪脚本（§2.1） |

---

## 9. 待引擎侧（IDA）证实的开放问题

1. hitgroupiddef 的碰撞体是球、胶囊还是 OBB？两球之间是否真的做扫掠？
2. `radius` / `scale_x` / `joint_offset` / `offset_z` 在体积计算中的确切角色；单位与缩放常数。
3. `group_id`（f32，含 2.5/3.5 这类半值）到底选择什么。
4. `hit_type`(0–3) 与 `collision_flags`(0–2) 的分支语义。
5. Class B 是否确为机体被弹判定。
6. hitgroupiddef `entryId` 的来源。
7. `reach`(grapparam) 与 `radius`(hitgroupiddef) 的坐标系换算。

以上问题的答案写入 `02-hitbox-volume-engine.md`。命中效果分类写入 `03-hit-effect-taxonomy.md`。
