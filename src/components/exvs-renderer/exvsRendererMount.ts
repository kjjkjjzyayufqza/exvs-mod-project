/** Positive useFrame priority is what makes react-three-fiber skip its own gl.render. */
export const EXVS_TAKE_OVER_PRIORITY = 1;

/**
 * The first Canvas commit can run before the drawing buffer exists. A failed
 * build has to be tried again on a later frame; caching that failure leaves the
 * dropdown on EXVS2 deferred while every later frame is still the standard renderer.
 */
export const EXVS_PIPELINE_BUILD_ATTEMPTS = 8;

const MIN_DRAWING_BUFFER_EDGE = 2;

export function isExvsDrawingBufferReady(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width >= MIN_DRAWING_BUFFER_EDGE &&
    height >= MIN_DRAWING_BUFFER_EDGE
  );
}

/** Priority 0 leaves react-three-fiber drawing. Takeover starts only once a pipeline exists. */
export function exvsTakeOverPriority(pipelineReady: boolean): number {
  return pipelineReady ? EXVS_TAKE_OVER_PRIORITY : 0;
}

/** `attempt` is zero-based. A successful build does not schedule another one. */
export function exvsPipelineBuildShouldRetry(attempt: number, built: boolean): boolean {
  if (built) return false;
  return attempt + 1 < EXVS_PIPELINE_BUILD_ATTEMPTS;
}
