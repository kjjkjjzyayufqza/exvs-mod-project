# 0x16F73C97 Structure 对比分析

对比 `origin_structure.json`（原始解包）与 `structure.json`（重新组装/工具输出）的 SubFileStructure 差异。

## 概要

| 属性 | origin | structure |
|------|--------|-----------|
| Fhm2dTotalCount | 41 | 46 |
| SubFileData 数量 | 41 | 46 |
| SubFileStructure 条目数 | 87 | 102 |

structure 多了 5 个文件（index 34-38，`sssssccccc` 系列），属于新增的模型组。

---

## 核心结构差异

### 1. 顶层 Folder 的 folderCount

| 位置 (index) | origin | structure | 说明 |
|---|---|---|---|
| [0] 根Folder | folderCount=**2** | folderCount=**1** | origin有2个顶级子组(base区+object区合并, sky区)；structure只有1个顶级子组 |
| [1] 第二层Folder | folderCount=**4** | folderCount=**5** | structure多了一个子节点（新增sssssccccc组） |

### 2. 文件组织方式的本质差异

**Origin** 的组织逻辑：
- 按**文件类型**集中索引（所有 nutexb 在一起，编号 0-16）
- SubFileStructure 中的 `fileIndex` 引用的是**全局平坦索引**
- 贴图文件被多个 model 的材质 Folder 共享引用（同一个 fileIndex 出现在不同位置）

**Structure** 的组织逻辑：
- 按**模型/逻辑组**分层组织（每个模型的贴图跟随模型走）
- 每个 model 有自己的贴图子文件夹 `0/`
- 新增了独立的贴图条目（fileIndex 22-27 为 object_box01 专属贴图）

### 3. info 区域的差异

**Origin**：info 文件夹内容平铺为单层 Folder

```
Folder(folderCount=7)
  ├─ Folder(folderCount=2) → fog: 2个nutexb [6,7]
  ├─ Folder(folderCount=1) → light: 1个nutexb [8]
  ├─ Item [34] border_hit.hkt
  ├─ Item [35] placement.csv
  ├─ Item [36] graphic_param.csv
  ├─ Item [37] plan_param.spbin
  └─ Folder(folderCount=1) → post_effect: 1个nutexb [9]
```

**Structure**：info 文件夹多了一个 post_effect 子Folder

```
Folder(folderCount=7)
  ├─ Folder(folderCount=2) → fog: [13,14]
  ├─ Folder(folderCount=1) → light: [15]
  ├─ Folder(folderCount=1) → post_effect: [16]  ← 独立子Folder
  ├─ Item [17] border_hit.hkt
  ├─ Item [18] graphic_param.csv
  ├─ Item [19] placement.csv
  └─ Item [20] plan_param.spbin
```

**关键差异**：origin 中 post_effect 是 info Folder 最后一个子节点（EndMark=2 表示同时关闭 post_effect 和 info），但 structure 中 post_effect 被提前到 light 之后。

### 4. EndMark 分布差异

| 场景 | origin | structure |
|------|--------|-----------|
| info 区末尾 | `EndMark(2)` 在 post_effect 后 | `EndMark(1)` × 多次，最终 info 结束 |
| 全文件末尾 | `EndMark(3)` + `Folder(0)` + `EndMark(2)` | 连续4个 `EndMark(1)` |

**Origin 末尾**:
```
EndMark(3)          ← 关闭sky模型组 + object_box01区 + 整个第二顶级组
Folder(folderCount=0) ← 空占位Folder
EndMark(2)          ← 关闭占位 + 根
```

**Structure 末尾**:
```
EndMark(1)  ← 关闭sky模型内部
EndMark(1)  ← 关闭sky区
EndMark(1)  ← 关闭第二顶级Folder
EndMark(1)  ← 关闭根
```

### 5. unk2 字段语义一致

两个文件中 unk2 的使用规则完全一致：

| unk2 值 | 含义 |
|---------|------|
| `"00000000"` | 普通项/子Folder |
| `"10000000"` | .nusktb（骨骼） |
| `"21000000"` | .numatb（材质） |
| `"30000000"` | .numshb（mesh） |
| `"40000000"` | .numdlb（模型） |
| `"50000000"` | .jnttbl（关节表） |
| `"01010000"` | post_effect 贴图（仅origin中出现） |

**注意**：`"01010000"` 只在 origin 的 lut_none (post_effect) 出现，structure 中对应的 lut_none 使用的是 `"00000000"`。

### 6. Folder 的 unk3/unk5 字段

贴图子Folder 的模式一致：
- `unk3=32, unk5=1` → 这是一个**贴图容器**Folder（包含 nutexb 文件列表）
- `unk3=0, unk5=0` → 普通组织Folder

### 7. 新增 sssssccccc 模型组（仅 structure）

Structure 新增了一个完整的模型组：
```
Folder(folderCount=2) ← sssssccccc + sky 的父容器
  └─ Folder(folderCount=7) ← sssssccccc 模型组
       ├─ Item[34] sssssccccc.nusktb     (unk2="10000000")
       ├─ Folder(1) → 贴图[2] diffuse    (unk3=32, unk5=1)
       ├─ Item[35] __maya__.numatb        (unk2="21000000")
       ├─ Folder(1) → 贴图[2] diffuse    (unk3=32, unk5=1)
       ├─ Item[36] __nust__.numatb        (unk2="21000000")
       ├─ Item[37] sssssccccc.numshb      (unk2="30000000")
       └─ Item[38] sssssccccc.numdlb      (unk2="40000000")
  └─ Item[39] sssssccccc.hkt
```

**特点**：
- 没有 jnttbl（无 unk2="50000000" 项）
- numatb 的贴图Folder 引用的是 fileIndex=2（复用 base 的 diffuse 贴图）
- 有独立的 map_hit (sssssccccc.hkt)

---

## 贴图引用策略差异

**Origin**：贴图全局编号，不同 model 的材质 Folder 引用相同的全局 fileIndex
- base maya材质 → [0,1,2,3,4,5]（对应 panel_01 六张贴图）
- base nust材质 → [2,3,1,0,4,5]（相同贴图，不同顺序）
- object_box01 maya材质 → [10,11,12,0,13,1,2,3,4,5,14,15]（混合 panel_01 + panel_02）
- object_box01 nust材质 → [12,0,1,13,5,2,3,4,14,10,11,15]（相同贴图，不同顺序）

**Structure**：贴图也是全局编号，但编号从 1-6 为 base 专属
- base maya材质 → [1,2,3,4,5,6]
- base nust材质 → [1,2,3,4,5,6]（**顺序一致！**与 origin 不同）
- object_box01 maya材质 → [1,2,3,4,5,6,22,23,24,25,26,27]（前6个复用base，后6个是独立的）
- object_box01 nust材质 → [1,2,3,4,5,6,22,23,24,25,26,27]（**顺序一致！**与 origin 不同）

**结论**：Structure 中 nust 材质的贴图引用顺序与 maya 材质相同，而 origin 中两者顺序不同。这可能是重组工具的简化处理。

---

## 总结

| 差异点 | 影响 |
|--------|------|
| 顶层folderCount不同 | 树结构深度/广度变化 |
| info 中 post_effect 位置 | 不影响功能，但二进制不一致 |
| EndMark 累加 vs 分散 | `EndMark(N)` 等价于 N 个 `EndMark(1)` |
| nust 材质贴图顺序 | 可能影响渲染（材质槽位映射） |
| unk2 `01010000` 消失 | post_effect 贴图标记丢失 |
| 新增 sssssccccc 组 | 测试用新增模型 |
| 空占位 Folder(0) 消失 | origin末尾有，structure没有 |
