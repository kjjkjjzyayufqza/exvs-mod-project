/**
 * Mounts the EXVS2 deferred pipeline inside a react-three-fiber canvas.
 *
 * Rendering is taken over with a positive `useFrame` priority, which is how
 * react-three-fiber hands the frame to a custom renderer. The pipeline is built
 * after commit and retried until the drawing buffer is real: constructing it
 * during render caches a one-time failure for the life of `gl`, and a priority-1
 * callback that then falls back to `gl.render` keeps painting the standard
 * pipeline while the dropdown already says deferred. Until a pipeline exists
 * this component does not take the frame, so the canvas keeps its own loop.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";

import {
  ExvsRenderPipeline,
  createEmptyExvsSceneTextures,
  type ExvsSceneTextures,
} from "./ExvsRenderPipeline";
import type { ExvsRenderSettings } from "./exvsRenderSettings";
import {
  exvsPipelineBuildShouldRetry,
  exvsTakeOverPriority,
  isExvsDrawingBufferReady,
} from "./exvsRendererMount";

export type ExvsRendererProps = {
  /** Overrides merged over the shipped defaults. */
  settings?: Partial<ExvsRenderSettings>;
  /** Stage-authored inputs. Anything left out disables the pass that reads it. */
  sceneTextures?: Partial<ExvsSceneTextures>;
  /** Reported once if the context cannot run the pipeline. */
  onUnsupported?: (error: Error) => void;
};

export function ExvsRenderer({ settings, sceneTextures, onUnsupported }: ExvsRendererProps) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const pipelineRef = useRef<ExvsRenderPipeline | null>(null);
  const [pipeline, setPipeline] = useState<ExvsRenderPipeline | null>(null);
  const [attempt, setAttempt] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sceneTexturesRef = useRef(sceneTextures);
  sceneTexturesRef.current = sceneTextures;
  const onUnsupportedRef = useRef(onUnsupported);
  onUnsupportedRef.current = onUnsupported;
  const reportedRef = useRef(false);
  const glIdentityRef = useRef(gl);
  if (glIdentityRef.current !== gl) {
    glIdentityRef.current = gl;
    reportedRef.current = false;
    setAttempt(0);
  }

  useLayoutEffect(() => {
    if (pipelineRef.current) return;

    const drawing = gl.domElement;
    let built: ExvsRenderPipeline | null = null;
    let failure: Error | null = null;
    if (isExvsDrawingBufferReady(drawing.width, drawing.height)) {
      try {
        built = new ExvsRenderPipeline(gl, settingsRef.current);
        built.sceneTextures = {
          ...createEmptyExvsSceneTextures(),
          ...sceneTexturesRef.current,
        };
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (built) {
      const created = built;
      pipelineRef.current = created;
      setPipeline(created);
      return () => {
        created.dispose();
        if (pipelineRef.current === created) pipelineRef.current = null;
        setPipeline(null);
      };
    }

    if (attempt === 0) reportedRef.current = false;
    if (exvsPipelineBuildShouldRetry(attempt, false)) {
      const handle = requestAnimationFrame(() => {
        setAttempt((current) => current + 1);
      });
      return () => cancelAnimationFrame(handle);
    }

    if (!reportedRef.current) {
      reportedRef.current = true;
      onUnsupportedRef.current?.(
        failure ??
          new Error("ExvsRenderPipeline: the drawing buffer was not ready"),
      );
    }
    return undefined;
  }, [gl, attempt]);

  useLayoutEffect(() => {
    if (!pipeline) return;
    invalidate();
  }, [pipeline, invalidate, size.width, size.height]);

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
    if (!active) return;
    active.render(state.scene, state.camera as PerspectiveCamera);
  }, exvsTakeOverPriority(pipeline !== null));

  return null;
}
