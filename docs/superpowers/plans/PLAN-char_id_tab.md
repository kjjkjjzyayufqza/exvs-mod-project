# Character ID Table 接入 Memory Preview Workspace 方案

## Summary
- 在 `Memory Preview Workspace` 内新增一个 `Character ID` 选择区，数据来源固定为当前工作区的 `0x036B9E67/character_id_table.bin`，但只向 UI 暴露 `CharacterId` 和 `Model` 映射。
- 选择区放在现有左侧栏顶部，保留当前 3 栏布局不变；下方仍是现有 `Virtual File Tree`，右侧 `Details` 和 `Preview Workbench` 行为不变。
- 用户单击某个有效 `Character ID` 后，立即用该行 `Model` 解析出 `obDplCachePath/0xXXXXXXXX.fhm2d`，并复用现有 `openSourcePath` 流程替换当前 memory session。
- 列表使用虚拟滚动和搜索；手动 `Open FHM2D` 保留，作为并行入口，不做 fallback 或静默降级。

## Key Changes
- 在 [Fhm2dMemoryPreviewModal.tsx](E:/TAURI_PROJECT/src/page/TestEditor/components/ssbh-model-preview/Fhm2dMemoryPreviewModal.tsx) 中新增 `Character ID` picker 区块。
- picker 顶部显示当前来源状态：工作区 `character_id_table.bin` 路径、`obDplCachePath` 是否已配置、可用条目数。
- picker 行展示固定为 `Character ID` 主标题 + `0xXXXXXXXX.fhm2d` 次级信息；搜索命中 `CharacterId` 字符串和 `Model` 的 hash 文本。
- picker 行按 `CharacterId` 升序展示；如果多个 `CharacterId` 指向同一个 `Model`，保留为多行，允许它们加载同一个 `.fhm2d`。
- 无效行保持可见但禁用，并给出明确原因：`Model <= 0`、`obDplCachePath` 未配置、源 `.fhm2d` 不存在、当前工作区缺少 `character_id_table.bin`。
- 单击有效行时直接调用现有 session 替换逻辑，不新增第二套载入实现；成功后更新当前高亮 `Character ID`，失败时维持现有 toast/error 行为。
- 新增内部类型 `CharacterIdMemoryPreviewOption`，放在 [fhm2dMemoryPreviewTypes.ts](E:/TAURI_PROJECT/src/page/TestEditor/components/ssbh-model-preview/fhm2dMemoryPreviewTypes.ts)，字段固定为 `characterId`、`modelValue`、`modelHashHex`、`sourcePath`、`sourceExists`、`disabledReason`。
- 新增只读数据加载模块，建议路径为 [fhm2dMemoryPreviewCharacterTable.ts](E:/TAURI_PROJECT/src/page/TestEditor/components/ssbh-model-preview/fhm2dMemoryPreviewCharacterTable.ts)。
- 该模块负责：读取当前工作区 `character_id_table.bin`、复用现有 `CharacterIdTable` 解析器后映射为轻量 picker 数据、按现有 `.fhm2d` 大小写兼容规则解析 `obDplCachePath` 下的源文件路径。
- `obDplCachePath` 直接从 `useConfigStore` 的 Zustand 状态读取，确保配置变更后 modal 内状态可重新计算，不新增独立配置读取流程。
- 不改 Rust/Tauri command；本次只做前端整合和现有 service 复用。

## Test Plan
- 为新 loader 增加单元测试，覆盖：正常读取 `CharacterId + Model`、按 `CharacterId` 排序、重复 `Model`、`Model=0`、缺失 `character_id_table.bin`、缺失 `obDplCachePath`、源 `.fhm2d` 缺失、大小写文件名兼容。
- 为 modal 增加组件测试，覆盖：显示 picker、搜索过滤、单击有效行后调用现有 `createFhm2dMemorySession/openSourcePath` 链路、无效行禁用且不触发加载。
- 在现有 memory preview 性能测试中补一条列表过滤预算用例，验证大表搜索在虚拟列表模式下不会明显拖慢交互。

## Assumptions
- 数据源是当前 Test Editor 工作区下的 `character_id_table.bin`，不是从 OB 目录直接读取表文件。
- 只在 picker 里暴露 `CharacterId` 和 `Model`；其他字段不进入 Memory Preview UI，也不参与搜索。
- 手动 `Open FHM2D`、`Reload Session`、`Apply Selected To 3D View` 维持现状，不因 Character ID picker 改变。
- 选择 `Character ID` 的行为等同于手动重新打开另一个 `.fhm2d`，会替换当前 memory session；不额外增加“未保存重命名确认”。
- 缺失配置或缺失文件时只做显式禁用/报错，不自动猜测路径、不回退到其他目录。
