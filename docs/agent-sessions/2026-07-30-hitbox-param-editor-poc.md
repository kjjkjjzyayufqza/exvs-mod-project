# 近战 Hitbox 参数分析与 POC 可视化

**日期：** 2026-07-30  
**目标：** 延续 Claude 会话 `f610c67c-78bc-4fb6-b6fc-2472c7187615`，把
`hitgroupiddef` / `interactionid` 的逆向结论接入主 Param Editor。

## 相关证据

- `docs/hitbox-research/` 记录参数表的球体、扫掠模式、外键和命中效果语义。
- OB v27 的运行时碰撞记录已经是世界坐标：静态模式读取单球，扫掠模式读取
  previous/current 两端点与半径。AABB 仅用于 broad phase，不是最终碰撞形状。
- 运行时 depot 使用三组并行数组；安全快照必须要求 record、mode、enable
  数量完全一致，并在读取前后复核 slot handle generation。

## 已实现

### Tauri 主编辑器

- 在 `TypedParamDataPanel` 内为 `hitgroupiddef` 和 `interactionid` 挂载
  `HitboxParamAnalysisPanel`，不再依赖未挂载的独立编辑器页面。
- hitgroup 行显示交互矩阵、球体覆盖范围、interaction 外键和已解析的命中效果。
- interaction 行显示伤害/倒地/407 麻痹/500–501 bind 分类、事件链，以及反向引用
  hitgroup 的只读几何预览。
- 配对参数文件通过 Tauri `parse_typed_param_file` 只读加载；路径沿用主编辑器的
  `paramEditor.v2.fp.*` 持久化键，不改变当前文件的 dirty/save 状态。
- 将数值属性面板的回调边界收紧为 `number`，字符串字段仍只在支持字符串写入的
  `PropertyField` 路径中传递。

## 验证

- `npm run build`：通过（TypeScript + Vite production build）。
- Vitest：5 个文件、25 个测试通过；覆盖 hitbox 分析、交叉引用、碰撞几何、命中效果
  分类和 motion batch export 的只读数组契约。
- `cargo test hitgroupiddef`：3 个测试通过。
- `cargo test interactionid`：2 个测试通过。
- `python .\tools\check_param_name_evidence.py`：271 个 canonical key 校验通过。
- POC：`build_exvs2_poc_advanced.bat` Release/x64 构建通过，输出
  `E:\OBHK0.3_v27\bngrw.dll`（1,987,584 bytes）。

## 运行边界

本轮没有启动 Tauri dev server，也没有注入或运行游戏。POC 仍需一次人工游戏内验证：
先保持 `[meleehitboxgizmo] Enabled=false` 验证基线，再启用并检查静态球、扫掠轴线、
单位过滤、Present 稳定性和限频日志。该步骤及判定标准已写入 POC 报告。
