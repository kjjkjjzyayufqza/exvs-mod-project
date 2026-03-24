import type { Object3D, PerspectiveCamera } from "three";
import { Box3, Sphere, Vector3 } from "three";
import type { OrbitControls } from "three-stdlib";

const DEFAULT_MARGIN = 1.35;
const MIN_RADIUS = 1e-4;

/**
 * Frames a perspective camera and orbit controls to fit `root` in view.
 * Does nothing if `root` has no measurable bounds.
 */
export function fitCameraToObject(
  root: Object3D,
  camera: PerspectiveCamera,
  controls: OrbitControls,
  margin = DEFAULT_MARGIN,
): void {
  const box = new Box3().setFromObject(root);
  if (!box.isEmpty()) {
    const sphere = new Sphere();
    box.getBoundingSphere(sphere);
    const center = sphere.center.clone();
    const radius = Math.max(sphere.radius, MIN_RADIUS);

    const vFov = (camera.fov * Math.PI) / 180;
    const dist = (radius * margin) / Math.sin(vFov / 2);

    const viewDir = new Vector3(0.55, 0.38, 0.74).normalize();
    const offset = viewDir.multiplyScalar(dist);

    camera.position.copy(center.clone().add(offset));
    camera.near = Math.max(radius / 64, 0.02);
    camera.far = 5e6;
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
    return;
  }

  const center = new Vector3(0, 0, 0);
  camera.position.set(2.4, 1.6, 2.8);
  camera.near = 0.02;
  camera.far = 5e6;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}
