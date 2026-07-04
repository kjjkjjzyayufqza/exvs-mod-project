# anim (MINA / .nuanmb) — ssbh_lib vs EXVS2 IDA 审计

**日期**: 2026-06-14  
**二进制**: `vsac27_Release.exe` (`E:\OBHK0.3_v27\vsac27_Release.exe.i64`)  
**ssbh_lib 来源**: `E:/research/ssbh_lib`（TAURI 通过 git `kjjkjjzyayufqza/ssbh_lib` branch `wmmt2` 引用）

---

## 1. 格式概览

| 项 | 值 |
|---|---|
| SSBH 外层 | `HBSS` |
| 内层 FourCC | `MINA`（字节序 `4D 49 4E 41`，作为 LE `u32` 读取为 `0x414E494D` = 1095649613） |
| 典型扩展名 | `.nuanmb` |
| ssbh_lib 模块 | `ssbh_lib/src/formats/anim.rs` |
| 高层 API | `ssbh_data/anim_data.rs` + `nuanmb_v12/` + `nuanmb_v12_encode.rs` |
| 支持版本 | V1.2 `(1,2)`、V2.0 `(2,0)`、V2.1 `(2,1)`；另有遗留 `NANM` 四字符 |

EXVS2 实际资产以 **Anim v1.2** 为主；v2.x 在 IDA 中有独立解析器但本审计侧重 v1.2 残余压缩族（`0x3409` / `0x4409`）。

---

## 2. ssbh_lib 二进制布局

### 2.1 版本变体 (`Anim` enum)

```rust
// ssbh_lib/src/formats/anim.rs
Anim::V12 { name, unk1, final_frame_index, unk2, unk3, tracks, buffers }
Anim::V20 { final_frame_index, unk1, unk2, name, groups, buffer }
Anim::V21 { ... V20 fields ..., unk_data }
```

| 版本 | major | minor | 层级 | 备注 |
|------|-------|-------|------|------|
| V12 | 1 | 2 | `TrackV1` → `Property` → `buffers[]` | EXVS2 主路径；节点名在 track 级 |
| V20 | 2 | 0 | `Group` → `Node` → `TrackV2` + 单 `buffer` | Smash 风格层级 |
| V21 | 2 | 1 | 同 V20 + `UnkData` | `unk_data` 写入端未重建（ssbh_data TODO） |

### 2.2 V1.2 头部语义（EXVS2 vs Smash）

`anim_data.rs` 的 `read_anim_groups` 记录两种 v1.2 头约定：

| 字段 | Smash 风格 | EXVS2 风格（IDA 证实） |
|------|-----------|----------------------|
| `unk1` | — | **动画时长（秒）** |
| `final_frame_index` | 末帧索引 `frame_count-1` | **时间基（常见 60.0）** |
| `unk2` | — | **末帧索引 `frame_count-1`** |
| `unk3` | — | 常见 `0.0` |

关系：`unk1 * final_frame_index ≈ unk2`（例：`0.65 * 60.0 == 39.0`）。

### 2.3 V1.2 Track / Property

- `TrackV1`: `name`（骨骼/节点名）、`track_type`（Transform=0, UvTransform=2, Visibility=5）、`properties[]`
- `Property`: `name`（`"Scale"` / `"Rotate"` / `"Translate"` / `"CompensateScale"` / `"Visibility"`）、`buffer_index`
- 各 property buffer 以 **`u32` magic** 开头，由 `nuanmb_v12` 解码

### 2.4 V1.2 Buffer Magic 表（ssbh_data 已实现）

| Magic | 通道 | 类型 | 解码器 |
|-------|------|------|--------|
| `0x3003` | Scale / Translate | 常量 Vector3 | 内联 |
| `0x4003` | Rotate | 常量 Vector4 | 内联 |
| `0x3200`–`0x3209` | Translate/Scale | 稀疏关键帧 + 残差 | `nuanmb_v12::translate` |
| `0x3300`–`0x3309` | 同上 | u8 帧索引变体 | 同上 |
| `0x3400`–`0x3408` | 同上 | 原始流 / 索引压缩 | 同上 |
| **`0x3409`** | Translate/Scale | **DCT 残余压缩（EXVS2 主力）** | `decode_*_3409` |
| `0x4200`–`0x4209` | Rotate | 稀疏 / 欧拉 | `nuanmb_v12::rotate_basic` |
| `0x4300`–`0x4309` | Rotate | 四元数关键帧 | `rotate_basic` / `rotate_inferred` |
| `0x4400`–`0x4408` | Rotate | 原始 / 索引 | `rotate_basic` |
| **`0x4409`** | Rotate | **四元数 DCT 残余** | `decode_rotate_4409` |
| `0x1013` / `0x1003` | CompensateScale / Visibility | u16 / f32 标志 | 内联 |

`0x3409` / `0x4409` 共用 `nuanmb_v12/common.rs` 的 **cosine kernel 矩阵**（`v18` 1..8 维）与 `decode_residual_component` / `decode_residual_vector`。

### 2.5 V2.x 压缩（简述）

- 单个大 `buffer`；`TrackV2` 含 `flags`（`TrackTypeV2` + `CompressionType`）、`data_offset`、`data_size`
- `anim_data/buffers.rs` + `compression.rs`：位压缩头 `CompressedHeader`（`unk_4=4`、`bits_per_entry`、`default_data` 指针）
- 写入时 `infer_optimal_compression_type` 按帧数与开销选择 Direct / Compressed / Constant

### 2.6 编码路径（ssbh_data）

| API | 行为 |
|-----|------|
| `AnimData::to_anim_v12_uncompressed()` | 默认 `0x3003` / `0x3400` / `0x4300` 等，不用 `0x3409` |
| `AnimData::to_anim_v12_compressed()` | EXVS2 兼容：`0x3409` Vector3、`0x4409` Quaternion |
| `TryFrom<AnimData> for Anim` | v1.2 默认走 **未压缩**；v2.0/2.1 走 `create_anim` |
| `Anim::V21` 写出 | `unk_data` 写空数组 |

---

## 3. IDA 发现

### 3.1 字节 / 字符串命中

| 搜索 | 命中 | 说明 |
|------|------|------|
| `41 4E 49 4D` / `4D 49 4E 41` | 代码与数据区多处 | 内联比较与跳转表 |
| 字符串 `MINA` | 11 处 | 多在 `0x14024xxxx` 解析器内 |
| 字符串 `NANM` | `0x141ab7be8` | 遗留格式；`sub_140233570` 引用 |
| 字符串 `nuanmb` | 6 处 | 扩展名过滤（无直接代码 xref） |
| 字符串 `.nuanmb` | 0 | 未找到字面量 |
| `HBSS` | 0 | 本二进制无此字面量（可能在更上层加载器） |
| immediate `0x4409` | `0x14117e078` | 初始化数据（`sub_14117DF10` 曲线类型表） |
| immediate `0x3409` | **代码段无直接 cmp** | 游戏可能用函数指针/表驱动，而非硬编码立即数 |

### 3.2 核心加载链：FourCC 分发

```
sub_140115FC0                    # 资产槽位绑定 / 动画实例工厂入口
  └─ sub_140233570               # MINA/NANM 版本分发（关键）
       ├─ [strncmp +4,"NANM"]   # 遗留
       │    └─ sub_14024AE90      # → 同 v1.2 解析实例 (off_141AB8030)
       ├─ [a2[4] == 0x414E494D] # "MINA" FourCC
       │    ├─ major==1 minor==0 → sub_14024AF40   # v1.0? 早期 v12
       │    ├─ major==1 minor==1 → sub_14024BD20   # v1.1?
       │    ├─ major==1 minor==2 → sub_14024C680   # Anim v1.2 主解析器
       │    └─ major==2 minor==0 → sub_14024D1D0   # Anim v2.0 解析器
       └─ (失败返回 0)
```

`sub_140115FC0` 还被 `sub_1402EE420`（模型资产批量加载）、`sub_1405B1AB0`、`sub_1408EE140` 等调用。

**版本字段映射（IDA 伪代码）**：

- `*((_WORD *)a2 + 10)` → major
- `*((_WORD *)a2 + 11)` → minor
- 与 ssbh_lib `(major, minor)` 一致：`1.2 → sub_14024C680`，`2.0 → sub_14024D1D0`

### 3.3 V1.2 解析器链（`sub_14024C680` 家族）

三个 major=1 变体（`sub_14024AF40` / `sub_14024BD20` / `sub_14024C680`）结构相似：

| 函数 | 大小 | 字符串线索 | 角色 |
|------|------|-----------|------|
| `sub_14024AF40` | 0xa58 | `Visibility`, `CompensateScale` | minor=0 解析 |
| `sub_14024BD20` | 0x95f | 同上 | minor=1 解析 |
| `sub_14024C680` | 0xb46 | 同上 | **minor=2 / v1.2 主解析** |
| `sub_14024D1D0` | 0xa9 | — | v2.0 实例构造 (`off_141AB8030`) |
| `sub_14024AE90` | — | — | NANM 路径实例构造 |

公共被调函数：

- `sub_14023BEC0` → `sub_14023C0E0`（boost::variant 式读写）
- `sub_14024BBC0` / `sub_14023BBE0`（属性列表拷贝）
- `sub_14024B9C0`（字节缓冲增长）
- `sub_14023ACC0` / `sub_14023AFC0` / `sub_14023BEC0`（属性遍历）

### 3.4 运行时求值链：Transform 属性

游戏**不在加载时完全展开曲线**，而是构建 `std::function` 求值器，按帧采样。

```
sub_140146A00                         # 角色/模型动画图构建
  └─ sub_1402370B0(Str1="Transform")  # 单 track 绑定
       └─ sub_140234CB0               # Transform 属性聚合
            ├─ strcmp "Transform"
            ├─ sub_140239D40(..., "Scale")
            ├─ sub_140239D40(..., "Rotate")
            ├─ sub_140239D40(..., "Translate")
            ├─ sub_140239D40(..., "CompensateScale")
            └─ sub_140233C00           # 合并四通道为采样闭包
                 ├─ sub_1402359C0(a3=Scale)    → sub_140233940(type=12)
                 ├─ sub_140235B80(a3=Rotate)   → sub_140233940(type=16)
                 ├─ sub_140235D60(a3=Translate)→ sub_140233940(type=1)
                 └─ sub_140238C20               # 组合 Transform 求值器
                      └─ sub_140239360          # 拷贝四通道 state
```

单属性 fallback：

```
sub_140234CB0
  └─ sub_140236280                     # 非 Transform 或已有 property 元数据
       ├─ sub_140233810                # 读 track_type 字节
       └─ sub_1402377A0                # 构建 type=44 求值器
```

**`sub_140233940` 求值器类型 ID**（第二参数 `a2`）：

| type | 来源函数 | 推测语义 |
|------|---------|---------|
| 1 | `sub_140235D60` | Translate |
| 12 | `sub_1402359C0` | Scale |
| 16 | `sub_140235B80` | Rotate |
| 44 | `sub_1402377A0` | 通用/UV/Visibility 等 |

类型 9 走 `sub_14024F870` → `sub_14024FD10` 等 lambda 表（与 buffer 内 `(header_size-16)/16` 相关）。

### 3.5 时间基与帧计数（IDA 证实 EXVS2 头语义）

`sub_140239FE0`（被所有曲线构建器调用）：

- 当 anim 头 `version word == 1`：读取浮点字段后 **`/ 60.0`** → 秒级时长
- 当 `== 2`：直接返回浮点字段（帧索引风格）
- 与 ssbh_data 对 `final_frame_index=60.0` + `unk2=末帧` 的解读一致

`sub_1402370B0` 写 `*(float*)(a1+72) = (frame_count-1) / sub_140239FE0(...)` 作为归一化末端。

### 3.6 动画图 / 场景节点

```
sub_140240440                         # AnimationNodePlugLayout 驱动
  ├─ sub_14023F760                    # 按帧/轨道解析 buffer 切片
  └─ sub_1402407B0                    # 大图谱属性绑定
       ├─ "Transform","Scale","Rotate","TexcoordScale",...
       └─ sub_140242B70 → sub_140149000
```

`sub_14023F760`：根据 `anim+2648` 索引表与 `312 * track_index` 步进，计算属性 buffer 指针（运行时随机访问）。

### 3.7 曲线类型初始化表

`sub_14117DF10` 在 `0x14117e078` 写入 `0x4409`（LE `09 44 00 00`），并生成大量 `0x440x` / `0x40x` 曲线描述字 — 与 v1.2 旋转缓冲 magic 族一致。该表为**全局曲线编解码元数据**，不直接等于 per-buffer 解析 switch。

---

## 4. ssbh_lib 与游戏差异 / 风险

| 严重度 | 主题 | ssbh_lib 现状 | IDA / 资产观察 | 建议 |
|--------|------|--------------|----------------|------|
| **高** | EXVS2 v1.2 头字段 | 已识别双约定；写出默认未压缩 | `sub_140239FE0` 硬编码 `/60` | 写出 v1.2 时固定 `final_frame_index=60.0`、`unk1=duration_sec`、`unk2=last_frame` |
| **高** | `0x3409` 布局探测 | `translate.rs` 按 flags 在 `0x14`/`0x18` 间试探 | 游戏严格；无立即数 cmp | 保持 `infer_3409_layout` 与 shipped 资产对齐；新增回归样本 |
| **高** | `0x4409` 四元数 | `rotate_4409.rs` 端点 base 启发式 | 同左 | 编码器 `nuanmb_v12_encode` 与解码探测顺序保持一致 |
| **中** | 1D 运动 `0x3409` 变体 | 注释称 in-game 严格/不支持 | 未在本轮 IDA 定位独立路径 | 保留原始 buffer 或 fallback `0x3400` |
| **中** | 缺 property 语义 | 合并为单 `Transform` track | `sub_140234CB0` 允许缺 Scale/Rotate/Translate 并用 flag 位标记 | `GBL_RT`/`CENTER_RT` 强制保留 Scale/Translate（已实现于 `anim_create_v12.rs`） |
| **中** | V2.1 `unk_data` | 写出空 | 未知插值/裁剪数据 | 需样本对比；暂勿声称 round-trip |
| **中** | V1.2 minor 0/1 | 仅 enum `V12 (1,2)` | IDA 有 `1.0/1.1` 解析器 | 读取可统一；写入只宣称 `1.2` |
| **低** | `NANM` 遗留 | 未实现 | `sub_14024AE90` | 仅当需要编辑极老资产 |
| **低** | V2.x 压缩 | 完整位压缩 | `sub_14024D1D0` 存在 | EXVS2 舞台/机体仍以 v1.2 为主 |

---

## 5. 建议验证用例

1. 取 shipped `.nuanmb`（含 `0x3409`/`0x4409`）→ `AnimData::from_file` → `to_anim_v12_compressed` → 字节级对比 residual 段  
2. 对比 `unk1/final_frame_index/unk2` 与游戏内 `sub_140239FE0` 输出（时长 vs 帧数）  
3. 对 `GBL_RT` / `CENTER_RT` 骨骼检查 property 列表是否保留  
4. 若有 v2.1 样本：对比 `unk_data` 与 `sub_14024D1D0` 之后的数据消费

---

## 6. 关键 IDA 符号索引

| 地址 | 符号 | 用途 |
|------|------|------|
| `0x140115FC0` | `sub_140115FC0` | 动画资产实例化入口 |
| `0x140233570` | `sub_140233570` | **MINA/NANM FourCC + 版本分发** |
| `0x14024C680` | `sub_14024C680` | Anim v1.2 解析 |
| `0x14024D1D0` | `sub_14024D1D0` | Anim v2.0 解析 |
| `0x140234CB0` | `sub_140234CB0` | Transform 属性名聚合 |
| `0x140233C00` | `sub_140233C00` | 四通道曲线合并 |
| `0x140233940` | `sub_140233940` | 曲线求值器工厂 |
| `0x140239FE0` | `sub_140239FE0` | **时间基 / 60fps 换算** |
| `0x1402370B0` | `sub_1402370B0` | 绑定 Transform track |
| `0x140146A00` | `sub_140146A00` | 模型动画图构建 |
| `0x1402407B0` | `sub_1402407B0` | 动画节点大图谱 |
| `0x14023F760` | `sub_14023F760` | Buffer 切片寻址 |
| `0x141ab7be8` | `"NANM"` | 遗留格式标记 |

---

## 7. 结论

- **ssbh_lib 结构层**（`Anim`/`TrackV1`/`Property`/magic 表）与 EXVS2 IDA 加载链 **总体对齐**；最大差距在 **v1.2 头部语义**（60fps 时间基 + 秒数字段）与 **`0x3409`/`0x4409` 残余压缩** 的严格布局，而非顶层 FourCC。
- 游戏对 MINA 的使用路径清晰：`sub_140115FC0 → sub_140233570 → sub_14024C680`，运行时经 `sub_140234CB0 → sub_140233C00` 按属性名采样。
- `sub_140239FE0` 的 `/60.0` 为 EXVS2 v1.2 头字段解读提供了**直接机器码证据**，与 `anim.rs` / `anim_data.rs` 注释一致。
- 本轮 IDA **未在代码段找到 `0x3409` 立即数比较**；曲线 magic 更可能通过 `sub_14024F870` 函数表或 `sub_14117DF10` 全局类型表间接分发 — ssbh_data 的专用解码器仍必要，且需持续用真实资产校验。
## EFXBN Animation Resource Bridge (2026-07-04)

`sub_140146A00` reads the copied EFXBN field at runtime `+0x290`, which maps
to raw `meta+0x288`, and passes it as the animation ID to
`sub_14016C1B0(manager+0x30, out, instanceId, animationId)`. Corpus evidence
confirms this ID is the IEEE CRC32 of the `.nuanmb` filename stem: all 54
nonzero references in 4201 EFXBN files resolve to local animation resources
with no collisions. After lookup, the helper iterates resolved model node
names and binds each against the literal `"Transform"` through
`sub_1402370B0`.
