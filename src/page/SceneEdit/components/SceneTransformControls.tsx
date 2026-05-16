import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  type RefObject,
} from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TransformControls as TransformControlsImpl } from "three-stdlib";

export type SceneTransformControlsMode = "translate" | "rotate" | "scale";
type SceneTransformControlsEventName = "change" | "objectChange" | "mouseDown" | "mouseUp";
type SceneTransformControlsEventTarget = {
  addEventListener(type: SceneTransformControlsEventName, listener: () => void): void;
  addEventListener(type: "dragging-changed", listener: (e: { value: boolean }) => void): void;
  removeEventListener(type: SceneTransformControlsEventName, listener: () => void): void;
  removeEventListener(type: "dragging-changed", listener: (e: { value: boolean }) => void): void;
};

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

export const SceneTransformControls = forwardRef<TransformControlsImpl, SceneTransformControlsProps>(
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

    const controls = useMemo(
      () => new TransformControlsImpl(camera, gl.domElement),
      [camera, gl.domElement],
    );

    useImperativeHandle(ref, () => controls, [controls]);

    useEffect(() => {
      const target = resolveObject(object);
      if (!target) return;
      controls.attach(target);
      invalidate();
      return () => {
        controls.detach();
        invalidate();
      };
    }, [controls, invalidate, object]);

    useEffect(() => {
      controls.setMode(mode);
      controls.setSpace(space);
      controls.setSize(size);
      const writable = controls as unknown as {
        showX: boolean;
        showY: boolean;
        showZ: boolean;
      };
      writable.showX = showX;
      writable.showY = showY;
      writable.showZ = showZ;
      controls.update();
      invalidate();
    }, [controls, invalidate, mode, showX, showY, showZ, size, space]);

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

      const eventTarget = controls as unknown as SceneTransformControlsEventTarget;
      eventTarget.addEventListener("change", handleChange);
      eventTarget.addEventListener("objectChange", handleObjectChange);
      eventTarget.addEventListener("mouseDown", handleMouseDown);
      eventTarget.addEventListener("mouseUp", handleMouseUp);
      eventTarget.addEventListener("dragging-changed", handleDraggingChanged);

      return () => {
        eventTarget.removeEventListener("change", handleChange);
        eventTarget.removeEventListener("objectChange", handleObjectChange);
        eventTarget.removeEventListener("mouseDown", handleMouseDown);
        eventTarget.removeEventListener("mouseUp", handleMouseUp);
        eventTarget.removeEventListener("dragging-changed", handleDraggingChanged);
        if (defaultControls) defaultControls.enabled = true;
      };
    }, [controls, defaultControls, invalidate, onChange, onMouseDown, onMouseUp, onObjectChange]);

    useEffect(() => () => controls.dispose(), [controls]);

    return <primitive object={controls} />;
  },
);
