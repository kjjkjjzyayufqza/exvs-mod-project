import { useRef, useEffect, useState, Suspense, useMemo, useCallback } from 'react';
import { useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three-stdlib';
import { TransformControls } from '@react-three/drei';
import { ModelState, SubModelState } from '../../../store/sceneStore';
import { BoundingBoxGrid } from './BoundingBoxGrid';
import * as THREE from 'three';

// 全局模型缓存
const modelCache = new Map<string, any>();

interface DAEModelProps {
    modelState: ModelState;
    mode: 'translate' | 'rotate' | 'scale';
    isSelected: boolean;
    selectedSubModelId: string | null;
    onClick: (id: string) => void;
    onSubModelClick: (subModelId: string) => void;
    onTransform: (modelState: ModelState) => void;
}

// 自定义Hook用于管理模型缓存和加载
function useDAEModel(filePath: string) {
    const [collada, setCollada] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // 检查缓存
        if (modelCache.has(filePath)) {
            console.log('DAEModel: Using cached model for:', filePath);
            setCollada(modelCache.get(filePath));
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
                modelCache.set(filePath, loadedCollada);
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
function DAEModelInner({ modelState, mode, isSelected, selectedSubModelId, onClick, onSubModelClick, onTransform }: DAEModelProps) {
    const meshRef = useRef<THREE.Group>(null);
    const subMeshRefs = useRef<Record<string, THREE.Group>>({});
    const timeoutRef = useRef<number | null>(null);
    const [isModelReady, setIsModelReady] = useState(false);
    const [subModelStates, setSubModelStates] = useState<SubModelState[]>([]);
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
        if (meshRef.current) {
            console.log('DAEModelInner: Setting up model transform');
            meshRef.current.position.set(...modelState.position);
            meshRef.current.rotation.set(...modelState.rotation);
            meshRef.current.scale.set(...modelState.scale);
        }
    }, [modelState.position, modelState.rotation, modelState.scale]);

    // 使用useCallback优化handleObjectChange函数
    const handleObjectChange = useCallback((subModelId?: string) => {
        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set new timeout to save after 300ms of no changes
        timeoutRef.current = window.setTimeout(() => {
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
    }, [modelState, subModelStates, onTransform]);

    // 使用useCallback优化点击处理函数
    const handleClick = useCallback((event: any) => {
        event.stopPropagation();
        // 对于DAE模型，不允许选择父模型，只能选择子模型
        // 如果没有子模型被选择，则什么都不做
    }, []);

    const handleSubModelClick = useCallback((subModelId: string) => {
        return (event: any) => {
            event.stopPropagation();
            onSubModelClick(subModelId);
        };
    }, [onSubModelClick]);

    // 使用useMemo缓存几何体和材质提取，避免重复计算
    const { geometries, materials } = useMemo(() => {
        const geometries: THREE.BufferGeometry[] = [];
        const materials: THREE.Material[] = [];

        if (collada && collada.scene) {
            collada.scene.traverse((child: THREE.Object3D) => {
                if (child instanceof THREE.Mesh) {
                    geometries.push(child.geometry);
                    materials.push(child.material);
                }
            });
        }

        return { geometries, materials };
    }, [collada]);

    console.log('DAEModelInner: Rendering sub-models:', subModelStates);

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

                    const isSubModelSelected = selectedSubModelId === subModel.id;

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
                           {isSubModelSelected && subMeshRefs.current[subModel.id] && (
                               <>
                                   <BoundingBoxGrid
                                       target={subMeshRefs.current[subModel.id]}
                                       visible={true}
                                       color="#ffff00"
                                   />
                                   <TransformControls
                                       object={subMeshRefs.current[subModel.id]}
                                       mode={mode}
                                       showX
                                       showY
                                       showZ
                                       size={1}
                                       space="world"
                                       onObjectChange={() => handleObjectChange(subModel.id)}
                                   />
                               </>
                           )}
                        </group>
                    );
                })}
            </group>
            {/* 移除父模型的变换控制器和边界框 - 只操作子模型 */}
        </>
    );
}

// Main DAE model component with error boundary
export function DAEModel(props: DAEModelProps) {
    return (
        <Suspense fallback={<LoadingBox />}>
            <DAEModelInner {...props} />
        </Suspense>
    );
}
