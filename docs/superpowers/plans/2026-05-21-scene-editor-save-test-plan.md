# Scene Editor Save 功能黑箱测试计划

> **测试目标:** 验证Scene Editor的完整保存流程，包括FHM2D解包、贴图迁移、DAE导入转换、场景编辑操作和FHM2D重新打包的正确性

**文档版本:** 1.0  
**创建日期:** 2026-05-21  
**测试类型:** 黑箱集成测试  
**测试范围:** Scene Editor Save as Folder + Save as FHM2D 完整流程

---

## 1. 测试概述

### 1.1 测试目标

本测试计划旨在验证Scene Editor保存功能的以下核心能力：

1. **FHM2D解包**: 正确解包地图FHM2D文件到文件夹结构
2. **贴图迁移**: 将旧格式贴图（model/0/, model/1/）迁移到共享textures/文件夹
3. **DAE导入转换**: 导入DAE模型并转换为SSBH（numatb/numshb/nusktb/numdlb）+ HKT格式
4. **场景编辑**: 支持新增、删除、移动、变换（位置xyz、旋转rotate、缩放scale）对象
5. **保存到文件夹**: 正确写入placement.csv、graphic_param.csv、structure JSON和模型文件
6. **保存到FHM2D**: 将文件夹打包为FHM2D格式
7. **格式验证**: 重新解包FHM2D并验证格式正确性

### 1.2 测试数据

| 数据类型 | 路径 | 说明 |
|---------|------|------|
| 测试地图FHM2D | `E:\XB\解包\com\test\16F73C97.fhm2d` | Stage 001 (5.8 MB, 小型地图, 主要测试目标) |
| 测试地图FHM2D | `E:\XB\解包\com\test\84F085E5.fhm2D` | Stage 100 (17 MB, 菜单场景, 最简单) |
| 测试地图FHM2D | `E:\XB\解包\com\test\35516817.fhm2d` | Stage 018 (195 MB, 森林场景, 22个对象, 包含EFFECT) |
| 测试地图FHM2D | `E:\XB\解包\com\test\BBC60B47.fhm2d` | Stage 211 (191 MB, 大型地图) |
| DAE模型 | `D:\output\exvs2\zabanya\` | Zabanya机体DAE文件，用于导入转换测试 |
| Structure JSON | `E:\XB\解包\com\test\0x16F73C97_structure.json` | Stage 001结构文件 |

**注意**: 所有测试地图均使用旧格式贴图（numbered subdirs），适合测试贴图迁移功能。

### 1.3 测试环境

| 组件 | 要求 |
|------|------|
| 操作系统 | Windows 10/11 |
| Tauri应用 | Scene Editor (开发版本) |
| Node.js工具 | compression.js (位于 `E:\XB\解包\com\compression.js`) |
| 测试工具 | Tauri MCP Server (用于自动化测试) |
| 磁盘空间 | 至少5GB可用空间（用于备份和临时文件） |

### 1.4 测试前提条件

- [ ] Scene Editor应用已构建并可运行
- [ ] compression.js工具可用且路径正确
- [ ] 测试数据完整且未损坏
- [ ] 有足够磁盘空间用于备份和临时文件
- [ ] 已安装Tauri MCP Server（用于自动化测试）

---

## 2. 测试环境准备

### 2.1 备份策略

每个测试用例执行前必须备份测试数据，测试后恢复：

```bash
# 备份命令示例
xcopy /E /I /Y "E:\XB\解包\com\test\16F73C97" "E:\XB\解包\com\test\16F73C97_backup"

# 恢复命令示例
rmdir /S /Q "E:\XB\解包\com\test\16F73C97"
xcopy /E /I /Y "E:\XB\解包\com\test\16F73C97_backup" "E:\XB\解包\com\test\16F73C97"
```

### 2.2 测试工作区设置

创建独立的测试工作区，避免污染原始数据：

```
E:\XB\解包\com\test_workspace\
├── original\          # 原始备份（只读）
├── working\           # 工作目录（测试执行）
└── output\            # 输出目录（保存的FHM2D）
```

### 2.3 工具验证

验证所有依赖工具可用：

```bash
# 验证compression.js
node "E:\XB\解包\com\compression.js" --help

# 验证Tauri应用可启动
# 手动启动Scene Editor并检查UI加载正常
```

---

## 3. 测试用例

### 测试套件 1: FHM2D解包和贴图迁移

**测试目标**: 验证FHM2D正确解包，并能检测和迁移旧格式贴图到共享textures/文件夹

#### TC-1.1: FHM2D基础解包

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-1.1 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97.fhm2d` (Stage 001, 5.8 MB) |
| **前置条件** | FHM2D文件完整，compression.js可用 |

**测试步骤**:
1. 使用compression.js解包FHM2D到工作目录
   ```bash
   node compression.js 0x16F73C97_structure.json -x -com-path "E:\XB\解包\com\test"
   ```
2. 验证解包后的文件夹结构

**预期结果**:
- 解包成功，无错误信息
- 生成文件夹: `16F73C97/0/0/`
- 包含子文件夹: `base/`, `sky/`, `info/`, 多个对象文件夹（如`001stage001_object_box01/`）
- `info/`包含: `placement.csv`, `graphic_param.csv`, `plan_param.spbin`
- 对象文件夹包含: `0/`子文件夹（SSBH文件）, `map_hit.hkt`
- 对象的`0/`子文件夹包含: `0/`, `1/`贴图子文件夹（旧格式）

**验证方法**:
```bash
# 检查关键文件存在
dir "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
dir "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box01\0\0\*.nutexb"
```

---

#### TC-1.2: 旧格式贴图检测

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-1.2 |
| **优先级** | P0 (关键) |
| **测试数据** | 解包后的`16F73C97/0/0/` |
| **前置条件** | TC-1.1通过 |

**测试步骤**:
1. 打开Scene Editor
2. 加载stage文件夹: `E:\XB\解包\com\test\16F73C97\0\0`
3. 观察控制台日志或UI提示

**预期结果**:
- Scene Editor成功加载stage
- 检测到旧格式贴图（numbered subdirs: `0/`, `1/`）
- 日志显示: "Detected old texture format in model folders"
- 场景正确渲染，所有模型显示贴图

**验证方法**:
- 检查控制台日志
- 截图验证场景渲染正确
- 使用Tauri MCP的`webview_dom_snapshot`检查是否有错误提示

---

#### TC-1.3: 贴图迁移到共享textures/文件夹

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-1.3 |
| **优先级** | P0 (关键) |
| **测试数据** | 解包后的`16F73C97/0/0/` |
| **前置条件** | TC-1.2通过 |

**测试步骤**:
1. 在Scene Editor中，不做任何编辑
2. 点击"Save as Folder"按钮
3. 观察保存进度对话框
4. 等待保存完成

**预期结果**:
- 保存进度对话框显示步骤: "Migrating textures..."
- 保存成功完成
- 在stage根目录创建`textures/`文件夹
- 所有`.nutexb`文件移动到`textures/`
- 模型文件夹的`0/0/`, `0/1/`等贴图子文件夹被删除
- `base/`和`sky/`的贴图也迁移到`textures/`

**验证方法**:
```bash
# 检查textures/文件夹存在且包含.nutexb文件
dir "E:\XB\解包\com\test\16F73C97\0\0\textures\*.nutexb"

# 检查旧的numbered subdirs已删除
dir "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box01\0\0" 
# 应该不存在或为空

# 统计贴图数量
powershell -Command "(Get-ChildItem -Path 'E:\XB\解包\com\test\16F73C97\0\0\textures' -Filter *.nutexb).Count"
```

---

#### TC-1.4: 贴图去重

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-1.4 |
| **优先级** | P1 (重要) |
| **测试数据** | 解包后的`16F73C97/0/0/` |
| **前置条件** | TC-1.2通过 |

**测试步骤**:
1. 手动复制一个贴图文件，创建重复（相同文件名和内容）
   ```bash
   copy "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box01\0\0\texture_diffuse.nutexb" ^
        "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box02\0\0\texture_diffuse.nutexb"
   ```
2. 在Scene Editor中加载stage
3. 点击"Save as Folder"
4. 检查保存后的`textures/`文件夹

**预期结果**:
- 相同内容的重复贴图只保留一份
- 日志显示去重信息: "Deduplicated N textures"
- `textures/`文件夹中只有一个`texture_diffuse.nutexb`

**验证方法**:
```bash
# 检查textures/中没有重复文件
dir "E:\XB\解包\com\test\16F73C97\0\0\textures\texture_diffuse*.nutexb"
# 应该只有一个文件
```

---

#### TC-1.5: 贴图冲突处理（相同文件名，不同内容）

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-1.5 |
| **优先级** | P1 (重要) |
| **测试数据** | 解包后的`16F73C97/0/0/` |
| **前置条件** | TC-1.2通过 |

**测试步骤**:
1. 手动创建一个同名但内容不同的贴图文件
   ```bash
   # 复制一个不同的贴图并重命名为相同名称
   copy "E:\XB\解包\com\test\16F73C97\0\0\base\001stage001_base\0\0\base_normal.nutexb" ^
        "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box01\0\0\base_normal.nutexb"
   ```
2. 在Scene Editor中加载stage
3. 点击"Save as Folder"
4. 检查保存后的`textures/`文件夹和日志

**预期结果**:
- 冲突的贴图文件被重命名，添加后缀: `base_normal_1.nutexb`
- 日志显示冲突警告: "Texture conflict: base_normal.nutexb, renamed to base_normal_1.nutexb"
- `textures/`文件夹包含两个文件: `base_normal.nutexb`, `base_normal_1.nutexb`
- 引用该贴图的numatb文件被更新，指向正确的文件名

**验证方法**:
```bash
# 检查两个文件都存在
dir "E:\XB\解包\com\test\16F73C97\0\0\textures\base_normal.nutexb"
dir "E:\XB\解包\com\test\16F73C97\0\0\textures\base_normal_1.nutexb"

# 检查文件内容不同
fc /b "E:\XB\解包\com\test\16F73C97\0\0\textures\base_normal.nutexb" ^
      "E:\XB\解包\com\test\16F73C97\0\0\textures\base_normal_1.nutexb"
```

---


### 测试套件 2: DAE导入和SSBH+HKT转换

**测试目标**: 验证DAE模型正确导入并转换为SSBH格式（numatb/numshb/nusktb/numdlb）和HKT碰撞文件

#### TC-2.1: DAE模型导入

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-2.1 |
| **优先级** | P0 (关键) |
| **测试数据** | `D:\output\exvs2\zabanya\` (Zabanya DAE模型) |
| **前置条件** | Stage已加载（使用`84F085E5`最简单场景） |

**测试步骤**:
1. 在Scene Editor中加载stage: `E:\XB\解包\com\test\84F085E5\0\0`
2. 点击"Import DAE"按钮
3. 选择DAE文件: `D:\output\exvs2\zabanya\zabanya.dae`
4. 在导入配置对话框中设置参数:
   - Model name: `zabanya_test`
   - Position: (0, 0, 0)
   - Rotation: (0, 0, 0)
   - Scale: (1, 1, 1)
5. 点击"Import"

**预期结果**:
- DAE模型成功导入到场景
- 在viewport中显示模型（可能无贴图，因为还未转换）
- 在Outliner中显示新对象: `zabanya_test`
- 对象标记为"imported"状态（黄色未保存指示器出现）
- 未保存指示器（黄点）出现在"Save as Folder"按钮上

**验证方法**:
- 截图验证viewport显示模型
- 使用Tauri MCP的`webview_dom_snapshot`检查Outliner包含`zabanya_test`节点
- 检查DOM中"Save as Folder"按钮有`animate-ping`类

---

#### TC-2.2: SSBH文件转换

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-2.2 |
| **优先级** | P0 (关键) |
| **测试数据** | TC-2.1导入的DAE模型 |
| **前置条件** | TC-2.1通过 |

**测试步骤**:
1. 继续TC-2.1的场景状态
2. 点击"Save as Folder"按钮
3. 观察保存进度对话框，等待"Converting new objects"步骤完成
4. 保存完成后，检查文件系统

**预期结果**:
- 保存进度显示: "Converting new objects (1/1)..."
- 转换成功，无错误
- 在stage文件夹创建新的模型文件夹: `zabanya_test/`
- 模型文件夹结构:
  ```
  zabanya_test/
  ├── 0/
  │   ├── model.numatb    # 材质文件
  │   ├── model.numshb    # Mesh文件
  │   ├── model.nusktb    # 骨骼文件
  │   ├── model.numdlb    # 模型数据文件
  │   └── jnttbl          # 关节表
  └── map_hit.hkt         # 碰撞文件
  ```
- 所有SSBH文件大小 > 0
- HKT文件存在且大小 > 0

**验证方法**:
```bash
# 检查模型文件夹存在
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test"

# 检查SSBH文件
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\0\*.numatb"
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\0\*.numshb"
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\0\*.nusktb"
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\0\*.numdlb"

# 检查HKT文件
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\map_hit.hkt"
```

---

#### TC-2.3: 贴图转换和引用

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-2.3 |
| **优先级** | P1 (重要) |
| **测试数据** | TC-2.1导入的DAE模型（带PNG贴图） |
| **前置条件** | TC-2.2通过 |

**测试步骤**:
1. 在DAE导入配置对话框中，为材质槽分配PNG贴图
   - Diffuse: `D:\output\exvs2\zabanya\textures\zabanya_diffuse.png`
   - Normal: `D:\output\exvs2\zabanya\textures\zabanya_normal.png`
   - 选择DDS格式: BC7_UNORM (diffuse), BC5_UNORM (normal)
2. 导入并保存
3. 检查`textures/`文件夹和numatb文件

**预期结果**:
- PNG贴图转换为`.nutexb`格式
- `.nutexb`文件保存到`textures/`文件夹:
  - `zabanya_diffuse.nutexb`
  - `zabanya_normal.nutexb`
- `numatb`文件正确引用贴图路径（相对路径指向`textures/`）
- 场景重新加载后，模型正确显示贴图

**验证方法**:
```bash
# 检查nutexb文件
dir "E:\XB\解包\com\test\84F085E5\0\0\textures\zabanya_*.nutexb"

# 使用十六进制编辑器检查numatb文件，验证贴图路径引用
# 或使用SSBH解析工具检查numatb内容
```

---

#### TC-2.4: HKT碰撞文件生成

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-2.4 |
| **优先级** | P2 (一般) |
| **测试数据** | TC-2.1导入的DAE模型 |
| **前置条件** | TC-2.2通过 |

**测试步骤**:
1. 检查生成的`map_hit.hkt`文件
2. 使用HKT查看工具（如果有）验证碰撞网格

**预期结果**:
- `map_hit.hkt`文件存在
- 文件大小合理（通常几KB到几百KB）
- HKT文件格式正确（可以被游戏引擎加载）

**验证方法**:
```bash
# 检查文件大小
dir "E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\map_hit.hkt"

# 检查文件头（HKT magic bytes）
powershell -Command "Get-Content 'E:\XB\解包\com\test\84F085E5\0\0\zabanya_test\map_hit.hkt' -Encoding Byte -TotalCount 16"
```

---

#### TC-2.5: 多个DAE模型导入

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-2.5 |
| **优先级** | P1 (重要) |
| **测试数据** | 多个DAE文件 |
| **前置条件** | TC-2.2通过 |

**测试步骤**:
1. 在同一场景中导入3个不同的DAE模型
2. 设置不同的位置和名称
3. 保存场景

**预期结果**:
- 所有3个模型都成功转换
- 保存进度显示: "Converting new objects (3/3)..."
- 创建3个独立的模型文件夹
- 每个文件夹包含完整的SSBH文件和HKT
- placement.csv包含3个新的OBJECT条目

**验证方法**:
```bash
# 检查3个模型文件夹都存在
dir "E:\XB\解包\com\test\84F085E5\0\0" | findstr /C:"zabanya"

# 检查placement.csv包含3个新条目
findstr /C:"VDK_TYPE,OBJECT" "E:\XB\解包\com\test\84F085E5\0\0\info\placement.csv"
```

---


### 测试套件 3: 场景编辑操作

**测试目标**: 验证场景编辑操作（新增、删除、移动、变换）正确标记dirty状态并能正确保存

#### TC-3.1: 对象位置变换 (Position XYZ)

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.1 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97/0/0/` (Stage 001) |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 在Scene Editor中加载stage
2. 在Outliner中选择对象: `001stage001_object_box01`
3. 在Property Editor中修改位置:
   - Position X: 100.0 → 250.0
   - Position Y: 50.0 → 75.0
   - Position Z: 0.0 → 10.0
4. 观察未保存指示器
5. 点击"Save as Folder"
6. 重新加载stage

**预期结果**:
- 修改位置后，viewport中对象移动到新位置
- 未保存指示器（黄点）出现在"Save as Folder"按钮上
- 保存成功
- `placement.csv`中对应条目的`VDK_POSITION_X/Y/Z`更新为新值
- 重新加载后，对象在新位置显示

**验证方法**:
```bash
# 检查placement.csv中的位置值
findstr /C:"001stage001_object_box01" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
# 应该包含: VDK_POSITION_X,250.0,VDK_POSITION_Y,75.0,VDK_POSITION_Z,10.0
```

---

#### TC-3.2: 对象旋转变换 (Rotation XYZ)

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.2 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 选择对象: `001stage001_object_box01`
2. 在Property Editor中修改旋转:
   - Rotation X: 0.0 → 45.0
   - Rotation Y: 0.0 → 90.0
   - Rotation Z: 0.0 → 180.0
3. 保存并重新加载

**预期结果**:
- viewport中对象旋转
- 未保存指示器出现
- `placement.csv`中`VDK_ROTATION_X/Y/Z`更新
- 重新加载后旋转保持

**验证方法**:
```bash
findstr /C:"VDK_ROTATION" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
```

---

#### TC-3.3: 对象缩放变换 (Scale XYZ)

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.3 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 选择对象: `001stage001_object_box01`
2. 在Property Editor中修改缩放:
   - Scale X: 1.0 → 2.0
   - Scale Y: 1.0 → 1.5
   - Scale Z: 1.0 → 0.5
3. 保存并重新加载

**预期结果**:
- viewport中对象缩放
- 未保存指示器出现
- `placement.csv`中`VDK_SCALE_X/Y/Z`更新
- 重新加载后缩放保持

**验证方法**:
```bash
findstr /C:"VDK_SCALE" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
```

---

#### TC-3.4: 对象删除

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.4 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载，至少有2个对象 |

**测试步骤**:
1. 在Outliner中选择对象: `001stage001_object_box01`
2. 按Delete键或点击删除按钮
3. 观察对象从viewport和Outliner消失
4. 点击"Save as Folder"
5. 观察删除确认对话框
6. 在对话框中查看要删除的文件列表
7. 点击"Confirm Delete"
8. 等待保存完成
9. 检查文件系统

**预期结果**:
- 对象从场景中移除
- 未保存指示器出现
- 保存时弹出删除确认对话框，显示:
  - 文件夹名: `001stage001_object_box01`
  - 文件列表: 所有SSBH文件和HKT
  - 总文件数和大小
- 确认后，文件夹被删除
- `placement.csv`中对应条目被移除
- 其他对象的`VDK_OBJECTNUMBER`重新索引（如果需要）

**验证方法**:
```bash
# 检查文件夹不存在
dir "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box01"
# 应该报错: 找不到文件

# 检查placement.csv不包含该对象
findstr /C:"001stage001_object_box01" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
# 应该无结果

# 检查其他对象的objectNumber是否连续
findstr /C:"VDK_OBJECTNUMBER" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
```

---

#### TC-3.5: 删除操作取消

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.5 |
| **优先级** | P1 (重要) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 删除一个对象
2. 点击"Save as Folder"
3. 在删除确认对话框中点击"Cancel"
4. 检查文件系统

**预期结果**:
- 保存操作被中止
- 文件夹未被删除
- `placement.csv`未修改
- 未保存指示器仍然存在（因为场景中对象已删除，但未保存到磁盘）

**验证方法**:
```bash
# 检查文件夹仍然存在
dir "E:\XB\解包\com\test\16F73C97\0\0\001stage001_object_box01"
```

---

#### TC-3.6: 对象复制

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.6 |
| **优先级** | P1 (重要) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 选择对象: `001stage001_object_box01`
2. 按Ctrl+D或点击复制按钮
3. 新对象出现在场景中（稍微偏移位置）
4. 保存场景
5. 检查文件系统

**预期结果**:
- 新对象出现在Outliner: `001stage001_object_box01_copy` (或类似名称)
- 未保存指示器出现
- 保存后，创建新的模型文件夹（复制原文件夹内容）
- `placement.csv`增加新条目
- 新对象的`VDK_OBJECTNUMBER`正确分配

**验证方法**:
```bash
# 检查新文件夹存在
dir "E:\XB\解包\com\test\16F73C97\0\0" | findstr /C:"box01"

# 检查placement.csv包含新条目
findstr /C:"VDK_TYPE,OBJECT" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv" | find /C ","
# 条目数应该增加1
```

---

#### TC-3.7: 多个对象同时变换

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.7 |
| **优先级** | P1 (重要) |
| **测试数据** | `35516817/0/0/` (Stage 018, 22个对象) |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 在Outliner中多选3个对象（Ctrl+点击）
2. 在Property Editor中修改位置: Position Y += 50.0
3. 保存场景
4. 重新加载并验证

**预期结果**:
- 所有3个对象同时移动
- 未保存指示器出现
- `placement.csv`中3个对象的`VDK_POSITION_Y`都增加50.0
- 重新加载后位置正确

**验证方法**:
```bash
# 检查3个对象的Position Y值
findstr /C:"VDK_POSITION_Y" "E:\XB\解包\com\test\35516817\0\0\info\placement.csv"
```

---

#### TC-3.8: Graphic Param修改

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-3.8 |
| **优先级** | P1 (重要) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 在Scene Editor中打开Graphic Param面板
2. 修改参数:
   - `directional_lighting_rot_x`: -45 → -60
   - `fog_density`: 0.5 → 0.8
3. 保存场景
4. 检查`graphic_param.csv`

**预期结果**:
- 未保存指示器出现
- 保存成功
- `graphic_param.csv`中对应参数值更新

**验证方法**:
```bash
# 检查graphic_param.csv
findstr /C:"directional_lighting_rot_x" "E:\XB\解包\com\test\16F73C97\0\0\info\graphic_param.csv"
findstr /C:"fog_density" "E:\XB\解包\com\test\16F73C97\0\0\info\graphic_param.csv"
```

---


### 测试套件 4: Save as Folder完整流程

**测试目标**: 验证Save as Folder功能正确写入所有文件并更新structure JSON

#### TC-4.1: 基础Save as Folder

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-4.1 |
| **优先级** | P0 (关键) |
| **测试数据** | `84F085E5/0/0/` (最简单场景) |
| **前置条件** | Stage已加载，做了一些编辑 |

**测试步骤**:
1. 加载stage
2. 修改一个对象的位置
3. 修改一个graphic param
4. 点击"Save as Folder"按钮
5. 观察保存进度对话框
6. 等待保存完成

**预期结果**:
- 保存进度对话框显示所有步骤:
  1. Checking for deletions... ✓
  2. Migrating textures... ✓
  3. Converting new objects (0/0)... ✓ (跳过)
  4. Writing materials... ✓
  5. Writing textures... ✓
  6. Writing HKT files... ✓
  7. Writing CSV files... ✓
  8. Rebuilding structure JSON... ✓
- 所有步骤显示"done"状态（绿色勾）
- 保存完成后显示"Save Complete"
- 未保存指示器消失
- 文件系统中文件已更新（时间戳改变）

**验证方法**:
```bash
# 检查文件时间戳
dir "E:\XB\解包\com\test\84F085E5\0\0\info\placement.csv"
dir "E:\XB\解包\com\test\84F085E5\0\0\info\graphic_param.csv"
dir "E:\XB\解包\com\test\84F085E5\0\0\0x84F085E5_structure.json"
```

---

#### TC-4.2: Structure JSON重建

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-4.2 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | TC-1.3通过（贴图已迁移） |

**测试步骤**:
1. 加载已迁移贴图的stage
2. 不做任何编辑，直接保存
3. 检查structure JSON文件

**预期结果**:
- Structure JSON被重建
- 所有文件路径正确
- 贴图路径指向`textures/`文件夹（不是旧的numbered subdirs）
- JSON格式正确，可以被compression.js解析

**验证方法**:
```bash
# 检查structure JSON包含textures/路径
findstr /C:"textures/" "E:\XB\解包\com\test\16F73C97\0\0\0x16F73C97_structure.json"

# 验证JSON格式
powershell -Command "Get-Content 'E:\XB\解包\com\test\16F73C97\0\0\0x16F73C97_structure.json' | ConvertFrom-Json"
```

---

#### TC-4.3: EFFECT条目保留

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-4.3 |
| **优先级** | P1 (重要) |
| **测试数据** | `35516817/0/0/` (包含EFFECT条目) |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 加载stage
2. 备份原始`placement.csv`
3. 修改一个OBJECT的位置
4. 保存场景
5. 对比保存前后的`placement.csv`

**预期结果**:
- EFFECT条目完全保留，字节级一致
- OBJECT条目正确更新
- SKY条目保留
- 条目顺序保持（EFFECT通常在最后）

**验证方法**:
```bash
# 提取EFFECT条目对比
findstr /C:"VDK_TYPE,EFFECT" "E:\XB\解包\com\test\35516817\0\0\info\placement.csv" > effect_after.txt
findstr /C:"VDK_TYPE,EFFECT" "E:\XB\解包\com\test\35516817_backup\0\0\info\placement.csv" > effect_before.txt
fc effect_before.txt effect_after.txt
# 应该完全相同
```

---

#### TC-4.4: ObjectNumber重新索引

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-4.4 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载，至少有3个对象 |

**测试步骤**:
1. 加载stage
2. 记录当前对象的objectNumber（从placement.csv）
3. 删除中间的一个对象（例如objectNumber=1）
4. 保存场景（确认删除）
5. 检查保存后的placement.csv

**预期结果**:
- 删除对象后，后续对象的`VDK_OBJECTNUMBER`递减1
- 例如: 原来是0,1,2,3 → 删除1后 → 0,1,2 (原来的2变成1，3变成2)
- objectNumber连续，无间隙
- SKY的objectNumber不受影响（通常是-1或特殊值）

**验证方法**:
```bash
# 检查objectNumber连续性
findstr /C:"VDK_OBJECTNUMBER" "E:\XB\解包\com\test\16F73C97\0\0\info\placement.csv"
# 应该是: 0, 1, 2, ... (连续)
```

---

### 测试套件 5: Save as FHM2D完整流程

**测试目标**: 验证Save as FHM2D功能正确打包文件夹为FHM2D格式

#### TC-5.1: 基础Save as FHM2D

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-5.1 |
| **优先级** | P0 (关键) |
| **测试数据** | `84F085E5/0/0/` |
| **前置条件** | Stage已加载，做了一些编辑 |

**测试步骤**:
1. 加载stage
2. 修改一个对象的位置
3. 点击"Save as FHM2D"按钮
4. 在文件保存对话框中选择输出路径: `E:\XB\解包\com\test_workspace\output\84F085E5_modified.fhm2d`
5. 观察保存进度对话框
6. 等待保存完成

**预期结果**:
- 文件保存对话框出现，默认文件名为`84F085E5.fhm2d`
- 保存进度对话框显示所有步骤（包括"Packing FHM2D..."）
- 所有步骤成功完成
- 输出文件创建: `84F085E5_modified.fhm2d`
- 文件大小合理（接近原始FHM2D大小）
- 未保存指示器消失

**验证方法**:
```bash
# 检查输出文件存在
dir "E:\XB\解包\com\test_workspace\output\84F085E5_modified.fhm2d"

# 检查文件大小
powershell -Command "(Get-Item 'E:\XB\解包\com\test_workspace\output\84F085E5_modified.fhm2d').Length / 1MB"
# 应该接近17 MB
```

---

#### TC-5.2: FHM2D打包进度显示

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-5.2 |
| **优先级** | P1 (重要) |
| **测试数据** | `16F73C97/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 导入一个新的DAE模型
2. 点击"Save as FHM2D"
3. 选择输出路径
4. 仔细观察保存进度对话框的每个步骤

**预期结果**:
- 保存进度显示9个步骤（比Save as Folder多一个"Packing FHM2D"）
- 步骤按顺序执行:
  1. Checking for deletions...
  2. Migrating textures...
  3. Converting new objects (1/1)...
  4. Writing materials...
  5. Writing textures...
  6. Writing HKT files...
  7. Writing CSV files...
  8. Rebuilding structure JSON...
  9. Packing FHM2D... ← 新增步骤
- 每个步骤显示正确的状态图标（pending → running → done）

**验证方法**:
- 截图保存进度对话框
- 使用Tauri MCP的`webview_screenshot`捕获UI状态

---

#### TC-5.3: FHM2D文件完整性

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-5.3 |
| **优先级** | P0 (关键) |
| **测试数据** | TC-5.1生成的FHM2D文件 |
| **前置条件** | TC-5.1通过 |

**测试步骤**:
1. 使用compression.js解包生成的FHM2D
   ```bash
   node compression.js 0x84F085E5_structure.json -x -com-path "E:\XB\解包\com\test_workspace\output"
   ```
2. 检查解包后的文件结构

**预期结果**:
- 解包成功，无错误
- 文件结构完整，包含所有必要文件夹和文件
- 文件内容正确（可以与原始文件对比）

**验证方法**:
```bash
# 检查解包后的文件夹
dir "E:\XB\解包\com\test_workspace\output\84F085E5\0\0"

# 对比关键文件
fc /b "E:\XB\解包\com\test\84F085E5\0\0\info\placement.csv" ^
      "E:\XB\解包\com\test_workspace\output\84F085E5\0\0\info\placement.csv"
```

---

#### TC-5.4: 大型场景FHM2D打包

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-5.4 |
| **优先级** | P1 (重要) |
| **测试数据** | `35516817/0/0/` (195 MB, 22个对象) |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 加载大型场景
2. 做一些小修改（移动一个对象）
3. 点击"Save as FHM2D"
4. 选择输出路径
5. 等待打包完成（可能需要几分钟）

**预期结果**:
- 打包过程不崩溃
- 进度对话框正确显示进度
- 输出FHM2D文件大小接近原始文件（~195 MB）
- 打包完成后可以成功解包

**验证方法**:
```bash
# 检查文件大小
powershell -Command "(Get-Item 'E:\XB\解包\com\test_workspace\output\35516817_modified.fhm2d').Length / 1MB"
# 应该接近195 MB

# 解包验证
node compression.js 0x35516817_structure.json -x -com-path "E:\XB\解包\com\test_workspace\output"
```

---

#### TC-5.5: 用户取消保存对话框

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-5.5 |
| **优先级** | P2 (一般) |
| **测试数据** | `84F085E5/0/0/` |
| **前置条件** | Stage已加载，有未保存修改 |

**测试步骤**:
1. 点击"Save as FHM2D"
2. 在文件保存对话框中点击"Cancel"

**预期结果**:
- 保存操作被取消
- 未保存指示器仍然存在
- 没有文件被修改或创建
- 场景状态不变

**验证方法**:
- 检查未保存指示器仍然显示
- 检查输出目录没有新文件

---


### 测试套件 6: FHM2D重新解包验证

**测试目标**: 验证保存的FHM2D文件可以正确解包并重新加载到Scene Editor

#### TC-6.1: 重新解包基础验证

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-6.1 |
| **优先级** | P0 (关键) |
| **测试数据** | TC-5.1生成的`84F085E5_modified.fhm2d` |
| **前置条件** | TC-5.1通过 |

**测试步骤**:
1. 使用compression.js解包生成的FHM2D
   ```bash
   cd E:\XB\解包\com\test_workspace\output
   node E:\XB\解包\com\compression.js 0x84F085E5_structure.json -x -com-path .
   ```
2. 在Scene Editor中加载解包后的文件夹
3. 检查场景显示

**预期结果**:
- 解包成功，无错误
- Scene Editor成功加载stage
- 所有对象正确显示
- 修改的位置保持正确
- 贴图正确加载和显示

**验证方法**:
- 截图对比修改前后的场景
- 检查placement.csv中的位置值
- 使用Tauri MCP验证DOM状态

---

#### TC-6.2: 贴图路径验证

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-6.2 |
| **优先级** | P0 (关键) |
| **测试数据** | TC-5.1生成并重新解包的stage |
| **前置条件** | TC-6.1通过 |

**测试步骤**:
1. 检查解包后的文件夹结构
2. 验证贴图位置
3. 检查numatb文件中的贴图引用

**预期结果**:
- `textures/`文件夹存在于stage根目录
- 所有`.nutexb`文件在`textures/`中
- 模型文件夹（如`001stage001_object_box01/0/`）不包含贴图文件
- numatb文件正确引用`textures/`中的贴图

**验证方法**:
```bash
# 检查textures/文件夹
dir "E:\XB\解包\com\test_workspace\output\84F085E5\0\0\textures\*.nutexb"

# 检查模型文件夹没有贴图
dir "E:\XB\解包\com\test_workspace\output\84F085E5\0\0\*\0\*.nutexb"
# 应该无结果或只在textures/中
```

---

#### TC-6.3: CSV文件内容验证

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-6.3 |
| **优先级** | P0 (关键) |
| **测试数据** | TC-5.1生成并重新解包的stage |
| **前置条件** | TC-6.1通过 |

**测试步骤**:
1. 对比原始和重新解包的`placement.csv`
2. 对比原始和重新解包的`graphic_param.csv`
3. 验证修改的值正确保存

**预期结果**:
- `placement.csv`格式正确，可以解析
- 修改的对象位置值正确
- `graphic_param.csv`格式正确
- 修改的参数值正确
- 未修改的条目保持不变

**验证方法**:
```bash
# 解析placement.csv
powershell -Command "Import-Csv 'E:\XB\解包\com\test_workspace\output\84F085E5\0\0\info\placement.csv' -Delimiter ','"

# 对比特定值
findstr /C:"VDK_POSITION" "E:\XB\解包\com\test_workspace\output\84F085E5\0\0\info\placement.csv"
```

---

#### TC-6.4: Structure JSON验证

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-6.4 |
| **优先级** | P1 (重要) |
| **测试数据** | TC-5.1生成并重新解包的stage |
| **前置条件** | TC-6.1通过 |

**测试步骤**:
1. 检查解包后的structure JSON文件
2. 验证JSON格式和内容

**预期结果**:
- Structure JSON文件存在
- JSON格式正确，可以解析
- 所有文件路径正确
- 文件列表完整（包含所有SSBH、HKT、CSV、贴图文件）

**验证方法**:
```bash
# 验证JSON格式
powershell -Command "Get-Content 'E:\XB\解包\com\test_workspace\output\84F085E5\0\0\0x84F085E5_structure.json' | ConvertFrom-Json | ConvertTo-Json"

# 检查文件路径
findstr /C:"textures/" "E:\XB\解包\com\test_workspace\output\84F085E5\0\0\0x84F085E5_structure.json"
```

---

#### TC-6.5: 完整往返测试 (Round-trip)

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-6.5 |
| **优先级** | P0 (关键) |
| **测试数据** | `16F73C97.fhm2d` |
| **前置条件** | 所有前置测试通过 |

**测试步骤**:
1. 解包原始FHM2D → 文件夹A
2. 在Scene Editor中加载文件夹A
3. 做以下修改:
   - 移动一个对象
   - 旋转一个对象
   - 修改一个graphic param
   - 导入一个新的DAE模型
   - 删除一个对象
4. Save as FHM2D → FHM2D_B
5. 解包FHM2D_B → 文件夹B
6. 在Scene Editor中加载文件夹B
7. 验证所有修改都正确保存和加载

**预期结果**:
- 所有修改在文件夹B中正确反映
- 场景在Scene Editor中正确显示
- 可以继续编辑和保存
- 再次Save as FHM2D → FHM2D_C，文件大小和内容稳定

**验证方法**:
- 截图对比场景状态
- 对比placement.csv和graphic_param.csv
- 检查新导入的模型文件夹存在
- 检查删除的对象文件夹不存在
- 对比FHM2D_B和FHM2D_C的大小（应该接近）

---

#### TC-6.6: 多次保存稳定性

| 项目 | 内容 |
|------|------|
| **测试ID** | TC-6.6 |
| **优先级** | P1 (重要) |
| **测试数据** | `84F085E5/0/0/` |
| **前置条件** | Stage已加载 |

**测试步骤**:
1. 加载stage
2. 做一个小修改（移动对象）
3. Save as Folder
4. 再做一个小修改（旋转对象）
5. Save as Folder
6. 重复步骤4-5共5次
7. 最后Save as FHM2D
8. 解包并验证

**预期结果**:
- 每次保存都成功
- 文件系统状态稳定，无累积错误
- 最终FHM2D文件正确包含所有修改
- 文件大小合理，无异常增长

**验证方法**:
```bash
# 检查文件大小趋势
dir "E:\XB\解包\com\test_workspace\output\*.fhm2d"
# 大小应该稳定，无异常增长
```

---

## 4. 测试执行流程

### 4.1 测试执行顺序

建议按以下顺序执行测试套件，确保依赖关系正确:

1. **测试套件 1** (FHM2D解包和贴图迁移) - 基础功能
2. **测试套件 2** (DAE导入和转换) - 导入功能
3. **测试套件 3** (场景编辑操作) - 编辑功能
4. **测试套件 4** (Save as Folder) - 保存到文件夹
5. **测试套件 5** (Save as FHM2D) - 保存到FHM2D
6. **测试套件 6** (重新解包验证) - 完整性验证

### 4.2 测试前准备清单

每个测试套件执行前:

- [ ] 备份测试数据到`test_workspace/original/`
- [ ] 清空工作目录`test_workspace/working/`
- [ ] 清空输出目录`test_workspace/output/`
- [ ] 验证compression.js可用
- [ ] 验证Scene Editor可启动
- [ ] 记录测试开始时间

### 4.3 测试后清理

每个测试用例执行后:

- [ ] 截图保存测试结果
- [ ] 记录测试日志
- [ ] 恢复测试数据（从backup）
- [ ] 清理临时文件
- [ ] 记录测试结束时间和结果

### 4.4 自动化测试脚本

可以使用以下PowerShell脚本自动化部分测试流程:

```powershell
# 测试准备脚本
$testRoot = "E:\XB\解包\com\test_workspace"
$originalData = "E:\XB\解包\com\test"

# 创建工作区
New-Item -ItemType Directory -Force -Path "$testRoot\original"
New-Item -ItemType Directory -Force -Path "$testRoot\working"
New-Item -ItemType Directory -Force -Path "$testRoot\output"

# 备份测试数据
Copy-Item -Path "$originalData\16F73C97" -Destination "$testRoot\original\" -Recurse -Force
Copy-Item -Path "$originalData\84F085E5" -Destination "$testRoot\original\" -Recurse -Force

# 复制到工作目录
Copy-Item -Path "$testRoot\original\16F73C97" -Destination "$testRoot\working\" -Recurse -Force

Write-Host "Test environment prepared successfully"
```

---

## 5. 验证标准

### 5.1 文件完整性验证

| 验证项 | 方法 | 通过标准 |
|--------|------|----------|
| FHM2D文件大小 | 对比原始和生成的文件大小 | 差异 < 5% |
| 文件夹结构 | 递归对比目录树 | 结构一致 |
| CSV格式 | 解析CSV文件 | 无解析错误 |
| JSON格式 | 解析JSON文件 | 无解析错误 |
| 贴图文件数量 | 统计.nutexb文件 | 数量匹配 |
| SSBH文件完整性 | 检查文件存在和大小 > 0 | 所有文件存在 |

### 5.2 功能正确性验证

| 验证项 | 方法 | 通过标准 |
|--------|------|----------|
| 对象位置 | 对比placement.csv中的坐标 | 值匹配 |
| 对象旋转 | 对比placement.csv中的旋转 | 值匹配 |
| 对象缩放 | 对比placement.csv中的缩放 | 值匹配 |
| Graphic参数 | 对比graphic_param.csv | 值匹配 |
| 对象删除 | 检查文件夹不存在 | 文件夹已删除 |
| 对象新增 | 检查文件夹存在 | 文件夹已创建 |
| 贴图迁移 | 检查textures/文件夹 | 贴图在共享文件夹 |

### 5.3 性能验证

| 验证项 | 方法 | 通过标准 |
|--------|------|----------|
| 保存时间 | 计时保存操作 | 小场景 < 10秒, 大场景 < 60秒 |
| 解包时间 | 计时compression.js | 小场景 < 5秒, 大场景 < 30秒 |
| 内存使用 | 监控进程内存 | < 2GB |
| 磁盘空间 | 检查临时文件清理 | 无残留临时文件 |

### 5.4 UI/UX验证

| 验证项 | 方法 | 通过标准 |
|--------|------|----------|
| 未保存指示器 | 检查DOM类 | 修改后出现，保存后消失 |
| 保存进度对话框 | 截图验证 | 所有步骤显示正确 |
| 删除确认对话框 | 截图验证 | 显示文件列表和大小 |
| 错误提示 | 触发错误场景 | 显示清晰的错误信息 |

---

## 6. 已知限制和注意事项

### 6.1 已知限制

1. **贴图格式**: 当前只支持PNG转DDS，不支持其他格式（如TGA、BMP）
2. **HKT生成**: HKT碰撞文件自动生成，可能不适合所有模型，需要手动调整
3. **大文件性能**: 超大场景（>500MB）的保存和打包可能较慢
4. **并发限制**: 不支持同时打开多个stage进行编辑

### 6.2 测试注意事项

1. **备份重要**: 每次测试前必须备份数据，避免数据丢失
2. **磁盘空间**: 确保有足够磁盘空间（至少5GB）
3. **工具版本**: 确保compression.js版本与测试数据兼容
4. **路径长度**: Windows路径长度限制（260字符），避免过深的目录结构
5. **文件权限**: 确保测试目录有读写权限

### 6.3 故障排查

| 问题 | 可能原因 | 解决方法 |
|------|----------|----------|
| 解包失败 | structure JSON损坏 | 使用备份的structure JSON |
| 保存失败 | 磁盘空间不足 | 清理磁盘空间 |
| 贴图丢失 | 路径引用错误 | 检查numatb文件中的路径 |
| FHM2D打包失败 | compression.js错误 | 检查compression.js日志 |
| Scene Editor崩溃 | 内存不足 | 关闭其他应用，增加可用内存 |

---

## 7. 测试报告模板

### 7.1 测试执行记录

| 测试ID | 测试名称 | 执行日期 | 执行人 | 结果 | 备注 |
|--------|----------|----------|--------|------|------|
| TC-1.1 | FHM2D基础解包 | | | ☐ Pass ☐ Fail | |
| TC-1.2 | 旧格式贴图检测 | | | ☐ Pass ☐ Fail | |
| TC-1.3 | 贴图迁移 | | | ☐ Pass ☐ Fail | |
| ... | ... | | | | |

### 7.2 缺陷报告模板

```
缺陷ID: BUG-XXX
测试用例: TC-X.X
严重程度: ☐ Critical ☐ High ☐ Medium ☐ Low
复现步骤:
1. ...
2. ...
预期结果: ...
实际结果: ...
截图/日志: ...
环境信息: ...
```

### 7.3 测试总结

```
测试周期: YYYY-MM-DD ~ YYYY-MM-DD
测试范围: Scene Editor Save功能
测试用例总数: XX
通过: XX
失败: XX
阻塞: XX
通过率: XX%

主要发现:
1. ...
2. ...

风险评估:
1. ...
2. ...

建议:
1. ...
2. ...
```

---

## 8. 附录

### 8.1 测试数据详细信息

| Stage ID | FHM2D文件 | 大小 | 对象数 | 特点 | 推荐用途 |
|----------|-----------|------|--------|------|----------|
| 84F085E5 | 84F085E5.fhm2d | 17 MB | 2 | 最简单，菜单场景 | 快速冒烟测试 |
| 16F73C97 | 16F73C97.fhm2d | 5.8 MB | 5+ | 小型地图，旧格式贴图 | 主要测试目标 |
| 35516817 | 35516817.fhm2d | 195 MB | 22 | 森林场景，包含EFFECT | EFFECT保留测试 |
| BBC60B47 | BBC60B47.fhm2d | 191 MB | 多个 | 大型地图 | 性能测试 |

### 8.2 工具和命令参考

**compression.js解包命令**:
```bash
node compression.js <structure_json> -x -com-path <base_path>
```

**compression.js打包命令**:
```bash
node compression.js <structure_json> -r -com-path <base_path> -o <output_fhm2d>
```

**PowerShell文件对比**:
```powershell
Compare-Object (Get-Content file1.txt) (Get-Content file2.txt)
```

**检查文件时间戳**:
```powershell
Get-Item <file_path> | Select-Object LastWriteTime
```

### 8.3 参考文档

- Scene Editor Save实现计划: `docs/superpowers/plans/2026-05-21-scene-editor-save.md`
- AGENTS.md: 项目架构和开发规范
- FHM2D格式规范: (如果有)
- SSBH格式规范: (如果有)

---

**文档结束**
