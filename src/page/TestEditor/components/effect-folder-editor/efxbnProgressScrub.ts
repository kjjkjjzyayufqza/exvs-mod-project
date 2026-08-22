/** Coalesce pointer-move progress writes so React sees at most one value per frame. */
export function createLatestAnimationFrameScheduler<T>(flush: (value: T) => void) {
  let frameId: number | null = null;
  let latest: T | undefined;
  let pending = false;

  const run = () => {
    frameId = null;
    if (!pending) return;
    pending = false;
    flush(latest as T);
  };

  return {
    schedule(value: T) {
      latest = value;
      pending = true;
      if (frameId !== null) return;
      frameId = requestAnimationFrame(run);
    },
    cancel() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      pending = false;
    },
    flushNow() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      if (!pending) return;
      pending = false;
      flush(latest as T);
    },
  };
}

export type EfxbnTransportState = {
  progress: number;
  playing: boolean;
  scrubbing: boolean;
};

export type EfxbnTransportAction =
  | { type: "scrubStart" }
  | { type: "scrubTo"; progress: number }
  | { type: "scrubEnd"; progress: number }
  | { type: "togglePlay" }
  | { type: "setProgress"; progress: number }
  | { type: "reset" }
  | { type: "load"; autoPlay: boolean };

export function reduceEfxbnTransport(
  state: EfxbnTransportState,
  action: EfxbnTransportAction,
): EfxbnTransportState {
  switch (action.type) {
    case "scrubStart":
      return { ...state, playing: false, scrubbing: true };
    case "scrubTo":
      return { ...state, progress: action.progress };
    case "scrubEnd":
      return { ...state, progress: action.progress, scrubbing: false };
    case "togglePlay":
      return { ...state, playing: !state.playing, scrubbing: false };
    case "setProgress":
      return { ...state, progress: action.progress };
    case "reset":
      return { ...state, progress: 0, playing: false, scrubbing: false };
    case "load":
      return { progress: 0, playing: action.autoPlay, scrubbing: false };
  }
}
