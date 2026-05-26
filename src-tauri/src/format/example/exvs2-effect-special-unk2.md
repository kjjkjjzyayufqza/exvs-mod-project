# EXVS2 Effect 特殊 unk2 处理规则

> **面向 AI Agent 的参考文档** — 修改 SubFileStructure rebuild 逻辑时必读。

---

## 问题

`info/post_effect/` 目录下的 `.nutexb` 文件（如 `lut_none.nutexb`）在游戏原始数据中
使用特殊的 `Item.unk2 = "01010000"`，而非普通贴图的 `"00000000"`。

如果将其重建为 `"00000000"`，可能导致游戏运行时后处理效果（Post Processing Effect）
查找 LUT 贴图失败。

---

## 修复方案

在 `fhm2d_stage.rs` 中新增 `unk2_for_file()` 函数，基于文件的**父目录名称**判断：

```rust
fn unk2_for_file(file: &Path, ext: &str) -> &'static str {
    if ext == ".nutexb" {
        if let Some(parent) = file.parent() {
            let parent_name = parent
                .file_name()
                .map(|n| n.to_string_lossy().to_ascii_lowercase())
                .unwrap_or_default();
            if parent_name == "post_effect" {
                return "01010000";
            }
        }
    }
    unk2_for_ext(ext)
}
```

`emit_file_item` 调用 `unk2_for_file(file, &ext)` 替代原来的 `unk2_for_ext(&ext)`。

---

## 规则总结

| unk2 | 条件 | 需要关注？ |
|------|------|-----------|
| `"01010000"` | `.nutexb` 且父目录为 `post_effect` | ✅ 已修复 |
| `"10000000"` | `.nusktb` | ❌ 不用管 |
| `"21000000"` | `.numatb` | ❌ 不用管 |
| `"30000000"` | `.numshb` | ❌ 不用管 |
| `"40000000"` | `.numdlb` | ❌ 不用管 |
| `"50000000"` | `.jnttbl` | ❌ 不用管 |
| `"00000000"` | 其他所有 | ❌ 不用管 |

只有 **`"01010000"` (post_effect 内的 nutexb)** 是需要特殊处理的 effect 类型。
其余 unk2 值（1/3/4/5/6）由 `unk2_for_ext()` 按扩展名自动匹配，无需额外关注。

---

## 验证

对比 origin_structure.json 中 `lut_none` 的 Item：
```json
{
  "type": "Item",
  "unk1": "00000000",
  "fileIndex": 9,
  "unk2": "01010000",   ← 正确值
  "unk2_1": 0,
  "unk3": 0,
  "unk4": 0,
  "originalFileIndex": 9
}
```

修复前 rebuild 输出 `"00000000"`，修复后正确输出 `"01010000"`。

---

## 源码位置

| 函数 | 文件:行 | 说明 |
|------|---------|------|
| `unk2_for_file` | `fhm2d_stage.rs:3335` | 带目录上下文的 unk2 判断 |
| `unk2_for_ext` | `fhm2d_stage.rs:3031` | 纯扩展名 unk2 映射（不处理 effect） |
| `emit_file_item` | `fhm2d_stage.rs:3351` | 调用 `unk2_for_file` |
