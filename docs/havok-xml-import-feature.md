# Havok 2018 HKT XML Import Feature - Development Documentation

## 概述

此功能旨在將Havok 2018版本的HKT XML物理碰撞模型數據導入到React Three.js場景中。我們不實現完整的Havok物理功能，而是專注於提取網格頂點數據並在Three.js中渲染為網格模型。

## 項目架構分析

### 現有代碼結構

基於現有代碼分析，項目採用以下架構：
- **場景管理**: `src/store/sceneStore.ts` - 使用Zustand管理場景狀態
- **文件加載**: `src/utils/vdkParser.ts` - 現有的文件解析工具參考
- **模型組件**: `src/page/SceneEdit/components/DAEModel.tsx` - 現有的模型加載和渲染組件
- **場景編輯**: `src/page/SceneEdit/page.tsx` - 主要的場景編輯界面

### 模型狀態結構

```typescript
interface ModelState {
    id: string;
    name: string;
    type: ModelType; // 'box' | 'dae' | 'havok' (新增)
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    isLocked: boolean;
    filePath?: string;
    subModels?: SubModelState[];
}
```

## Havok XML 文件結構分析

### XML 數據結構

基於33.xml文件分析，Havok XML包含以下關鍵結構：

#### 1. Sections 數據
```xml
<field name="sections">
    <array count="1" elementtypeid="type386">
        <record>
            <field name="nodes">
                <array count="199" elementtypeid="type400">
                    <record>
                        <field name="xyz">
                            <array count="3" elementtypeid="type135">
                                <integer value="0"/>
                                <integer value="0"/>  
                                <integer value="0"/>
                            </array>
                        </field>
                        <field name="data"><integer value="91"/></field>
                    </record>
                </array>
            </field>
        </record>
    </array>
</field>
```

#### 2. Primitives 數據
```xml
<field name="primitives">
    <array count="100" elementtypeid="type388">
        <record>
            <field name="indices">
                <array count="4" elementtypeid="type135">
                    <integer value="83"/>
                    <integer value="84"/>
                    <integer value="87"/>
                    <integer value="81"/>
                </array>
            </field>
        </record>
    </array>
</field>
```

### 關鍵數據特徵

1. **Sections**: 包含空間分割節點，每個節點有xyz坐標和data字段
2. **Primitives**: 包含索引數組，定義四邊形面片（每組4個索引）
3. **數據類型**: 主要使用`hkUint8`（0-255範圍的整數）
4. **索引引用**: primitives中的indices引用sections中的節點

## 功能設計

### 1. XML 解析器 (`src/utils/havokXmlParser.ts`)

```typescript
// Havok XML數據接口
interface HavokNode {
    xyz: [number, number, number];
    data: number;
}

interface HavokPrimitive {
    indices: number[]; // 4個索引構成一個四邊形
}

interface HavokMeshData {
    nodes: HavokNode[];
    primitives: HavokPrimitive[];
    metadata: {
        numPrimitiveKeys: number;
        bitsPerKey: number;
        maxKeyValue: number;
    };
}

// 核心解析函數
export function parseHavokXML(xmlContent: string): HavokMeshData;
export function extractSections(xmlDoc: Document): HavokNode[];
export function extractPrimitives(xmlDoc: Document): HavokPrimitive[];
```

#### 解析策略

1. **硬編碼搜索**: 直接查找`<field name="sections">`和`<field name="primitives">`標籤
2. **DOM解析**: 使用DOMParser解析XML結構
3. **數據提取**: 遍歷數組元素提取xyz坐標和indices數據
4. **數據驗證**: 檢查數據完整性和格式正確性

#### 實現細節

```typescript
export function parseHavokXML(xmlContent: string): HavokMeshData {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // 檢查解析錯誤
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing failed: ' + parserError.textContent);
    }
    
    const nodes = extractSections(xmlDoc);
    const primitives = extractPrimitives(xmlDoc);
    const metadata = extractMetadata(xmlDoc);
    
    return {
        nodes,
        primitives,
        metadata
    };
}

function extractSections(xmlDoc: Document): HavokNode[] {
    const sectionsField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'sections');
    
    if (!sectionsField) {
        throw new Error('Sections field not found in XML');
    }
    
    const nodes: HavokNode[] = [];
    const nodeRecords = sectionsField.querySelectorAll('record');
    
    nodeRecords.forEach(record => {
        const xyzField = record.querySelector('field[name="xyz"]');
        const dataField = record.querySelector('field[name="data"]');
        
        if (xyzField && dataField) {
            const xyzValues = Array.from(xyzField.querySelectorAll('integer'))
                .map(int => parseInt(int.getAttribute('value') || '0'));
            const dataValue = parseInt(dataField.querySelector('integer')?.getAttribute('value') || '0');
            
            if (xyzValues.length === 3) {
                nodes.push({
                    xyz: [xyzValues[0], xyzValues[1], xyzValues[2]],
                    data: dataValue
                });
            }
        }
    });
    
    return nodes;
}

function extractPrimitives(xmlDoc: Document): HavokPrimitive[] {
    const primitivesField = Array.from(xmlDoc.querySelectorAll('field'))
        .find(field => field.getAttribute('name') === 'primitives');
    
    if (!primitivesField) {
        throw new Error('Primitives field not found in XML');
    }
    
    const primitives: HavokPrimitive[] = [];
    const primitiveRecords = primitivesField.querySelectorAll('record');
    
    primitiveRecords.forEach(record => {
        const indicesField = record.querySelector('field[name="indices"]');
        
        if (indicesField) {
            const indices = Array.from(indicesField.querySelectorAll('integer'))
                .map(int => parseInt(int.getAttribute('value') || '0'));
            
            primitives.push({ indices });
        }
    });
    
    return primitives;
}
```

### 2. 網格生成器 (`src/utils/havokMeshGenerator.ts`)

```typescript
import * as THREE from 'three';
import { HavokMeshData } from './havokXmlParser';

// 將Havok數據轉換為Three.js幾何體
export function generateHavokMesh(havokData: HavokMeshData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    // 提取頂點位置
    const vertices: number[] = [];
    const indices: number[] = [];
    
    // 將Havok節點轉換為頂點
    havokData.nodes.forEach(node => {
        // 將0-255範圍的整數轉換為世界坐標
        // 可能需要根據實際場景調整縮放因子
        const scale = 0.1; // 調整此值以匹配場景比例
        vertices.push(
            node.xyz[0] * scale,
            node.xyz[1] * scale,
            node.xyz[2] * scale
        );
    });
    
    // 處理四邊形面片，轉換為三角形
    havokData.primitives.forEach(primitive => {
        if (primitive.indices.length === 4) {
            // 將四邊形分解為兩個三角形
            const [i0, i1, i2, i3] = primitive.indices;
            
            // 第一個三角形: i0, i1, i2
            indices.push(i0, i1, i2);
            
            // 第二個三角形: i0, i2, i3
            indices.push(i0, i2, i3);
        }
    });
    
    // 設置幾何體屬性
    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    
    // 計算法線
    geometry.computeVertexNormals();
    
    return geometry;
}

// 創建網格材質
export function createHavokMaterial(): THREE.Material {
    return new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        wireframe: true,
        transparent: true,
        opacity: 0.7
    });
}

// 創建完整的網格對象
export function createHavokMeshObject(havokData: HavokMeshData): THREE.Mesh {
    const geometry = generateHavokMesh(havokData);
    const material = createHavokMaterial();
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'HavokCollisionMesh';
    
    return mesh;
}
```

### 3. React Three.js 組件 (`src/page/SceneEdit/components/HavokModel.tsx`)

```typescript
import { useRef, useEffect, useState, memo } from 'react';
import { TransformControls } from '@react-three/drei';
import { ModelState } from '../../../store/sceneStore';
import { BoundingBoxGrid } from './BoundingBoxGrid';
import { SelectionManager } from '../utils/SelectionManager';
import { parseHavokXML } from '../../../utils/havokXmlParser';
import { createHavokMeshObject } from '../../../utils/havokMeshGenerator';
import * as THREE from 'three';

interface HavokModelProps {
    modelState: ModelState;
    mode: 'translate' | 'rotate' | 'scale';
    onTransform: (modelState: ModelState) => void;
    selectionManager?: SelectionManager;
}

function HavokModelInner({ modelState, mode, onTransform, selectionManager }: HavokModelProps) {
    const meshRef = useRef<THREE.Group>(null);
    const [havokMesh, setHavokMesh] = useState<THREE.Mesh | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // 加載Havok XML文件
    useEffect(() => {
        if (!modelState.filePath) return;
        
        const loadHavokFile = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                // 讀取XML文件內容
                const response = await fetch(modelState.filePath!);
                const xmlContent = await response.text();
                
                // 解析Havok數據
                const havokData = parseHavokXML(xmlContent);
                
                // 生成Three.js網格
                const mesh = createHavokMeshObject(havokData);
                setHavokMesh(mesh);
                
            } catch (err) {
                console.error('Failed to load Havok file:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };
        
        loadHavokFile();
    }, [modelState.filePath]);
    
    // 更新網格位置、旋轉和縮放
    useEffect(() => {
        if (havokMesh && meshRef.current) {
            meshRef.current.clear();
            meshRef.current.add(havokMesh);
            
            meshRef.current.position.set(...modelState.position);
            meshRef.current.rotation.set(...modelState.rotation);
            meshRef.current.scale.set(...modelState.scale);
        }
    }, [havokMesh, modelState.position, modelState.rotation, modelState.scale]);
    
    // 處理點擊選擇
    const handleClick = (e: any) => {
        e.stopPropagation();
        if (selectionManager) {
            selectionManager.selectModel(modelState.id);
        }
    };
    
    // 處理變換變更
    const handleObjectChange = () => {
        if (!meshRef.current) return;
        
        const updatedModelState: ModelState = {
            ...modelState,
            position: [
                meshRef.current.position.x,
                meshRef.current.position.y,
                meshRef.current.position.z
            ],
            rotation: [
                meshRef.current.rotation.x,
                meshRef.current.rotation.y,
                meshRef.current.rotation.z
            ],
            scale: [
                meshRef.current.scale.x,
                meshRef.current.scale.y,
                meshRef.current.scale.z
            ]
        };
        
        onTransform(updatedModelState);
    };
    
    const isSelected = selectionManager?.getSelectedModelId() === modelState.id;
    
    if (isLoading) {
        return (
            <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="gray" opacity={0.5} transparent />
            </mesh>
        );
    }
    
    if (error) {
        return (
            <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="red" opacity={0.5} transparent />
            </mesh>
        );
    }
    
    return (
        <>
            <group ref={meshRef} onClick={handleClick} />
            
            {isSelected && meshRef.current && !modelState.isLocked && (
                <>
                    <BoundingBoxGrid
                        target={meshRef.current}
                        visible={true}
                        color="#ff00ff"
                    />
                    <TransformControls
                        object={meshRef.current}
                        mode={mode}
                        showX
                        showY
                        showZ
                        size={1}
                        space="world"
                        onObjectChange={handleObjectChange}
                    />
                </>
            )}
        </>
    );
}

export const HavokModel = memo(HavokModelInner);
```

### 4. 存儲集成 (`src/store/sceneStore.ts` 更新)

```typescript
// 在ModelType中添加havok類型
export type ModelType = 'box' | 'dae' | 'havok';

// 添加loadHavokModelFromFile方法
loadHavokModelFromFile: async () => {
    try {
        set((state) => {
            state.isLoading = true;
            state.loadingError = null;
        });

        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Havok XML Files',
                extensions: ['xml', 'hkt']
            }]
        });

        if (!selected) {
            set((state) => {
                state.isLoading = false;
            });
            return;
        }

        const fileName = selected.split(/[/\\]/).pop() || 'unknown.xml';
        const baseName = fileName.replace(/\.(xml|hkt)$/, '');
        const modelId = `havok_${baseName}_${Date.now()}`;

        const havokModelState: ModelState = {
            id: modelId,
            name: baseName,
            type: 'havok',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            isLocked: false,
            filePath: selected
        };

        set((state) => {
            state.models[modelId] = havokModelState;
            state.isLoading = false;
        });

    } catch (error) {
        console.error('Failed to load Havok file:', error);
        set((state) => {
            state.isLoading = false;
            state.loadingError = `Failed to load Havok file: ${error}`;
        });
    }
}
```

### 5. UI集成

#### 更新ControlPanel添加Havok導入按鈕

```typescript
// src/page/SceneEdit/components/ControlPanel.tsx
<button
    onClick={onLoadHavokModel}
    className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
>
    Import Havok XML
</button>
```

#### 更新主場景頁面

```typescript
// src/page/SceneEdit/page.tsx
import { HavokModel } from './components/HavokModel';

// 在渲染循環中添加Havok模型
{Object.values(models).map((modelState) => {
    if (modelState.type === 'havok') {
        return (
            <HavokModel
                key={modelState.id}
                modelState={modelState}
                mode={transformMode}
                onTransform={handleTransform}
                selectionManager={selectionManagerRef.current || undefined}
            />
        );
    }
    // ... 其他類型
})}
```

## 數據轉換和縮放

### 坐標系統轉換

1. **Havok坐標**: 0-255整數範圍
2. **Three.js坐標**: 浮點數世界坐標
3. **轉換公式**: `threeCoord = havokCoord * scaleFactor`

### 建議的縮放策略

```typescript
// 根據場景需求調整縮放因子
const HAVOK_SCALE_FACTOR = 0.1; // 可配置的縮放因子

function convertHavokToThreeCoords(havokXYZ: [number, number, number]): [number, number, number] {
    return [
        havokXYZ[0] * HAVOK_SCALE_FACTOR,
        havokXYZ[1] * HAVOK_SCALE_FACTOR,
        havokXYZ[2] * HAVOK_SCALE_FACTOR
    ];
}
```

## 性能優化

### 1. 大文件處理
- 實現漸進式解析，分批處理大型XML文件
- 使用Web Workers進行後台解析
- 實現LOD（Level of Detail）系統

### 2. 內存管理
- 實現幾何體緩存和重用
- 及時清理不再使用的資源
- 使用THREE.js的dispose方法正確釋放內存

### 3. 渲染優化
- 使用InstancedMesh處理大量重複幾何體
- 實現視錐體剔除
- 考慮使用線框材質減少渲染負荷

## 錯誤處理

### 1. XML解析錯誤
- 驗證XML格式正確性
- 處理缺失的必需字段
- 提供詳細的錯誤信息

### 2. 數據驗證
- 檢查索引值是否在有效範圍內
- 驗證幾何體完整性
- 處理空或損壞的數據

### 3. 內存限制
- 監控內存使用情況
- 實現文件大小限制
- 提供優雅的降級處理

## 測試策略

### 1. 單元測試
- 測試XML解析函數
- 測試幾何體生成函數
- 測試坐標轉換函數

### 2. 集成測試
- 測試完整的導入流程
- 測試與現有場景系統的集成
- 測試UI交互

### 3. 性能測試
- 測試大文件處理性能
- 測試內存使用情況
- 測試渲染幀率

## 部署和配置

### 1. 文件類型支持
在Tauri配置中添加XML文件類型支持：

```json
{
  "plugins": {
    "dialog": {
      "extensions": ["xml", "hkt"]
    }
  }
}
```

### 2. 依賴管理
確保項目包含必要的依賴：
- @react-three/fiber
- @react-three/drei
- three
- @tauri-apps/plugin-fs
- @tauri-apps/plugin-dialog

## 使用示例

### 基本用法

```typescript
// 1. 用戶點擊"Import Havok XML"按鈕
// 2. 選擇Havok XML文件
// 3. 系統自動解析並渲染網格
// 4. 用戶可以像操作其他模型一樣變換Havok模型

const havokModel = useSceneStore(state => 
    Object.values(state.models).find(model => model.type === 'havok')
);
```

### 高級配置

```typescript
// 自定義材質
const customMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    wireframe: true,
    transparent: true,
    opacity: 0.8
});

// 自定義縮放
const customScaleFactor = 0.05;
```

## 後續擴展

### 1. 多格式支持
- 支持二進制HKT格式
- 支持其他物理引擎格式

### 2. 高級功能
- 實現碰撞檢測可視化
- 添加物理屬性編輯
- 支持動畫軌跡導入

### 3. 工具集成
- 添加Havok數據導出功能
- 實現批量處理工具
- 開發Havok到其他格式的轉換器

## 結論

此功能將為項目提供強大的Havok物理模型導入能力，同時保持與現有架構的良好集成。通過模塊化設計和漸進式實現，可以確保功能的穩定性和可擴展性。
