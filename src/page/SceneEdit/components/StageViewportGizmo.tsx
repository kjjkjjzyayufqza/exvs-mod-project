import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ViewportGizmo } from "three-viewport-gizmo";
import type { OrbitControls as ThreeOrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type { RefObject } from "react";

const SCENE_VIEWPORT_GIZMO_OPTIONS = {
  placement: "bottom-right" as const,
  offset: { right: 72, bottom: 72 },
  type: "sphere" as const,
  x: { color: "#f87171", labelColor: "#ffffff" },
  y: { color: "#4ade80", labelColor: "#ffffff" },
  z: { color: "#60a5fa", labelColor: "#ffffff" },
};

function isViewportCamera(
  camera: THREE.Camera,
): camera is THREE.PerspectiveCamera | THREE.OrthographicCamera {
  return camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera;
}

export function StageViewportGizmo({
  controlsRef,
  enabled,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  enabled: boolean;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const gizmoRef = useRef<ViewportGizmo | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!isViewportCamera(camera)) return undefined;

    const container = gl.domElement.parentElement ?? gl.domElement;
    const gizmo = new ViewportGizmo(camera, gl, {
      ...SCENE_VIEWPORT_GIZMO_OPTIONS,
      container,
    });
    gizmoRef.current = gizmo;

    const requestRepaint = () => invalidate();
    gizmo.addEventListener("change", requestRepaint);
    gizmo.addEventListener("start", requestRepaint);
    gizmo.addEventListener("end", requestRepaint);
    invalidate();

    return () => {
      gizmo.removeEventListener("change", requestRepaint);
      gizmo.removeEventListener("start", requestRepaint);
      gizmo.removeEventListener("end", requestRepaint);
      gizmo.dispose();
      gizmoRef.current = null;
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return undefined;

    let cancelled = false;
    const attach = () => {
      const controls = controlsRef.current;
      if (!controls) return false;
      gizmo.attachControls(controls as unknown as ThreeOrbitControls);
      return true;
    };

    if (attach()) return undefined;

    const poll = () => {
      if (cancelled || attach()) return;
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);

    return () => {
      cancelled = true;
    };
  }, [controlsRef]);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    gizmo.enabled = enabled;
    if (enabled) {
      gizmo.update();
      invalidate();
    }
  }, [enabled, invalidate]);

  useEffect(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo) return;
    gizmo.update();
    invalidate();
  }, [size.width, size.height, invalidate]);

  useFrame(() => {
    const gizmo = gizmoRef.current;
    if (!gizmo || !enabledRef.current || !gizmo.enabled) return;
    gizmo.render();
    if (gizmo.animating) {
      invalidate();
    }
  });

  return null;
}
