# course category 是规则开关，不是标签（E3 / E3-）

**Date:** 2026-09-20
**Status:** E3（两次实机会话，一次崩溃一次规则错乱）+ E1（117 行 course × 342 个 BSFO 的全量统计）
**Kind:** 负面结果 + 硬不变量 —— 动 `triad_battle_course_list` 的 `FFFF823B`（CATEGORY）之前必须读
**Owner 文档:** [exvs2-ob-triad-mission-architecture](./exvs2-ob-triad-mission-architecture.md) §6.3
**落地:** `src-tauri/src/format/triad_route_validate.rs`（7 条规则，见 §6）

---

## 0. 一页结论

course 行的 `CATEGORY`（`0xFFFF823B`，1..6 = A..F）**同时决定三件事**，改它等于换关卡规则：

1. **关数**：A–E 走 stage1→stage2→stage3，F 只走 stage1。
2. **选关页分组**，以及 scene 名字必须带的类别字母。
3. **战斗规则**：F 类是限时目标猎杀，A–E 是歼灭。

这三者在原版数据里**从不分歧**。任何一处对不上，游戏不会报错，只会崩溃或者算错：

| 分歧 | 实机表现 |
|---|---|
| A–E 类 course 只填了 1 关 | 打完第 1 关 → 取 stage2 scene key = 0 → 三张表都查不到 → `未初期化のoptional型にアクセスしようとしています` → access violation |
| F 类 course 指向 `a…` 场景 | 不崩，但按 F 规则跑歼灭关：击坠正常计数，**战力槽不掉**，loading 页和选关页显示的类别互相矛盾 |

---

## 1. 怎么发现的（实机，E3）

两次会话打的是同一条自制路线 A-30（course_id 253，`COURSE_NAME` = `A-30`，只有一关 `a030_001`，
脚本是 `a001_001` 的逐字节克隆）。

### 1.1 CATEGORY = 1（A 类）→ 崩溃

`EXVS2-debug-20260920-122343.log`：

```
12:24:55~12:25:30  第 1 关战斗（AiContextProbe: GYAN00 / CHRGEL / GUNDAM / GNTANK / GCANON）
12:25:52           result 上传 socket
12:25:53 + 12:26:07 两次 LoadProfiler burst（在加载下一关）
12:26:10           新单位 spawn，task key 归零 = 全新战斗上下文
12:26:11  [GAME-LOG] 未初期化のoptional型にアクセスしようとしています
12:26:11  [error] [CrashReport] access violation: read at 0x7959B80000, faulting rva=0x65070E7FD
12:26:11  [error] [CrashReport] access violation: write at 0x0, faulting rva=0x85A799
```

course 行当时是 `CATEGORY=1`、`STAGE1=0xE8E88E4A`、`STAGE2=0`、`STAGE3=0`。
scene 表和 sceneidtable 里**都没有 id 为 0 的行**（两表最小 id 都是 `0x00721CDC`），
所以 stage2 的查表落空 —— 这就是那个空 optional。

### 1.2 CATEGORY = 6（F 类）→ 不崩，但规则不对

只把 CATEGORY 改成 6 之后（`EXVS2-debug-20260920-125233.log`）：

- 全程无 `[error]`，不再崩溃；
- `[GAME-LOG]撃破数: 1 → 2 → 3` —— 击坠是正常记的；
- 但战力槽不掉，因为 F 类跑的是目标/计时规则，歼灭槽没有东西驱动；
- 选关页按 `CATEGORY` 归到 F 区，loading 页按 `COURSE_NAME`（仍是 `A-30`）显示 `A-30-1`。

> **排除项**：`賞金首撃破数: 1` 在 A 类那次和 F 类这次**都出现**，它来自脚本里的 boss 槽，
> 不是 F 类带来的，不能用它判断类别。

---

## 2. 名字不是标签：scene key 把类别哈希进去了

scene key / 脚本包哈希都由**资源名**推导（§5.2 的前缀状态模型）：

```
family_hash(state, UPPER(name)) = reflected CRC32 从 state 续算，末尾 ^ 0xFFFFFFFF
scene key       state = 0x7B60F97C
script package  state = 0xAA71E366
```

对 `000triad_battle_a030_001` 实测：

| | 算出 | 表里 |
|---|---|---|
| scene key | `0xE8E88E4A` | scene_list / sceneidtable 行 id ✓ |
| script package | `0xDC5B78E4` | sceneidtable 该行的值 ✓ |

名字里的 `a` 和 `_001` 因此**不可改写**：改字母或改关序号就是换一个 key，
必须重新建 scene（新 BSFO、新脚本包、新表行），不能只改显示名。

---

## 3. 从原版数据挖出的不变量（E1）

统计对象：`012list/triad_battle_list` 的 117 行 course（116 行原版 + 1 行本次自制）、
`outmission` 的 342 个 BSFO。scene key 用 §2 的公式全量反解，**321 个 stage key 无一解不出**。

| # | 不变量 | 覆盖率 | 例外 |
|---|---|---|---|
| INV-1 | 非 F 类（1..5）course 恰好 3 个非零 stage key | 102 / 102 | 本次自制行 |
| INV-2 | F 类（6）course 恰好 1 个非零 stage key | 14 / 14 | — |
| INV-3 | stage scene 名字的类别字母 == course 的 CATEGORY 字母 | 116 / 117 | 本次自制行（F 类指 `a030_001`） |
| INV-4 | stage scene 名字的关序号 == 它所在的 stage 槽位 | 117 / 117 | — |
| INV-5 | F 类 BSFO 的 scene class == 2（TARGET） | 14 / 14 | — |
| INV-6 | F 类 BSFO 的 `hasTarget` == 1 | 14 / 14 | — |
| INV-7 | F 类 BSFO 时限 == 420 秒 | 14 / 14 | — |
| INV-8 | A–E 类 BSFO 时限 == 180 秒 | 306 / 306 | — |
| INV-9 | 一条 course 的各关来自**同一个** scene 课号 | 117 / 117 | — |

INV-9 只覆盖课号，**不覆盖 `_r` 变体后缀**：原版有 6 条 course 把变体和非变体场景混在一起
（`B-4` = `b004_001_r1 / b004_002 / b004_003`，`A-11` = `a011_001 / a011_002 / a011_003_r1`，
另有 `A-2`、`A-3`、`C-4` 和 `B-4` 的第二个变体行），所以混用变体是正常写法，不该报错。

BSFO scene class 按类别的分布（0=STANDARD 1=RANDOM 2=TARGET 3=BOSS，已剔除自制行）：

| 类别 | class 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| A | 39 | 36 | 2 | 1 |
| B | 33 | 38 | 3 | 1 |
| C | 34 | 29 | 5 | 1 |
| D | 21 | 21 | 0 | 0 |
| E | **42** | 0 | 0 | 0 |
| F | 0 | 0 | **14** | 0 |

> **E 类全是 STANDARD（42/42）** 是一个观察，不是强制规则 —— 样本比 F 小且没有实机反证，
> 所以校验器没有把它变成规则，只记在这里。

`COURSE_NAME` 与 `CATEGORY`+`NUMBER_IN_CATEGORY` 的关系**不是**不变量：
原版 A-99 / B-99 / C-99 三行的 `NUMBER_IN_CATEGORY` 都是 50，名字却是 `x-99`。
`COURSE_NAME` 是自由显示串，`NUMBER_IN_CATEGORY` 是上报服务端的槽位，两者可以不同。

---

## 4. 两个自洽形状

想加一条路线，只能落在这两个形状之一。

### 4.1 A–E 类（歼灭，三关）

| 字段 | 值 |
|---|---|
| `CATEGORY` | 1..5 |
| stage key | 3 个非零，分别指向 `<字母><NNN>_001 / _002 / _003` |
| BSFO scene class | 0 / 1 / 2 / 3 皆可（与脚本胜利条件互证，见 §9） |
| BSFO 时限 | 180 |

### 4.2 F 类（限时目标猎杀，单关）

| 字段 | 值 |
|---|---|
| `CATEGORY` | 6 |
| stage key | 1 个非零，指向 `f<NNN>_001`（原版 f001..f014 已占满） |
| BSFO scene class | 2（TARGET） |
| BSFO `hasTarget` | 1 |
| BSFO 时限 | 420 |
| 脚本 | 从某个 f 场景克隆；目标数 / 胜利标志在脚本里 |

把一条 A 类路线「改成 F 类」**不是改一个字段**：scene 名字带类别字母，
所以要重新建 `f<NNN>_001` 场景，scene key 和脚本包哈希全部重算。

---

## 5. 被证伪的做法（E3-）

| # | 被证伪的做法 | 实机症状 | 正确方向 |
|---|---|---|---|
| T1 | A–E 类 course 只填 1 关，指望游戏在 stage key = 0 时收手 | 打完第 1 关崩溃（空 optional → access violation） | 非 F 类必须填满 3 关；校验器 `stage-count-invalid` 以 Warning 报告，不挡住保存 |
| T2 | 用改 `CATEGORY` 来「修」T1 | 不崩了，但按 F 规则跑歼灭关：击坠计数正常，战力槽不掉 | CATEGORY 换了就要连 scene 名字、BSFO class / hasTarget / 时限一起换 |
| T3 | 把 scene 名字当显示标签，以为改类别不用重建场景 | 改名 = 换 key，原来的 BSFO / sceneidtable / 脚本包全部对不上 | 见 §2；换类别要走新建场景流程 |
| T4 | 只重打包 `outmission` + 脚本包，不打包 `0xE952325A` / `0xA073DA71` | 关卡在游戏里**完全不出现**，没有任何报错 | 表在那两个包里；用 Triad Route Editor 的「重新打包」对账 |

---

## 6. 校验器落地

`src-tauri/src/format/triad_route_validate.rs`，2026-09-20 新增 / 改动：

| code | 级别 | 规则 | 依据 |
|---|---|---|---|
| `stage-count-invalid` | **Warning**（不挡住保存；实机仍会在打完后崩溃） | 非 F 类必须恰好 3 关 | INV-1 + T1 实机崩溃 |
| `scene-category-mismatch` | Error | stage scene 名字的类别字母必须等于 course 的 CATEGORY 字母 | INV-3 + T2 实机规则错乱 |
| `scene-stage-number-mismatch` | Error | scene 名字的关序号必须等于它所在的 stage 槽位 | INV-4 |
| `scene-name-unresolved` | Warning | scene key 反解不出标准名时，上面两条无法检查，据实说明而不是假设通过 | — |
| `f-class-briefing-class` | Error | F 类 BSFO scene class 必须是 2 | INV-5 |
| `f-class-target-flag-missing` | Error | F 类 BSFO 必须置 `hasTarget` | INV-6 |
| `f-class-time-limit-unusual` | Warning | F 类时限不是 420 秒时提醒 | INV-7 |
| `scene-course-number-mixed` | Warning | 各关来自不同 scene 课号时提醒（变体后缀不参与判断） | INV-9（仅 E1，无实机反证） |

已有的 `f-class-single-stage`（F 类超过 1 关 = Error）和 `scene-class-mismatch`
（BSFO class ↔ 脚本胜利标志）保持不变；后者让 F 类的 class=2 顺带把脚本的目标计数也拉进检查链。

---

## 7. 顺带确认：exe 的日文是 UTF-8

崩溃时那条 `未初期化のoptional型にアクセスしようとしています` 在
`vsac27_Release.exe` 的 `.rdata`：

```
file 0x01AAC750   rva 0x01AAD550   va 0x141AAD550   UTF-8
```

**不是 Shift-JIS** —— 按 CP932 扫会得到 `譛ｪ蛻晄悄蛹`​ 这类乱码，这是之前字符串工具扫不出日文的原因。
它周围是 `nbamsavdat::*` 那批 Namco AM 库报错串，说明这是**引擎全局共用的 optional 断言**，
不是 mission 专用的，光靠字符串定位不到抛它的函数（需要对该 VA 做 xref，本次未做）。

全量日文串导出保存在仓库外（`AGENTS.md` 禁止把游戏 dump 提交进 git）：
`E:\research\exvs2-jp-strings\`，6134 条（`.rdata` + `.data`；`.text` 命中全是代码字节
碰巧组成合法 UTF-8 的噪声，已剔除）。

---

## 8. 复现

所有统计都只读工作区和游戏目录，不需要 IDA：

1. course 表：`{workspace}/012list/triad_battle_list/*.bin`，param binary（§5.3），
   列哈希见 `src-tauri/src/format/triad_course.rs` 的 `columns`。
2. scene 名字反解：`family_hash(0x7B60F97C, UPPER("000triad_battle_<cat><NNN>_<MMM>"))`，
   实现见 `src-tauri/src/format/mission_hash.rs::identify_triad_scene`。
3. BSFO：`{workspace}/051mission/outmission/`，文件按 scene key 索引（结构 JSON 的 `unk1`），
   sec4 的 word 0 / 2 / 3 / 4 = scene class / map / 时限 / hasTarget（§8.2）。
4. 实机日志：`E:\OBHK0.3_v27\EXVS2-debug-*.log`，UTF-8。

---

## 9. 相关

- [exvs2-ob-triad-mission-architecture](./exvs2-ob-triad-mission-architecture.md)
  §5.2 哈希模型 · §6 course 表 · §6.3 分类与编号 · §7 scene 表 · §8 BSFO · §13 新增路线
- 写回守卫：同文档 §14.1（`mission_round_trip_status` 必须 `Identical`）
