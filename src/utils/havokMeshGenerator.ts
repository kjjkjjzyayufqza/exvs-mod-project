import * as THREE from 'three';
import type { HavokMeshData } from './havokXmlParser';

/**
 * Generate Three.js BufferGeometry from Havok collision mesh data.
 * Vertices are already in world coordinates (decoded from packedVertices + domain AABB).
 */
export function generateHavokMesh(data: HavokMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();

  if (data.vertices.length === 0 || data.quads.length === 0) {
    return geometry;
  }

  const positions: number[] = [];
  for (const [x, y, z] of data.vertices) {
    positions.push(x, y, z);
  }

  // Convert quads to triangles
  const indices: number[] = [];
  for (const [i0, i1, i2, i3] of data.quads) {
    if (i0 < data.vertices.length && i1 < data.vertices.length &&
        i2 < data.vertices.length && i3 < data.vertices.length) {
      indices.push(i0, i1, i2);
      indices.push(i0, i2, i3);
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}
