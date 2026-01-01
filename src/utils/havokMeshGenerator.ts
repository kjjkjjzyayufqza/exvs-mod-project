// Havok mesh generator utility
// Converts Havok XML data to Three.js geometry

import * as THREE from 'three'
import { HavokMeshData } from './havokXmlParser'

// Scale factor to convert Havok coordinates (0-199) to Three.js world coordinates
// Since maxKeyValue is 199, we use a larger scale to make the model more visible
const HAVOK_SCALE_FACTOR = 1.0

/**
 * Generate Three.js BufferGeometry from Havok mesh data
 */
export function generateHavokMesh (havokData: HavokMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()

  // Extract vertex positions from nodes
  const vertices: number[] = []
  const indices: number[] = []

  // Convert Havok nodes to vertices
  havokData.nodes.forEach(node => {
    // Convert 0-255 range integers to world coordinates
    vertices.push(node.xyz[0] * HAVOK_SCALE_FACTOR, node.xyz[1] * HAVOK_SCALE_FACTOR, node.xyz[2] * HAVOK_SCALE_FACTOR)
  })

  // Process quad primitives and convert to triangles
  havokData.primitives.forEach(primitive => {
    if (primitive.indices.length === 4) {
      // Convert quad to two triangles
      const [i0, i1, i2, i3] = primitive.indices

      // Validate indices are within bounds
      const maxIndex = havokData.nodes.length - 1
      if (i0 <= maxIndex && i1 <= maxIndex && i2 <= maxIndex && i3 <= maxIndex) {
        // First triangle: i0, i1, i2
        indices.push(i0, i1, i2)

        // Second triangle: i0, i2, i3
        indices.push(i0, i2, i3)
      }
    }
  })

  // Set geometry attributes
  geometry.setIndex(indices)
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))

  // Compute normals for proper lighting
  geometry.computeVertexNormals()

  // Compute bounding box and sphere
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  console.log(`Generated Havok mesh: ${vertices.length / 3} vertices, ${indices.length / 3} triangles`)

  // Debug: show vertex range
  let minX = Infinity,
    maxX = -Infinity
  let minY = Infinity,
    maxY = -Infinity
  let minZ = Infinity,
    maxZ = -Infinity

  for (let i = 0; i < vertices.length; i += 3) {
    minX = Math.min(minX, vertices[i])
    maxX = Math.max(maxX, vertices[i])
    minY = Math.min(minY, vertices[i + 1])
    maxY = Math.max(maxY, vertices[i + 1])
    minZ = Math.min(minZ, vertices[i + 2])
    maxZ = Math.max(maxZ, vertices[i + 2])
  }

  console.log(`Vertex bounds: X[${minX}, ${maxX}], Y[${minY}, ${maxY}], Z[${minZ}, ${maxZ}]`)

  // Show some vertex samples to understand the pattern
  console.log('First 10 vertices (as [x,y,z] groups):')
  for (let i = 0; i < Math.min(30, vertices.length); i += 3) {
    console.log(`  [${vertices[i]}, ${vertices[i + 1]}, ${vertices[i + 2]}]`)
  }

  return geometry
}

/**
 * Create wireframe material for Havok collision mesh
 */
export function createHavokMaterial (): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    transparent: true,
    opacity: 1.0,
    side: THREE.DoubleSide
  })
}

/**
 * Create solid material for Havok collision mesh
 */
export function createHavokSolidMaterial (): THREE.Material {
  return new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  })
}

/**
 * Create complete Havok mesh object with geometry and material
 */
export function createHavokMeshObject (havokData: HavokMeshData, wireframe: boolean = true): THREE.Mesh {
  const geometry = generateHavokMesh(havokData)
  const material = wireframe ? createHavokMaterial() : createHavokSolidMaterial()

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'HavokCollisionMesh'

  return mesh
}

/**
 * Convert Havok coordinates to Three.js coordinates
 */
export function convertHavokToThreeCoords (havokXYZ: [number, number, number]): [number, number, number] {
  return [havokXYZ[0] * HAVOK_SCALE_FACTOR, havokXYZ[1] * HAVOK_SCALE_FACTOR, havokXYZ[2] * HAVOK_SCALE_FACTOR]
}
