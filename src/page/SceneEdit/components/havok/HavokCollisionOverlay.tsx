import { useMemo } from "react";
import * as THREE from "three";
import type { HavokMeshData } from "@/utils/havokXmlParser";
import { generateHavokMesh } from "@/utils/havokMeshGenerator";

const COLLISION_WIREFRAME_COLOR = 0x00ff00;

function HavokCollisionMesh({ data }: { data: HavokMeshData }) {
  const geometry = useMemo(() => generateHavokMesh(data), [data]);

  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: COLLISION_WIREFRAME_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  return <mesh geometry={geometry} material={wireframeMaterial} />;
}

interface HavokCollisionOverlayProps {
  meshDataMap: Map<string, HavokMeshData>;
  viewMode: "normal" | "collision" | "both";
}

export function HavokCollisionOverlay({
  meshDataMap,
  viewMode,
}: HavokCollisionOverlayProps) {
  if (viewMode === "normal" || meshDataMap.size === 0) return null;

  return (
    <group name="havok-collision-overlay">
      {Array.from(meshDataMap.entries()).map(([id, data]) => (
        <HavokCollisionMesh key={id} data={data} />
      ))}
    </group>
  );
}
