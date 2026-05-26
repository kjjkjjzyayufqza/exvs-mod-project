# SubFileStructure unk 字段逐项对比

对比 `0x16F73C97_origin_structure.json`（游戏原始）与 `0x16F73C97_structure.json`（工具重组输出）。

---

## Folder 节点 unk 对比

两个文件中 Folder 节点的 unk 字段分布：

### origin 中所有 Folder 的 unk 组合

| 出现次数 | unk1 | unk2 | unk2_1 | unk3 | unk4 | unk5 | unk6 | 语义 |
|---------|------|------|--------|------|------|------|------|------|
| 13 | 00000000 | 00000000 | 0 | 0 | 0 | 0 | 0 | 普通目录 |
| 6 | 00000000 | 00000000 | 0 | 32 | 0 | 1 | 0 | 贴图容器 |

**结论**：origin 中只有两种 Folder unk 组合。全部 unk1/unk2/unk2_1/unk4/unk6 = 0。

### structure 中所有 Folder 的 unk 组合

| 出现次数 | unk1 | unk2 | unk2_1 | unk3 | unk4 | unk5 | unk6 | 语义 |
|---------|------|------|--------|------|------|------|------|------|
| 14 | 00000000 | 00000000 | 0 | 0 | 0 | 0 | 0 | 普通目录 |
| 8 | 00000000 | 00000000 | 0 | 32 | 0 | 1 | 0 | 贴图容器 |

**结论**：structure 也只有相同两种组合。Folder 的 unk 字段**完全一致**，无差异。

---

## Item 节点 unk 对比

### origin 中所有 Item 的 unk2 分布

| unk2 | 出现次数 | 对应文件类型 | 备注 |
|------|---------|------------|------|
| `"00000000"` | 52 | .nutexb / .hkt / .csv / .spbin | 默认 |
| `"10000000"` | 3 | .nusktb | 骨骼 |
| `"21000000"` | 6 | .numatb | 材质 |
| `"30000000"` | 3 | .numshb | Mesh |
| `"40000000"` | 3 | .numdlb | 模型 |
| `"50000000"` | 3 | .jnttbl | 关节表 |
| **`"01010000"`** | **1** | .nutexb (lut_none) | **post_effect 特殊** |

### structure 中所有 Item 的 unk2 分布

| unk2 | 出现次数 | 对应文件类型 | 备注 |
|------|---------|------------|------|
| `"00000000"` | 69 | .nutexb / .hkt / .csv / .spbin | 默认 |
| `"10000000"` | 4 | .nusktb | 骨骼（多1个 sssssccccc） |
| `"21000000"` | 8 | .numatb | 材质（多2个 sssssccccc） |
| `"30000000"` | 4 | .numshb | Mesh（多1个） |
| `"40000000"` | 4 | .numdlb | 模型（多1个） |
| `"50000000"` | 2 | .jnttbl | 关节表（少1个，sssssccccc无jnttbl） |
| **`"00000000"`** | — | .nutexb (lut_none) | **⚠️ 丢失了 `01010000`** |

### ⚠️ 关键差异：post_effect unk2 丢失

| 文件 | lut_none.nutexb 的 unk2 |
|------|------------------------|
| origin | `"01010000"` |
| structure | `"00000000"` |

这是唯一的 Item.unk2 值差异。structure 的 rebuild 逻辑没有识别 `info/post_effect/` 目录下的 nutexb 需要特殊 unk2。

### Item 的其他 unk 字段

| 字段 | origin 全部值 | structure 全部值 | 差异 |
|------|-------------|----------------|------|
| unk1 | 全部 `"00000000"` | 全部 `"00000000"` | ✅ 无差异 |
| unk2_1 | 全部 `0` | 全部 `0` | ✅ 无差异 |
| unk3 | 全部 `0` | 全部 `0` | ✅ 无差异 |
| unk4 | 全部 `0` | 全部 `0` | ✅ 无差异 |

---

## EndMark 对比

| 场景 | origin | structure |
|------|--------|-----------|
| 普通关闭 | `EndMark(1)` | `EndMark(1)` |
| 多层关闭 | `EndMark(2)`, `EndMark(3)` | 只有 `EndMark(1)` |
| 二进制等价 | — | ✅ 等价（N个0x0B） |

origin 使用合并式 EndMark（一次关闭多层），structure 使用逐层 EndMark（每次关闭1层）。
**二进制输出完全相同**，仅 JSON 表示形态不同。

---

## 总结：需要修复的 unk 差异

| # | 差异 | 影响 | 修复状态 |
|---|------|------|---------|
| 1 | `post_effect/` 下 nutexb 的 unk2 从 `01010000` 变为 `00000000` | 游戏可能无法识别 LUT 贴图 | ✅ 已修复（`unk2_for_file`） |
| 2 | Folder unk 字段 | 无差异 | — |
| 3 | Item unk1/unk2_1/unk3/unk4 | 无差异 | — |
| 4 | EndMark 格式 | 二进制等价 | — |

**唯一实质性差异就是 Item.unk2 的 `"01010000"` 丢失**，已通过 `unk2_for_file()` 修复。
