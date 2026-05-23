import { useCallback, useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { MOUSE } from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import type { RefObject } from "react";

function applyUnrealMouseBindings(controls: OrbitControlsType, altDown: boolean) {
  controls.mouseButtons.LEFT = altDown ? MOUSE.ROTATE : (null as unknown as MOUSE);
  controls.mouseButtons.MIDDLE = MOUSE.PAN;
  controls.mouseButtons.RIGHT = MOUSE.ROTATE;
}

export function StageOrbitControls({
  controlsRef,
  orbitActiveRef,
  rightMouseDownRef,
}: {
  controlsRef: RefObject<OrbitControlsType | null>;
  orbitActiveRef?: RefObject<boolean>;
  rightMouseDownRef: RefObject<boolean>;
}) {
  const { gl, invalidate, performance } = useThree();
  const regress = performance.regress;
  const flyKeysRef = useRef({
    w: false,
    a: false,
    s: false,
    d: false,
    q: false,
    e: false,
  });

  const onGestureStart = useCallback(() => {
    if (orbitActiveRef) orbitActiveRef.current = true;
    regress();
    invalidate();
  }, [invalidate, orbitActiveRef, regress]);

  const onGestureEnd = useCallback(() => {
    setTimeout(() => {
      if (orbitActiveRef) orbitActiveRef.current = false;
    }, 80);
  }, [orbitActiveRef]);

  const onDemandFrame = useCallback(() => {
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    applyUnrealMouseBindings(controls, false);
  }, [controlsRef]);

  useEffect(() => {
    const applyForAlt = (altDown: boolean) => {
      const controls = controlsRef.current;
      if (!controls) return;
      applyUnrealMouseBindings(controls, altDown);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") applyForAlt(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") applyForAlt(false);
    };
    const onBlur = () => applyForAlt(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [controlsRef]);

  useEffect(() => {
    const canvas = gl.domElement;

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) rightMouseDownRef.current = true;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.button === 2) rightMouseDownRef.current = false;
    };
    const onBlur = () => {
      rightMouseDownRef.current = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onBlur);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onBlur);
      rightMouseDownRef.current = false;
    };
  }, [gl.domElement, rightMouseDownRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (!rightMouseDownRef.current) return;
      switch (event.key.toLowerCase()) {
        case "w":
          flyKeysRef.current.w = true;
          break;
        case "a":
          flyKeysRef.current.a = true;
          break;
        case "s":
          flyKeysRef.current.s = true;
          break;
        case "d":
          flyKeysRef.current.d = true;
          break;
        case "q":
          flyKeysRef.current.q = true;
          break;
        case "e":
          flyKeysRef.current.e = true;
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.key.toLowerCase()) {
        case "w":
          flyKeysRef.current.w = false;
          break;
        case "a":
          flyKeysRef.current.a = false;
          break;
        case "s":
          flyKeysRef.current.s = false;
          break;
        case "d":
          flyKeysRef.current.d = false;
          break;
        case "q":
          flyKeysRef.current.q = false;
          break;
        case "e":
          flyKeysRef.current.e = false;
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [rightMouseDownRef]);

  useFrame((_, delta) => {
    if (!rightMouseDownRef.current) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const keys = flyKeysRef.current;
    const moveAmount = 12 * delta;
    const camera = controls.object;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const movement = new THREE.Vector3();

    if (keys.w) movement.add(forward);
    if (keys.s) movement.sub(forward);
    if (keys.d) movement.add(right);
    if (keys.a) movement.sub(right);
    if (keys.e) movement.y += 1;
    if (keys.q) movement.y -= 1;

    if (movement.lengthSq() === 0) return;
    movement.normalize().multiplyScalar(moveAmount);

    camera.position.add(movement);
    controls.target.add(movement);
    controls.update();
    invalidate();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={0.08}
      maxDistance={5e6}
      enableDamping
      dampingFactor={0.06}
      screenSpacePanning
      zoomSpeed={0.85}
      rotateSpeed={0.65}
      panSpeed={0.65}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI - 0.05}
      onStart={onGestureStart}
      onEnd={onGestureEnd}
      onChange={onDemandFrame}
      mouseButtons={{
        LEFT: null as unknown as MOUSE,
        MIDDLE: MOUSE.PAN,
        RIGHT: MOUSE.ROTATE,
      }}
    />
  );
}
