import { useMemo } from "react";
import * as THREE from "three";
import type { HavokMeshData, HavokAabb } from "@/utils/havokXmlParser";
import { generateHavokMesh } from "@/utils/havokMeshGenerator";
import type { PlacementRow } from "../../types/placement";

const COLLISION_WIREFRAME_COLOR = 0x00ff00;
const COLLISION_SELECTED_COLOR = 0x00ffff;
const AABB_COLOR = 0xff8800;

function HavokAabbBox({ aabb }: { aabb: HavokAabb }) {
  const geometry = useMemo(() => {
    const sx = aabb.max[0] - aabb.min[0];
    const sy = aabb.max[1] - aabb.min[1];
    const sz = aabb.max[2] - aabb.min[2];
    return new THREE.BoxGeometry(sx, sy, sz);
  }, [aabb]);

  const position: [number, number, number] = useMemo(
    () => [
      (aabb.min[0] + aabb.max[0]) / 2,
      (aabb.min[1] + aabb.max[1]) / 2,
      (aabb.min[2] + aabb.max[2]) / 2,
    ],
    [aabb],
  );

  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: AABB_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    [],
  );

  return <mesh geometry={geometry} material={material} position={position} />;
}

function HavokCollisionMesh({ data, selected = false }: { data: HavokMeshData; selected?: boolean }) {
  const geometry = useMemo(() => generateHavokMesh(data), [data]);

  const wireframeMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: selected ? COLLISION_SELECTED_COLOR : COLLISION_WIREFRAME_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [selected],
  );

  if (!geometry || geometry.getAttribute("position")?.count === 0) return null;

  return <mesh geometry={geometry} material={wireframeMaterial} />;
}

/** Extract folder name from sourceId like "folder/map_hit.hkt" or "folder\map_hit.hkt" */
function folderFromSourceId(sourceId: string): string {
  const normalized = sourceId.replace(/\\/g, "/");
  const parts = normalized.split("/");
  // sourceId is relative path like "201stage201_object_build_a_left_before/map_hit.hkt"
  // or "info/border_hit.hkt" or just "border_hit.hkt"
  if (parts.length >= 2) {
    return parts[0];
  }
  return "";
}

export interface SubModelEntry {
  folderName: string;
  objectIndex: number;
}

export interface ObjectTransform {
  position: [number, number, number];
  rotation: [number, number, number];
}

interface HavokCollisionOverlayProps {
  meshDataMap: Map<string, HavokMeshData>;
  viewMode: "normal" | "collision" | "both";
  showAabb?: boolean;
  showMesh?: boolean;
  subModels?: SubModelEntry[];
  placementEntries?: PlacementRow[];
  collisionVisibility?: Record<string, boolean>;
  objectTransforms?: Map<string, ObjectTransform>;
  selectedSourceId?: string | null;
}

export function HavokCollisionOverlay({
  meshDataMap,
  viewMode,
  showAabb = true,
  showMesh = true,
  subModels,
  placementEntries,
  collisionVisibility,
  objectTransforms,
  selectedSourceId,
}: HavokCollisionOverlayProps) {
  if (viewMode === "normal" || meshDataMap.size === 0) return null;

  // Build lookup: folder name -> HavokMeshData
  const folderToMesh = useMemo(() => {
    const map = new Map<string, HavokMeshData>();
    for (const [sourceId, data] of meshDataMap) {
      const folder = folderFromSourceId(sourceId);
      if (folder) {
        map.set(folder, data);
      }
    }
    return map;
  }, [meshDataMap]);

  const folderToSourceId = useMemo(() => {
    const map = new Map<string, string>();
    for (const [sourceId] of meshDataMap) {
      const folder = folderFromSourceId(sourceId);
      if (folder) map.set(folder, sourceId);
    }
    return map;
  }, [meshDataMap]);

  // Build placement positions for each sub-model
  const instances = useMemo(() => {
    const result: { key: string; sourceId: string; data: HavokMeshData; position: [number, number, number]; rotation: [number, number, number] }[] = [];

    if (!subModels || !placementEntries) {
      for (const [id, data] of meshDataMap) {
        const t = objectTransforms?.get(id);
        result.push({
          key: id,
          sourceId: id,
          data,
          position: t?.position ?? [0, 0, 0],
          rotation: t?.rotation ?? [0, 0, 0],
        });
      }
      return result;
    }

    for (const sub of subModels) {
      const meshData = folderToMesh.get(sub.folderName);
      if (!meshData) continue;

      const origSourceId = folderToSourceId.get(sub.folderName) ?? sub.folderName;

      const rows = placementEntries
        .map((entry, idx) => ({ entry, idx }))
        .filter(({ entry }) =>
          entry.vdkType.toUpperCase() === "OBJECT" &&
          entry.objectNumber === sub.objectIndex,
        );

      if (rows.length === 0) {
        result.push({
          key: `${sub.folderName}_standalone`,
          sourceId: origSourceId,
          data: meshData,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        });
      } else {
        for (const { entry, idx } of rows) {
          result.push({
            key: `${sub.folderName}_pl${idx}`,
            sourceId: origSourceId,
            data: meshData,
            position: [entry.posX, entry.posY, entry.posZ],
            rotation: [entry.rotX, entry.rotY, entry.rotZ],
          });
        }
      }
    }

    for (const [sourceId, data] of meshDataMap) {
      const folder = folderFromSourceId(sourceId);
      if (!folder || folder === "base") {
        const t = objectTransforms?.get(sourceId);
        result.push({
          key: sourceId,
          sourceId,
          data,
          position: t?.position ?? [0, 0, 0],
          rotation: t?.rotation ?? [0, 0, 0],
        });
      } else if (!subModels.some(s => s.folderName === folder)) {
        const t = objectTransforms?.get(sourceId);
        result.push({
          key: sourceId,
          sourceId,
          data,
          position: t?.position ?? [0, 0, 0],
          rotation: t?.rotation ?? [0, 0, 0],
        });
      }
    }

    return result;
  }, [meshDataMap, folderToMesh, folderToSourceId, subModels, placementEntries, objectTransforms]);

  // Filter instances by collisionVisibility
  const visibleInstances = useMemo(() => {
    if (!collisionVisibility) return instances;
    return instances.filter(({ key }) => {
      // Extract the folder name from the key for visibility check
      const folder = key.replace(/_standalone$|_pl\d+$/, "");
      return collisionVisibility[folder] !== false;
    });
  }, [instances, collisionVisibility]);

  return (
    <group name="havok-collision-overlay">
      {visibleInstances.map(({ key, sourceId, data, position, rotation }) => (
        <group
          key={key}
          position={position}
          rotation={[
            rotation[0] * (Math.PI / 180),
            rotation[1] * (Math.PI / 180),
            rotation[2] * (Math.PI / 180),
          ]}
        >
          {showAabb && data.aabb && <HavokAabbBox aabb={data.aabb} />}
          {showMesh && (
            <HavokCollisionMesh
              data={data}
              selected={selectedSourceId != null && sourceId === selectedSourceId}
            />
          )}
        </group>
      ))}
    </group>
  );
}
