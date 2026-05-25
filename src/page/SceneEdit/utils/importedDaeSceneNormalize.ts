import * as THREE from "three";

const _parentWorldInverse = new THREE.Matrix4();
const _localMatrix = new THREE.Matrix4();
const _bbox = new THREE.Box3();
const _center = new THREE.Vector3();
const _skinnedVertex = new THREE.Vector3();

function cloneMaterial(material: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }
  return material.clone();
}

function normalizeToGroundPlane(display: THREE.Object3D): void {
  _bbox.setFromObject(display);
  if (_bbox.isEmpty()) return;

  _bbox.getCenter(_center);
  const xShift = -_center.x;
  const yShift = -_bbox.min.y;
  const zShift = -_center.z;
  if (xShift * xShift + yShift * yShift + zShift * zShift < 1e-12) return;

  display.traverse((node) => {
    if (node instanceof THREE.Mesh && !(node instanceof THREE.SkinnedMesh)) {
      node.geometry.translate(xShift, yShift, zShift);
      node.geometry.computeBoundingBox();
      node.geometry.computeBoundingSphere();
    }
  });

  display.updateMatrixWorld(true);
}

function bakeMeshGeometryToWorld(node: THREE.Mesh): THREE.BufferGeometry {
  const geometry = node.geometry.clone();

  if (node instanceof THREE.SkinnedMesh) {
    node.skeleton.update();
    const position = node.geometry.getAttribute("position");
    const bakedPositions = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      _skinnedVertex.fromBufferAttribute(position, i);
      node.applyBoneTransform(i, _skinnedVertex);
      _skinnedVertex.applyMatrix4(node.matrixWorld);
      bakedPositions[i * 3] = _skinnedVertex.x;
      bakedPositions[i * 3 + 1] = _skinnedVertex.y;
      bakedPositions[i * 3 + 2] = _skinnedVertex.z;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(bakedPositions, 3));
    geometry.deleteAttribute("skinIndex");
    geometry.deleteAttribute("skinWeight");
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
  }

  geometry.applyMatrix4(node.matrixWorld);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Collada imports often bake transforms into Object3D.matrix with matrixAutoUpdate
 * disabled. Parent motion then does not move the visible mesh.
 */
export function normalizeImportedDaeHierarchy(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);

  root.traverse((node) => {
    node.matrixAutoUpdate = true;
  });

  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrix();

  root.traverse((node) => {
    if (node === root) return;
    const parent = node.parent;
    if (!parent) return;

    parent.updateWorldMatrix(true, false);
    _parentWorldInverse.copy(parent.matrixWorld).invert();
    _localMatrix.copy(node.matrixWorld).premultiply(_parentWorldInverse);
    _localMatrix.decompose(node.position, node.quaternion, node.scale);
    node.matrix.identity();
    node.matrixAutoUpdate = true;
  });

  root.updateMatrixWorld(true);
}

/**
 * Build a display root whose rigid meshes respond to transform on this node only.
 * Bakes each mesh world matrix into geometry so gizmo / property-panel transforms apply.
 */
export function buildImportedDaeDisplayRoot(source: THREE.Object3D): THREE.Group {
  source.updateMatrixWorld(true);

  const display = new THREE.Group();
  display.name = source.name ? `${source.name}_display` : "dae_display";

  source.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) {
      return;
    }

    node.updateMatrixWorld(true);
    const geometry = bakeMeshGeometryToWorld(node);

    const baked = new THREE.Mesh(geometry, cloneMaterial(node.material));
    baked.name = node.name;
    baked.castShadow = node.castShadow;
    baked.receiveShadow = node.receiveShadow;
    display.add(baked);
  });

  display.updateMatrixWorld(true);
  normalizeToGroundPlane(display);
  return display;
}
