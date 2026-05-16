import { useRef, useEffect, useState, memo } from 'react';
import { SceneTransformControls } from './SceneTransformControls';
import { ModelState } from '../../../store/sceneStore';
import { BoundingBoxGrid } from './BoundingBoxGrid';
import { SelectionManager } from '../utils/SelectionManager';
import { parseHavokXML } from '../../../utils/havokXmlParser';
import { createHavokMeshObject } from '../../../utils/havokMeshGenerator';
import { readFile } from '@tauri-apps/plugin-fs';
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
    const [isSelected, setIsSelected] = useState(false);
    
    // Load Havok XML file
    useEffect(() => {
        if (!modelState.filePath && !modelState.originalFilePath) return;
        
        const loadHavokFile = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                let xmlContent: string;
                
                // Check if we have a blob URL or need to read from file
                if (modelState.filePath && modelState.filePath.startsWith('blob:')) {
                    const response = await fetch(modelState.filePath);
                    xmlContent = await response.text();
                } else if (modelState.originalFilePath) {
                    // Read from original file path
                    const fileContent = await readFile(modelState.originalFilePath);
                    xmlContent = new TextDecoder().decode(fileContent);
                } else {
                    throw new Error('No valid file path found');
                }
                
                // Parse Havok data
                const havokData = parseHavokXML(xmlContent);
                
                // Generate Three.js mesh
                const mesh = createHavokMeshObject(havokData, true); // wireframe = true
                setHavokMesh(mesh);
                
                console.log('Havok model loaded successfully:', modelState.name);
                
            } catch (err) {
                console.error('Failed to load Havok file:', err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setIsLoading(false);
            }
        };
        
        loadHavokFile();
    }, [modelState.filePath, modelState.originalFilePath]);
    
    // Update mesh transform when model state changes
    useEffect(() => {
        if (havokMesh && meshRef.current) {
            meshRef.current.clear();
            meshRef.current.add(havokMesh);
            
            meshRef.current.position.set(...modelState.position);
            meshRef.current.rotation.set(...modelState.rotation);
            meshRef.current.scale.set(...modelState.scale);
        }
    }, [havokMesh, modelState.position, modelState.rotation, modelState.scale]);
    
    // Register with SelectionManager
    useEffect(() => {
        if (meshRef.current && selectionManager) {
            // Set model ID in userData
            meshRef.current.userData.modelId = modelState.id;
            
            // Register as selectable object
            selectionManager.registerSelectableObject(meshRef.current);
            
            // Listen for selection changes
            const handleSelectionChange = (selectedObject: THREE.Object3D | null) => {
                const isCurrentlySelected = selectedObject?.userData?.modelId === modelState.id;
                setIsSelected(isCurrentlySelected);
            };
            
            selectionManager.addSelectionChangeCallback(handleSelectionChange);
            
            return () => {
                // Cleanup
                selectionManager.unregisterSelectableObject(meshRef.current!);
                selectionManager.removeSelectionChangeCallback(handleSelectionChange);
            };
        }
    }, [meshRef.current, selectionManager, modelState.id]);
    
    // Handle transform changes
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
    
    // Handle click events
    const handleClick = (e: any) => {
        e.stopPropagation();
        // Click handling is now managed by SelectionManager
    };
    
    // Loading state
    if (isLoading) {
        return (
            <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="gray" opacity={0.5} transparent />
            </mesh>
        );
    }
    
    // Error state
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
                    <SceneTransformControls
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
