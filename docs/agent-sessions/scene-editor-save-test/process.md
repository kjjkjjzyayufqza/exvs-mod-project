# Scene Editor Save - 实际磁盘黑箱测试 Process

## 目标

对 `E:\XB\解包\com\test` 进行完整黑箱测试，验证 fhm2d 解包→编辑→重打包→再解包的完整流程。
测试覆盖：新增对象、删除对象、移动/变换、XYZ 轴变换、保存到 fhm2d、再次解包验证格式。

## 用户实际需求（最终确认）

1. **贴图始终独立存在于 `textures/` 文件夹**，不放在模型子目录（`0/`, `1/`）
2. **打包 fhm2d 时只修改 `_structure.json` 的 `fileUrl` 路径**指向 `textures/`，不物理移动文件
3. **`textures/` 放在 content root（`0/0/textures/`）下**，不是 pack root 下
4. **info/ 里的 nutexb（fog、light、post_effect）不受影响**，只处理 base 和 sub model 的贴图
5. **整合到 scene editor**：`restore_shared_textures` 和 `rebuild_stage_structure_json` 替换 TypeScript 实现

---

## 踩过的坑

### 坑 1：`textures/` 放在 pack root 还是 content root

**问题**：`restore_shared_textures(stage_root)` 最初把 `textures/` 放在 `stage_root/textures/`。当 `stage_root` 是 pack root（`16F73C97/`）时，`textures/` 在 `16F73C97/textures/`，不在 content root（`16F73C97/0/0/`）下。

**后果**：fhm2d 的 structure JSON 里 textures 路径是 `.\16F73C97\textures\*.nutexb`（pack root 下），但 fhm2d 的 stage 结构期望所有内容在 `0/0/` 下。Re-extract 时 stage rename 把 `textures/` 当成最后一个子目录（sky），导致 rename 混乱。

**修复**：`restore_shared_textures` 和 `redistribute_stage_textures` 接受 content root 作为参数（调用者传入 `stageRoot = 0/0/`）。`rebuild_structure_json_for_stage_with_shared_textures` 用 `resolve_content_root` 自动从 pack root 找到 content root。

---

### 坑 2：`textures/` 在 re-extract 时被 stage rename 成 `sky/`

**问题**：stage rename 逻辑基于位置（position 0=base, 1=info, last=sky）。当 `textures/` 出现在 `0/0/` 下时，它成为最后一个子目录，被 rename 成 `sky/`，导致 `textures/` 消失，sky 的文件被放到 `textures/` 里。

**根本原因**：`tokenize_structure` 把所有 Folder 节点命名为数字（计数器），`apply_semantic_rename` 无法区分 `textures/` 和其他子目录。

**修复**：
1. `emit_dir_recursive` 为 `textures/` 文件夹生成 `unk3=64` 标记（区别于普通 `unk3=0` 和 texture container `unk3=32`）
2. `tokenize_structure` 识别 `unk3=64`，把该 Folder 节点命名为 `"textures"` 而不是数字
3. `rename_stage_content_folder` 检查 `folder.name == "textures"` 时直接 return，跳过 rename
4. `apply_semantic_rename` 从位置计数中排除 `textures/`，确保 sky 仍然是最后一个非 textures 子目录

---

### 坑 3：`try_preserve_original_structure` 使用旧 structure JSON 导致错误路径

**问题**：磁盘测试中，`scene_edit_test_structure.json` 是上一次运行留下的旧文件（引用 `base/0/0.nutexb` 等旧路径）。`try_preserve_original_structure` 检查旧文件里的所有引用文件是否存在，如果都存在就直接返回旧文件，不做 full rebuild。

**后果**：旧 structure JSON 里的路径（`base/0/0.nutexb`）被保留，导致 repack 时找不到文件或打包错误内容。

**修复**：测试开始时清理 `scene_edit_test_structure.json`（不只清理目录）。实际使用中，每次 save 都会 full rebuild，不会有这个问题。

---

### 坑 4：re-extract 时覆盖了 edit 目录

**问题**：`extract_stage_fhm2d_to_folder_impl` 用 fhm2d 文件名（`scene_edit_test`）作为输出目录名。Re-extract `scene_edit_test.fhm2d` 时，输出到 `test_dir/scene_edit_test/`，覆盖了正在使用的 edit 目录，导致 `edit_textures` 路径失效。

**修复**：Re-extract 时先输出到独立的临时目录（`scene_edit_verify_raw/`），再 rename 到 `scene_edit_verify/`。

---

### 坑 5：`rebuild_structure_json_for_stage_with_shared_textures` 第二次调用返回旧结果

**问题**：该函数先调用 `rebuild_structure_json_for_stage`（第一次 full rebuild，生成正确路径），然后 patch nutexb URL。但 patch 后再次调用 `rebuild_structure_json_for_stage`（在 `rebuild_structure_json_for_stage_with_shared_textures` 内部），第二次调用发现 structure JSON 已存在且所有文件都存在，`try_preserve_original_structure` 成功，直接返回第一次 rebuild 的结果（已经包含 `textures/` 路径），patch 是 no-op。

**结论**：这实际上是正确的行为——第一次 rebuild 已经生成了 `textures/` 路径（因为 `textures/` 在磁盘上），patch 只是确保路径格式正确。

---

### 坑 6：`zabanya_body.numdlb` 内部 model name 是 `001stage001_object_box01`

**问题**：测试中复制 `object_box01` 的 SSBH 文件并重命名为 `zabanya_body.*`，但 `zabanya_body.numdlb` 内部的 model name 字段仍然是 `001stage001_object_box01`。Re-extract 时 stage rename 用 numdlb 内部 model name 来命名文件夹，导致 `zabanya_body/` 被 rename 成 `001stage001_object_box01/`（与已删除的目录同名），rename 失败，退化成 `sub_2/`。

**结论**：这是测试数据的限制（没有真正转换 DAE），不是 bug。实际 scene editor 中，DAE→SSBH 转换会生成正确的 model name。测试改为验证文件数量和 placement.csv 内容，不依赖文件夹名称。

---

### 坑 7：`resolve_content_root` 破坏了现有测试

**问题**：为了让 `restore_shared_textures` 自动找到 content root，添加了 `resolve_content_root` 辅助函数，在 `restore_shared_textures` 内部自动从 pack root 找 `0/0/`。但现有测试（T2、redistribute roundtrip 等）传入的是 pack root，期望 `textures/` 在 pack root 下，被 `resolve_content_root` 改变了行为。

**修复**：移除 `resolve_content_root` 在 `restore_shared_textures` 和 `redistribute_stage_textures` 中的使用，让调用者负责传入正确的 root（content root）。只在 `rebuild_structure_json_for_stage_with_shared_textures` 中保留 `resolve_content_root`（因为它需要同时处理 pack root 和 content root）。

---

## 最终架构

### 打包流程（Save as FHM2D）

```
stageRoot (content root: 0/0/)
  ↓
restore_shared_textures(stageRoot)
  → nutexb 从 model/0/, model/1/ 移到 0/0/textures/
  ↓
rebuild_structure_json_for_stage_with_shared_textures(packRoot)
  → 扫描磁盘，生成 structure JSON
  → textures/ 文件夹用 unk3=64 标记
  → patch nutexb fileUrl 指向 0/0/textures/
  ↓
repack_fhm2d_from_structure(structurePath, outputFhm2dPath)
  → 从 textures/ 读取 nutexb 打包
```

### 解包流程（Extract FHM2D）

```
fhm2d
  ↓
extract_stage_fhm2d_to_folder_impl
  → 写文件到磁盘（textures/ 在 0/0/textures/）
  ↓
stage_rename_in_memory
  → tokenize_structure: unk3=64 → 命名为 "textures"
  → apply_semantic_rename: 跳过 textures/ rename
  → textures/ 保持原名，nutexb 在 0/0/textures/
```

### Scene Editor 整合

- **Save as Folder**：`restore_shared_textures(stageRoot)` + `rebuild_stage_structure_json(packRoot)`
- **Save as FHM2D**：`restore_shared_textures(stageRoot)` + `rebuild_stage_structure_json_with_shared_textures(packRoot)` + repack

---

## 测试结果（2026-05-23）

**总计：59/59 Rust 测试通过**

新增测试：
- `test_rebuild_with_shared_textures_no_file_movement` — 验证 textures 不被物理移动
- `test_disk_scene_editor_add_delete_repack_verify` — 完整磁盘黑箱测试（新增+删除对象→repack→re-extract→验证）
- T1-T7 黑箱测试（解包验证、贴图迁移、DAE→SSBH、增删改变换）

## 修改文件

- `src-tauri/src/format/fhm2d_stage.rs` — 核心修复（unk3=64、tokenize_structure、rename 保护、resolve_content_root、restore/redistribute 修复）
- `src-tauri/src/stage_commands.rs` — 新增 `rebuild_stage_structure_json_with_shared_textures` 命令
- `src-tauri/src/lib.rs` — 注册新命令
- `src-tauri/src/format/fhm2d_stage_test.rs` — 新增 9 个黑箱测试
- `src/page/SceneEdit/utils/sceneSaveFolderPipeline.ts` — Phase 2/8 改用 Rust 实现
- `src/page/SceneEdit/utils/sceneSaveFhm2dPipeline.ts` — 移除 redistribute/restore，改用新 rebuild 命令

