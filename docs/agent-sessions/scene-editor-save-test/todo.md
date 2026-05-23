# Scene Editor Save - 实际磁盘黑箱测试 Todo

**目标**: 对 `E:\XB\解包\com\test` 进行完整黑箱测试，验证 fhm2d 解包→编辑→重打包→再解包的完整流程。

## 任务状态

- [x] T1: 解包 16F73C97.fhm2d，验证结构正确
- [x] T2: 验证 textures/ 文件夹迁移（restore_shared_textures）
- [x] T3: 把 zabanya body.dae 转换成 SSBH，放入 stage 目录
- [x] T4: 新增对象测试 → repack → 再解包验证
- [x] T5: 删除对象测试 → repack → 再解包验证
- [x] T6: 移动/变换测试 → repack → 再解包验证
- [x] T7: XYZ 轴变换测试 → repack → 再解包验证
- [x] T8: 运行所有 Rust 测试，确认全部通过（59/59）
- [x] 确保 textures/ 独立存在，不放在模型子目录（unk3=64 标记）
- [x] 整合到 scene editor（sceneSaveFolderPipeline.ts、sceneSaveFhm2dPipeline.ts）
- [x] 记录踩坑和用户需求

## 结果

**59/59 Rust 测试全部通过**

关键修复：
- `textures/` 用 `unk3=64` 标记，re-extract 时不被 rename
- `restore_shared_textures` 接受 content root，textures 放在 `0/0/textures/`
- `rebuild_structure_json_for_stage_with_shared_textures` 生成指向 `textures/` 的 nutexb 路径
- Scene editor 的 Phase 2/8 改用 Rust 实现

详见 process.md。
