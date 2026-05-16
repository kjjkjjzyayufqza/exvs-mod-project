import * as THREE from "three";
import { AXIS_VECTORS, PLANE_NORMALS, type AxisId } from "./gizmoConstants";

const _ray = new THREE.Ray();
const _plane = new THREE.Plane();
const _intersection = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _tempVec = new THREE.Vector3();
const _startPoint = new THREE.Vector3();
const _endPoint = new THREE.Vector3();
const _worldQuatInverse = new THREE.Quaternion();
const _tempQuat = new THREE.Quaternion();

export interface DragState {
  axis: AxisId;
  constraintPlane: THREE.Plane;
  startPoint: THREE.Vector3;
  startTargetPosition: THREE.Vector3;
  startTargetQuaternion: THREE.Quaternion;
  startTargetScale: THREE.Vector3;
  startAngle: number;
}

export function computeConstraintPlane(
  axis: AxisId,
  gizmoPosition: THREE.Vector3,
  cameraDirection: THREE.Vector3,
  targetQuaternion: THREE.Quaternion,
  space: "world" | "local",
): THREE.Plane {
  const plane = new THREE.Plane();

  if (axis === "XY" || axis === "XZ" || axis === "YZ") {
    let normal = PLANE_NORMALS[axis].clone();
    if (space === "local") {
      normal.applyQuaternion(targetQuaternion);
    }
    plane.setFromNormalAndCoplanarPoint(normal, gizmoPosition);
    return plane;
  }

  if (axis === "XYZ" || axis === "screen") {
    plane.setFromNormalAndCoplanarPoint(
      cameraDirection.clone().negate(),
      gizmoPosition,
    );
    return plane;
  }

  let axisVec = AXIS_VECTORS[axis as "X" | "Y" | "Z"].clone();
  if (space === "local") {
    axisVec.applyQuaternion(targetQuaternion);
  }

  const camPerp = _tempVec.copy(cameraDirection).cross(axisVec).normalize();
  const planeNormal = camPerp.clone().cross(axisVec).normalize();
  plane.setFromNormalAndCoplanarPoint(planeNormal, gizmoPosition);

  return plane;
}

export function computeRotationPlane(
  axis: AxisId,
  gizmoPosition: THREE.Vector3,
  cameraDirection: THREE.Vector3,
  targetQuaternion: THREE.Quaternion,
  space: "world" | "local",
): THREE.Plane {
  const plane = new THREE.Plane();

  if (axis === "screen") {
    plane.setFromNormalAndCoplanarPoint(
      cameraDirection.clone().negate(),
      gizmoPosition,
    );
    return plane;
  }

  const axisKey = axis as "X" | "Y" | "Z";
  let normal = AXIS_VECTORS[axisKey].clone();
  if (space === "local") {
    normal.applyQuaternion(targetQuaternion);
  }
  plane.setFromNormalAndCoplanarPoint(normal, gizmoPosition);
  return plane;
}

export function beginDrag(
  axis: AxisId,
  raycaster: THREE.Raycaster,
  gizmoWorldPosition: THREE.Vector3,
  cameraDirection: THREE.Vector3,
  target: THREE.Object3D,
  space: "world" | "local",
  mode: "translate" | "rotate" | "scale",
): DragState | null {
  let constraintPlane: THREE.Plane;

  if (mode === "rotate") {
    constraintPlane = computeRotationPlane(
      axis,
      gizmoWorldPosition,
      cameraDirection,
      target.quaternion,
      space,
    );
  } else {
    constraintPlane = computeConstraintPlane(
      axis,
      gizmoWorldPosition,
      cameraDirection,
      target.quaternion,
      space,
    );
  }

  _ray.copy(raycaster.ray);
  const hit = _ray.intersectPlane(constraintPlane, _intersection);
  if (!hit) return null;

  let startAngle = 0;
  if (mode === "rotate") {
    startAngle = computeAngleOnPlane(
      _intersection,
      gizmoWorldPosition,
      constraintPlane.normal,
    );
  }

  return {
    axis,
    constraintPlane,
    startPoint: _intersection.clone(),
    startTargetPosition: target.position.clone(),
    startTargetQuaternion: target.quaternion.clone(),
    startTargetScale: target.scale.clone(),
    startAngle,
  };
}

export function applyTranslateDrag(
  dragState: DragState,
  raycaster: THREE.Raycaster,
  target: THREE.Object3D,
  space: "world" | "local",
): boolean {
  _ray.copy(raycaster.ray);
  const hit = _ray.intersectPlane(dragState.constraintPlane, _intersection);
  if (!hit) return false;

  _offset.copy(_intersection).sub(dragState.startPoint);

  const axis = dragState.axis;
  if (axis === "X" || axis === "Y" || axis === "Z") {
    let axisVec = AXIS_VECTORS[axis].clone();
    if (space === "local") {
      axisVec.applyQuaternion(dragState.startTargetQuaternion);
    }
    const projected = _offset.dot(axisVec);
    _offset.copy(axisVec).multiplyScalar(projected);
  }

  target.position.copy(dragState.startTargetPosition).add(_offset);
  return true;
}

export function applyRotateDrag(
  dragState: DragState,
  raycaster: THREE.Raycaster,
  target: THREE.Object3D,
  gizmoWorldPosition: THREE.Vector3,
  space: "world" | "local",
): { applied: boolean; sweepAngle: number } {
  _ray.copy(raycaster.ray);
  const hit = _ray.intersectPlane(dragState.constraintPlane, _intersection);
  if (!hit) return { applied: false, sweepAngle: 0 };

  const currentAngle = computeAngleOnPlane(
    _intersection,
    gizmoWorldPosition,
    dragState.constraintPlane.normal,
  );
  const sweepAngle = currentAngle - dragState.startAngle;

  const rotAxis = dragState.constraintPlane.normal.clone();
  _tempQuat.setFromAxisAngle(rotAxis, sweepAngle);

  if (space === "local") {
    _worldQuatInverse.copy(dragState.startTargetQuaternion).invert();
    const localQuat = _worldQuatInverse.clone().multiply(_tempQuat).multiply(dragState.startTargetQuaternion);
    target.quaternion.copy(dragState.startTargetQuaternion).multiply(localQuat);
  } else {
    target.quaternion.copy(_tempQuat).multiply(dragState.startTargetQuaternion);
  }

  return { applied: true, sweepAngle };
}

export function applyScaleDrag(
  dragState: DragState,
  raycaster: THREE.Raycaster,
  target: THREE.Object3D,
  gizmoWorldPosition: THREE.Vector3,
  space: "world" | "local",
): boolean {
  _ray.copy(raycaster.ray);
  const hit = _ray.intersectPlane(dragState.constraintPlane, _intersection);
  if (!hit) return false;

  _startPoint.copy(dragState.startPoint).sub(gizmoWorldPosition);
  _endPoint.copy(_intersection).sub(gizmoWorldPosition);

  const axis = dragState.axis;

  if (axis === "XYZ") {
    const startLen = _startPoint.length();
    if (startLen < 1e-8) return false;
    const factor = _endPoint.length() / startLen;
    const sign = _endPoint.dot(_startPoint) >= 0 ? 1 : -1;
    const sf = Math.max(0.01, factor * sign);
    target.scale.copy(dragState.startTargetScale).multiplyScalar(sf);
    return true;
  }

  if (axis === "X" || axis === "Y" || axis === "Z") {
    let axisVec = AXIS_VECTORS[axis].clone();
    if (space === "local") {
      axisVec.applyQuaternion(dragState.startTargetQuaternion);
    }
    const startProj = _startPoint.dot(axisVec);
    if (Math.abs(startProj) < 1e-8) return false;
    const endProj = _endPoint.dot(axisVec);
    const factor = Math.max(0.01, endProj / startProj);

    target.scale.copy(dragState.startTargetScale);
    if (axis === "X") target.scale.x *= factor;
    else if (axis === "Y") target.scale.y *= factor;
    else target.scale.z *= factor;
    return true;
  }

  if (axis === "XY" || axis === "XZ" || axis === "YZ") {
    const startLen = _startPoint.length();
    if (startLen < 1e-8) return false;
    const factor = Math.max(0.01, _endPoint.length() / startLen);
    const sign = _endPoint.dot(_startPoint) >= 0 ? 1 : -1;
    const sf = Math.max(0.01, factor * sign);

    target.scale.copy(dragState.startTargetScale);
    if (axis === "XY") {
      target.scale.x *= sf;
      target.scale.y *= sf;
    } else if (axis === "XZ") {
      target.scale.x *= sf;
      target.scale.z *= sf;
    } else {
      target.scale.y *= sf;
      target.scale.z *= sf;
    }
    return true;
  }

  return false;
}

function computeAngleOnPlane(
  point: THREE.Vector3,
  center: THREE.Vector3,
  normal: THREE.Vector3,
): number {
  const dir = _tempVec.copy(point).sub(center);

  const basis1 = new THREE.Vector3();
  if (Math.abs(normal.x) < 0.9) {
    basis1.crossVectors(new THREE.Vector3(1, 0, 0), normal).normalize();
  } else {
    basis1.crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
  }
  const basis2 = new THREE.Vector3().crossVectors(normal, basis1).normalize();

  return Math.atan2(dir.dot(basis2), dir.dot(basis1));
}
