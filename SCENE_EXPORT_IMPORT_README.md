# 场景导出/导入功能说明

## 功能概述

这个功能允许您将当前Three.js场景中的所有对象、模型、贴图和数据导出为JSON文件，并且可以从JSON文件导入场景状态。

## 主要特性

### 导出功能
- **完整场景状态保存**：包括所有模型的变换属性（位置、旋转、缩放）
- **模型文件路径保存**：保存完整的模型文件路径，方便重新加载
- **贴图设置保存**：保存贴图路径和设置
- **VDK配置保存**：保存VDK配置数据和对象信息
- **元数据保存**：包括场景名称、时间戳、版本信息

### 导入功能
- **完整场景恢复**：从JSON文件恢复所有场景状态
- **自动贴图重载**：尝试自动重新加载贴图文件
- **VDK配置恢复**：恢复VDK配置和对象信息
- **历史记录重置**：导入后重置撤销/重做历史

## 导出的JSON格式

```json
{
  "name": "场景名称",
  "timestamp": "2025-09-23T13:34:00.000Z",
  "version": "1.0.0",
  "data": [
    {
      "id": "模型ID",
      "name": "模型名称",
      "type": "dae", // 或 "box"
      "index": 0,
      "position": [x, y, z],
      "rotation": [x, y, z],
      "scale": [x, y, z],
      "isLocked": false,
      "modelFilePath": "完整文件路径",
      "subModels": [
        {
          "id": "子模型ID",
          "name": "子模型名称",
          "geometryIndex": 0,
          "position": [x, y, z],
          "rotation": [x, y, z],
          "scale": [x, y, z],
          "texturePath": "贴图文件路径"
        }
      ]
    }
  ],
  "vdkConfigs": [...],
  "vdkObjectInfos": {...}
}
```

## 使用方法

### 导出场景

1. 在场景编辑页面右侧找到"场景导出/导入"面板
2. 在"场景名称"输入框中输入场景名称（可选）
3. 点击"导出场景"按钮
4. 选择保存位置和文件名
5. 场景将被保存为JSON文件

### 导入场景

1. 在场景编辑页面右侧找到"场景导出/导入"面板
2. 点击"导入场景"按钮
3. 选择要导入的JSON文件
4. 场景将被完全替换为导入的内容

## 注意事项

### 文件路径处理
- **绝对路径**：导出时保存完整的文件路径
- **Blob URL处理**：使用临时文件的模型会被标记为`[BLOB_URL]`，导入后需要重新加载
- **贴图重载**：导入时会尝试自动重新加载贴图，如果路径无效会显示警告

### 兼容性
- **版本控制**：JSON文件包含版本信息，确保兼容性
- **数据验证**：导入时会验证数据格式的完整性
- **错误处理**：提供详细的错误信息和警告

### 性能考虑
- **大场景处理**：大型场景可能需要较长的导出/导入时间
- **内存使用**：导入时会清除当前场景，释放内存
- **文件大小**：JSON文件大小取决于场景复杂度

## 技术实现

### 核心文件
- `src/utils/sceneExporter.ts` - 导出/导入核心逻辑
- `src/page/SceneEdit/components/SceneExportPanel.tsx` - UI组件
- `src/store/sceneStore.ts` - 状态管理集成

### 主要函数
- `exportSceneToFile()` - 导出场景到文件
- `importSceneFromFile()` - 从文件导入场景
- `convertSceneStateToExportData()` - 场景状态转换
- `convertExportDataToSceneState()` - 导入数据转换

### 数据流
1. **导出**：SceneStore → ExportData → JSON文件
2. **导入**：JSON文件 → ExportData → SceneStore

## 示例用法

### 基本导出
```typescript
const { exportScene } = useSceneStore();
await exportScene("我的场景");
```

### 基本导入
```typescript
const { importScene } = useSceneStore();
await importScene();
```

### 程序化使用
```typescript
import { exportSceneToFile, importSceneFromFile } from '../utils/sceneExporter';

// 导出
await exportSceneToFile(sceneState, "场景名称");

// 导入
const result = await importSceneFromFile();
if (result) {
  // 处理导入的数据
  console.log('导入成功:', result.sceneName);
}
```

## 故障排除

### 常见问题

1. **导出失败**
   - 检查文件写入权限
   - 确保场景中有模型数据
   - 查看控制台错误信息

2. **导入失败**
   - 验证JSON文件格式
   - 检查文件路径是否存在
   - 确保文件未被占用

3. **贴图丢失**
   - 检查贴图文件路径
   - 确保贴图文件存在
   - 手动重新设置贴图

4. **模型无法加载**
   - 验证模型文件路径
   - 检查文件格式支持
   - 重新加载模型文件

### 调试信息
- 所有操作都会在控制台输出详细日志
- 错误信息会显示在UI界面上
- 可以通过浏览器开发者工具查看详细错误

## 更新日志

### v1.0.0 (2025-09-23)
- 初始版本发布
- 支持完整场景导出/导入
- 支持VDK配置保存
- 支持贴图设置保存
- 提供用户友好的UI界面
