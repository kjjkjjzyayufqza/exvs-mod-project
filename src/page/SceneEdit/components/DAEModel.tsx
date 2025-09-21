import { useRef, useEffect, useState, Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three-stdlib';
import { TransformControls } from '@react-three/drei';
import { ModelState, SubModelState } from '../../../store/sceneStore';
import { BoundingBoxGrid } from './BoundingBoxGrid';
import * as THREE from 'three';

interface DAEModelProps {
    modelState: ModelState;
    mode: 'translate' | 'rotate' | 'scale';
    isSelected: boolean;
    selectedSubModelId: string | null;
    onClick: (id: string) => void;
    onSubModelClick: (subModelId: string) => void;
    onTransform: (modelState: ModelState) => void;
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

    console.log('DAEModelInner: Loading model from:', modelState.filePath);

    // Load DAE file using ColladaLoader
    const collada = useLoader(ColladaLoader, modelState.filePath!);

    console.log('DAEModelInner: Collada loaded:', collada);

    // Initialize sub-models when collada is loaded (only once)
    useEffect(() => {
        if (collada && collada.scene && !isInitializedRef.current) {
            console.log('DAEModelInner: Initializing sub-models from collada scene');
            isInitializedRef.current = true;

            // Extract geometries from the scene
            const geometries: THREE.BufferGeometry[] = [];
            const geometryNames: string[] = [];

            collada.scene.traverse((child) => {
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

    const handleClick = (event: any) => {
        event.stopPropagation();
        // Only allow parent model selection when no sub-model transform controls are active
        if (!selectedSubModelId) {
            onClick(modelState.id);
        }
    };

    const handleObjectChange = (subModelId?: string) => {
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
    };

    if (!collada) {
        console.log('DAEModelInner: Collada not loaded yet, showing loading box');
        return <LoadingBox />;
    }

    console.log('DAEModelInner: Rendering sub-models:', subModelStates);

    // Extract geometries and materials from the collada scene
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    if (collada.scene) {
        collada.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                geometries.push(child.geometry);
                materials.push(child.material);
            }
        });
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
                                onClick={(event) => {
                                    event.stopPropagation();
                                    // Only allow sub-model selection when main model transform controls are not active
                                    if (!isSelected || selectedSubModelId) {
                                        onSubModelClick(subModel.id);
                                    }
                                }}
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
            {isSelected && !selectedSubModelId && isModelReady && meshRef.current && (
                <>
                    <BoundingBoxGrid
                        target={meshRef.current}
                        visible={true}
                        color="#00ff00"
                    />
                    <TransformControls
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

// Main DAE model component with error boundary
export function DAEModel(props: DAEModelProps) {
    return (
        <Suspense fallback={<LoadingBox />}>
            <DAEModelInner {...props} />
        </Suspense>
    );
}
