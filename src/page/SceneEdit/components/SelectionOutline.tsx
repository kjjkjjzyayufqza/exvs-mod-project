import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Outline,
  Selection,
  Select,
} from "@react-three/postprocessing";
import { BlendFunction, KernelSize } from "postprocessing";
import * as THREE from "three";

export interface SelectionOutlineProps {
  enabled?: boolean;
  selectedMeshes: THREE.Object3D[];
  edgeColor?: string;
  hiddenEdgeColor?: string;
  edgeStrength?: number;
  pulseSpeed?: number;
}

export function SelectionOutlineEffect({
  enabled = true,
  selectedMeshes,
  edgeColor = "#ff8c00",
  hiddenEdgeColor = "#4a3000",
  edgeStrength = 3.5,
  pulseSpeed = 0,
}: SelectionOutlineProps) {
  const meshRefs = useMemo(() => {
    if (!enabled || selectedMeshes.length === 0) return [];
    const collected: THREE.Mesh[] = [];
    for (const obj of selectedMeshes) {
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          collected.push(child);
        }
      });
    }
    return collected;
  }, [enabled, selectedMeshes]);

  if (!enabled || meshRefs.length === 0) return null;

  return (
    <EffectComposer multisampling={0} autoClear={false}>
      <Outline
        selection={meshRefs}
        edgeStrength={edgeStrength}
        pulseSpeed={pulseSpeed}
        visibleEdgeColor={new THREE.Color(edgeColor).getHex()}
        hiddenEdgeColor={new THREE.Color(hiddenEdgeColor).getHex()}
        blur
        kernelSize={KernelSize.SMALL}
        xRay={true}
        blendFunction={BlendFunction.ALPHA}
      />
    </EffectComposer>
  );
}

export function useCollectSelectedMeshes(
  sceneRef: React.RefObject<THREE.Group | null>,
  selectedNodeId: string | null,
): THREE.Object3D[] {
  const collected = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    collected.current = [];
    if (!sceneRef.current || !selectedNodeId) return;

    sceneRef.current.traverse((child) => {
      if (child.userData?.nodeId === selectedNodeId) {
        collected.current.push(child);
      }
    });
  }, [sceneRef, selectedNodeId]);

  return collected.current;
}
