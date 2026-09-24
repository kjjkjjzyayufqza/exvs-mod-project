# 过程报告：地图库 / 贴图开关 / 任务脚本预览 / 机体镜头归属

**日期：** 2026-09-20
**分支：** `main`
**范围：** OB（`vsac27_Release.exe`）及 OB 数据集，符合仓库既定的版本范围约束。

---

## 0. 总览

| # | 需求 | 类型 | 结果 |
|---|---|---|---|
| 1 | map list 索引 fhm2d 并解压，map editor 只需打开文件夹 | 功能 | 已完成 |
| 2 | map editor 贴图加载总开关（先只加载模型，后续可即时补贴图） | 功能 | 已完成 |
| 3 | 把 mission `.c` 当作入口点载入 map editor，自动加载地图、spawn 位置/朝向/波次预览、可热重载 | 设计 + 功能（仅 preview） | 已完成 |
| 4 | 每个机体第三人称初始镜头由哪个文件控制 | 研究 | 已定位并有盘面证据 |

四项全部落地。第 3 项按要求**只做 preview，不做 editor**。

---

## 1. map list → 解压 fhm2d → map editor 打开文件夹

### 1.1 路径重新分析（这是整件事的关键）

原来的流程之所以别扭，是因为 map editor 只认「一个 `.fhm2d` 文件」，而 dplcache 里有
约 19000 个只有哈希名的包，人根本无从下手。真正的索引链条在 `stage_list.bin` 里，
但它有两个完全不同的哈希，之前没有被区分：

| 字段 | 偏移 | 实际含义 |
|---|---|---|
| `entryId` | id 表 | **地图哈希**。mission 脚本 `sys_0(0x40e, …)` 传的就是它，关卡列表卡片上的 ID |
| `recordLookupId` | `0x00` | 另一套很小的查找键（ミンスリー是 `0x21`，サイド7是 `0x1`），不是地图哈希 |
| `fileName` | `0x1C` | **模型资源包哈希**。几何体在 `<dplcache>\0x<fileName>.fhm2d` |

证据（2026-09-23 用 `E:\XB\mod\012list\stage_list` 重新对照 `missionMaps.ts`。早先把命中记在 `recordLookupId` 上，那个字段对不上）：

* **18/19** 个地图哈希能在 stage_list 里按 `entryId` 命中一行，且命中行的名字
  与该哈希已记录的日文名完全对应（サイド7、ミンスリー、ギアナ高地 …）。
  唯一没命中的是 `0x5EE38886`（アーモリー・ワン），这张 stage_list 里根本没有这一行。
* 命中的 18 行里，**17 行**的 `fileName` 包真实存在于 OB dplcache。唯一缺的是
  `テスト用デフォルトステージ`（自用测试关，本来就没有几何体）。
* 这 19 个哈希**没有任何一个**出现在 `recordLookupId` / `fileName` / `vs_s_d` / `vs_s_l` / `vs_sn` 里。

包的落盘目录名来自仓库已有的 `src/assets/fhm2d-name-map.generated.json`
（`stage.model` 路由 → `001stage/<name>`），所以 Side 7 会解到
`001stage\201stage201` 而不是 `001stage\0x4D1F5138`，与 workspace 其它类目
（`012list`、`041cpm`、`051mission`）的组织方式一致。

### 1.2 落地

新服务 `src/services/mapLibrary/mapLibraryService.ts`：

* `mapLibraryRootFor(extractOutputPath)` → `<解包输出路径>\001stage`
* `workspaceStageListPathFor(...)` → `<解包输出路径>\012list\stage_list\stage_list.bin`
* `mapPackFolderName(packHash)` → 研究名 / 回退到哈希名
* `buildMapLibraryRows({entries, dplCacheDir, libraryRoot})` → 一次性 `readDir`
  两个目录（dplcache 约 19k 项、库目录），再和 stage_list 行做 join，得到
  「地图名 / 地图哈希 / 资源包 / 包是否存在 / 是否已解包 / 已解包路径」
* `extractMapPack(row)` → 复用既有后端命令 `extract_stage_fhm2d_to_folder`
* `findRowByMapHash(rows, mapHash)` → 给第 3 项用

两个入口：

1. **EXVS2 Workspace → Stage List**：新增「解包地图」按钮，对当前选中的地图行直接解包到地图库，
   toast 里给出落盘路径。（对应「map list 用 index 解压」）
2. **Scene Edit → 文件 → 从地图库打开…**：新窗口 `MapLibraryDialog`，
   直接列出 stage_list 全部地图，带搜索、状态徽章（已解包 / 未解包 / 缺资源包），
   「解包并打开」一键完成解包 + 载入，已解包的直接「打开」。

`SceneEdit/page.tsx` 里把原 `handleOpenFolder` 拆成了 `loadStagePackRoot(packRoot)`，
手动选文件夹和地图库走的是**同一条**加载路径，不存在两套行为。

---

## 2. 贴图加载总开关

### 2.1 分析

Scene Edit 打开一张地图时，重的部分只有 **nutexb 解码**（`useSceneTextureLoader` 里
identity 解析 + 并发解码 + RGBA 上传）。`listStageTextureFilePaths` 只是列路径，几乎免费；
模型几何体由 `stageStreamBundles` 流式加载，本身不含贴图像素。

所以「只加载模型」不需要改加载管线，只需要给解码阶段加一个总闸门；
而且因为这个 hook 是响应式的，闸门一开，它会对**已经载入的模型**重新收集贴图路径并立即解码，
天然满足「加载完地图后再打开开关 → 立刻 decode 并 apply 到场景」。

### 2.2 落地

* `useSceneTextureLoader(..., texturesEnabled: boolean)` 新增最后一个参数。
  `false` 时清空 `textureDataMap`、清进度、清警告并直接 return；
  `texturesEnabled` 进依赖数组，所以从 `false` 翻到 `true` 会重新跑整个 effect。
* `SceneEdit/page.tsx` 新增 `texturesEnabled` state（默认开）。
* `MapToolbar` 新增贴图开关按钮（`Image` / `ImageOff` 图标 + tooltip）。
* 既有的 `useSceneTextureLoader.test.tsx` 同步补了新参数。

关闭状态下打开地图 = 纯模型；任何时刻点开 = 立即解码并贴到场景；再关 = 贴图从场景卸下，
几何体不动。

---

## 3. map editor ↔ mission MSC 链接（Preview）

完整设计文档：`docs/agent-sessions/map-editor-mission-preview/design.md`。这里只列要点。

### 3.1 入口点模型

`E:\XB\mod\051mission\000triad_battle_a001_001\000triad_battle_a001_001.c` 里，
你问的 `func_32`～`func_35` 正好就是这个「关卡蓝图」的四个角色：

| 函数 | 角色 | 内容 |
|---|---|---|
| `func_32` | **配置函数** | `sys_0(0x40e, 0xfe67f4f9)` 选地图；`global1/2` 各队 cost；`global16/17` 胜负标志；`global19` BGM；8 条 `sys_0(0x400, …)` 槽位 |
| `func_33` | 入口 | `global0 = func_34`，调用配置函数，清 `global21..24` |
| `func_34` | **开场函数** | 等开战信号 → `func_12(2)` / `func_12(3)` 投放开场敌机 → `global0 = func_35` |
| `func_35` | **阶段函数** | 扁平的 `if (global20 == N)` 链，每支 = 一波：敌机 ≤ N 时开始倒计时 → 到点投放 |

`sys_0(0x400, …)` 共 51 个参数，其中已证实含义的（`slot_param`）：
槽位 0、机体 id 2、队伍 3、CPU 搭档 5、坐标 34/35/36、登场动作 37、**朝向角度 38**、
登场帧数 39、AI 等级 20。

用 a001_001 实测：我方在 `z = -40`、朝向 `0°`，敌方在 `z = +350…+600`、朝向 `180°`，
两边正好面对面——这直接验证了「0° 看 +Z、180° 看 -Z」的约定。
坐标就是地图编辑器 placement 行用的同一套世界单位（`PlacementRow.posX/Y/Z` 直接喂 three.js），
所以不需要任何换算。注意 `y` 是**出生高度**（槽位 0 是 `y = 200`，在空中），
不是地面偏移，标记环画在出生点本身。

### 3.2 分层实现

| 层 | 文件 | 职责 |
|---|---|---|
| 解析 | `src-tauri/src/format/mission_preview.rs` | 读 `.c`（文本）或 `.mismsexc`（进程内反编译），交给既有的 `MissionScript::parse`，返回 `StageScriptConfig` + 源类型 + 配置函数名 + mtime |
| 命令 | `triad_route_commands.rs` | `load_mission_script_preview`、`mission_script_modified_ms` |
| 派生 | `src/services/missionPreview/missionPreviewService.ts` | 槽位 → spawn 标记；开场/波次 → 部署阶段；胜负标志位拆解 |
| 解析地图 | `mapLibraryService.ts` | `sys_0(0x40e)` 哈希 → stage_list 行 → 包 → 已解包目录 |
| 状态 | `SceneEdit/components/mission-preview/useMissionPreview.ts` | 载入的脚本、显示开关、热重载轮询、机体名查表 |
| 面板 | `MissionPreviewPanel.tsx` | 只读检视器：规则、阶段、槽位、显示控制 |
| 绘制 | `MissionSpawnMarkers.tsx` | three.js 覆盖层，挂在 `MapViewport` 的 Canvas 内 |

解析层刻意做薄：`MissionScript::parse` 已经存在，且 343 个出货脚本里 342 个能逐字节往返，
所以**预览读到的就是 route 编辑器写出去的东西**，没有第二套字节码解释。

### 3.3 预览能力

* **自动加载地图**：面板上「加载地图」按钮 → 用 `0x40e` 哈希查 stage_list →
  已解包直接载入；未解包则打开地图库并预先过滤到那一行，一键解包 + 打开。
* **spawn 标记**：每个槽位一个圆柱（机体本体）+ 圆锥（朝向箭头）+ 出生平面环。
  颜色：我方蓝、CPU 搭档青、敌方红；后续波次每波一个颜色。
* **阶段与判定逻辑**：
  * `initial` —— 开场函数和所有波次都没提到它 → 开局即在场（出货脚本里就是玩家 + 搭档）
  * `opening` —— 在 `openingSlots` 里，开战信号后立刻投放
  * `wave N` —— 在 `waves[N].deploySlots` 里，面板照实显示门槛
    （「剩余敌人 ≤ 1 时，延迟 1 秒」），**不**伪造成 "t = 47s" 的绝对时间轴，
    因为这个门槛是条件性的。
* **波次不可解析时**：约一半出货脚本的阶段函数用了模板外的写法（中途换 BGM、复活开关、
  帧数门），这些会报 `wavesReadable: false` 并给出空波次列表，面板打上「波次无法解析」徽章——
  明显错，而不是悄悄错。
* **热重载 / 刷新**：`mission_script_modified_ms` 只是一次 `stat`，不解析。
  开着热重载时每 1.5s 轮询一次，时间戳真的变了才重读。
  你可以在别的编辑器里改 `.c`、保存，标记立刻跟着动。重载**不碰已加载的地图**，
  一次脚本改动的代价是一次解析，不是一次关卡加载。
* **显示控制**：标记大小滑杆（2–60，默认 12）、名称标签开关、每个阶段单独显隐、
  点槽位 ↔ 视口高亮联动。
* **机体名**：从 `012list/character_list/character_list.bin` 查。读不到时面板明写
  「无法读取机体名称，改用原始 ID：<原因>」，不静默隐藏失败。

### 3.4 为什么这一期不做 editor

route 编辑器（TestEditor → Triad Route）已经拥有脚本写入权，并且是逐字节往返的。
再加一个能写同一条 51 参数调用的写入方，那 11 个没人解出含义的参数就有两个可能破坏它的地方。
所以覆盖层**只读**。将来要做编辑，扩展点是标记拖拽的 commit 回调汇入 route 编辑器既有的
`ScriptSlot` 写入器，而不是再写一个脚本写入器。

---

## 4. 机体第三人称初始镜头由什么控制

完整研究：`docs/param-research/2026-09-20-unit-third-person-camera-owner.md`。

### 4.1 结论

**`041cpm/<unit>/characterparam.bin`**，不是 `2.c`，也不是 `camera/parameters/*.vgsht2`。

镜头「在机体后面多远、多高」是 characterparam 的 **6 个 float 字段**，
按**机体**、并且按 characterparam 的**行（row）**分别存：

| 哈希 | 规范键名 | 轴 | 作用 |
|---|---|---|---|
| `0x78C70D3F` | `target_relative_camera_height_near` | Y | 水平距离 0 时的高度 |
| `0x51DD39F0` | `target_relative_camera_height_far` | Y | 水平距离 ≥130 时的高度 |
| `0x82B967A9` | `target_relative_camera_height_high_elevation` | Y | 仰角混合饱和端的高度 |
| `0xE1D56972` | `target_relative_camera_back_distance_normal_elevation` | Z（后方） | 常规仰角端的后退距离 |
| `0xBC427D55` | `target_relative_camera_back_distance_high_elevation` | Z（后方） | 高仰角端的后退距离 |
| `0x432ADAA1` | `camera_vertical_height_correction` | Y | 从垂直基线里减去的修正 |

前五个共用一个消费者 `sub_140640230`，它构造局部向量 `(0, height, -back_distance)`，
按目标相对角度旋转后加到镜头锚点上。第六个属于相邻的 `sub_14063FD80` 分支。
这两条链路的 IDA 推导仓库里早已有记录
（`2026-08-01-characterparam-target-relative-camera-curve.md`、
`…-camera-vertical-height-correction.md`），本次补的是**归属答案 + 盘面证据**。

**OB 没有逐机体的横向（X）镜头偏移。** 曾经挂着 `camera_offset_partner_x` 标签的
`0x5175F1DE` 在所有采样行里都是 `0.0`、且哈希在 OB 镜像里根本不存在，现已改名
`reserved_128`。消费者构造的局部向量 X 恒为 0，「左右」来自消费者施加的 yaw，不是参数。

### 4.2 本次新增的盘面证据

扫描了 `E:\XB\mod\041cpm` 下全部 `characterparam.bin`：**26 个机体、44 行**
（脚本：`tmp/camera-owner/camera_param_scan.py`，按 `param_bin_format.rs` 的布局读，kind 5 = f32）。

| 机体 | 行 | near 高 | far 高 | 高仰角高 | 常规后退 | 高仰角后退 |
|---|---|---|---|---|---|---|
| `016gundmw_001wgzero_001` | 默认 | 8.60 | 5.30 | 3.00 | 43.00 | 14.00 |
| `018ggundm_001godgnd_001` | 默认 | 5.40 | 4.20 | 4.00 | 42.00 | 15.00 |
| `001gundam_004zeong0_001` | 默认 | 16.00 | 9.00 | 5.00 | 63.00 | 18.00 |
| `001gundam_004zeong0_001` | `0x6C159EEB` | 14.00 | 8.00 | 5.00 | 58.00 | 18.00 |
| `002zgundm_006hambrb_001` | 默认 | 10.40 | 6.20 | 4.00 | 49.00 | 15.00 |
| `002zgundm_006hambrb_001` | `0x6C159EEB` | 16.00 | 9.00 | 4.00 | 54.00 | 15.00 |
| `058vlprgs_001overon_001` | 默认 | 11.00 | 8.00 | 20.00 | 48.00 | 30.00 |
| `654gexvs2_003glfunl_001` | 默认 | 30.00 | 25.00 | 4.00 | 420.00 | 15.00 |

两个直接结论：

1. **逐机体。** 高达 G 是 `5.40 / 42.00`，吉翁号是 `16.00 / 63.00`，巨型 boss 行是
   `30.00 / 420.00`。数值跨度跟模型体积正相关——这正是你说的「每个机体取景不一样」。
2. **逐行，不是逐文件。** 吉翁号和哈姆拉比的第二行带着不同的镜头值，而哈姆拉比的第二行就是 MA 形态。
   也就是说**镜头跟着变形走**，因为变形本身就是一次 characterparam 行切换。

`camera_vertical_height_correction` 在整个 OB 采样里都是 `0.0`。它是真实消费者（`sub_14063FD80` 已证），
但没有一台出货机体用它——是个空着的旋钮，不是可以从别的机体抄过来的值。

### 4.3 `2.c` 能做和不能做的

`2.c` 从不写镜头字段。它唯一能做的是选行：

```
sys_1(0x60008, 0x1B12AE7D)   // 默认行
sys_1(0x60008, 0xF51CCF51)   // 备用行（变形 / buff 状态）
```

OB 采样里出现的行 id：`0x1B12AE7D`（默认，26 台里 25 台有）、`0x6C159EEB`、
`0xF51CCF51`、`0x0ADC2880`。所以**开局那一帧的镜头 = 当时生效的那一行的镜头块**，
对所有出货机体来说就是默认行。

顺带一个对既有 mod 的提醒：仓库里那些为了变形而 `0x1B12AE7D ↔ 0xF51CCF51` 切行的 MSC 研究
（Sinanju、Delta Kai、Gyan）**同时也在切镜头取景**，无论当初是不是有意的。

### 4.4 明确不是答案的相邻文件

| 文件 | 真实身份 |
|---|---|
| `camera/parameters/{00system,01waza,02winlose,03cpubattle}.vgsht2` | 220 字节的**片段（clip）**表，键是 `sys_53(0x4, hash)` 查的 clip 哈希 —— 胜负、招式、cut-in 镜头，不是跟随镜头 |
| `camera/battle/big.nuanmb`、`camera_motion.nusktb` | menu / god camera 的骨架与动画，菜单路径 |
| `camera/stage_intro/stage_intro_camera_group.bin` | 362 字节，magic `89 8C 96 9C`。两组升序哈希键（18 与 19 个，与头部 `0x12` / `0x13` 计数对上），外加一张 18 项、从 `0x134` 步进 3 的 id 表。它是关卡入场的分组表，里面没有镜头几何也没有机体 id。结构是本次实测的，**id 表的含义未证**。 |
| `012list/stage_list` | 逐关行，没有任何镜头字段 |
| `051mission/*/*.c` | `sys_0(0x400, …)` 带出生位置和朝向，决定第一帧镜头**从哪儿看**，但不决定偏移量本身 |

### 4.5 置信边界

* E1（本次盘面）：6 个字段逐机体逐行存在、数值如表、`camera_vertical_height_correction`
  在整个 OB 采样里为 `0.0`。
* E2（仓库已记录的 OB IDA 会话）：getter、共用消费者 `sub_140640230`、
  混合阈值（仰角 15°…80°、水平距离 0…130）、局部向量 `(0, height, -back)`。
* 未证：选中这条镜头例程的运行时状态叫什么，以及是否有别的模式读别的块。
  键名保持 `target_relative_camera_*` 就是因为这一点。
* 未在游戏内测：本次没有改任何值再跑。想做单变量确认的话，改一台机体的
  `target_relative_camera_back_distance_normal_elevation` 是最便宜的验证。

---

## 5. 改动清单

### 后端（Rust）

| 文件 | 变更 |
|---|---|
| `src-tauri/src/format/mission_preview.rs` | 新增。按扩展名分派 `.c` / `.mismsexc`，解析成预览结构，另提供 mtime 查询 |
| `src-tauri/src/format/mod.rs` | 注册模块 |
| `src-tauri/src/triad_route_commands.rs` | 新增 `load_mission_script_preview`、`mission_script_modified_ms` |
| `src-tauri/src/lib.rs` | 注册两个命令 |
| `src-tauri/Cargo.toml` | 注册测试目标 `mission_preview_test` |
| `src-tauri/tests/mission_preview_test.rs` | 新增，4 个测试 |

### 前端（TypeScript / React）

| 文件 | 变更 |
|---|---|
| `src/services/mapLibrary/mapLibraryService.ts` | 新增。stage_list ↔ dplcache ↔ 地图库的解析与解包 |
| `src/services/mapLibrary/mapLibraryService.test.ts` | 新增，11 个测试 |
| `src/services/missionPreview/missionPreviewService.ts` | 新增。命令封装 + spawn 标记 / 阶段分组派生 |
| `src/services/missionPreview/missionPreviewService.test.ts` | 新增，8 个测试 |
| `src/page/SceneEdit/components/map-library/MapLibraryDialog.tsx` | 新增。地图库窗口 |
| `src/page/SceneEdit/components/mission-preview/useMissionPreview.ts` | 新增。预览状态 + 热重载 |
| `src/page/SceneEdit/components/mission-preview/MissionPreviewPanel.tsx` | 新增。只读检视面板 |
| `src/page/SceneEdit/components/mission-preview/MissionSpawnMarkers.tsx` | 新增。three.js 覆盖层 |
| `src/page/SceneEdit/components/MapViewport.tsx` | 新增 `missionOverlay` prop 并在 Canvas 内渲染 |
| `src/page/SceneEdit/components/MapToolbar.tsx` | 新增「从地图库打开」菜单项、贴图总开关、任务预览按钮 |
| `src/page/SceneEdit/hooks/useSceneTextureLoader.ts` | 新增 `texturesEnabled` 总闸门 |
| `src/page/SceneEdit/hooks/useSceneTextureLoader.test.tsx` | 同步新参数 |
| `src/page/SceneEdit/page.tsx` | 拆出 `loadStagePackRoot`；新增贴图开关 / 地图库 / 任务预览状态与 `handleOpenMissionMap` |
| `src/page/TestEditor/components/StageListView.tsx` | 新增「解包地图」按钮与处理函数 |
| `src/i18n/resources/{en-US,zh-CN,ja-JP}/scene-map-library.json` | 新增 |
| `src/i18n/resources/{en-US,zh-CN,ja-JP}/scene-mission-preview.json` | 新增 |
| `src/i18n/resources/{en-US,zh-CN,ja-JP}/scene-toolbar.json` | 新增 file/textures/mission 文案 |
| `src/i18n/resources/{en-US,zh-CN,ja-JP}/test-stage-list-view.json` | 新增 mapExtract 文案 |
| `src/i18n/resources/{en-US,zh-CN}/scene-page.json` | 新增 `errors.missionMapFailed` |

> `ja-JP` 没有 `scene-page.json`（该语言本来就只覆盖 55/67 个命名空间），
> 这一条走 i18next 回退，不是本次引入的缺口。

### 文档

| 文件 | 内容 |
|---|---|
| `docs/agent-sessions/map-editor-mission-preview/design.md` | 第 3 项的系统设计（索引链条、分层、槽位语义、坐标空间、阶段模型、热重载、为什么只读、已知限制） |
| `docs/param-research/2026-09-20-unit-third-person-camera-owner.md` | 第 4 项的研究结论与证据 |
| `docs/agent-sessions/map-editor-mission-preview/process-report.md` | 本文件 |

---

## 6. 验收

按要求走的是「先分析 → 再开发 → 最后小范围验收」，不是 TDD。所有长跑命令都走后台，
没有阻塞开发，也没有启动 dev server。

| 检查 | 命令 | 结果 |
|---|---|---|
| Rust 编译 | `cargo check` | 通过（只剩 binrw / proc-macro-error2 的既有 future-incompat 警告） |
| Rust 新测试 | `cargo test --test mission_preview_test` | **4 passed, 0 failed** |
| TypeScript 类型 | `./node_modules/.bin/tsc --noEmit` | 通过，0 error |
| 新服务测试 | `vitest run src/services/mapLibrary src/services/missionPreview` | **19 passed, 0 failed** |
| 贴图 hook 回归 | `vitest run --config vitest.all.config.ts .../useSceneTextureLoader.test.tsx` | **1 passed** |
| i18n 覆盖 | `node scripts/check_i18n_coverage.mjs` | **失败，9 项——全部是既有文件**（`camera-table/*`、`chrsys-action-table/*`、`triad-route/SlotTableEditor.tsx`），本次新增文件一项未命中 |

`cargo check` 第一次跑时被 RTK 的输出过滤吞掉了真实错误（filtered 输出显示 exit 0，
实际文件里有一个反斜杠被 heredoc 吃掉导致的语法错误）。后续所有 Rust 命令都改用
`rtk proxy cargo …` 拿原始输出，并已复核通过。这个坑值得记一下：
**用 heredoc 写含反斜杠的源码会丢转义**，本次因此在 `mission_preview.rs`、
`mapLibraryService.ts`、`StageListView.tsx` 三处修过被吃掉的 `\`。

### 没做的事（明确说明）

* **没有在游戏里实跑。** 本次没有打包 2.dscex，也没有生成任何 `.fhm2d`。
  第 4 项的镜头结论是静态证据（盘面 + 仓库已有的 IDA 记录），不是游戏内验证。
* **没有做 mission editor。** 按你的要求这一期只做 preview。
* **朝向角的 90° / 270° 手性没有独立确认。** 0°/180° 由出货数据（双方面对面）佐证，
  用到直角的脚本会正常画出来，但左右手性没有对着游戏核过。
* **cut-in 消息哈希（`sys_0(0x355, …)`）按哈希原样带出**，仓库里没有能把它解成文本的表。
* **覆盖层画的是标记，不是机体模型。** 按槽位加载真实机体模型要接 unit model 管线，
  是另一件事。

---

## 7. 下一步建议（不在本次范围内）

1. 把 `0x5EE38886`（アーモリー・ワン）补进 stage_list，或确认它属于另一份 stage_list——
   目前它是唯一一个查不到行的已知地图哈希。
2. 覆盖层加「按槽位加载真实机体模型」，接 unit model 的动态文件夹管线。
3. 标记拖拽 → 汇入 route 编辑器既有 `ScriptSlot` 写入器，形成真正的 mission editor。
4. 想验证第 4 项的话：改一台机体的 `target_relative_camera_back_distance_normal_elevation`，
   打包进游戏看取景是否后移——单变量，最便宜。

---

## 8. UI 重做：向 UE5 / Unity 的工具风格靠拢

第一版的 UI 能用，但风格是通用网页后台，不是引擎工具。这一轮按「先诊断再改」重做。

### 8.1 诊断：第一版的问题

最核心的一条：**项目里本来就有一套 UE/Unity 风格的 token，我没用。**
`src/page/SceneEdit/components/propertyPanelStyles.ts` 里有一组注释写着
「UE/Unity property row」的 `INSPECTOR_*`、以及 Maya 通道盒风格的 `MAYA_*`，
`MayaSection` 则是现成的可折叠 Details 分区。第一版两个面板全用了通用 shadcn
`Card` / `<dl>` / `Badge` 药丸，等于在一个 DCC 工具里插了两个网页管理后台。

其余问题：

| 位置 | 问题 |
|---|---|
| 两个面板 | 数字不是 tabular，哈希列会随数字宽度抖动 |
| 两个面板 | 只有 hover，没有按下反馈、没有 focus ring |
| MapLibraryDialog | 状态用 `Badge` 药丸；行不可选中；加载态只有一行字，列表落地时布局跳动 |
| MissionPreviewPanel | `<dl>` + 重复的 `rounded border p-2` 区块，没有分区标题、不可折叠 |
| MissionPreviewPanel | 坐标挤成一行字符串，引擎检视器应该是对齐的 X/Y/Z 字段 |
| MissionPreviewPanel | 为了拿两个颜色常量，从 `MissionSpawnMarkers.tsx` import，把 three.js + drei 拖进了面板模块 |
| MapToolbar | 新增的两个控件是 `size="sm"` 文字按钮，插在一排 `size="icon" h-6 w-6` 里，破坏了工具栏节奏 |
| MissionSpawnMarkers | 圆柱 + 圆锥 + 平环，原型级；`depthTest={false}` 让标记整体穿透一切，完全没有深度线索 |
| MissionSpawnMarkers | 没有落地投影、没有高度线 —— 而出生点普遍在空中（槽位 0 是 y=200），看不出高度 |
| MissionSpawnMarkers | 没有朝向扇形、没有选中描边；标签是实色圆角块 + 通用 shadow |
| MissionSpawnMarkers | 配色是高饱和原色（`#3b82f6` / `#ef4444`），在视口里发飘 |

### 8.2 改动（before → after）

| 原则 | Before | After |
|---|---|---|
| 复用既有设计系统 | 通用 `Card` / `<dl>` / `Badge` | `MayaSection` 折叠分区 + `INSPECTOR_PROP_ROW` 标签值行 + `MAYA_TRANSFORM_GRID` 坐标表 |
| 表格风格 | `bg-muted/80 backdrop-blur` 网页表头 + 药丸状态 | 资产浏览器：sticky 表头、单击选中行、双击打开、状态用 2px 圆点 + 小字 |
| 等宽数字 | 比例字体，哈希列抖动 | 工具窗根节点加 `[font-variant-numeric:tabular-nums]`，哈希/坐标列 `font-mono tabular-nums` |
| 过渡范围 | 只有 `transition-colors` | 显式列出 `transition-[background-color,color,box-shadow,transform]`，全仓无 `transition: all` / `will-change: all` |
| 按下反馈 | 无 | `active:translate-y-px`（工具栏与工具按钮） |
| 焦点可见 | 自定义 `<button>` 无 focus ring | `focus-visible:ring-1 focus-visible:ring-ring/60` |
| 加载态 | 一行「正在读取…」 | 10 行骨架占位，列表落地时不跳版 |
| 空态 | 一行灰字 | 图标 + 说明 + 直接可点的「打开脚本」 |
| 状态栏 | 无 | 底部状态条：脚本路径 / 槽位数；地图库显示「显示 N / 共 M」与已解包数 |
| 工具栏节奏 | `size="sm"` 文字按钮 | `size="icon" h-6 w-6` + Tooltip + `aria-pressed`，任务按钮激活时底部一条 1px 指示线 |
| 模块边界 | 面板 import 标记组件（带进 three + drei） | 新增 `missionPreviewTheme.ts` 纯 TS 模块存放配色与 `missionPhaseKey` |
| 命中区域 | 清除筛选按钮 16px | 20px（保持 12px 图标）；其余沿用项目 24px 密度 |
| 文字排版 | 默认换行 | 说明性文案加 `[text-wrap:pretty]` |
| 字体渲染 | 无 | `src/App.css` base 层加 `-webkit-font-smoothing: antialiased` |

### 8.3 three.js 标记：改成引擎里那套 gizmo

每个槽位现在由五层构成，而不是三个原型几何体：

1. **落地投影** —— 正下方（`y = 0`）的实心淡盘 + 描边环，回答「这台机体落在地图哪儿」。
2. **高度虚线** —— 从落地点到出生点的虚线。出生点普遍在空中，这条线是唯一能读出高度的东西。
   用 drei 的 `<Line>` 而不是裸 `<line> + lineDashedMaterial`——后者不调
   `computeLineDistances()` 会渲染成实线，而且拿不到线宽。
3. **朝向扇形** —— 出生平面上沿 +Z 张开的楔形（±≈25.7°），比一个圆锥箭头更像引擎的视锥提示。
4. **本体胶囊** —— **保留深度测试**，所以它真的"坐"在地图里，有遮挡关系。
5. **轮廓** —— 略大的 `BackSide` 胶囊，`depthTest={false}` 常驻最上层且很淡，
   被挡住的槽位仍然找得到，但不会像第一版那样整个标记穿模发光。

选中状态：所有描边换成统一的琥珀色强调色 `#F0A63C`（刻意不属于任何一方），
不透明度整体提高，本体 emissive 提升。

标签从实色块改成深色半透明板 + 1px 同色描边 + 色块 + 等宽字，
并去掉了 `distanceFactor` —— 原本远处标签会缩到看不见，引擎里标签是恒定尺寸的。

配色整体降饱和，从原色改为：我方 `#4C8FD6`、CPU 搭档 `#54B3BD`、敌方 `#CF5A52`，
后续波次一条暖色渐变（`#D4883F / #C2A02C / #9A6DBD / #BD5F86 / #3F9B8A`）。

### 8.4 这轮没做的

- **没有换字体。** skill 建议换 Geist / Satoshi 之类，但这是个桌面 DCC 工具，
  换全局字体会影响所有既有面板，超出「小步可审查」的范围。要换的话应该单独一轮。
- **没有改主题 token。** Tailwind v4 的 `@theme inline` 与 `.dark` 调色板是全局契约，
  只在 base 层加了字体平滑这一条。
- **没有把命中区域放大到 40px。** 项目既有密度是 24px 一格的工具条，
  统一放大会破坏整个 Scene Editor 的布局。只修了明显过小的那个 16px 清除按钮。
- **没有在游戏/应用里实跑截图确认。** 验收仍然是静态门禁。

### 8.5 本轮验收

`tsc --noEmit` 通过 0 error；`vitest` 新服务测试 19 passed（配色/工具函数迁移到
`missionPreviewTheme.ts` 后，`missionPreviewService` 的测试不受影响）。

---

## 9. 修复：地图库读取的是错误的配置项

### 9.1 现象

用户报告：Stage List 里明明已经加载了
`E:\XB\mod\012list\stage_list\stage_list.bin`（120 个关卡、17 条命令），
但地图库窗口报 `Error: Extract output path is not configured`。

### 9.2 根因（我的错）

我把地图库接在了 `extractOutputPath` 上。真实配置
（`%APPDATA%\com.kjjkjjzyayufqza.exvsmod\settings.json`）里：

```
testEditorFolder   = "E:\XB\mod"     ← EXVS2 Workspace 实际用的根目录
extractOutputPath  = ""              ← 我接的这个，是空的
```

而且第 1 轮我读的是 `%APPDATA%\com.tauri.app.extract\settings.json`——
那是**另一个 app identifier** 的陈旧文件，里面 `extractOutputPath` 恰好有值，
所以我误以为这个键是对的。正确做法应该是去看 StageListView 怎么解析路径，而不是
去猜哪个配置键像是对的。

第二个缺陷：我把 stage_list 的相对路径写死成 `012list/stage_list/stage_list.bin`。
StageListView 其实是走 `resolveWorkspaceContent(folderPath, workspaceDocument, "stage-list")`，
路径可以被工作区文档重映射，写死就绕过了这个机制。

### 9.3 修复

新增 `resolveMapWorkspace(workspaceRoot)`，与 Stage List 走同一套解析：

| 解析项 | 方式 |
|---|---|
| 工作区根 | 配置键 `testEditorFolder` |
| `stageListPath` | `resolveWorkspaceContent(root, doc, "stage-list")`，优先 `existing`，否则 `configured` |
| `libraryRoot` | `resolveWorkspaceRouteRoot(root, doc, "stage.model")`（默认 `001stage`，可被重映射） |

三个调用点同步改掉：

* `MapLibraryDialog` —— 改读 `testEditorFolder`
* `SceneEdit/page.tsx` 的 `handleOpenMissionMap` —— 同上
* `StageListView` 的「解包地图」—— 它本来就持有工作区根 `folderPath`，直接传进去，
  并删掉了多余的 `extractOutputPath` 读取

删除了 `mapLibraryRootFor` / `workspaceStageListPathFor` 两个按错误配置项构造路径的导出。
错误文案也改了：原来写「请设置解包输出路径」，现在写「请在 EXVS2 Workspace 打开工作区文件夹」。

### 9.4 验收

* 新增 3 个回归测试（`resolveMapWorkspace`），其中一个直接注释了这次的根因，
  另一个验证被重映射的工作区路由也能正确解析。
* `vitest run src/services/mapLibrary src/services/missionPreview` → **19 passed**
* `tsc --noEmit` → 0 error

仍未做：没有在应用里实跑确认弹窗现在能出列表——这一条要你打开 Scene Edit →
文件 → 从地图库打开 才能确认。

---

## 10. 朝向翻转 + 第二处同类配置 bug

### 10.1 朝向画反了

用户反馈：坐标没问题，但朝向是反的。

算了一下几何就确认了：朝向楔形在自己的 XY 平面里以 `+PI/2`（= 形状 +Y）为中心，
然后用 `rotation={[-PI/2, 0, 0]}` 放倒到地面。绕 X 轴 -90° 的映射是
`+Y → -Z`，所以 yaw 0 时楔形实际指向 **-Z**，而不是我注释里写的 +Z。

结果就是：我方（z = -40，yaw 0）指向 -Z、背对敌人；敌方（z = +350，yaw 180）
指向 +Z、背对我方。两边互相背对——正是用户看到的现象。

**修复**：把弧心改到形状 `-PI/2`，放倒后指向 +Z。

**防回归**：新增 `missionFacingForward(facingDegrees)` 把约定固化成可测函数
（0 → +Z、90 → +X、180 → -Z、270 → -X），并写了一条直接用 a001_001 真实数据的断言——
我方前向的 Z 分量符号必须指向敌方所在的一侧，反之亦然。约定现在只写在这一个地方，
标记组件的注释指向它。

### 10.2 机体名也接了错误的配置项

同一轮用户还报了「无法读取机体名称，改用原始 ID：Extract output path is not configured」。

这是第 9 节那个 bug 的**第二处**：`useMissionPreview` 里读 character_list 同样接了
`extractOutputPath`，而且同样写死了 `012list\character_list\character_list.bin`。
第 9 节我只修了地图库，漏了这里。

Config 页面的说明文字其实早就写清楚了：

> Extract output path —— *Optional secondary* extract root used by
> Character ID table > Extract to Output Folder. **Extract to Workspace uses the
> EXVS2 Workspace root instead.**

也就是说这个键被明确定义为「可选的次要路径」，我却拿它当核心依赖。

**修复**：新增 `src/services/testEditorWorkspace/resolveFromRoot.ts`，
把「只知道工作区文件夹 → 解析工作区内容路径」这件事收敛成一个入口：

* `requireWorkspaceRoot(root)` —— 空路径直接报「EXVS2 Workspace folder is not open」
* `loadWorkspaceDocumentFor(root)` —— 载入工作区文档
* `resolveWorkspaceContentFilePath(root, contentId)` —— 解析任一 catalog 内容文件
* `resolveWorkspaceRouteRootFor(root, routeId)` —— 解析任一 asset route 根目录

`mapLibraryService.resolveMapWorkspace` 和 `useMissionPreview` 的机体名查表都改走这里。
工作区外的代码以后想拿工作区里的文件，就用这个入口，不要再自己拼
`<root>/012list/<name>/<name>.bin`。

全仓扫过一遍：我新增的代码里已无 `extractOutputPath` 引用，也无写死的工作区相对路径。
`UnitModelEdit` 里剩下的两处 `extractOutputPath` 是既有代码，且符合该键「次要解包根」的定义，未动。

### 10.3 验收

* `tsc --noEmit` → 0 error
* `vitest run --config vitest.all.config.ts`（mission-preview + mapLibrary + missionPreview）
  → **27 passed / 3 files**，其中新增 `missionPreviewTheme.test.ts` 覆盖朝向约定与配色分配
* 仍未做：没有在应用里实跑。地图库能否出列表、机体名能否显示、朝向是否已正，
  需要你打开 Scene Edit 实际确认。
