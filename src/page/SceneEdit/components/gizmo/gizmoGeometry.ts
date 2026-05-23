import * as THREE from "three";
import {
  ARROW_SHAFT_RADIUS,
  ARROW_SHAFT_LENGTH,
  ARROW_CONE_RADIUS,
  ARROW_CONE_LENGTH,
  PLANE_HANDLE_SIZE,
  PLANE_HANDLE_OFFSET,
  CENTER_SPHERE_RADIUS,
  RING_RADIUS,
  RING_TUBE,
  RING_SEGMENTS,
  SCREEN_RING_RADIUS,
  SCREEN_RING_TUBE,
  SCALE_CUBE_SIZE,
  SCALE_CENTER_CUBE_SIZE,
  PICKER_ARROW_RADIUS,
  PICKER_RING_TUBE,
  PICKER_PLANE_SIZE,
  PICKER_LAYER,
  GIZMO_RENDER_ORDER,
  type AxisId,
} from "./gizmoConstants";
import type { GizmoMaterials } from "./gizmoMaterials";

interface GizmoElement {
  visual: THREE.Object3D;
  picker: THREE.Object3D;
  axisId: AxisId;
}

export interface ModeGeometry {
  elements: GizmoElement[];
}

const HALF_PI = Math.PI / 2;

function makeShaft(radius: number, height: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radius, radius, height, 8, 1);
}

function makeCone(radius: number, height: number): THREE.ConeGeometry {
  return new THREE.ConeGeometry(radius, height, 16, 1);
}

function orientAxisGroup(group: THREE.Group, axis: "X" | "Y" | "Z"): void {
  if (axis === "X") {
    group.rotation.set(0, 0, -HALF_PI);
  } else if (axis === "Z") {
    group.rotation.set(HALF_PI, 0, 0);
  }
}

function createArrow(
  axis: "X" | "Y" | "Z",
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = `arrow-${axis}`;

  const shaftGeo = makeShaft(ARROW_SHAFT_RADIUS, ARROW_SHAFT_LENGTH);
  const shaft = new THREE.Mesh(shaftGeo, material);
  shaft.position.y = ARROW_SHAFT_LENGTH / 2;
  visual.add(shaft);

  const coneGeo = makeCone(ARROW_CONE_RADIUS, ARROW_CONE_LENGTH);
  const cone = new THREE.Mesh(coneGeo, material);
  cone.position.y = ARROW_SHAFT_LENGTH + ARROW_CONE_LENGTH / 2;
  visual.add(cone);

  orientAxisGroup(visual, axis);

  const picker = new THREE.Group();
  picker.name = `picker-arrow-${axis}`;
  const pickerGeo = makeShaft(PICKER_ARROW_RADIUS, ARROW_SHAFT_LENGTH + ARROW_CONE_LENGTH);
  const pickerMesh = new THREE.Mesh(pickerGeo, pickerMaterial);
  pickerMesh.position.y = (ARROW_SHAFT_LENGTH + ARROW_CONE_LENGTH) / 2;
  picker.add(pickerMesh);
  orientAxisGroup(picker, axis);
  setPickerLayer(picker);

  return { visual, picker, axisId: axis };
}

function createPlaneHandle(
  axisId: "XY" | "XZ" | "YZ",
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = `plane-${axisId}`;

  const geo = new THREE.PlaneGeometry(PLANE_HANDLE_SIZE, PLANE_HANDLE_SIZE);
  const mesh = new THREE.Mesh(geo, material);

  const edgeGeo = new THREE.EdgesGeometry(geo);
  const edgeMat = (material as THREE.MeshBasicMaterial).clone();
  edgeMat.transparent = false;
  edgeMat.opacity = 1;
  const edge = new THREE.LineSegments(edgeGeo, edgeMat);
  mesh.add(edge);

  const offset = PLANE_HANDLE_OFFSET;
  if (axisId === "XY") {
    mesh.position.set(offset, offset, 0);
  } else if (axisId === "XZ") {
    mesh.rotation.x = -HALF_PI;
    mesh.position.set(offset, 0, offset);
  } else {
    mesh.rotation.y = HALF_PI;
    mesh.position.set(0, offset, offset);
  }
  visual.add(mesh);

  const picker = new THREE.Group();
  picker.name = `picker-plane-${axisId}`;
  const pickerGeo = new THREE.PlaneGeometry(PICKER_PLANE_SIZE, PICKER_PLANE_SIZE);
  const pickerMesh = new THREE.Mesh(pickerGeo, pickerMaterial);
  pickerMesh.position.copy(mesh.position);
  pickerMesh.rotation.copy(mesh.rotation);
  picker.add(pickerMesh);
  setPickerLayer(picker);

  return { visual, picker, axisId };
}

function createCenterSphere(
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = "center-sphere";
  const geo = new THREE.SphereGeometry(CENTER_SPHERE_RADIUS, 12, 12);
  visual.add(new THREE.Mesh(geo, material));

  const picker = new THREE.Group();
  picker.name = "picker-center";
  const pickerGeo = new THREE.SphereGeometry(CENTER_SPHERE_RADIUS * 1.5, 8, 8);
  picker.add(new THREE.Mesh(pickerGeo, pickerMaterial));
  setPickerLayer(picker);

  return { visual, picker, axisId: "XYZ" };
}

function createRotationRing(
  axis: "X" | "Y" | "Z",
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = `ring-${axis}`;
  const geo = new THREE.TorusGeometry(RING_RADIUS, RING_TUBE, 8, RING_SEGMENTS);
  visual.add(new THREE.Mesh(geo, material));
  orientRingGroup(visual, axis);

  const picker = new THREE.Group();
  picker.name = `picker-ring-${axis}`;
  const pickerGeo = new THREE.TorusGeometry(RING_RADIUS, PICKER_RING_TUBE, 8, RING_SEGMENTS);
  picker.add(new THREE.Mesh(pickerGeo, pickerMaterial));
  orientRingGroup(picker, axis);
  setPickerLayer(picker);

  return { visual, picker, axisId: axis };
}

function orientRingGroup(group: THREE.Group, axis: "X" | "Y" | "Z"): void {
  if (axis === "X") {
    group.rotation.set(0, HALF_PI, 0);
  } else if (axis === "Y") {
    group.rotation.set(HALF_PI, 0, 0);
  }
}

function createScreenRing(
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = "screen-ring";
  const geo = new THREE.TorusGeometry(SCREEN_RING_RADIUS, SCREEN_RING_TUBE, 8, RING_SEGMENTS);
  visual.add(new THREE.Mesh(geo, material));

  const picker = new THREE.Group();
  picker.name = "picker-screen-ring";
  const pickerGeo = new THREE.TorusGeometry(SCREEN_RING_RADIUS, PICKER_RING_TUBE, 8, RING_SEGMENTS);
  picker.add(new THREE.Mesh(pickerGeo, pickerMaterial));
  setPickerLayer(picker);

  return { visual, picker, axisId: "screen" };
}

function createScaleAxis(
  axis: "X" | "Y" | "Z",
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = `scale-${axis}`;

  const shaftGeo = makeShaft(ARROW_SHAFT_RADIUS, ARROW_SHAFT_LENGTH);
  const shaft = new THREE.Mesh(shaftGeo, material);
  shaft.position.y = ARROW_SHAFT_LENGTH / 2;
  visual.add(shaft);

  const cubeGeo = new THREE.BoxGeometry(SCALE_CUBE_SIZE, SCALE_CUBE_SIZE, SCALE_CUBE_SIZE);
  const cube = new THREE.Mesh(cubeGeo, material);
  cube.position.y = ARROW_SHAFT_LENGTH + SCALE_CUBE_SIZE / 2;
  visual.add(cube);

  orientAxisGroup(visual, axis);

  const picker = new THREE.Group();
  picker.name = `picker-scale-${axis}`;
  const pickerGeo = makeShaft(PICKER_ARROW_RADIUS, ARROW_SHAFT_LENGTH + SCALE_CUBE_SIZE);
  const pickerMesh = new THREE.Mesh(pickerGeo, pickerMaterial);
  pickerMesh.position.y = (ARROW_SHAFT_LENGTH + SCALE_CUBE_SIZE) / 2;
  picker.add(pickerMesh);
  orientAxisGroup(picker, axis);
  setPickerLayer(picker);

  return { visual, picker, axisId: axis };
}

function createScaleCenterCube(
  material: THREE.Material,
  pickerMaterial: THREE.Material,
): GizmoElement {
  const visual = new THREE.Group();
  visual.name = "scale-center";
  const geo = new THREE.BoxGeometry(
    SCALE_CENTER_CUBE_SIZE,
    SCALE_CENTER_CUBE_SIZE,
    SCALE_CENTER_CUBE_SIZE,
  );
  visual.add(new THREE.Mesh(geo, material));

  const picker = new THREE.Group();
  picker.name = "picker-scale-center";
  const pickerGeo = new THREE.BoxGeometry(
    SCALE_CENTER_CUBE_SIZE * 1.5,
    SCALE_CENTER_CUBE_SIZE * 1.5,
    SCALE_CENTER_CUBE_SIZE * 1.5,
  );
  picker.add(new THREE.Mesh(pickerGeo, pickerMaterial));
  setPickerLayer(picker);

  return { visual, picker, axisId: "XYZ" };
}

function setPickerLayer(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    child.layers.set(PICKER_LAYER);
  });
}

const PICKER_MAT = new THREE.MeshBasicMaterial({
  depthTest: false,
  depthWrite: false,
  transparent: true,
  opacity: 0,
  side: THREE.DoubleSide,
  colorWrite: false,
});

export function buildTranslateGeometry(materials: GizmoMaterials): ModeGeometry {
  return {
    elements: [
      createArrow("X", materials.axisX.normal, PICKER_MAT),
      createArrow("Y", materials.axisY.normal, PICKER_MAT),
      createArrow("Z", materials.axisZ.normal, PICKER_MAT),
      createPlaneHandle("XY", materials.planeXY.normal, PICKER_MAT),
      createPlaneHandle("XZ", materials.planeXZ.normal, PICKER_MAT),
      createPlaneHandle("YZ", materials.planeYZ.normal, PICKER_MAT),
      createCenterSphere(materials.center.normal, PICKER_MAT),
    ],
  };
}

export function buildRotateGeometry(materials: GizmoMaterials): ModeGeometry {
  const screenMat = new THREE.MeshBasicMaterial({
    color: 0x888888,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
  });
  return {
    elements: [
      createRotationRing("X", materials.axisX.normal, PICKER_MAT),
      createRotationRing("Y", materials.axisY.normal, PICKER_MAT),
      createRotationRing("Z", materials.axisZ.normal, PICKER_MAT),
      createScreenRing(screenMat, PICKER_MAT),
    ],
  };
}

export function buildScaleGeometry(materials: GizmoMaterials): ModeGeometry {
  return {
    elements: [
      createScaleAxis("X", materials.axisX.normal, PICKER_MAT),
      createScaleAxis("Y", materials.axisY.normal, PICKER_MAT),
      createScaleAxis("Z", materials.axisZ.normal, PICKER_MAT),
      createPlaneHandle("XY", materials.planeXY.normal, PICKER_MAT),
      createPlaneHandle("XZ", materials.planeXZ.normal, PICKER_MAT),
      createPlaneHandle("YZ", materials.planeYZ.normal, PICKER_MAT),
      createScaleCenterCube(materials.center.normal, PICKER_MAT),
    ],
  };
}

export function createRotationArcMesh(
  axis: THREE.Vector3,
  startAngle: number,
  sweepAngle: number,
  radius: number,
): THREE.Mesh {
  const segments = Math.max(3, Math.ceil(Math.abs(sweepAngle) / (Math.PI / 32)));
  const geo = new THREE.BufferGeometry();

  const positions: number[] = [0, 0, 0];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + (sweepAngle * i) / segments;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  }

  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const indices: number[] = [];
  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    color: 0xffcd00,
    transparent: true,
    opacity: 0.25,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);

  const up = new THREE.Vector3(0, 0, 1);
  const quat = new THREE.Quaternion().setFromUnitVectors(up, axis.clone().normalize());
  mesh.quaternion.copy(quat);

  mesh.renderOrder = GIZMO_RENDER_ORDER;
  return mesh;
}

export function disposeGeometry(modeGeo: ModeGeometry): void {
  for (const el of modeGeo.elements) {
    el.visual.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
    el.picker.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }
}
