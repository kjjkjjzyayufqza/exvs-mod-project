import { Canvas } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import { useRef, useEffect, useState } from "react";
import { useSceneStore, BoxState } from "../../store/sceneStore";

interface BoxProps {
    boxState: BoxState;
    color: string;
    mode: 'translate' | 'rotate' | 'scale';
    isSelected: boolean;
    onClick: (id: string) => void;
    onTransform: (boxState: BoxState) => void;
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
                const updatedBoxState: BoxState = {
                    id: boxState.id,
                    position: meshRef.current.position.toArray(),
                    rotation: meshRef.current.rotation.toArray().slice(0, 3),
                    scale: meshRef.current.scale.toArray()
                };
                onTransform(updatedBoxState);
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
        boxes,
        selectedBoxId,
        transformMode,
        setSelectedBox,
        clearSelection,
        setTransformMode,
        updateBoxTransform,
        undo,
        redo,
        canUndo,
        canRedo
    } = useSceneStore();

    const handleBoxClick = (boxId: string) => {
        setSelectedBox(boxId);
    };

    const handleTransform = (boxState: any) => {
        updateBoxTransform(boxState);
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

    return (
        <div className="w-full h-screen bg-gray-800 relative">
            <div className="absolute top-4 left-4 z-50 text-white bg-black bg-opacity-50 backdrop-blur-sm p-3 rounded-lg text-sm">
                <div className="text-xs text-gray-300 space-y-1 mb-2">
                    <p className="font-semibold">Selected: {selectedBoxId || 'None'}</p>
                    <p>W: XYZ translate</p>
                    <p>E: rotate</p>
                    <p>R: scale</p>
                    <p>Ctrl+Z: Undo</p>
                    <p>Ctrl+Y: Redo</p>
                </div>
            </div>

            <Canvas
                camera={{ position: [8, 8, 8], fov: 30 }}
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

                {Object.values(boxes).map((boxState) => (
                    <Box
                        key={boxState.id}
                        boxState={boxState}
                        color={boxState.id === 'box1' ? 'orange' : 'blue'}
                        mode={transformMode}
                        isSelected={selectedBoxId === boxState.id}
                        onClick={handleBoxClick}
                        onTransform={handleTransform}
                    />
                ))}

                <OrbitControls
                    makeDefault
                    enableDamping={true}
                    dampingFactor={1}
                />
            </Canvas>
        </div>
    );
}
