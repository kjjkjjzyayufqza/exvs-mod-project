import { useRef, useEffect, useState, Suspense } from 'react';
import { useLoader } from '@react-three/fiber';
import { ColladaLoader } from 'three-stdlib';
import { TransformControls } from '@react-three/drei';
import { ModelState } from '../../../store/sceneStore';
import * as THREE from 'three';

interface DAEModelProps {
    modelState: ModelState;
    mode: 'translate' | 'rotate' | 'scale';
    isSelected: boolean;
    onClick: (id: string) => void;
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
function DAEModelInner({ modelState, mode, isSelected, onClick, onTransform }: DAEModelProps) {
    const meshRef = useRef<THREE.Group>(null);
    const timeoutRef = useRef<number | null>(null);
    const [isModelReady, setIsModelReady] = useState(false);

    console.log('DAEModelInner: Loading model from:', modelState.filePath);

    // Load DAE file using ColladaLoader
    const collada = useLoader(ColladaLoader, modelState.filePath!);

    console.log('DAEModelInner: Collada loaded:', collada);

    // Update mesh transform when modelState changes
    useEffect(() => {
        if (meshRef.current && collada) {
            console.log('DAEModelInner: Setting up model transform');
            meshRef.current.position.set(...modelState.position);
            meshRef.current.rotation.set(...modelState.rotation);
            meshRef.current.scale.set(...modelState.scale);
            setIsModelReady(true);
            console.log('DAEModelInner: Model ready');
        }
    }, [modelState, collada]);

    const handleClick = (event: any) => {
        event.stopPropagation();
        onClick(modelState.id);
    };

    const handleObjectChange = () => {
        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set new timeout to save after 300ms of no changes
        timeoutRef.current = window.setTimeout(() => {
            if (meshRef.current) {
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

    console.log('DAEModelInner: Rendering collada scene:', collada.scene);

    return (
        <>
            <group ref={meshRef} onClick={handleClick}>
                <primitive object={collada.scene} />
            </group>
            {isSelected && isModelReady && meshRef.current && (
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
