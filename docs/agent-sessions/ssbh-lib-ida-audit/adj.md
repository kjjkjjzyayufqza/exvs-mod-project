# adj (.adjb) — EXVS2 vs ssbh_lib 审计

Session: 2026-06-14  
IDA binary: `vsac27_Release.exe` (`E:\OBHK0.3_v27\vsac27_Release.exe.i64`, port 13337)  
ssbh_lib sources: `E:/research/ssbh_lib/ssbh_lib/src/formats/adj.rs`, `ssbh_data/src/adj_data.rs`

---

## Overview

| 属性 | 值 |
|------|-----|
| Rust 类型 | `Adj` / `AdjData` |
| FourCC | **无**（非 HBSS 容器格式） |
| 典型扩展名 | `.adjb`（如 `model.adjb`） |
| ssbh_lib 模块 | `formats/adj.rs` |
| ssbh_data 模块 | `adj_data.rs` |
| 用途 | 存储每个 `MeshObject` 的顶点邻接信息，供法线重算、接缝处理等使用 |

`.adjb` 是 **纯二进制、无 magic/FourCC 头** 的伴生文件：文件开头是 `entry_count`，随后是定长 8 字节的 `AdjEntry` 表，剩余全部为 `i16` 扁平 `index_buffer`（`until_eof` 读到文件尾）。

与 SSBH 族（`HBSS` + inner FourCC）不同，`Adj` 在 `ssbh_lib::Ssbh` 枚举之外单独通过 `read_write_impl!(prelude::Adj)` 注册读写。

**EXVS2 审计结论（重要）**：在 `vsac27_Release.exe` 中 **未找到** `.adjb` / `adjb` / `ADJB` 字符串字面量，也未找到 `AdjData` / `CAdj` 等 RTTI 或专用解析器。FHM2D 打包 type-id 表（游戏与 TAURI `fhm2d_pack.rs` 一致）在 `0x0F`（`.numdlb`）与 `0x11`（`.nuanmb`）之间 **无 `0x10` 槽位**，未登记 `.adjb`。因此当前证据表明 **EXVS2 正式资源管线不加载 `.adjb` 伴生文件**；ssbh_lib 的实现主要来自 Smash Ultimate / 工具链研究，而非本 EXVS2 构建中的可观测加载路径。

---

## ssbh_lib 覆盖范围

### 低层：`Adj` / `AdjEntry`（`adj.rs`）

```rust
pub struct Adj {
    // entry_count: u32 (temp, not stored)
    pub entries: Vec<AdjEntry>,
    pub index_buffer: Vec<i16>,  // until_eof
}

pub struct AdjEntry {
    pub mesh_object_index: u32,
    pub index_buffer_offset: u32,  // byte offset into index_buffer
}
```

- **写入**：`SsbhWrite for Adj` 顺序写出 `entries.len() as u32`、`entries`、`index_buffer`。
- **读取**：`#[br(count = entry_count)]` 读 entries；`index_buffer` 用 `until_eof` 吞掉剩余字节。
- **语义**（文档与测试）：
  - 每个三角面只存 **非共享** 的两个邻接顶点索引（共享顶点省略）。
  - 每个顶点邻接槽位固定填充 `-1`（`i16`）；Smash Ultimate 使用 **每顶点 18 个 `i16`**（最多 9 个邻接三角面 × 2）。
  - `index_buffer_offset` 为 **字节偏移**；相邻 entry 的 offset 差除以 2 得到该 entry 的 `i16` 数量。

### 高层：`AdjData` / `AdjEntryData`（`adj_data.rs`）

```rust
pub struct AdjData {
    pub entries: Vec<AdjEntryData>,
}

pub struct AdjEntryData {
    pub mesh_object_index: usize,
    pub vertex_adjacency: Vec<i16>,
}
```

| 能力 | 状态 |
|------|------|
| `AdjData::from_file` / `write_to_file` | 经 `SsbhData` trait 完整支持 |
| `TryFrom` 双向转换 `Adj` ↔ `AdjData` | 支持；offset 越界返回 `BufferOffsetOutOfRange` |
| 从三角面 **生成** 邻接 | `AdjEntryData::from_triangle_faces` / `from_mesh_object` |
| 接缝（同位置分裂顶点） | `triangle_adjacency` 合并同位置顶点的邻接列表 |
| 填充宽度 | `MAX_ADJACENT_VERTICES = 18`（与 SU 一致） |
| 模糊测试 | `ssbh_data/fuzz/fuzz_targets/adj_from_data.rs` |
| 回归测试 | `adj_data.rs` 内 round-trip 与 `triangle_adjacency` 用例 |

### 仓库内样本

- `E:/TAURI_PROJECT` 与 `E:/research/ssbh_lib` **均无** 检入的 `.adjb` 样例文件。
- `ssbh_test` 可用 glob `*.adjb` 做 round-trip，但依赖外部样本目录。

---

## IDA 函数（EXVS2）

### 字符串 / 符号搜索结果

| 查询 | 结果 |
|------|------|
| `.adjb`, `adjb`, `ADJB`, `model.adjb` | **0 命中** |
| `numshexb`, `meshex`, `MeshEx` | **0 命中**（同类非 SSBH 伴生格式亦无字符串） |
| `AdjData`, `CAdj`, `VertexAdj`, `MeshAdj` | **0 命中** |
| `adjacency`（排除 boost 图模板） | **0 代码 xref** |
| `.numshb`, `.numdlb`, `HBSS` | **0 命中**（扩展名不以明文出现在二进制中） |
| `HSEM` | 作为 **立即数** `0x4D455348` 出现在 mesh 版本分发逻辑中 |

**结论**：不存在可直接命名为 “adjb loader” 的 `sub_140XXXXXX`；下列函数为 **最邻近的 mesh 资源链**，供后续若发现运行时生成邻接时对照。

### 已识别的 mesh 加载链（HSEM / `nu::Mesh`）

```
sub_1402EDCF0 / sub_1402EE420     # 资产批处理（VDK::DEV::ASSET，含 NuSkeleton / NuMesh 等）
  └─ sub_1401152E0                # 单资源：骨架句柄 + HBSS 载荷 → Mesh 实例指针
       ├─ sub_140114490           # 从载荷取 nu::Skeleton 句柄
       │    └─ sub_140117280
       └─ sub_1402980A0           # HSEM (0x4D455348) 版本分派
            ├─ version 7  → sub_14029B410   # mesh v7 解析（大型，~5KB）
            ├─ version 8  → sub_14029FD90
            ├─ version 9  → sub_1402A22D0
            └─ version 10 → sub_1402A3E80
```

**`sub_1402980A0` 要点**（decompile）：

- 检查 `a3+16` 处 inner header：`DWORD == 1296388936`（`HSEM`）且 `WORD+4 == 1`。
- 用 `WORD+6`（版本 7–10）选择四个解析器之一；失败则返回空 `nu::InstancePointer<nu::Mesh>`。
- **未见** 在解析后加载第二文件或读取 `i16` 邻接缓冲的逻辑。

**`sub_14029B410` 要点**：

- HSEM v7 主解析器；callees 含 `sub_140295560`（mesh 对象状态初始化）、`sub_14029D5B0`、`sub_14029E430` 等。
- 初始化路径使用 `nu::VertexDeclaration_x64`、`nu::BlendShape` 等渲染结构，**无 `AdjEntry` 形状（8 字节 record + 扁平 i16 heap）的显式映射**。

### FHM2 / ModelDataSet 上下文

| 符号 | 说明 |
|------|------|
| `ModelDataSet@ASSET@DEV@VDK` | 模型数据集；`SetupOldFormat` / `SetupNewFormat` 从 `FHM2::Content` 装配 |
| `ModelDataSet@Exvs2ResourceInstance` | EXVS2 侧资源实例包装 |
| `CBinder@FHM2@DEV@VDK` | FHM2 内容绑定 |

FHM2 type-id（与 `.cursor/skills/fhm2d-format/SKILL.md`、`fhm2d_pack.rs` 一致）：

| 扩展名 | Type ID |
|--------|---------|
| `.numshb` | `0x0E` |
| `.numdlb` | `0x0F` |
| *(空缺)* | `0x10` |
| `.nuanmb` | `0x11` |

`.adjb` **不在** 已知的 EXVS2 FHM2 type-id 表中。

### 常量 `18`（`0x12`）扫描

在 mesh 模块附近搜索 `cmp/mov , 12h`：**未发现** 与「每顶点 18 个邻接 `i16`」相关的稳定模式。唯一显眼的 `mov r8d, 12h` 出现在 `sub_1402AA810`，实为字符串 `"SpecularCubeMapSRV"` 的长度（0x12 = 18 字符），与 adj 无关。

---

## 逻辑流（ssbh_lib 侧）

### 磁盘布局（线性）

```
offset 0x00: u32 entry_count
offset 0x04: AdjEntry[entry_count]
               each: u32 mesh_object_index
                     u32 index_buffer_offset  (bytes)
offset 0x04+8*entry_count: i16[index_buffer.len()]  // until EOF
```

### `Adj` → `AdjData` 解码

1. 假定 `entries` 按 `index_buffer_offset` **单调递增**。
2. 对每条 entry，邻接切片为 `index_buffer[start..end)`，其中  
   `start = offset / 2`，`end = next_entry.offset / 2`（最后一条直到 buffer 末尾）。
3. `mesh_object_index` 转为 `usize`。

### `AdjData` → `Adj` 编码

1. 顺序遍历 `entries`，累计 `index_buffer_offset`（每次 `+= vertex_adjacency.len() * 2`）。
2. `index_buffer` = 所有 `vertex_adjacency` 拼接。

### 生成算法（`triangle_adjacency`）

对每条三角面 `(v0,v1,v2)`：

- `v0` 邻接列表 push `v1, v2`；`v1` push `v2, v0`；`v2` push `v0, v1`。
- 将 **同位置**（`PartialEq`）顶点的邻接列表合并（处理 UV/法线接缝）。
- 每条顶点邻接向量 `resize(padding_size, -1)`，`padding_size` 默认 18。

---

## 字段映射

### 二进制 ↔ ssbh_lib

| 文件偏移 / 字段 | 类型 | Rust 字段 | 说明 |
|-----------------|------|-----------|------|
| `+0x00` | `u32` | *(temp)* `entry_count` | entry 个数 |
| per entry `+0x00` | `u32` | `AdjEntry.mesh_object_index` | 对应 `MeshObject` 索引 |
| per entry `+0x04` | `u32` | `AdjEntry.index_buffer_offset` | **字节** 偏移，指向 `index_buffer` 中本 object 数据起点 |
| 条目表之后 | `i16[]` | `Adj.index_buffer` | 邻接顶点索引；unused = `-1` |

### `AdjEntry` ↔ `AdjEntryData`

| `AdjEntry` | `AdjEntryData` | 变换 |
|------------|----------------|------|
| `mesh_object_index: u32` | `mesh_object_index: usize` | 直接 cast |
| `index_buffer_offset` + 下一 offset | `vertex_adjacency: Vec<i16>` | 由 offset 差分切片 |

### 与 `MeshObject` 的关联

- 语义上：`AdjEntry.mesh_object_index` == `Mesh.objects[i]` 的索引（见 `adj_data` 文档示例）。
- EXVS2 IDA：**未验证** 运行时 `nu::Mesh` 对象是否挂载等价邻接缓冲；mesh 解析器未暴露与 `index_buffer_offset` 同构的字段。

---

## 差异与缺口（Gaps）

| 严重度 | 缺口 | 说明 |
|--------|------|------|
| **高** | EXVS2 无 `.adjb` 加载证据 | 全二进制字符串搜索为 0；无专用解析 `sub_`；FHM2D 无 type-id |
| **高** | 无 IDA 字段级 ground truth | 无法将 `sub_14029B410` 等 mesh 解析器字段与 `AdjEntry` 对齐 |
| **中** | FHM2D / 资源打包不包含 `.adjb` | TAURI `get_file_type_id` 亦未登记；stage/机体打包流程不会保留 adjb |
| **中** | 无项目内 `.adjb` 黄金样本 | 无法在 EXVS2 资产上做单文件 hex 对照 |
| **中** | 运行时邻接来源未知 | 游戏可能完全依赖 GPU/CPU 从 `numshb` 索引缓冲 **即时计算** 法线，而非读盘 |
| **低** | ssbh_lib 生成器与 SU 字节级一致性 | `triangle_adjacency` 的接缝合并、绕序、截断顺序未与官方工具逐字节对比 |
| **低** | `AdjData::try_from` 对乱序 offset | 注释含 “TODO: Handle edge cases”；非递增 offset 行为未定义 |
| **低** | `MAX_ADJACENT_VERTICES=18` 未在 EXVS2 中证实 | 常量仅来自 Smash Ultimate 文档/测试；EXVS2 若将来需要邻接可能用不同宽度 |

### 建议的后续验证（超出本次 IDA 范围）

1. 从 **Smash Ultimate** 或官方工具链提取真实 `model.adjb`，对 `ssbh_lib` round-trip 与 `triangle_adjacency` 输出做字节 diff。
2. 若 EXVS2 模组需要法线接缝：在 **不依赖 adjb** 的前提下，用 `MeshData` 索引 + 位置相等性在工具侧生成 `AdjData`（ssbh_lib 已支持），勿假设游戏会读取该文件。
3. 若未来在 FHM2 中发现 `0x10` 类型文件：优先抓取 payload 前 16 字节看是否匹配 `u32 count + (u32,u32)*` 布局，再回连 `sub_14029B410` 消费点。

---

## IDA 命令记录

```
list_instances          → vsac27_Release.exe @ 13337
find string: .adjb,adjb,Adj,adjacency,numshexb,HSEM,HBSS,...
analyze_function: 0x1402980A0, 0x14029B410, 0x1401152E0, 0x1402EDCF0
callgraph roots: 0x1402980A0 (depth 4)
py_eval: idautils.Strings scan for adj*/FHM2/ModelDataSet
```

---

## 交叉引用

- 会话清单：`docs/agent-sessions/ssbh-lib-ida-audit/todo.md`
- FHM2 type-id：`.cursor/skills/fhm2d-format/SKILL.md`
- ssbh_lib 枚举：`ssbh_lib/src/lib.rs`（`Adj` 在 `Ssbh` 枚举之外）
