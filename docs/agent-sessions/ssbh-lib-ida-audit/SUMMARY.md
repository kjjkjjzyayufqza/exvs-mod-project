# ssbh_lib IDA 审计 — 汇总

**会话**: `docs/agent-sessions/ssbh-lib-ida-audit/`  
**日期**: 2026-06-14  
**IDA 二进制**: `vsac27_Release.exe`（`E:\OBHK0.3_v27\vsac27_Release.exe.i64`）  
**ssbh_lib**: `E:/research/ssbh_lib`（TAURI 通过 git `kjjkjjzyayufqza/ssbh_lib` 分支 `wmmt2` 引用）

---

## 执行摘要

对 `ssbh_lib` 全部 **12** 种格式完成了 EXVS2 可执行文件与库实现的交叉审计。结论可概括为：

1. **核心角色资源链（modl / mesh / skel / matl / anim / hlpb）** 在 IDA 中均有可追踪的 FourCC 分发或专用解析器，ssbh_lib 的**磁盘布局与游戏 v1.x 主路径大体对齐**；最大风险集中在 **ssbh_data 高层往返**（字段语义折叠、约束调度丢失、压缩头约定）而非 HBSS 容器本身。

2. **渲染管线格式（nrpd / nufx / shdr）** 存在明确的**版本错位**：EXVS2 出货资源使用 **DPRN v1.2**、**XFUN v1.2**，而 ssbh_lib 分别只实现 **v1.6** 与 **v1.0/1.1**；**RDHS** 在主线 EXE 中**未找到** FourCC 比较，解析可能在外部模块或剥离 HBSS 后的载荷层。

3. **非 SSBH 伴生格式（adj / meshex）** 与 **TSLN（nlst）** 在 EXE 中**无扩展名字面量、无专用加载器证据**；实际加载经 **FHM2D → ModelDataSet** 间接绑定，ssbh_lib 结构自洽但**与 EXVS2 运行时是否消费**仍不确定（adj 尤其如此）。

4. **TAURI 日常路径** 主要依赖 mesh / skel / modl / matl / anim / hlpb；nrpd / nufx / shdr 多为 FHM2D 透传；nlst / adj / meshex 当前未接入。优先修复应面向 **会改写出资源的格式**（anim 头、mesh 顶点语义、hlpb 约束序、nrpd v1.2 只读）。

**审计完成度**: 12/12 格式报告已落地；HBSS 外层未单独成文（各 SSBH 报告内已覆盖）。

---

## 格式对照表

| 格式 | FourCC / 扩展名 | IDA 覆盖度 | ssbh_lib 缺口严重度 | 首要修复 |
|------|-----------------|------------|---------------------|----------|
| [adj](adj.md) | 无 FourCC / `.adjb` | **低** — 无字符串、无解析器、FHM2D 无 type-id | **低**（EXVS2 可能不加载） | 若需法线接缝：工具侧从 mesh 生成，勿假设游戏读盘 |
| [anim](anim.md) | `MINA` / `.nuanmb` | **高** — `sub_140233570` 全版本链 + `/60` 时间基 | **中** — v1.2 头语义与 `0x3409`/`0x4409` 严格布局 | 写出固定 `final_frame_index=60`、`unk1=秒`、`unk2=末帧`；压缩回归 |
| [hlpb](hlpb.md) | `BPLH` / `.nuhlpb` | **高** — v1.1 解析 `sub_1402A6BC0`，144/112 字节步长确认 | **高** — `HlpbData` 丢失约束交错序；预览忽略 quat/`unk_type` | 往返保留 `constraint_indices`/`constraint_types` 原始顺序 |
| [matl](matl.md) | `LTAM` / `.numatb` | **高** — v1.5/v1.6 分发与 param switch 1:1 | **低–中** — Type4 16B 盘 vs 12B 内部；V15 不可写 | EXVS2 `Fresnel` Type4 黄金样本 round-trip |
| [mesh](mesh.md) | `HSEM` / `.numshb` | **中** — HSEM v7–10 分发有据；`sub_14029ACB0` 本次未重验 | **高** — `ExvsColor5/4/12` 读时语义折叠；v1.10 权重线格式歧义 | 停止将 usage 10–12 映射为 `TextureCoordinate`；对齐 `VertexWeightV10` |
| [meshex](meshex.md) | 无 FourCC / `.numshexb` | **低** — 无扩展名；经 ModelDataSet 间接 | **中** — 包围球重算、EntryFlag 位 3–5 丢失 | 保留 retail 标志位与包围球（若需二进制一致） |
| [modl](modl.md) | `LDOM` / `.numdlb` | **高** — v1.6/v1.7 解析与 24 字节 entry 步长 | **低** — 仅 v1.7；游戏另有 v1.6 | 遇 v1.6 资产时评估 `Modl::V16` |
| [nlst](nlst.md) | `TSLN` / `.nulstb` | **无** — EXE 无 `0x4E4C5354` 比较 | **低** — 仅 lib；TAURI 未用 | 确认 EXVS2 是否使用 `.nulstb` 后再投入 |
| [nrpd](nrpd.md) | `DPRN` / `.nurpdb` | **中** — 布局来自样本；IDA 会话曾断开 | **严重** — 出货 **v1.2** 未实现；`render_passes` 写 ptr 错误 | **实现 DPRN v1.2 只读**；修复 write rel ptr |
| [nufx](nufx.md) | `XFUN` / `.nufxlb` | **高** — v1.0–1.2 三路解析确认 | **中** — 缺 **v1.2**；无 ssbh_data | 对比 `sub_14028DB50` 与 v1.1，按需加 `NufxV2` |
| [shdr](shdr.md) | `RDHS` / `.nushdb` | **无** — EXE 无 RDHS/HBSS 立即数 | **高** — 内层 blob 大量未解析；无 writer | 经 FHM2D `0x0A` 或 SSBHLib DLL 追踪加载器 |
| [skel](skel.md) | `LEKS` / `.nusktb` | **中** — `sub_14029A4B0` 解析确认；无 LEKS 立即数 | **低** — v1.0 布局强；矩阵往返非 bit-exact | 真机 `.nusktb` hex 对比；`.jnttbl` 另审 |

**严重度图例**: 严重 = 阻断 EXVS2 出货资源读写；高 = 编辑往返或游戏语义明显偏差；中 = 局部字段/版本；低 = 未使用或只读透传可接受。

---

## 横切主题

### 1. 版本错位（游戏 > ssbh_lib）

| 格式 | 游戏（IDA/样本） | ssbh_lib | 影响 |
|------|------------------|----------|------|
| **nrpd** | v1.2（ASCII 名、8 字节数组头） | v1.6 only | 无法解析 `renderpipeline/1.nurpdb` |
| **nufx** | v1.0 / v1.1 / **v1.2** | v1.0 / v1.1 | 若舞台库 minor=2 则读失败 |
| **modl** | v1.6 + v1.7 | v1.7 only | 老旧 v1.6 清单可能无法打开 |
| **hlpb** | v1.0 + v1.1 | v1.1 only | 遗留 v1.0 约束文件未覆盖 |
| **anim** | v1.0 / v1.1 / v1.2 / v2.0 | v1.2 / v2.0 / v2.1 | minor 0/1 可读但未单独建模；v2.1 `unk_data` 写出为空 |

### 2. EXE 中缺失的 FourCC / 扩展名

- **扩展名字面量**（`.numatb`、`.nusktb`、`.adjb`、`.nushdb` 等）在 `vsac27_Release.exe` 中普遍为 **0 命中**；路由依赖 **FourCC 立即数** 或 **FHM2D fileType**。
- **在 .text 中未找到立即数比较** 的格式：`LEKS`、`RDHS`、`TSLN`、`HSEM`（部分会话）、`HBSS` 外层 — 解析可能在 **归档剥离 HBSS 之后** 或 **表驱动工厂**（如 `sub_140298020` 骨架、`sub_140114C10`）而非内联 `cmp`。
- **有清晰 FourCC 分发** 的格式：`LDOM`、`LTAM`、`BPLH`、`MINA`、`DPRN`（样本侧）、`XFUN`；`HSEM` 在 adj/modl 相关链中有 `sub_1402980A0`。

### 3. ssbh_data 往返损失

| 格式 | 丢失或重算内容 | 后果 |
|------|----------------|------|
| **hlpb** | `constraint_indices` / `constraint_types` 交错序；aim 尾部 `unk17–22`；quat/`unk_type` 未进预览 | 多约束堆叠顺序错误；编辑后行为漂移 |
| **mesh** | `ExvsColor5/4/12` → 泛化 `TextureCoordinate`/`ColorSet` | 舞台材质着色器输入语义错误 |
| **meshex** | `EntryFlag` 位 3–5；retail 包围球 | 水面反射等特殊绘制模式丢失 |
| **skel** | `world_*` / `inv_*` 矩阵重算；`flags.unk1` 写死 1 | 浮点非 bit-identical；未知标志语义 |
| **anim** | 默认 `TryFrom` 走未压缩；v2.1 `unk_data` 写空 | 与 EXVS2 压缩资产不一致 |
| **matl** | `MatlData` 不可写 V15 | GVS 迁入需额外路径 |
| **shdr** | 无 `ShdrData` → `Shdr` | 无法编辑着色器库 |
| **adj** | 非单调 `index_buffer_offset` 边界未定义 | 恶意/损坏文件行为未规定 |

### 4. FHM2D 间接加载

游戏不通过路径后缀表加载多数资源，而是：

```
.fhm2d → CBinder / CFhm2BinderImpl
      → ResourceInstanceInterface / Exvs2ResourceInstance
      → ModelDataSet::SetupNewFormat(Content)
           ├─ NuMesh（.numshb）
           ├─ nu::Skeleton（.nusktb，type 0x0C）
           ├─ MaterialContainer（.numatb）
           ├─ HelperBone（.nuhlpb，type 0x13）
           └─ （推测）.numshexb / .adjb 等伴生 blob — 无独立 RTTI 名
```

- **FHM2D type-id 空缺**：`.adjb` 在 `0x0F`（numdlb）与 `0x11`（nuanmb）之间 **无 0x10 槽位** — 支持「EXVS2 正式管线不加载 adjb」的结论。
- **已知 type-id**：`.nushdb` → `0x0A`；`.nusktb` → `0x0C`；`.nuhlpb` → `0x13`；`.nurpdb` → `0x19`（见 TAURI `fhm2d_pack.rs`）。
- **meshex / adj 审计启示**：须在 `ModelDataSet::SetupNewFormat` 内找 **64 字节 meshex 头**（`file_length` + `entry_count` + 绝对指针）或 **adjb 式扁平 i16 堆**，而非搜索扩展名字符串。

### 5. 共享运行时构件

- 资产批处理：`sub_1402EDCF0`、`sub_1402EE420`、`sub_140115510`。
- 骨骼名解析：`sub_1402A6110`（hlpb、skel 约束共用）。
- SSBH 头约定：`buffer+0x10` FourCC，`+0x14` major，`+0x16` minor，`+0x18` payload — 与 `ssbh_lib::write_ssbh_header` 一致。

---

## ssbh_lib 优先修复 Top 10

按 **对 EXVS2 出货资源正确性 + TAURI 编辑往返** 的影响排序：

| 秩 | 格式 | 修复项 | 理由 |
|----|------|--------|------|
| **1** | nrpd | 实现 **DPRN v1.2 只读**（ASCII 名、8 字节数组头） | 阻断舞台 `1.nurpdb` 一切工具链解析 |
| **2** | nrpd | 修复 **`render_passes` 写入相对指针** bug | v1.6 编辑一旦启用即损坏文件 |
| **3** | mesh | 对齐 **`VertexWeightV10`** 线格式（`u16` vs `u32`） | v1.10 蒙皮损坏风险 |
| **4** | mesh | **保留 `ExvsColor5/4/12`** 独立语义（对齐 `sub_14029ACB0` Color4/Color5） | 舞台顶点色材质回归 |
| **5** | anim | **v1.2 写出契约**：`final_frame_index=60`、`unk1=时长秒`、`unk2=末帧`；默认压缩路径 | IDA `sub_140239FE0` 硬编码 `/60` |
| **6** | anim | **`0x3409`/`0x4409`** 编解码与 shipped 资产字节级回归 | EXVS2 主力曲线 magic |
| **7** | hlpb | **`HlpbData` 保留 `constraint_indices`/`constraint_types` 交错** | 编辑保存改变约束求值顺序 |
| **8** | nufx | 评估并添加 **v1.2**（`sub_14028DB50` vs `sub_14028D2C0`） | 舞台 effect library minor=2 时读失败 |
| **9** | matl | 验证 **`ParamV16Type4` 16 字节盘区** 与游戏 12 字节内部槽 | `Fresnel` 等参数往返 |
| **10** | shdr | 追踪 **FHM2D 0x0A / SSBHLib DLL** 加载链，验证内层偏移 288/2848/2896 | 内层布局仅有 fork 注释、无游戏佐证 |

**未入 Top 10 但值得关注**：meshex 标志位保留（舞台反射）；modl v1.6 读取；skel `.jnttbl` 与 `sub_1402A6110` 哈希图；nlst/adj 仅在确认 EXVS2 使用后再投入。

---

## 报告索引

| # | 格式 | 报告 |
|---|------|------|
| 1 | adj | [adj.md](adj.md) |
| 2 | anim | [anim.md](anim.md) |
| 3 | hlpb | [hlpb.md](hlpb.md) |
| 4 | matl | [matl.md](matl.md) |
| 5 | mesh | [mesh.md](mesh.md) |
| 6 | meshex | [meshex.md](meshex.md) |
| 7 | modl | [modl.md](modl.md) |
| 8 | nlst | [nlst.md](nlst.md) |
| 9 | nrpd | [nrpd.md](nrpd.md) |
| 10 | nufx | [nufx.md](nufx.md) |
| 11 | shdr | [shdr.md](shdr.md) |
| 12 | skel | [skel.md](skel.md) |

**过程记录**: [process.md](process.md) · **任务清单**: [todo.md](todo.md)
