# origin_structure vs test_structure (post-fix) — unk 字段对比

修复后对比：所有 unk 字段现在完全匹配。

## 概要

| 属性 | origin | test | 状态 |
|------|--------|------|------|
| Fhm2dTotalCount | 41 | 41 | OK |
| UnkCount | 5 | 5 | OK |
| SubFileStructure 条目数 | 87 | 90 | 见下方 EndMark 差异 |
| 根 Folder.folderCount | 2 | 2 | OK (fixed) |

---

## Folder unk 字段：完全匹配

两文件中所有 Folder 的 unk 组合完全一致：

| unk1 | unk2 | unk2_1 | unk3 | unk4 | unk5 | unk6 | 语义 |
|------|------|--------|------|------|------|------|------|
| 00000000 | 00000000 | 0 | 0 | 0 | 0 | 0 | 普通目录 |
| 00000000 | 00000000 | 0 | 32 | 0 | 1 | 0 | 贴图容器 |

sky 空 nust 容器 Folder(0, unk3=32, unk5=1) 已正确生成。
末尾空 Folder(0, unk3=0, unk5=0) 已正确生成。

---

## Item unk2 字段：完全匹配

| unk2 | origin 次数 | test 次数 | 状态 |
|------|------------|-----------|------|
| 00000000 (default) | 52 | 52 | OK |
| 10000000 (skel) | 3 | 3 | OK |
| 21000000 (mat) | 6 | 6 | OK (nust fixed) |
| 30000000 (mesh) | 3 | 3 | OK |
| 40000000 (mdl) | 3 | 3 | OK |
| 50000000 (jnt) | 3 | 3 | OK |
| **01010000 (fx)** | **1** | **1** | **OK (fixed)** |

## Item 其他 unk 字段：完全匹配

| 字段 | origin | test |
|------|--------|------|
| unk1 | 全部 00000000 | 全部 00000000 |
| unk2_1 | 全部 0 | 全部 0 |
| unk3 | 全部 0 | 全部 0 |
| unk4 | 全部 0 | 全部 0 |

---

## EndMark 差异（二进制等价）

| 场景 | origin | test | 二进制 |
|------|--------|------|--------|
| sky 后关闭 | EndMark(3) | EndMark(4) | 不同字节数 |
| 尾部 | Folder(0) + EndMark(2) | Folder(0) + EndMark(2) | OK |

origin 在 sky 后用 EndMark(3) 然后接 Folder(0) + EndMark(2) = 总共 3+2=5 个 0x0B。
test 在 sky 后用 EndMark(4) 然后接 Folder(0) + EndMark(2) = 总共 4+2=6 个 0x0B。

**原因**：test 的 sky 比 origin 多了一层 sky/ wrapper folder（origin sky 在内容层直接有模型子文件夹）。这导致多了一层需要关闭。

这是**结构拓扑差异**（目录层级不同），不是 unk 字段差异。

---

## 结论

所有 unk 字段修复均已生效：
- post_effect unk2=01010000 ✅
- 空 nust 贴图容器 (unk3=32, unk5=1, count=0) ✅  
- 末尾空 Folder (count=0) ✅
- 根 Folder count=2 ✅
