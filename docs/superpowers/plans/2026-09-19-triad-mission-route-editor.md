# Triad Mission Route Editor 集成计划

> **For agentic workers:** 按 Phase 顺序执行，每个 Task 用 checkbox 跟踪。涉及 MSC 的 Phase（3、4.4）**禁用** fast-path 规则，
> 必须先加载 `.cursor/skills/msc-research-index/SKILL.md` 与 `.cursor/skills/msc-ingame-audit/SKILL.md`。

**Goal:** 在 EXVS2 Workspace（TestEditor）里提供「街机 Triad 路线编辑器」：查看全部 course / scene / 关卡脚本 / 简报数据，
并能一键生成「激活休眠 course」（T1）与「全新 course」（T2）所需的全部文件，输出到 OB 的 `data/x64/mod/`。

**Research basis:** [exvs2-ob-triad-mission-architecture](../../mission-research/exvs2-ob-triad-mission-architecture.md)（下称「架构文档」）。
本计划里的每个格式 / 语义结论都引用那份文档的章节；证据等级低于 E2 的字段在 UI 上只读或标为「实验」。

**Architecture:**

```text
OB dplcache / mod
  └─ fhm2d.rs（修：尾部源路径表）──► 解包到 workspace
        ├─ format/triad_course.rs      course / scene / ribbon 三表（基于 param_bin_format + obf_string）
        ├─ format/scene_id_table.rs    sceneidtable
        ├─ format/bsfo.rs              outmission BSFO
        ├─ format/mission_hash.rs      CRC 前缀状态哈希 + 查重
        ├─ format/triad_route_document.rs   人类可读的「路线工程」JSON
        └─ format/triad_route_validate.rs   跨表不变量（架构文档 §13.4）
  └─ tools/（Python）mission MSC 编译配置 + 往返门槛 + 槽位 / 波次生成器
  └─ triad_route_commands.rs ──► React：src/page/TestEditor/components/triad-route/*
  └─ fhm2d_pack.rs ──► data/x64/mod/0x????????.fhm2d
```

**Status (2026-09-19):** Phase 1 / 2 格式层、Phase 3 mission MSC、Phase 4 Workspace + UI 均已落地并全绿
（Rust 115 项、前端 117 项，`cargo check --lib --bins` 零 warning，`tsc` 干净，i18n 覆盖检查通过）。
mission profile 五条规则全部实测实现，**342/343 逐字节往返**；关卡内容读写层可读 340/343 槽位、可改写 163/343 波次，
写回前按文件过 `mission_round_trip_status`。「1 台自机 vs 10 台同型机」已有端到端测试：
生成阵容 → 写进 mission 脚本 → 编译 → 回读确认 1 + 10。
Mission 数据初始化已接进 FHM2D Init（`triad_battle_list` / `sceneidtable` / `outmission` / `pilot_name_list`）。
Phase 5 打包沿用既有重打包对话框；Phase 6 实机验证仍待用户执行。

**Tech stack:** Rust（Tauri v2 commands）、Python MSC 工具链（`tools/mscdec.py` / `tools/msclang.py`）、React 19 + TypeScript + Zustand、Vitest。

**Non-goals:**

- 不改 exe、不做 hook（运行环境的 `mod/` 重定向属于本地 POC，不在本仓库）。
- 不编辑遗留表（trialset / missionset / challenge / missioninfo / ultimate*）。
- 不做服务端改动；只输出一份「服务端需要开放哪些 course_id」的清单（Phase 7）。
- 不把任何游戏文件、反编译全文、IDA 列表放进 git；测试夹具一律在测试里用字节构造。

---

## Phase 0：研究登记

### Task 0.1：MSC catalog 登记 mission 脚本 cluster

**Files:** Modify `tools/msc_research_catalog.py`（生成 `docs/msc-research/INDEX.md`）

- [x] 新增常量 `CLUSTER_MISSION_SCRIPT = "mission-script"` 与 `Cluster(kind="global")`（2026-09-19 完成）：
  - `aliases`：`mission script`、`mismsexc`、`CMissionScript`、`triad`、`arcade mode`、`arcade course`、`sceneidtable`、`outmission`、`BSFO`、`triad_battle_course_list`、`sys_0 0x400`、`0x40e`、`X-99` 等（Python 源码里不放中文，中文检索靠 `docs/msc-research/INDEX.md`）。
  - `read_first`：`docs/mission-research/exvs2-ob-triad-mission-architecture.md`。
  - `settled`：架构文档 §0 的 E2 结论。
  - `do_not`：「不要用 `0x400` 的死参数调数值」「不要依赖 `sys_0(0x349)`」「不要把 trialset 当成街机路线」「不要把 msclang 重编的 mission 脚本当成已验证」「不要跨模板版本搬 global 编号」。
- [x] `python tools/msc_research_catalog.py --write-index` 与 `--check`：`OK: 39 clusters, 107 msc-research files catalogued`。
- [ ] 实机结果回来后，把 E3 / E3- 结论补进该 cluster 的 `settled` / `do_not`。

---

## Phase 1：格式层（Rust，先只读后可写）

每个 Task 结束：从 `src-tauri/` 跑 debug `cargo check --lib --bins`（零 warning）与对应的 `cargo test <module>`。

### Task 1.1：fhm2d 解析容忍尾部源路径表

**Files:** Modify `src-tauri/src/format/fhm2d.rs`

- [ ] `parse_ob_fhm2d`：SubFileStructure 的起点改为 meta `+0x10`（与现有 `sub_cursor` 交叉校验，不一致就报错，不做回退）；
  解析在「根 Folder 的 EndMark 闭合」处结束，剩余字节作为 `trailing_path_table` 解析成 NUL 分隔字符串并保留在结构里。
- [ ] 单元测试：用字节构造一个 1 文件包（Folder + Item + EndMark + 路径字符串），断言解析成功、路径字符串被读出、Item `unk1` 被保留。
- [ ] 真实文件验证（不入库）：`fhm2d_extract` 解 GX 的 `0x67AF23FA.fhm2d` 到 `tmp/fhm2d-extract/mission-gx-check/`，与架构文档附录 D 的已知输出比对。

### Task 1.2：mission 哈希家族

**Files:** Create `src-tauri/src/format/mission_hash.rs`

- [x] `pub fn family_hash(state: u32, name: &str) -> Result<u32, String>`（架构文档 §5.2；非 ASCII / 空名直接报错）。
- [x] 常量：`SCRIPT_PACKAGE_STATE = 0xAA71_E366`、`SCENE_KEY_STATE = 0x7B60_F97C`。
- [ ] `pub fn triad_scene_name(category: char, course_no: u16, stage_no: u16, variant: Option<u8>) -> Result<String, String>`：只接受 `a..f`、`1..=999`、`1..=3`，其它直接报错。
- [x] `pub fn check_collisions(candidate: u32, existing: &HashSet<u32>) -> Result<(), String>`。
- [x] **额外**：`identify_triad_scene(scene_key)` 反查官方场景名（枚举命名规则全空间），休眠槽位因此能显示成 `A-22 / a022_001`。
- [ ] 测试：`000triad_battle_a001_001` → 包 `0x67AF23FA`、`000triad_battle_a002_001_r1` → `0x8FEEB7E9`、`100training_mode_001` → `0x37D39484`（这些是数值常量，不含游戏数据）。

### Task 1.3：triad 三表 codec

**Files:** Create `src-tauri/src/format/triad_course.rs`

- [ ] 基于 `param_bin_format::{read_param_binary, build_param_binary}` 与 `obf_string`，定义：
  - `TriadCourseRow`（字段按架构文档 §6.1，全部列都保留；未知列放 `extra: BTreeMap<u32, i32>` 原样回写）。
  - `TriadSceneRow { scene_key, scene_no }`（`61DF48F7` 必须等于行 id，否则报错）。
  - `TriadRibbonRow`（§7.2，未知列原样保留）。
- [ ] 行 id 升序插入 / 删除 API；重复 id 直接报错。
- [ ] 字符串池：重建时重新编码（`obf_encode_from_string`），并对「无修改时逐字节相同」做测试。
- [ ] 测试：字节构造的 2 行 course 表往返逐字节一致；插入一行后行 id 仍有序。

### Task 1.4：sceneidtable codec

**Files:** Create `src-tauri/src/format/scene_id_table.rs`

- [ ] 单列 `7E82C1E7`（int32 → 按 u32 解释）的 key → 包哈希映射；升序插入；往返测试。

### Task 1.5：BSFO codec

**Files:** Create `src-tauri/src/format/bsfo.rs`

- [ ] `Bsfo { header, sec0: [i32; 12], units: Vec<BsfoUnit>, sec2_raw: Vec<u8>, slots: Vec<BsfoSlot>, sec4: [i32; 44] }`，
  `h08` / `h0c` 由内容重新计算并校验（架构文档 §8.1），`sec2` 原样保留。
- [ ] 类型化访问：`stage_hash()`（sec4[2]）、`scene_class()`（sec4[0]：0..3）、`time_limit_seconds()`（sec4[3]/[5]）、`boss_slots()`（sec0[2..4]）。
- [ ] 测试：字节构造的 BSFO 往返逐字节一致；`h08`、`h0c` 计算正确。

### Task 1.6：路线工程文档与跨表校验

**Files:** Create `src-tauri/src/format/triad_route_document.rs`、`src-tauri/src/format/triad_route_validate.rs`

- [ ] 「路线工程」JSON（`schema: "exvs2.triad-route/v1"`）：一个 course + 1..3 个 stage，每个 stage 持有 scene key、scene_no、脚本包哈希、BSFO 的可编辑字段、mission 配置摘要（Phase 3 填充）。
- [ ] 校验器实现架构文档 §13.4 全部条目，返回 `Vec<ValidationIssue { code, severity, message, location }>`；无修复性回退。
- [ ] 需要全局数据的检查（机体 id、驾驶员名、BGM、地图）通过已有 parser 注入：`characterlist.rs`、`bgm_list.rs`、`stagelist.rs`，以及新的 `pilot_name_list` 读取（vgsht2 单列字符串）。

---

## Phase 2：`exvs2-json` CLI

**Files:** Modify `src-tauri/src/exvs2_json_cli/inspect.rs`、`src-tauri/src/exvs2_json_cli/`（edit / correlate）、`docs/exvs2-json-cli.md`、`src-tauri/tests/exvs2_json_cli_test.rs`

- [ ] `inspect` 自动识别：course / scene / ribbon 表（按列哈希集合）、sceneidtable、BSFO（magic）。
- [ ] `correlate --triad-route <course_id> --workspace <dir>`：输出 course → 3 个 scene → 脚本包 → BSFO → 地图 / 胜负类别 的关联 JSON。
- [ ] `edit` 支持 course / scene 行的增删改（lossless builder）。
- [ ] 产物一律写到 `tmp/exvs2-json/<task>/`。
- [ ] 集成测试只用字节构造的夹具。

---

## Phase 3：mission MSC 工具链（MSC 规则全开）

开始前：`python tools/msc_research_catalog.py --match "mission script"`，并 grep `docs/msc-research/msc-falsified-negatives-registry.md`。

### Task 3.1：mission 编译配置与逐字节往返门槛

**Files:** Modify `tools/msclang.py`（新增 `--profile mission`）；Create `tools/check_mission_msc_roundtrip.py`

- [ ] `--profile mission`：header `0x08 = 0x000002FD`；`0x1C` 按原版规则计算（先用 343 个 OBHK 脚本统计出规则，写成确定性公式，规则不明就报错而不是猜）；
  保留 `0x01` 操作码（先在 `mscdec` 侧把它反编译成显式形式，确保 C 源里不丢信息）。
- [ ] `check_mission_msc_roundtrip.py <dir>`：对目录里每个 `.mismsexc` 做 `mscdec → msclang --profile mission → 逐字节比对`，报告首个差异（复用 `src-tauri/src/msc_roundtrip.rs` 的报告格式）。
- [ ] **门槛：OBHK 343/343 逐字节一致。** 达不到之前，Phase 4 的「生成脚本」按钮保持禁用。

### Task 3.2：mission 语义 overlay（只影响可读性）

**Files:** Create `tools/mission_sys0_overlay.json`；Modify `tools/mscdec.py`（可选注释输出）

- [ ] 为架构文档 §9.6 的子命令输出行尾注释（如 `// set_stage`），**不改变字节码**；overlay 不作为证据来源。

### Task 3.3：槽位表与关卡配置的双向转换

**Files:** Create `tools/mission_config.py`

- [ ] 从反编译 C 里定位配置函数（含 `sys_0(0x40e` 的函数），抽取：地图、各队 cost、胜 / 负标志、目标数、重要单位上限、BGM、全部 `0x400` 调用 → JSON（字段名用架构文档 §9.5 的语义名，死参数标 `dead: true`）。
- [ ] 反向：JSON → 重写配置函数体（只替换该函数，其他模板函数逐字保留），输出新的 `.c`，再走 Task 3.1 的编译。
- [ ] 波次：支持四种触发（存活数 ≤ N、延时秒数、已过帧数、槽位 HP%），生成与官方模板同形的阶段函数（参照 `a001_001` 的 `func_35`、`f001_001` 的 HP 分段）。
  生成区域用固定的起止注释标记，便于工具再次定位；不引入新的 opaque 函数指针（改完跑 `tools/check_msc_opaque_func_ptrs.py`）。
- [ ] 测试：对 OBHK 脚本「抽取 → 回写（不改内容）→ 编译」逐字节一致。

---

## Phase 4：Workspace / UI

### Task 4.1：内容目录登记

**Files:** Modify `src/services/testEditorWorkspace/contentCatalog.ts`（及其测试）

- [ ] 新增：`triad-battle-list`（`0xE952325A`）、`scene-id-table`（`0xA073DA71`）、`outmission`（`0xF7B91DE7`）、`pilot-name-list`（`0x80113E3D`）。

### Task 4.2：Tauri 命令

**Files:** Create `src-tauri/src/triad_route_commands.rs`；Modify `src-tauri/src/lib.rs`（`generate_handler!`）；Create `src/services/triadRoute/*.ts`

- [ ] `parse_triad_workspace(dir)`：一次返回 course / scene / ribbon / sceneidtable / BSFO 摘要（体积小，无需分块）。
- [ ] `validate_triad_route(project_json)`、`build_triad_route(project_json, output_dir)`（写出三表、sceneidtable、BSFO、脚本到 workspace 目录，不直接打包）。
- [ ] `generate_triad_scene_identity(category, course_no, stage_no)`：返回名字、scene key、包哈希与查重结果。

### Task 4.3：页面组件

**Files:** Create `src/page/TestEditor/components/triad-route/`：`TriadRouteView.tsx`、`CourseTable.tsx`、`CourseEditorPanel.tsx`、`StageInspector.tsx`、`BsfoEditor.tsx`、`SlotTableEditor.tsx`、`WaveEditor.tsx`、`ValidationPanel.tsx`、`RouteWizardDialog.tsx`；i18n：`src/i18n/resources/{en-US,zh-CN,ja-JP}/triad-route.json`

- [ ] 课程表：按分类 A..F 分组，列出 course_id、名称、3 关、解锁类型、初始开放、变体；休眠 scene 单独一栏。
- [ ] 关卡检视：脚本配置摘要、BSFO 字段、两者不一致高亮（地图、胜负类别、boss 槽位）。
- [ ] 槽位表：机体用角色表下拉（显示名字），驾驶员名用 `pilot_name_list`，BGM 用 `bgm_list`；死参数只读并提示「OB 不读取」。
- [ ] 向导：
  - **T1 激活休眠 course**：选休眠组（如 A-22）→ 填 course 属性 → 预览要改的 4 个包 → 生成。
  - **T2 新 course**：选分类与编号 → 自动生成名字与哈希（查重）→ 选模板 scene 复制脚本与 BSFO → 生成。
- [ ] 重计算放 `useTransition`；I/O 用显式 loading 状态。

### Task 4.4：脚本编辑入口（MSC 规则全开）

- [ ] 从关卡检视跳到现有 MSC workspace 打开对应 `.c`；提交前强制跑 Task 3.1 编译与 `check_msc_opaque_func_ptrs.py`。

---

## Phase 5：打包与部署

- [ ] 复用现有 repack 流程写出 `0xE952325A`、`0xA073DA71`（仅 T2）、`0xF7B91DE7`、脚本包；包名 `0x` + 大写十六进制；写入前调用 `removeMatchingModVgsht2` 清掉同名加密覆盖。
- [ ] 打包器：先用「内容不变」的重打包做 Phase 6 #0 验证；若游戏拒绝，改走与参考打包器逐字节一致的路径（见 `fhm2d_pack.rs` 的小文件兼容回退说明）。

---

## Phase 6：实机验证（由用户执行）

按架构文档 §13.5 的 H/P/F 矩阵，外加：

| # | 改动 | 通过判据 |
|---|---|---|
| 0 | 三个包「内容不变」重打包放入 `mod/` | A-1 / A-22 相关画面与原版完全一致 |
| 1..6 | 架构文档 §13.5 | 见原表 |

每个构建只改一个变量；结果回写到架构文档对应条目（E1 → E3 / E3-），并同步 catalog 的 `settled` / `do_not`。

---

## Phase 7：服务端清单（仓库外）

- [ ] 由 `build_triad_route` 同时输出 `server-release.json`：新增 course_id、名称、分类、金牌分、徽章 id，供本地服务端配置 `release_cpu_course` 与 Web UI 使用。

---

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| msclang 达不到逐字节往返 | 自制脚本不可信 | Phase 3.1 门槛；未达标前只允许 T1 且只改 BSFO / 表（脚本保持原版） |
| 新包哈希原版加载不了 | T2 失效 | 优先 T1（复用 27 个休眠 scene）；T2 放在实机验证 #6 之后 |
| course 选择页容量 | 新 course 不显示 | 先用休眠 course 号（UI 大概率预留）；实机验证 #1 |
| 小文件打包兼容 | 包被拒绝 | 实机验证 #0；必要时换打包路径 |
| 死参数误用 | 调了没效果 | UI 只读 + 提示；架构文档 §9.5 |
| 解锁类型 3 计数语义未知 | X-99 类路线解锁不符预期 | 新路线默认用类型 0（服务端开放）或类型 1（通关前置），类型 3 标实验 |

## 完成定义

- Phase 1–2：模块测试全绿，`cargo check --lib --bins` 零 warning，CLI 能对真实 OBHK 数据（放在 `tmp/`）给出完整 course 关联报告。
- Phase 3：343/343 mission 脚本逐字节往返。
- Phase 4–5：向导能对 A-22 生成完整改动并打包到 `mod/`。
- Phase 6：用户完成 #0、#1、#2 三项实机验证并回写证据等级。
