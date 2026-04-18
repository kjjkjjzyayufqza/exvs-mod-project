# Test Editor 3D Preview 纯内存 FHM2D 工作台设计稿

## Summary

在 `Test Editor -> 3D View` 增加一个专用 `Memory Preview` modal，提供一条独立于现有磁盘预览的纯内存工作流：

- 读取 `.fhm2d` 后在 Rust 侧完成纯内存解包，不落盘。
- 复用现有 `fhm2d_numdlb_character` 命名逻辑，默认按 `fhm2d_character` 处理，自动生成虚拟文件路径与模型分组。
- 前端展示虚拟文件树 + 详情面板 + 批量候选清单，允许在内存会话内 rename，并实时更新引用关系。
- 用户从虚拟候选里批量勾选模型文件夹或 `.numdlb`，再将选中项挂载到现有 3D 窗口。
- 现有磁盘预览能力保留不变，内存工作台作为明确区分的新入口，不和旧入口混淆。

## Key Changes

### 1. 后端内存会话与虚拟文件树

新增一组纯内存 Tauri 命令，职责分离如下：

- `create_fhm2d_memory_session`
  - 输入：`fhm2d` 文件字节、格式提示、源文件名。
  - 输出：`sessionId`、虚拟根目录、解析摘要、命名告警、候选模型列表、虚拟文件树。
  - 逻辑直接复用 `src-tauri/src/format/fhm2d.rs` 现有解析能力，但新增“只产出内存结构、不写磁盘”的路径。
- `rename_fhm2d_memory_entry`
  - 输入：`sessionId`、虚拟文件节点 id、目标名称或目标虚拟路径。
  - 输出：更新后的节点、受影响引用、冲突信息。
  - 规则：只允许会话内 rename；发生重名、非法扩展名、破坏 `.numdlb -> .numshb/.nusktb/.numatb/.nutexb` 关联时直接报错，不做 fallback。
- `list_fhm2d_memory_preview_candidates`
  - 返回虚拟模型文件夹、`.numdlb`、关联侧车文件、纹理引用情况，支持批量选择 UI。
- `build_ssbh_preview_bundle_from_memory`
  - 输入：`sessionId` + 选中的虚拟 `.numdlb`。
  - 输出：与现有 `SsbhModelPreviewBundle` 同形的 bundle JSON，但来源改为内存解析而不是磁盘路径。
  - 需要在 `src-tauri/src/ssbh_preview.rs` 补一条“from bytes / from virtual resolver”链路，避免继续依赖 `ModlData::from_file` 这类磁盘 API。
- `dispose_fhm2d_memory_session`
  - 显式释放会话和缓存，关闭 modal 或清空工作台时调用。

内存会话数据结构需要明确包含：

- `sessionId`
- `sourceName`
- `format`
- `namingWarning`
- `virtualTree`
- `virtualEntriesById`
- `previewCandidates`
- `selectedCandidateIds`
- `renameRevision`
- `derivedPreviewBundlesCache`

### 2. 前端 Memory Preview modal

在 `3D View` 工具栏新增入口按钮，打开 `Memory Preview` modal。modal 默认分成三栏：

- 左栏：虚拟文件树
  - 支持搜索、按类型过滤、按“模型相关文件”过滤。
  - 节点显示虚拟路径、扩展名、是否被选中用于预览、是否存在引用异常。
- 中栏：详情面板
  - 展示当前节点的虚拟路径、文件类型、大小、来源 file index、引用关系。
  - 对 `.numdlb` 展示绑定的 `.numshb/.nusktb/.numatb/.nutexb` 摘要。
  - 对 rename 结果展示影响范围与即时校验错误。
- 右栏：预览候选工作台
  - 分区展示“模型文件夹候选”和“`.numdlb` 候选”。
  - 支持批量勾选、全选、清空、按引用完整性筛选。
  - 默认行为是“先进入工作台，再勾选加载”。

modal 顶部操作区：

- `Open FHM2D`
- `Reload Session`
- `Auto Rename`
- `Apply Selected To 3D View`
- `Append To 3D View`
- `Clear Session`

交互要求：

- modal 内 rename 只修改内存视图，不写磁盘。
- `Apply Selected To 3D View` 替换当前 3D 预览实例。
- `Append To 3D View` 将选中虚拟 `.numdlb` 追加为多实例。
- 当前会话关闭后全部失效，不做持久化，不导出磁盘。

### 3. 与现有 3D Preview 的集成方式

现有 `SsbhModelPreviewContext` 保留磁盘模型能力，同时新增一条内存来源通道：

- `loadModelAt` / `addModelAt` 保持原样。
- 新增 `loadMemoryPreviewCandidates` / `appendMemoryPreviewCandidates` 一类上下文动作，接收内存 bundle 数组。
- `SsbhModelPreviewBundle` 需要扩展来源信息：
  - `sourceKind: "disk" | "memory"`
  - `sourceSessionId?: string`
  - `virtualModlPath?: string`
- 现有 viewport、mesh list、attachment、motion、scene config 的逻辑默认继续工作，但 v1 只保证：
  - 内存模型可正常显示、批量追加、显示/隐藏、切换 active instance。
  - 不把内存来源写入现有 scene export/import。
  - 不支持基于内存来源的“Open folder in file manager”“Copy disk path”这类磁盘操作；这些按钮对内存模型直接禁用并给明确提示。

### 4. 命名、选择与错误策略

命名策略固定为：

- 默认走 `fhm2d_numdlb_character` 的 Character/Effect 命名逻辑。
- 当前主路径按 `fhm2d_character` 作为默认类型设计。
- 自动命名后允许手动 rename 覆写。
- 手动 rename 只改虚拟路径和依赖映射，不改二进制内容。

选择策略固定为：

- 批量选择模型文件夹和 `.numdlb` 都在工作台进行。
- 真正加载到窗口前必须显式点击 `Apply` 或 `Append`。
- 一个虚拟模型文件夹如果内部存在多个 `.numdlb`，UI 按 folder 分组但最终仍以 `.numdlb` 为最小加载单位。

错误策略固定为：

- 缺少关联文件、引用断裂、重名、非法 rename、无法解析的 `.numdlb`，一律明确报错。
- 不做自动降级、不偷偷跳过、不回退到磁盘路径。
- 若某个候选损坏，只阻止该候选加载，不清空整个会话。

### 5. 性能与可用性约束

这是大文件场景，v1 需要直接带上性能措施：

- FHM2D 解包、SSBH 解析全部放在 Rust。
- 前端候选清单和文件树使用虚拟化或分段渲染。
- 批量筛选、搜索、勾选操作使用 `startTransition` 包住非阻塞 UI 更新。
- 内存 session 只缓存当前 modal 会话；关闭 modal 后主动释放。
- 纹理解码沿用现有按需加载思路，不因为纯内存而默认一次性把所有贴图解码到前端。

## Public API / Type Changes

需要新增或调整的公开接口与类型：

- Tauri commands
  - `create_fhm2d_memory_session`
  - `rename_fhm2d_memory_entry`
  - `list_fhm2d_memory_preview_candidates`
  - `build_ssbh_preview_bundle_from_memory`
  - `dispose_fhm2d_memory_session`
- Frontend types
  - `Fhm2dMemorySessionSummary`
  - `Fhm2dVirtualEntry`
  - `Fhm2dPreviewCandidate`
  - `MemoryRenameImpact`
- `SsbhModelPreviewBundle`
  - 新增 `sourceKind`
  - 新增 `sourceSessionId?`
  - 新增 `virtualModlPath?`
- `SsbhModelPreviewContext`
  - 新增打开内存 modal 的入口状态
  - 新增从内存 bundle 加载/追加实例的方法

## Test Plan

### Rust

- `fhm2d_character` 文件可在不落盘的前提下解析为完整虚拟文件树。
- 自动命名结果与现有落盘提取逻辑一致。
- 手动 rename 后，`.numdlb` 的侧车文件解析仍正确指向新的虚拟路径。
- 同名冲突、非法扩展名、引用断裂时返回明确错误。
- 从内存虚拟 `.numdlb` 构建的 preview bundle 与磁盘 bundle 在字段形状上兼容。

### Frontend

- 打开 modal 后能显示虚拟文件树、详情面板、候选工作台。
- 搜索、过滤、批量勾选不会阻塞 UI。
- rename 成功后树节点、详情、候选状态同步刷新。
- 对内存模型执行 `Apply` 会替换当前 3D 视图实例。
- 对内存模型执行 `Append` 会追加多实例，不影响已加载磁盘模型。
- 内存模型时，依赖磁盘路径的快捷操作被禁用且提示明确。

### Integration / Acceptance

- 选择一个 `fhm2d_character` 文件，自动命名后能看到多个虚拟模型候选。
- 批量勾选若干 `.numdlb`，点击 `Apply` 后 3D 窗口出现对应模型。
- 关闭 modal 重新打开，不保留上一轮内存会话。
- 清空会话后释放内存资源，再次打开新包不串数据。
- 部分候选损坏时，其它候选仍可正常加载。

## Assumptions

- 当前目标包类型主要是 `fhm2d_character`，`fhm2d_effect` 作为同一命名链路兼容，但不是 v1 主验收对象。
- v1 不做内存会话持久化、不导出到磁盘、不保存回 `.fhm2d`。
- v1 不支持编辑虚拟文件内容本体，只支持 rename、筛选、选择、加载。
- v1 不把内存模型纳入现有 scene config 的导入导出。
- 现有磁盘 3D preview 流程必须保持兼容，所有新增能力都通过独立 modal 入口进入。
