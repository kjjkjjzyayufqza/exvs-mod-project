import { useMemo } from "react";
import * as THREE from "three";

import type { HavokMeshData } from "@/utils/havokXmlParser";
import { generateHavokMesh } from "@/utils/havokMeshGenerator";

export const BORDER_MESH_COLOR = "#ffb020";

/** Stage border wireframe. The viewport draws this only while collision view is on. */
export function BorderHitMesh({ data }: { data: HavokMeshData }) {
  const geometry = useMemo(() => generateHavokMesh(data), [data]);
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: BORDER_MESH_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [],
  );

  if (!geometry || geometry.getAttribute("position")?.count === 0) return null;

  return <mesh name="border-hit" geometry={geometry} material={material} renderOrder={2} />;
}
