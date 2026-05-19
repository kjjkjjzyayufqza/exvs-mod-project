import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  type RefObject,
} from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { UnrealTransformGizmo } from "./gizmo/UnrealTransformGizmo";

export type SceneTransformControlsMode = "translate" | "rotate" | "scale";

interface SceneTransformControlsProps {
  object: THREE.Object3D | RefObject<THREE.Object3D | null>;
  mode: SceneTransformControlsMode;
  space?: "world" | "local";
  size?: number;
  showX?: boolean;
  showY?: boolean;
  showZ?: boolean;
  onChange?: () => void;
  onObjectChange?: () => void;
  onMouseDown?: () => void;
  onMouseUp?: () => void;
}

function resolveObject(
  object: THREE.Object3D | RefObject<THREE.Object3D | null>,
): THREE.Object3D | null {
  if (object instanceof THREE.Object3D) return object;
  return object.current;
}

export const SceneTransformControls = forwardRef<UnrealTransformGizmo, SceneTransformControlsProps>(
  function SceneTransformControls(
    {
      object,
      mode,
      space = "world",
      size = 1,
      showX = true,
      showY = true,
      showZ = true,
      onChange,
      onObjectChange,
      onMouseDown,
      onMouseUp,
    },
    ref,
  ) {
    const camera = useThree((state) => state.camera);
    const gl = useThree((state) => state.gl);
    const invalidate = useThree((state) => state.invalidate);
    const defaultControls = useThree((state) => state.controls) as unknown as { enabled: boolean } | null;

    const gizmo = useMemo(
      () => new UnrealTransformGizmo(camera, gl.domElement),
      [camera, gl.domElement],
    );

    useImperativeHandle(ref, () => gizmo, [gizmo]);

    const attachTarget = resolveObject(object);

    useLayoutEffect(() => {
      if (!attachTarget) return;
      gizmo.attach(attachTarget);
      invalidate();
      return () => {
        gizmo.detach();
        invalidate();
      };
    }, [attachTarget, gizmo, invalidate]);

    useEffect(() => {
      gizmo.setMode(mode);
      gizmo.setSpace(space);
      gizmo.setSize(size);
      gizmo.showX = showX;
      gizmo.showY = showY;
      gizmo.showZ = showZ;
      invalidate();
    }, [gizmo, invalidate, mode, showX, showY, showZ, size, space]);

    useEffect(() => {
      const handleChange = () => {
        onChange?.();
        invalidate();
      };
      const handleObjectChange = () => onObjectChange?.();
      const handleMouseDown = () => onMouseDown?.();
      const handleMouseUp = () => onMouseUp?.();
      const handleDraggingChanged = (e: { value: boolean }) => {
        if (defaultControls) defaultControls.enabled = !e.value;
      };

      gizmo.addEventListener("change", handleChange);
      gizmo.addEventListener("objectChange", handleObjectChange);
      gizmo.addEventListener("mouseDown", handleMouseDown);
      gizmo.addEventListener("mouseUp", handleMouseUp);
      gizmo.addEventListener("dragging-changed", handleDraggingChanged);

      return () => {
        gizmo.removeEventListener("change", handleChange);
        gizmo.removeEventListener("objectChange", handleObjectChange);
        gizmo.removeEventListener("mouseDown", handleMouseDown);
        gizmo.removeEventListener("mouseUp", handleMouseUp);
        gizmo.removeEventListener("dragging-changed", handleDraggingChanged);
        if (defaultControls) defaultControls.enabled = true;
      };
    }, [gizmo, defaultControls, invalidate, onChange, onMouseDown, onMouseUp, onObjectChange]);

    useEffect(() => () => gizmo.dispose(), [gizmo]);

    return <primitive object={gizmo} />;
  },
);
