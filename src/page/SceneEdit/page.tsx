import { Canvas } from "@react-three/fiber";
import { OrbitControls, TransformControls, useHelper } from "@react-three/drei";
import { useRef, useEffect, useState, useCallback } from "react";
import { useSceneStore, ModelState } from "../../store/sceneStore";
import { ControlPanel } from "./components/ControlPanel";
import { DAEModel } from "./components/DAEModel";
import { BoundingBoxGrid } from "./components/BoundingBoxGrid";
import { SelectionManager } from "./utils/SelectionManager";
import { PostProcessing } from "./components/PostProcessing";
import * as THREE from 'three';
import { DirectionalLightHelper } from 'three';

function LightWithHelper() {
    const lightRef = useRef<THREE.DirectionalLight>(null);
    useHelper(lightRef as any, DirectionalLightHelper, 50);

    return (
        <directionalLight ref={lightRef} position={[400, 400, 350]} intensity={1} />
    );
}

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
                    name: boxState.name,
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
                <>
                    <BoundingBoxGrid
                        target={meshRef.current}
                        visible={true}
                        color="#00ffff"
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

export default function SceneEdit() {
    const {
        models,
        selectedModelId,
        transformMode,
        setSelectedModel,
        clearSelection,
        clearAllModels,
        setTransformMode,
        updateModelTransform,
        getInitialModelState,
        loadSpecificDAEModel,
        undo,
        redo,
        canUndo,
        canRedo
    } = useSceneStore();

    const selectionManagerRef = useRef<SelectionManager | null>(null);

    const handleBoxClick = useCallback((boxId: string) => {
        setSelectedModel(boxId);
    }, [setSelectedModel]);

    const handleTransform = useCallback((boxState: any) => {
        updateModelTransform(boxState);
    }, [updateModelTransform]);

    const handleCanvasClick = (event: any) => {
        // 只有当点击的不是模型时才清除选择
        // 检查事件对象是否有 intersections 且没有相交对象
        if (event.intersections && event.intersections.length === 0) {
            clearSelection();
            // 同时清除SelectionManager的选中状态
            if (selectionManagerRef.current) {
                selectionManagerRef.current.clearSelection();
            }
        }
    };

    // 初始化SelectionManager
    const initializeSelectionManager = useCallback((scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement) => {
        if (!selectionManagerRef.current) {
            selectionManagerRef.current = new SelectionManager(scene, camera);
            
            // 监听选中状态变化，但避免循环更新
            selectionManagerRef.current.addSelectionChangeCallback((selectedObject) => {
                if (selectedObject) {
                    const modelId = selectedObject.userData?.modelId;
                    if (modelId && modelId !== selectedModelId) {
                        // 只有当选中的模型ID真正改变时才更新store
                        setSelectedModel(modelId);
                    }
                } else if (selectedModelId !== null) {
                    // 只有当当前有选中模型时才清除选择
                    clearSelection();
                }
            });

            // 添加鼠标事件监听
            const handleMouseDown = (event: MouseEvent) => {
                selectionManagerRef.current?.handleMouseDown(event, canvas);
            };

            const handleMouseMove = (event: MouseEvent) => {
                selectionManagerRef.current?.handleMouseMove(event, canvas);
            };

            const handleMouseUp = (event: MouseEvent) => {
                selectionManagerRef.current?.handleMouseUp(event);
            };

            const handleClick = (event: MouseEvent) => {
                selectionManagerRef.current?.handleClick(event, canvas);
            };

            canvas.addEventListener('mousedown', handleMouseDown);
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mouseup', handleMouseUp);
            canvas.addEventListener('click', handleClick);

            // 返回清理函数
            return () => {
                canvas.removeEventListener('mousedown', handleMouseDown);
                canvas.removeEventListener('mousemove', handleMouseMove);
                canvas.removeEventListener('mouseup', handleMouseUp);
                canvas.removeEventListener('click', handleClick);
                selectionManagerRef.current?.dispose();
                selectionManagerRef.current = null;
            };
        }
    }, [setSelectedModel, clearSelection, selectedModelId]);

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
                // Clear all existing models before loading new ones
                clearAllModels();

                await loadSpecificDAEModel("E:\\XB\\解包\\gundamv\\16F73C97\\scene_0.dae");
                await loadSpecificDAEModel("E:\\XB\\解包\\gundamv\\16F73C97\\scene_1.dae");
                await loadSpecificDAEModel("E:\\XB\\解包\\gundamv\\16F73C97\\scene_2.dae");
                await loadSpecificDAEModel("E:\\XB\\解包\\gundamv\\16F73C97\\body.dae");
            } catch (error) {
                console.error('Failed to load initial DAE model:', error);
            }
        };

        loadInitialDAEModel();
    }, [clearAllModels]);

    // Sync SelectionManager when selectedModelId changes
    useEffect(() => {
        if (selectionManagerRef.current && selectedModelId) {
            selectionManagerRef.current.setSelectedById(selectedModelId);
        } else if (selectionManagerRef.current && !selectedModelId) {
            selectionManagerRef.current.clearSelection();
        }
    }, [selectedModelId]);

    return (
        <div className="w-full h-[calc(100vh-28px)] bg-gray-800 relative">
            <ControlPanel
                models={models}
                selectedModelId={selectedModelId}
                selectedModelState={selectedModelState}
                onUpdateModelTransform={updateModelTransform}
                getInitialModelState={getInitialModelState}
                onModelSelect={setSelectedModel}
            />

            <Canvas
                camera={{ position: [300, 300, 300], fov: 30, near: 0.1, far: 100000000 }}
                style={{ background: '#1a1a1a' }}
                className="z-10"
                onClick={handleCanvasClick}
                onCreated={({ scene, camera, gl }) => {
                    // 初始化SelectionManager
                    initializeSelectionManager(scene, camera, gl.domElement);
                }}
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
                <LightWithHelper />

                {Object.values(models).map((modelState) => {
                    if (modelState.type === 'dae') {
                        return (
                            <DAEModel
                                key={modelState.id}
                                modelState={modelState}
                                mode={transformMode}
                                onTransform={handleTransform}
                                selectionManager={selectionManagerRef.current || undefined}
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
                    enableDamping={false}
                    dampingFactor={1}
                />

                <PostProcessing />
            </Canvas>
        </div>
    );
}
