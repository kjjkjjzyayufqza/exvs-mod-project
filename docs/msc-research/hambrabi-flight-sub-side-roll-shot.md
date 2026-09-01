# ハンブラビ 変形サブ射撃「側転射撃」— 实现解剖与 Rebellion 左右移植

**Date:** 2026-08-31
**Status:** L1 源码 E1（两份 2.c 逐字读取）。L2 架构分野 E2（跨机体对照 +
`msc-generation-param-bridge-comparison.md`）。L3 mixed：I1/I2 selector/form
故障已 E3 定位；Stage 1 START 对准已 E3 观察；Stage 2 profile-1 解耦
E3- I9；Stage 3 SHOOT-only yaw E3- I10；Stage 4 SE 探针被用户拒绝；
Stage 5 ENTER-only 关电机 E3- I11；Stage 6 每 tick 关电机 E3- I12 自由落体。
用户澄清：不按后正常，持续按后往后飞导致视角偏移。Stage 7 `global454=0` E3- I13 没用。
Stage 8 `func_296(0x3e9)` / Stage 9 `sys_4C(0x8, 0x3)` 均未 E3 证明能挡住后向 analog。
Stage 10 声称已装 `68C073FE`，但用户加载的 `2.dscex` 不是那份二进制。
Stage 12 已装 `46A5F1D2`：clamp 改成 tick 最后写入。Stage 13 已装 `1CFD3810`
（304256 B）：SHOOT 每 tick `func_351(0,0x4)`（I1 profile 0），679 ENTER 恢复
`func_351(0x2,0x4)`（D10）。clamp / 电机 / `0x4000` 不变。禁止再关电机（I12）、禁止 SE、禁止清 `0x4000`、禁止 `sys_46(0xF)`、禁止叠 SHOOT yaw。
**Kind:** Cross-unit MSC action-flow reference + port record

## Sources

```text
Hambrabi  E:\XB\mod\040msc\002zgundm_006hambrb_001\0.c   (3,7xx 行)
          E:\XB\mod\040msc\002zgundm_006hambrb_001\2.c   (34,737 行 / 1,203 函数)
Target    E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\0.c
          E:\XB\mod\040msc\wing_gundam_zero_rebellion_msc\2.c (33,638 行 / 1,175 函数)
Wiki      https://w.atwiki.jp/exvs2ob/pages/373.html  (ハンブラビ)
```

---

## 1. Wiki 说的是什么（E2，外部来源）

| 项 | 值 |
|----|----|
| 変形サブ射撃 | 背部ビーム・ライフル |
| 弾数 | 2 |
| 威力 | 91～ |
| 備考 | レバー縦/横に回転移動しながら3連射 |

三个杆方向变体：

- **【変形サブ射撃】** 移動しながら背部ビーム・ライフルを連射。レバー入れで動作が変わる。
  どの動作も連射の任意タイミングから**変形特格でキャンセル可能**。
- **【レバー前後】前進射撃** — 相手に突撃しつつ3連射。銃口補正が1射ごとにかかり直す。
- **【レバー横】側転射撃** — 相手に向き直りつつ3連射。ハンブラビの弾幕形成を担う重要武装。
  **大きく横に移動**しつつ攻撃、回避と軸合わせを両立、ただし**ブースト消費が激しい**。

「左右不同」就在 **レバー横 = 側転射撃** 上：往左滚和往右滚是两条独立的 action row。

---

## 2. 他到底有没有「专属动作」

**有专属代码，但不是专属 action，而且不可直接 clone。**

### 2.1 Hambrabi 是外部 param-table 世代

`0.c func_143` 不用 if-chain 派发 hash，而是把整个输入状态交给引擎：

```c
var0 = sys_41(0x1, global48, global2, func_123(), global20, func_97(0x71), ...);
...
func_98(var0 & 0xfffffff);        // 或 func_145(var0, var1, 0)
```

`sys_41` 返回的是 **cmdaction 表的 row index**，输入→动作的映射在 `chrsysparam.csyspm`
（`N x 128` u32 action matrix），不在 MSC 里。

`2.c func_849` 再把整张表遍历注册：

```c
var0 = sys_0(0x700001, 0);                       // row count
while (var1 < var0) {
    var2 = sys_0(0x700000, 0, var1, 0x2e);       // field 0x2e = action hash
    var3 = sys_0(0x700000, 0, var1, 0xa);        // field 0x0a = archetype kind
    var4 = func_873(var3);                       // kind -> ENTER 函数指针
    func_241(var2, var4);
    var1++;
}
```

`func_873` 是 kind → ENTER 的静态表（指针经 `2.txt` 反查，偏移恒为 −48）：

| kind | ENTER | 说明 |
|------|-------|------|
| 0x02 | `func_953` | ranged |
| **0x03** | **`func_957`** | ranged，`func_593` 四槽 |
| 0x0c | `func_924` | |
| 0x0d | `func_942` | |
| 0x0f | `func_946` | |
| **0x12** | **`func_963`** | ranged，`func_593` 四槽 |
| 0x17 | `func_950` | |
| 0x1f | `func_916` | |
| 0x25 | `func_919` | |
| **0x35** | **`func_969`** | ranged，`func_593` 四槽 ← 変形サブ射撃 走这条 |

全 34,737 行 `2.c` 里只有 **三个** `global676 =` 写点（`func_957/963/969`），
它们是**通用原型**，被所有同 kind 的 row 共用。行为值全部来自 param row：

```c
void func_867() {
    global822 = func_875(global798, 0x2);    // 前置 hook hash
    global821 = func_875(global798, 0x3);
    global820 = func_875(global798, 0x8);    // 弾槽
    global811 = func_875(global798, 0xa);    // kind
    ...
    global841 = func_875(global798, 0x1e);   // 弾 hash 1
    global842 = func_875(global798, 0x1f);   // 弾 hash 2
    ...
}
```

`func_875(row, field)` 就是 `sys_0(0x700000, 0, row, field)`。

### 2.2 专属代码在哪里 —— `func_988` hook 表

每个 row 有三个「脚本 hook」字段（`func_849` 第三个循环）：

```c
sys_1(0x10001, 0x10, var1, func_988(func_875(var1, 0x2)));    // 主 hook
sys_1(0x10001, 0x11, var1, func_988(func_875(var1, 0x7c)));   // 进入 hook
sys_1(0x10001, 0x12, var1, func_988(func_875(var1, 0x7d)));   // 退出 hook
```

`func_988` 是一张 **131 项** 的 hash → 字节码指针二分查找表，目标是
`func_976`–`func_1109` 这 134 个机体专属函数。**这才是 Hambrabi 的专属动作代码**，
但它们是挂在 param row 上的 hook，不是自带 ENTER 的 action。

### 2.3 側転射撃 左右两侧就是这两对 hook

`func_1182` 是全文件唯一的「サブ键连射」helper，**只有两个调用者**：`func_1083` / `func_1086`。

```c
void func_1182(int slot, int fx, int maxRepeat, int winStart, int refireStart, int winEnd)
{
    var6 = 0;
    if (func_233(0x80, 0)) { var6 = 0x1; }             // 0x80 = サブ射撃 键仍按住
    if (!global982) {
        if (motionTime >= winStart*0x64 && motionTime <= winEnd*0x64) {
            if (global972 < maxRepeat - 1 && var6 && sys_0(0x90000, slot, 0) != 0) {
                global972++; global982 = 0x1;
            }
        }
    } else if (motionTime >= refireStart*0x64 && motionTime <= winEnd*0x64) {
        func_891(fx); global982 = 0;                   // 重新派发本 row → 下一发
    }
}
```

两侧 hook（**唯一差别已加粗**）：

| | 左侧 | 右侧 |
|---|---|---|
| 前置 hook | `func_1082` | `func_1085` |
| 反向踢 | `sys_46(0x2, 0x3, **0x2328**, 0, 0xdc)` | `sys_46(0x2, 0x3, **0xffffdcd8**, 0, 0xdc)` |
| 触发条件 | `global964 == 0x2`（上一次滚了另一边） | `global964 == 0x1` |
| 写回 | `global964 = 0x1` | `global964 = 0x2` |
| 主 hook | `func_1083` | `func_1086` |
| 横向推进 | `sys_46(0x1, 0x2, **0x2328**, 0xfffffc18, 0xb4)` | `sys_46(0x1, 0x2, **0xffffdcd8**, 0, 0xb4)` |
| 其余 | 逐字相同 | 逐字相同 |

`0x2328 = +9000`，`0xffffdcd8 = −9000`。`global964` 是**上次滚向哪边**的 latch：
只有换边时才补一脚反向冲量，同侧连滚不叠加。

共通时间线（`sys_47(0, sys_4B(0x1))` 单位 = 帧×100）：

| 时刻 | 动作 |
|------|------|
| 4f | `sys_4A(0x7/0x9/0xa, ...)` 枪口/拖尾 FX |
| 8f | 横向推进 `sys_46(0x1, 0x2, ±0x2328, ..., 0xb4)` |
| 14f | `sys_4A(0x1, 0x7, 0x1)` 清 FX |
| 19–27f | `func_299(0x63); func_300(0x63);` 速度混合 |
| 30–38f | `func_299(0x5f); func_300(0x5f);` + `func_106/109` 渐变 |
| 5–34f | `func_1182(0x1, fx, 0x5, 0x5, 0x15, 0x22)` 连射窗口 |

弾 hash 由摇杆位选：`if (global87 & 0x10) fx = 0x1e112ba4; else fx = 0xaed70b08;`
（`global87 & 0x3c` 是 2.c 侧的方向位）。前置 hook 还写
`global689 = 0x6`（START 瞄准窗）、`global452/453/454 = 0x32/0x60/0x62`（模拟量混合）。

`func_915(phase, useCurrent)` 是「当前是不是第 N 段」，kind 0x03/0x12/0x35 的段 id
统一为 `0x44d` start / `0x44e` shoot / `0x44f` no_ammo / `0x450` end。

---

## 3. 为什么不能逐字 clone

| | Hambrabi | Wing Zero Rebellion |
|---|---|---|
| 世代 | 外部 param-table bridge | 经典本地 selector |
| `0.c` 输入派发 | `sys_41` → row index | `func_95(hash, ...)` if-chain |
| `2.c` `0x700000` 读取 | **有**（`func_875` 全家） | **0 处** |
| `func_241` 注册 | 26 条基础态 + `func_849` 遍历全表 | 67 条硬编码 |
| `global` 上限 | `global986` | `global779` |
| 连射机制 | `func_1182` → `func_891` 重派发 row | 原生 `func_596` 重跑 `global677` |

结论：`func_1082/1083/1085/1086` 依赖 `global798` 指向的 param row、
`global964/951/952`（都在 `global779` 之上）、以及 `func_891` 的 row 重派发。
Rebellion 三样都没有。**能搬的是配方，不是函数。**

好消息：两边的**共通 runtime 模板逐字相同**（已核对）：
`func_233 / func_236 / func_274 / func_299 / func_300 / func_308 / func_309 /
func_351 / func_586 / func_593 / func_594 / func_595 / func_596 / func_167 /
func_91 / func_106 / func_109 / func_110` 全部 identical。
只有 `func_891` 不同（Hambrabi 版是 row 重派发，Rebellion 版是 `sys_4A` 清 FX）。
`sys_46(0x1, 0x2, …)` / `sys_46(0x2, 0x3, …)` 两种调用形在两边都是高频形，参数数一致。

---

## 4. 已落地的移植（2026-08-31）

### 4.1 映射

| 输入 | hash | ACTION | 变形 |
|------|------|--------|------|
| 鸟形态 `global48 & 0x80` + `global2 & 0x10`（左） | `0x5346534c` "SFSL" | `SUB_SHOT_FLIGHT_ROLL_L` | **保持** |
| 鸟形态 `global48 & 0x80` + `global2 & 0x20`（右） | `0x53465352` "SFSR" | `SUB_SHOT_FLIGHT_ROLL_R` | **保持** |
| 鸟形态 `global48 & 0x80` 其余（N / 前后） | `0x7e08fcc9` | `SUB_SHOT_FLIGHT`（原解除变形 stub） | 解除 |

自造 hash 沿用本机已在用的 ASCII 风格（`0x53554243` = "SUBC"）。
`func_241` 对未知 depiction id 会走 `sys_1(0x10004, 0x2, hash, 0x1)` 自注册，
"SUBC" 就是靠这条工作的。

### 4.2 逐字照抄的部分

```c
sys_46(0x2, 0x3, ±0x2328, 0, 0xdc)    // 换边反向踢    Hambrabi func_1082/1085
sys_46(0x1, 0x2, ±0x2328, 0, 0xb4)    // 横向推进      Hambrabi func_1083/1086
global452 / global453 / global454 = 0x32 / 0x60 / 0x62
global689 = 0x6                        // START 瞄准窗
```

### 4.3 用本机原生手法重写的部分

| Hambrabi 做法 | Rebellion 替代 |
|---------------|----------------|
| `func_1182` → `func_891` 重派发 row 实现按住续射 | `global683 = 0x1`；tick 在 `func_593` 之后跑 `rebellion_flight_sub_hold_refire`（`func_233(0x80)` + 5/21/34f 窗 + `func_81(global3, 0, 0x1, 0)`）。禁止 `global683 = 0x3` |
| 自带側転 motion clip | 无该 clip，START 用 `func_308(global20, 0x9de587ce, global276, 0x190, 0)` 播鸟环，形状抄 `ACTION_A_SHOT_BIRD` |
| `global964` 换边 latch | `rebellion_flight_sub_last_side` |
| `global951 / global952` | **丢弃**（语义未知且超 `global779`，不猜） |
| 弾 `0x1e112ba4 / 0xaed70b08` | `0xCDA9F563 / 0xCDA9F564`（本机自制副射弹对） |

保持变形的做法抄 `ACTION_A_SHOT_BIRD`：tick 只有 `func_593()`，
靠 `func_41` 白名单跳过 teardown。**不要**往 tick 里加 `func_167`，
**不要**抄 flight-special 的 translation clamp —— 两者在本机都是登记在案的失败。

弾药：每次 ENTER 的那一发走 `sys_4F(0, 0x5, …)`。按住续射靠 `func_81` 重进，
`sys_0(0x90000, 1)` 没弹就不武装。

### 4.4 相位时序（本机自制时钟 `global244` / `func_274`）

| 段 | 帧 | 内容 |
|----|----|----|
| `676` start | 8f | 播鸟环、`func_94(0x5)`、`sys_4E(0)`、换边反向踢 |
| `677` shoot | 6f ×1 | 横向推进 + 弹对 + `sys_58(0x1, 0x436f1f0a)` + `func_123(0x380)`。按住副射才续 |
| `678` no_ammo | — | 指向 `679` end；**不可为 0**，见 I2 |
| `679` end | until clip `0x22` / complete | `func_89(0x5, 0)`、`global212 = 0x14`；给 `func_1182` 的 21–34f 续射窗留时间 |

合计约 34f，与 Hambrabi 的 34–38f 窗口同量级。

### 4.5 改动位置

```text
2.c  named globals 块      + rebellion_flight_sub_roll_side / _last_side
                             / _roll_push / _shot_count
2.c  SUB_SHOT_FLIGHT 之后   + SUB_SHOT_FLIGHT_ROLL_L / _R 与五个相位体
2.c  func_41 鸟形态白名单    + 0x5346534c / 0x53465352
2.c  func_1040             + 两条 func_241 注册
0.c  鸟形态 global48 & 0x80  右 0x20 -> ROLL_R，其余全部 -> ROLL_L
                           （0x7e08fcc9 保留注册但已不可达）
```

Gates：`check_msc_ai_blocks` / `check_msc_opaque_func_ptrs` /
`check_msc_action_shape` 三项全过。
`msclang.py` 编译通过。**只算本次改动**的字节增量：
`2.c` 262,544 → 263,632（**+1,088 B**），`0.c` 24,832 → 24,912（**+80 B**）。

> 测量方式：工作区 `2.c` 在本次改动之前就带有未提交的编辑
> （`rebellion_flight_special_dampen_shoot_move` 的 `0x50` → `0x32` 等）。
> 所以基线不是 `HEAD`（262,560 B），而是把本次五处锚点逆向剥掉后的工作区副本。
> 那些先前的未提交改动没有被碰过。

---

## 4.6 运行记录 I1（E3，2026-08-31）— 掉落 + 武装栏回主模式

**现象：** 鸟形态按副射左/右，动作确实是飞行 loop，但机体立刻下坠，
右侧武装栏变回主模式，鸟形态挂件被卸掉。

**原因：保持形态的白名单有两张，第一版只补了一张。**

`func_882`（由引擎经 `2.c func_15` 调用；`func_95` class `0x1` 的动作都会命中）
开头有一张和 `func_41` teardown 白名单**互为镜像**的早退表。新 hash 不在里面，
整段就跑完了：

| `func_882` 里的动作 | 症状 |
|---|---|
| `rebellion_interrupt_bird_form_to_ground()` → `func_296(0x3e8, 0)` → `sys_1(0x30001, 0)` | 飞行马达关闭 → 下坠 |
| 同上 → `func_169(0x4000)` + `global143 = 0` | 飞行位被清 |
| 同上 → `rebellion_bird_props_detach_after_shrink()` / `rebellion_restore_normal_hand_weapons()` | 挂件卸除、武装栏回主模式 |
| `func_884()`（START 里 `global170 = 0x1` → 走 else 分支挂军刀 `0x1c5c91a8`） | 装备被换掉 |
| 没有任何人停 `0x9de587ce` | 动作仍是飞行 loop |

`rebellion_teardown_should_keep_air_hold()` 对本动作返回 0（不在它的 hash 表里，
`global7` 是鸟 loop `0x77b100ff` 也不在保留表里），所以走的是 `func_296(0x3e8, 0)`
那条硬掉落分支。

**修法（已落地）：** 把 `0x5346534c` / `0x53465352` 也加进 `func_882` 的早退表。
先例是鸟特格落地三个 hash —— `func_41` 注释里就写着「Selector (1,4,9) still hits
func_882」，它们同样靠这张表保住形态。

**不要**改 `func_95` 的 selector class 去绕开 `func_882`：class 还牵动取消路线、
优先级和弹药门，动它的副作用面比补名单大得多。

**新增不变量：** `func_41` 的 `global3 != …` 链和 `func_882` 的 `global3 == …` 链
必须**始终是同一个集合**。只补一张 = 动作留着、状态全丢。当前两边各 12 个 hash，
已核对无漂移。

---

## 4.7 运行记录 I2（E3，2026-08-31）— 「完全没变化」其实是 stub 在跑

**现象：** 打完 I1 的补丁后**没有任何变化**；而且 `global678` 已经改成 0，
no_ammo 段却照样进。

**原因：第一版把 N / 前 / 後 留在了旧的 `0x7e08fcc9` untransform stub 上，
而测试时摇杆是回中的。** 跑的根本不是新动作。

三条报告互相印证同一个结论：

| 报告 | 解释 |
|---|---|
| 掉落 + 武装栏回主模式 | `SUB_SHOT_FLIGHT` ENTER 第一行 `rebellion_interrupt_bird_form_to_ground()` |
| I1 的 `func_882` 补丁毫无效果 | `0x7e08fcc9` 本来就不该进那张白名单，它就是要拆形态的 |
| `678` 改成 0 但 no_ammo 仍进 | 改的是 ROLL 的 ENTER；stub 的 `global678` 仍是 `sub_shot_flight_no_ammo` |

排除过程（记下来省得重走）：

- `0.bscex` / `2.dscex` 的 mtime 与体积都随改动增长，**反编译打包产物**确认
  三分支和两条 `func_241` 注册都在二进制里 → 工具链与部署无嫌疑。
- `0.c func_2`：`global2` 的方向位是纯摇杆读数
  （`sys_0(0x20000, 0x4)` → `0x10` 左、`0x5` → `0x20` 右），
  **没有任何飞行态门控** → 左右分支本身没问题。
- 把 `.dscex` 当明文小端 u32 grep hash **是无效测法**：连未改动的旧 hash
  也是 0 命中，常量不以明文存放。

**修法（已落地）：** 鸟形态 `global48 & 0x80` 的所有方向都走 ROLL 对，
回中/前/後默认 `+0x2328` 侧（`SUB_SHOT_FLIGHT_ROLL_L`）。
`0x7e08fcc9` 保留注册但已不可达。

**I1 的补丁仍然必要**，只是被这个 bug 掩盖了：ROLL 用 `func_95` class `0x1` 提交，
真正跑起来后一定会命中 `func_882`。

## 4.8 `global678 = 0` 会挂死（E1，源码钉死）

「没弹药不需要进入」这个想法对，但 driver 不是跳过，是照样进：

`func_595` 在 START 结束时查 `sys_0(0x90000, global681, 0)`，空槽就
`global184 = 3` 并 `func_71(global678)`。`func_71(0)` 把 `global225` 置 0，
`func_72()` 的 `else if (global225 != 0)` 于是**什么都不调**。此后每帧跑
`func_597`：`func_72()` 空转，而它退出的唯一条件是 `if (global252)` ——
可 `func_73()` 刚把 `global252` 清零，再没人写回。**永久停在 phase 3。**

`0.c` 鸟形态 `0x80` 分支**没有弹药门**（隔壁 `0x100` 特射才有
`if (!(sys_0(0x90000, 0x2) == 0))`），弹数只有 2，所以这条路够得着。

正确写法是指向 end 而不是 0：`global678 = sub_shot_flight_roll_end;`

---

## 4.9 `func_95` 四参数 = 武装类别描述符（E2，跨机体对照）

Hambrabi 的 0.c **没有**飞行副射这段代码：全文 `func_95(0x…)` 调用点 **0 个**，
也没有 `global48 & 0x80` 分支。输入→动作整张表在 `chrsysparam`，
`func_143` 只把状态丢给 `sys_41` 拿 row index。

但 `func_145` 交代了 `func_95` 四个参数**从哪来**：

```c
void func_145(int row, int classIndex, int extra) {
    var3 = sys_0(0x700000, 0, row, 0x2e);               // arg0 hash
    var4 = sys_0(0x700000, 0, row, 0xa);                // kind
    var6 = sys_0(0x700002, var4, 0,   row, 1);          // arg1  <- 由 kind 决定
    var7 = sys_0(0x700002, var4, 0x1, row, 1) | extra;  // arg2  <- 由 kind 决定
    func_95(var3, var6, var7, classIndex);              // arg3 <- func_144(row)
}
```

**四个数是武装类别描述符，不是自由填的。** 经典 selector 世代没有表，
就必须**从同类别的现成动作照抄**。

`func_144` 的方向重映射（前 `0x4`→2 / 左 `0x10`→3 / 右 `0x20`→4 / 後 `0x8`→5）
在 WZR 自己的数据里得到完全印证 —— 左右格闘 `0x6338be1f` 就是**同一个 hash
配 class 3 和 class 4**。这是 E2 交叉确认。

WZR 0.c 全部 36 条 `func_95` 归纳出的 class 语义：

| class | 用途 |
|---|---|
| 0 | 主射系 / **鸟形态射击**：`0x476fac14` 鸟主射、`0x2194f05d` 鸟CS2、`0xd94d608f` 飞行特射、`0x7cd11119` 地面主射 |
| 1 | N 格 | 2/3/4/5 | 前 / 左 / 右 / 後 格 | 6 | BD 格 |
| 7 | **地面副射** | 8 | 地面特射 | 9 | 特格 | 0xa 覚醒 | 0xb CSA | 0xc CSB |

`arg1` → `global61`：两个引擎谓词分流，`func_87()` 要 `global61 == 1`，
`func_88()` 要 `global61 == 0`。**0.c `func_15`（飞行/待机形态选择器，
`global20 & 0x4000` → index `0x18` 就在里面）第一行就是 `var0 = func_88();`** ——
只有 `arg1 == 0` 的提交参与飞行 loop 选择。三个保持形态的鸟形态射击全是 `arg1 = 0`。

`arg3` → `global62`：`sys_1(0x10000, 0, 0x1a, global62)` 发布为共享字段 0x1a，
并被当位号用（`0x1 << global62`）。

**修法（已落地）：** 飞行副射三条 `func_95` 从 `(0x1, 0x1, 0x7)` 改为
**`(0, 0x1, 0)`**，与鸟主射/鸟CS2/飞行特射完全一致。
`(0x1, …, 0x7)` 是从 untransform stub 继承来的**地面副射**槽。
这也顺带绕开了 I1 那条路：`arg1=0 class=0` 的动作根本不进
`func_15`→`func_882`，鸟主射就是这么保住形态的。

**不要**照搬 Hambrabi 的方向→class 重映射：`func_144` 只在
`row field 0x3 % 100 == 1` 时才应用它，kind 0x35 的该字段值在没有 chrsysparam
的情况下未知（E0），而且 WZR 的 class 3/4 已被左右格闘占用。
左右用两个 hash + 两个 ENTER 是本世代的正确等价物 —— Hambrabi 那边左右很可能
共用一个 hash，靠 row index 挂不同 hook 区分，而 WZR 没有 row。

---

## 4.10 对准 / 移动所有权实机结果（2026-08-31）

**Stage 1:** 两个 roll ENTER 的 `global689` 从 `0x6` 改为 `0xA`。用户确认
背对敌人时 START 能对准，但与前包没有可观察差异；持续 SHOOT 按住后仍会偏离
目标。结论：`global689` 只影响 `func_595` START，不是 SHOOT yaw owner。

**Stage 2（E3-，registry I9）：** 在共享 START/SHOOT ENTER 加 TV Wing Zero
`func_351(0x1,0x4)`。用户再次报告无可观察变化：背对 START 仍对准，持续 SHOOT
按住后仍偏离。结论：profile 1 在 Rebellion 上没有把平移与 yaw 解耦。

下一单变量为 SHOOT-only current-target yaw，写在 bare `func_593()` 之后并严格 gate
`global184==2`。本 action tick 没有 `func_167` 后置覆盖，因此与 flight-special D12
不是同一 writer order。禁止扩到 START/679；否则会与 `func_595` 或 EXIT analog 竞争。

**Stage 3（E3-，registry I10）：** 上述 SHOOT-only yaw 实机仍完全不起作用。
这使 writer order 重新变成二义：要么 `global184==2` 分支没有按假设执行，要么
native flight analog 在整个 MSC tick 之后再次覆盖 channel 0。按探针协议，下一包只在
该分支第一次执行时播放一次 SE；响后才允许研究 native input owner，禁止继续加大 yaw。

**Stage 4 探针被用户拒绝。** 不用 SE；锁定是否还在、会不会坠、收招能不能飞，
全部用动作本身判别。I10 的「完全没效果」按 D9/I7 处理：`func_594` 在 START
留下 `func_296(0x3e8, 1)` / `sys_1(0x30001, 1)`，按住摇杆就会把航向从当前锁拉开。

**Stage 5（E3-，registry I11）：** 677 ENTER-only `func_296(0x3e8, 0)`。当时按
「锁朝向」读；用户后来说只要不按后都正常，持续按后会往后飞、镜头偏。

**Stage 6（E3-，registry I12）：** 同一关电机改到 677 每一 tick。SHOOT 自由落体，
鸟外观还在，落地解除变形。电机已从这条招拿掉。Hambrabi / 鸟主射都不关电机。

**用户澄清（2026-09-01，动作）：** 不按后 = 没问题。持续按后 = 往后飞 → 视角偏移。
这是 `0x4000` analog 后向位移，不是 START 锁朝向失败。

**Stage 7（E3-，registry I13）：** `global454=0` 与鸟主射相同。用户报告没用：不按后
仍正常，持续按后仍往后飞、镜头偏。mix 已改回 Hambrabi `0x62`。结论：native
`0x4000` analog 不吃 leftover scale。不要再降 mix、关电机、清 `0x4000`、抄
足止 clamp、或写 yaw。不按后这条招保持现状。

**Stage 8（撤回，未 E3）：** `func_296(0x3e9,0)` 抄的是 kind 0x35 `global854` 足止，
不是侧转 hook。`func_1083`/`func_1086` 从不写 `0x3e9`。

**Stage 9（撤回，未 E3）：** `sys_4C(0x8, 0x3)` 是 magnitude reseed，挡不住后向 analog。

**Stage 10（未进入用户加载的二进制）：** 声称 `68C073FE` 已装，用户侧哈希对不上。

**Stage 11（E1 已装 `616D3F43`，E3 待实机）：** 2026-08-28 电机开着的通道 clamp
写在 tick 的 `func_593()` 之后。676/677 每 tick 升 `clamp_live`，SHOOT 另升
`rewrite_lateral` 以便清通道后再写 Hambrabi `sys_46(0x1, 0x2)`。679 清标志，
所以 EXIT 不被 clamp。不 gate `global184`（I10）。不关电机（I12）。不清
`0x4000`。不写 `sys_46(0xF)`。I13 禁止抄 clamp 是 mix 失败后的预防性禁令，
这条招上从未 E3 测过 clamp；Stage 11 是第一次哈希对得上的 clamp，但 START yaw 在 clamp 之后。

**Stage 12（E1 已装 `46A5F1D2`，E3 待实机）：** 把通道 clamp 改到 tick 最后写入。START yaw 仍可在 `global184==1` 时跑，但必须在 clamp 之前。电机开着。不清 `0x4000`。不写 `sys_46(0xF)`。

**Stage 13（E1 已装 `1CFD3810`，E3 待实机）：** SHOOT 每 tick `func_351(0, 0x4)`（I1 足止 profile，电机仍开）。679 ENTER `func_351(0x2, 0x4)`（D10，避免 profile 0 收招空中 idle）。START 仍是 profile 1。Stage 12 clamp 仍在 tick 最后。

**Stage 3 之后的静态重读（仍 E1/E2，等 Stage 4 探针升格）：**
前一轮把 I10 理解成「本 tick 没有 `func_167`，所以不是 flight-special D12」。
这只排除了 MSC 自己后置重发 analog，**没有**排除鸟形态 `global24 0x4000`
的原生 analog。I7 已经 E3 证明：只要该位仍在，原生 analog 会同时写位移和朝向，
不需要 MSC `func_167`。foot-stop handbook / D9 的原话是：analog `0x4000` 或
ch-1 mag 仍跑时，`sys_46(0)` 会被飞行航向覆盖。侧转 tick 故意保持
`ACTION_A_SHOT_BIRD` 的裸 `func_593`、不拆 `0x4000`，因此 I10 的「完全没效果」
与 D9 同类，优先于「没进 SHOOT」。用户拒绝 SE 探针后，Stage 5 改为 SHOOT-only
关掉 `sys_1(0x30001)`，用动作看锁还在不在。

Hambrabi 原文也**不是** SHOOT 活锁：`func_1083`/`func_1086` 只在
`func_309(..., 0x320)` 写横向 `sys_46(0x1, 0x2, ±0x2328, …, 0xb4)`，没有
`sys_46(0, func_626())`。瞄准窗只在 START 的 hook `global689=0x6`。wiki
「转回目标」更像侧转 clip 的 root 旋转；本机 START/SHOOT 播的是鸟 loop
`0x9de587ce`，没有这条视觉。

TV `ACTION_AB_SUB_ALT_2/3` 的 `func_351(0x1,0x4)` 也不是单独生效：它配专用
clip（`0x2ed9aa96` / `0x59477866`）、`func_168(0x1000000)`、`func_166` 姿态
偏置，以及 START 每 tick `global47 |= 0x40`。I9 只抄了 profile 1，所以无观察
变化不能解读成「TV 解耦在 Rebellion 上被证伪了完整配方」，只能解读成
**单变量 profile 1 不够**。完整 TV 配方是多变量，禁止一次堆上。

`func_594` 在 `global24 & 0x1000000` 且没有 `global122 0x40000` 时会
`func_296(0x3e8, 1)` 并把 `global714` 设成 `global454`（侧转 mix `0x62`）。
鸟主射把 mix 写成 `0/0/0`；侧转抄的是 Hambrabi `0x32/0x60/0x62`。I8 禁止
在**仍有** `func_167` 的照射 tick 上靠 ENTER mix 降敏捷；本侧转 tick 没有
`func_167`，因此 mix/analog 才是 I10 之后的合法下一刀，yaw 不是。

---

## 5. 实机之前要盯的点（部分已验证，见 §4.6–4.10）

1. **左右方向可能反**。`sys_46` 的轴向符号约定是 E0，`0x2328` 到底是左还是右
   只能实机看。反了就把两个 ENTER 里的 `rebellion_flight_sub_roll_push` 对调。
2. **保持变形是否真的成立**。白名单加了，但 `0x7e08fcc9` 历来是解除变形的路径，
   鸟形态资源挂载（`rebellion_attach_dual_hand_guns_bird`）在这条路上没跑过。
3. **3 连射是否真的打三发**。`global683` 强制重复不看按键，但 `func_596` 还要过
   `sys_0(0x90000, global681, 0)`；第一发扣掉弹后若槽归零，后两发会被吞。
   若出现只打一发，先把弹槽改成不扣（三束全走 `0x5`），再实机。
4. **N / 前后 仍然解除变形**，与左右保持变形并存，手感会不一致。
   补 `前進射撃` 是 Future work。
5. 工作区里的 `2.dscex`（302,016 B）与 `msclang.py` 从当前 `2.c` 编出的
   263,632 B 差 39 KB，**这在改动之前就存在**（baseline 编译 262,560 B）。
   打包前先确认要发布的 `.dscex` 到底从哪条路来的。

---

## 6. 反查工具备忘

`func_873` / `func_988` 返回的是**字节码指针**，反编译器没还原成函数名。
用同目录 `2.txt` 的 `[func_name: func_N, pointer: P]` 表反查，偏移固定 **−48**：

```python
target_name = name_of(pointer + 48)
```

`func_988` 的 131 项要从二分查找树里正则抓 `(0x……) == arg0) { var1 = (0x……);`。
