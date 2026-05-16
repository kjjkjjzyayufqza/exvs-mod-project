import { useRef, useEffect, useState, Suspense, useMemo, useCallback, memo } from 'react';
import { useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three-stdlib';
import { SceneTransformControls } from './SceneTransformControls';
import { ModelState, SubModelState } from '../../../store/sceneStore';
import { BoundingBoxGrid } from './BoundingBoxGrid';
import { SelectionManager } from '../utils/SelectionManager';
import * as THREE from 'three';

const colladaSceneCache = new Map<string, unknown>();

export function clearSceneEditColladaModelCache(): void {
  colladaSceneCache.clear();
}

interface DAEModelProps {
    modelState: ModelState;
    mode: 'translate' | 'rotate' | 'scale';
    onTransform: (modelState: ModelState) => void;
    selectionManager?: SelectionManager;
}

/** Hook for Collada loading with blob-URL keyed cache (see clearSceneEditColladaModelCache). */
function useDAEModel(filePath: string) {
    const [collada, setCollada] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // 如果filePath是本地文件路径（不是blob URL），等待重新加载
        if (filePath && !filePath.startsWith('blob:')) {
            console.log('DAEModel: Waiting for blob URL reload, current path:', filePath);
            setIsLoading(true);
            setError(null);
            setCollada(null);
            return;
        }
        // 检查缓存
        if (colladaSceneCache.has(filePath)) {
            console.log('DAEModel: Using cached model for:', filePath);
            setCollada(colladaSceneCache.get(filePath));
            setIsLoading(false);
            return;
        }

        // 如果没有缓存，则加载模型
        console.log('DAEModel: Loading new model from:', filePath);
        setIsLoading(true);
        setError(null);

        const loader = new ColladaLoader();
        loader.load(
            filePath,
            (loadedCollada) => {
                console.log('DAEModel: Model loaded and cached:', filePath);
                // 缓存加载的模型
                colladaSceneCache.set(filePath, loadedCollada);
                setCollada(loadedCollada);
                setIsLoading(false);
            },
            undefined,
            (loadError) => {
                console.error('DAEModel: Failed to load model:', loadError);
                setError(new Error(`Failed to load model: ${loadError.message || 'Unknown error'}`));
                setIsLoading(false);
            }
        );
    }, [filePath]);

    return { collada, isLoading, error };
}

// Loading fallback component
function LoadingBox() {
    return (
        <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#666666" wireframe />
        </mesh>
    );
}

// Error fallback component
function ErrorBox({ error }: { error: Error }) {
    console.error('DAE Model loading error:', error);
    return (
        <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#ff4444" />
        </mesh>
    );
}

// Inner DAE model component
function DAEModelInner({ modelState, mode, onTransform, selectionManager }: DAEModelProps) {
    const meshRef = useRef<THREE.Group>(null);
    const subMeshRefs = useRef<Record<string, THREE.Group>>({});
    const timeoutRef = useRef<number | null>(null);
    const [isModelReady, setIsModelReady] = useState(false);
    const [subModelStates, setSubModelStates] = useState<SubModelState[]>([]);
    const [isSelected, setIsSelected] = useState(false);
    const isInitializedRef = useRef(false);

    // 使用自定义Hook加载模型（带缓存）
    const { collada, isLoading, error } = useDAEModel(modelState.filePath!);

    // Initialize sub-models when collada is loaded (only once)
    useEffect(() => {
        if (collada && collada.scene && !isInitializedRef.current) {
            console.log('DAEModelInner: Initializing sub-models from collada scene');
            isInitializedRef.current = true;

            // Extract geometries from the scene
            const geometries: THREE.BufferGeometry[] = [];
            const geometryNames: string[] = [];

            collada.scene.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh && child.geometry) {
                    geometries.push(child.geometry);
                    geometryNames.push(child.name || `geom_${geometries.length - 1}`);
                }
            });

            console.log('DAEModelInner: Found geometries:', geometryNames);

            // Create sub-model states if they don't exist
            if (!modelState.subModels || modelState.subModels.length === 0) {
                const newSubModels: SubModelState[] = geometries.map((geom, index) => ({
                    id: `${modelState.id}_sub_${index}`,
                    name: geometryNames[index],
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scale: [1, 1, 1],
                    geometryIndex: index
                }));

                setSubModelStates(newSubModels);

                // Only update the model state if sub-models don't exist
                // Use setTimeout to avoid updating during render
                setTimeout(() => {
                    const updatedModelState: ModelState = {
                        ...modelState,
                        subModels: newSubModels
                    };
                    onTransform(updatedModelState);
                }, 0);
            } else {
                // If sub-models already exist, just set them
                setSubModelStates(modelState.subModels);
            }

            setIsModelReady(true);
            console.log('DAEModelInner: Sub-models initialized');
        }
    }, [collada]); // Only depend on collada to prevent circular updates

    // Sync sub-models from modelState when they change (but not during initialization)
    useEffect(() => {
        if (isInitializedRef.current && modelState.subModels && modelState.subModels.length > 0) {
            setSubModelStates(modelState.subModels);
        }
    }, [modelState.subModels]);

    // Update mesh transform when modelState changes
    useEffect(() => {
        if (meshRef.current && isModelReady) {
            console.log('DAEModelInner: Setting up model transform', modelState.id, modelState.position, modelState.rotation, modelState.scale);
            meshRef.current.position.set(...modelState.position);
            meshRef.current.rotation.set(...modelState.rotation);
            meshRef.current.scale.set(...modelState.scale);
        }
    }, [modelState.position, modelState.rotation, modelState.scale, isModelReady]);

    // Additional effect to handle model state changes that might occur after initial setup
    useEffect(() => {
        if (meshRef.current && isModelReady) {
            console.log('DAEModelInner: Model state changed, updating transform', modelState.id, modelState.position, modelState.rotation, modelState.scale);
            meshRef.current.position.set(...modelState.position);
            meshRef.current.rotation.set(...modelState.rotation);
            meshRef.current.scale.set(...modelState.scale);
        }
    }, [modelState, isModelReady]);

    // 使用useCallback优化handleObjectChange函数
    const handleObjectChange = useCallback((subModelId?: string) => {
        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // 开始变换，禁用选择
        if (selectionManager) {
            selectionManager.setTransforming(true);
            selectionManager.updateSelectionBox();
        }

        // Set new timeout to save after 300ms of no changes
        timeoutRef.current = window.setTimeout(() => {
            // 变换完成，允许选择
            if (selectionManager) {
                selectionManager.setTransforming(false);
            }
            if (subModelId && subMeshRefs.current[subModelId]) {
                // Update sub-model transform
                const subMesh = subMeshRefs.current[subModelId];
                const position = subMesh.position.toArray() as [number, number, number];
                const rotation = [
                    subMesh.rotation.x,
                    subMesh.rotation.y,
                    subMesh.rotation.z
                ] as [number, number, number];
                const scale = subMesh.scale.toArray() as [number, number, number];

                const updatedSubModels = subModelStates.map(subModel =>
                    subModel.id === subModelId
                        ? { ...subModel, position, rotation, scale }
                        : subModel
                );

                const updatedModelState: ModelState = {
                    ...modelState,
                    subModels: updatedSubModels
                };
                onTransform(updatedModelState);
            } else if (meshRef.current) {
                // Update main model transform
                const position = meshRef.current.position.toArray() as [number, number, number];
                const rotation = [
                    meshRef.current.rotation.x,
                    meshRef.current.rotation.y,
                    meshRef.current.rotation.z
                ] as [number, number, number];
                const scale = meshRef.current.scale.toArray() as [number, number, number];

                const updatedModelState: ModelState = {
                    ...modelState,
                    position,
                    rotation,
                    scale
                };
                onTransform(updatedModelState);
            }
        }, 300);
    }, [modelState, subModelStates, onTransform, selectionManager]);

    // 注册到SelectionManager并监听选中状态变化
    useEffect(() => {
        if (meshRef.current && selectionManager) {
            // 设置模型ID到userData中
            meshRef.current.userData.modelId = modelState.id;

            // 注册为可选择对象
            selectionManager.registerSelectableObject(meshRef.current);

            // 监听选中状态变化
            const handleSelectionChange = (selectedObject: THREE.Object3D | null) => {
                const isCurrentlySelected = selectedObject?.userData?.modelId === modelState.id;
                setIsSelected(isCurrentlySelected);
            };

            selectionManager.addSelectionChangeCallback(handleSelectionChange);

            return () => {
                // 清理
                selectionManager.unregisterSelectableObject(meshRef.current!);
                selectionManager.removeSelectionChangeCallback(handleSelectionChange);
            };
        }
    }, [meshRef.current, selectionManager, modelState.id]);

    // 使用useCallback优化点击处理函数
    const handleClick = useCallback((event: any) => {
        event.stopPropagation();
        // 点击事件现在由SelectionManager处理
    }, []);

    const handleSubModelClick = useCallback((subModelId: string) => {
        return (event: any) => {
            event.stopPropagation();
            // 点击事件现在由SelectionManager处理
        };
    }, []);

    // 使用useMemo缓存几何体和材质提取，避免重复计算
    const { geometries, originalMaterials } = useMemo(() => {
        const geometries: THREE.BufferGeometry[] = [];
        const originalMaterials: THREE.Material[] = [];

        if (collada && collada.scene) {
            collada.scene.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) {
                    geometries.push(child.geometry);
                    originalMaterials.push(child.material);
                }
            });
        }

        return { geometries, originalMaterials };
    }, [collada]);

    // 创建带有自定义贴图的材质
    const materials = useMemo(() => {
        return originalMaterials.map((originalMaterial, index) => {
            // 找到对应geometryIndex的子模型
            const subModel = subModelStates.find(sm => sm.geometryIndex === index);

            if (subModel && subModel.textureBlob) {
                // 如果有自定义贴图，创建新材质
                const texture = new THREE.TextureLoader().load(subModel.textureBlob);
                texture.flipY = false; // DAE模型通常需要这个设置
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;

                // 创建新的材质，保持原材质的其他属性
                const newMaterial = originalMaterial.clone();
                if (newMaterial instanceof THREE.MeshStandardMaterial ||
                    newMaterial instanceof THREE.MeshBasicMaterial ||
                    newMaterial instanceof THREE.MeshLambertMaterial ||
                    newMaterial instanceof THREE.MeshPhongMaterial) {
                    newMaterial.map = texture;
                    newMaterial.needsUpdate = true;
                }

                console.log(`Applied texture to subModel ${subModel.name} (geometryIndex: ${index})`);
                return newMaterial;
            }

            // 如果没有自定义贴图，使用原材质
            return originalMaterial;
        });
    }, [originalMaterials, subModelStates]);

    // console.log('DAEModelInner: Rendering sub-models:', subModelStates);

    // 如果有错误，显示错误框
    if (error) {
        return <ErrorBox error={error} />;
    }

    // 如果正在加载，显示加载框
    if (isLoading || !collada) {
        return <LoadingBox />;
    }

    return (
        <>
            <group ref={meshRef} onClick={handleClick}>
                {subModelStates.map((subModel, index) => {
                    const geometry = geometries[subModel.geometryIndex];
                    const material = materials[subModel.geometryIndex];

                    if (!geometry || !material) return null;

                    return (
                        <group key={subModel.id}>
                            <group
                                ref={(ref) => {
                                    if (ref) subMeshRefs.current[subModel.id] = ref;
                                }}
                                position={subModel.position}
                                rotation={subModel.rotation}
                                scale={subModel.scale}
                                onClick={handleSubModelClick(subModel.id)}
                            >
                                <mesh geometry={geometry} material={material} />
                            </group>
                        </group>
                    );
                })}
            </group>
            {/* 当父模型被选中且未被锁定时，显示边界框和变换控制器 */}
            {isSelected && meshRef.current && !modelState.isLocked && (
                <>
                    <BoundingBoxGrid
                        target={meshRef.current}
                        visible={true}
                        color="#00ffff"
                    />
                    <SceneTransformControls
                        object={meshRef.current}
                        mode={mode}
                        showX
                        showY
                        showZ
                        size={1}
                        space="world"
                        onObjectChange={() => handleObjectChange()}
                    />
                </>
            )}
        </>
    );
}

export const DAEModel = function DAEModel(props: DAEModelProps) {
    return (
        <Suspense fallback={<LoadingBox />}>
            <DAEModelInner {...props} />
        </Suspense>
    );
}
