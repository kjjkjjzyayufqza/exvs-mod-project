import { Canvas } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import { useSceneStore, ModelState } from "../../store/sceneStore";
import { ControlPanel } from "./components/ControlPanel";
import { DAEModel } from "./components/DAEModel";

interface BoxProps {
    boxState: ModelState;
    color: string;
    mode: 'translate' | 'rotate' | 'scale';
    isSelected: boolean;
    onClick: (id: string) => void;
    onTransform: (modelState: ModelState) => void;
}

function Box({ boxState, color, mode, isSelected, onClick, onTransform }: BoxProps) {
    const meshRef = useRef<any>(null);
    const timeoutRef = useRef<number | null>(null);
    const [isMeshReady, setIsMeshReady] = useState(false);

    // Update mesh transform when boxState changes
    useEffect(() => {
        if (meshRef.current) {
            meshRef.current.position.set(...boxState.position);
            meshRef.current.rotation.set(...boxState.rotation);
            meshRef.current.scale.set(...boxState.scale);
            setIsMeshReady(true);
        }
    }, [boxState]);

    const handleClick = (event: any) => {
        event.stopPropagation();
        onClick(boxState.id);
    };

    const handleObjectChange = () => {
        // Clear previous timeout
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // Set new timeout to save after 300ms of no changes
        timeoutRef.current = window.setTimeout(() => {
            if (meshRef.current) {
                const updatedModelState: ModelState = {
                    id: boxState.id,
                    type: 'box',
                    position: meshRef.current.position.toArray(),
                    rotation: meshRef.current.rotation.toArray().slice(0, 3),
                    scale: meshRef.current.scale.toArray()
                };
                onTransform(updatedModelState);
            }
        }, 300);
    };

    return (
        <>
            <mesh ref={meshRef} onClick={handleClick}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color={color} />
            </mesh>
            {isSelected && isMeshReady && (
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

export default function SceneEdit() {
    const {
        models,
        selectedModelId,
        transformMode,
        setSelectedModel,
        clearSelection,
        setTransformMode,
        updateModelTransform,
        getInitialModelState,
        loadSpecificDAEModel,
        undo,
        redo,
        canUndo,
        canRedo
    } = useSceneStore();

    const handleBoxClick = (boxId: string) => {
        setSelectedModel(boxId);
    };

    const handleTransform = (boxState: any) => {
        updateModelTransform(boxState);
    };

    const handleCanvasClick = (event: any) => {
        // 只有当点击的不是模型时才清除选择
        // 检查事件对象是否有 intersections 且没有相交对象
        if (event.intersections && event.intersections.length === 0) {
            clearSelection();
        }
    };

    useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
            // Handle undo/redo
            if (event.ctrlKey || event.metaKey) {
                if (event.key === 'z' && !event.shiftKey) {
                    event.preventDefault();
                    undo();
                    return;
                }
                if ((event.key === 'y') || (event.key === 'z' && event.shiftKey)) {
                    event.preventDefault();
                    redo();
                    return;
                }
            }

            // Handle transform modes
            switch (event.key.toLowerCase()) {
                case 'w':
                    setTransformMode('translate');
                    break;
                case 'e':
                    setTransformMode('rotate');
                    break;
                case 'r':
                    setTransformMode('scale');
                    break;
            }
        };

        // 阻止鼠标滚轮按下时的页面滚动
        const handleContextMenu = (event: MouseEvent) => {
            // 阻止右键菜单
            event.preventDefault();
        };

        window.addEventListener('keydown', handleKeyPress);
        window.addEventListener('contextmenu', handleContextMenu);

        return () => {
            window.removeEventListener('keydown', handleKeyPress);
            window.removeEventListener('contextmenu', handleContextMenu);
        };
    }, []);

    const selectedModelState = selectedModelId ? models[selectedModelId] : null;

    // Load DAE model on scene initialization
    useEffect(() => {
        const loadInitialDAEModel = async () => {
            try {
                await loadSpecificDAEModel("E:\\XB\\解包\\gundamv\\16F73C97\\scene_0.dae");
            } catch (error) {
                console.error('Failed to load initial DAE model:', error);
            }
        };

        loadInitialDAEModel();
    }, []);

    return (
        <div className="w-full h-[calc(100vh-28px)] bg-gray-800 relative">
            <ControlPanel
                selectedModelId={selectedModelId}
                selectedModelState={selectedModelState}
                onUpdateModelTransform={updateModelTransform}
                getInitialModelState={getInitialModelState}
            />

            <Canvas
                camera={{ position: [8, 8, 8], fov: 30, near: 0.1, far: 100000000 }}
                style={{ background: '#1a1a1a' }}
                className="z-10"
                onClick={handleCanvasClick}
                onPointerDown={(event) => {
                    // 阻止鼠标滚轮按下时的页面滚动
                    if (event.button === 1) { // 中键
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
                onWheel={(event) => {
                    // 确保滚轮事件不会导致页面滚动
                    if (event.buttons === 4) { // 中键被按下
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }}
            >
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 5]} intensity={1} />

                {Object.values(models).map((modelState) => {
                    if (modelState.type === 'dae') {
                        return (
                            <DAEModel
                                key={modelState.id}
                                modelState={modelState}
                                mode={transformMode}
                                isSelected={selectedModelId === modelState.id}
                                onClick={handleBoxClick}
                                onTransform={handleTransform}
                            />
                        );
                    } else {
                        return (
                            <Box
                                key={modelState.id}
                                boxState={modelState}
                                color={modelState.id === 'box1' ? 'orange' : 'blue'}
                                mode={transformMode}
                                isSelected={selectedModelId === modelState.id}
                                onClick={handleBoxClick}
                                onTransform={handleTransform}
                            />
                        );
                    }
                })}

                <OrbitControls
                    makeDefault
                    enableDamping={true}
                    dampingFactor={1}
                />
            </Canvas>
        </div>
    );
}
