/**
 * Mounts the EXVS2 deferred pipeline inside a react-three-fiber canvas.
 *
 * Rendering is taken over with a positive `useFrame` priority, which is how
 * react-three-fiber hands the frame to a custom renderer. When the context
 * cannot support the pipeline the component reports it and renders nothing, so
 * the canvas keeps drawing with react-three-fiber's own loop instead of going
 * black.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";

import {
  ExvsRenderPipeline,
  createEmptyExvsSceneTextures,
  type ExvsSceneTextures,
} from "./ExvsRenderPipeline";
import type { ExvsRenderSettings } from "./exvsRenderSettings";

export type ExvsRendererProps = {
  /** Overrides merged over the shipped defaults. */
  settings?: Partial<ExvsRenderSettings>;
  /** Stage-authored inputs. Anything left out disables the pass that reads it. */
  sceneTextures?: Partial<ExvsSceneTextures>;
  /** Reported once if the context cannot run the pipeline. */
  onUnsupported?: (error: Error) => void;
};

/** Priority above zero tells react-three-fiber to stop rendering the scene itself. */
const TAKE_OVER_PRIORITY = 1;

export function ExvsRenderer({ settings, sceneTextures, onUnsupported }: ExvsRendererProps) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const pipelineRef = useRef<ExvsRenderPipeline | null>(null);
  const unsupportedRef = useRef(false);

  const pipeline = useMemo(() => {
    try {
      return new ExvsRenderPipeline(gl, settings);
    } catch (error) {
      unsupportedRef.current = true;
      onUnsupported?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
    // The pipeline owns GPU resources; rebuilding it on a settings change would
    // reallocate every target, so settings are pushed onto the live instance below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    pipelineRef.current = pipeline;
    return () => {
      pipeline?.dispose();
      pipelineRef.current = null;
    };
  }, [pipeline]);

  useEffect(() => {
    if (!pipeline || !settings) return;
    pipeline.settings = { ...pipeline.settings, ...settings };
  }, [pipeline, settings]);

  useEffect(() => {
    if (!pipeline) return;
    pipeline.sceneTextures = { ...createEmptyExvsSceneTextures(), ...sceneTextures };
  }, [pipeline, sceneTextures]);

  useEffect(() => {
    if (!pipeline) return;
    const ratio = gl.getPixelRatio();
    pipeline.setSize(Math.round(size.width * ratio), Math.round(size.height * ratio));
  }, [pipeline, gl, size.width, size.height]);

  useFrame((state) => {
    const active = pipelineRef.current;
    if (!active) {
      // No pipeline: draw the way react-three-fiber would have, so taking the
      // priority does not leave the canvas empty.
      state.gl.render(state.scene, state.camera);
      return;
    }
    active.render(state.scene, state.camera as PerspectiveCamera);
  }, TAKE_OVER_PRIORITY);

  return null;
}
