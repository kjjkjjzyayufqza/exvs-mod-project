import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createLatestAnimationFrameScheduler,
  reduceEfxbnTransport,
  type EfxbnTransportState,
} from "./efxbnProgressScrub";

describe("createLatestAnimationFrameScheduler", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only the latest value and flushes it once per animation frame", () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const index = id - 1;
      if (index >= 0 && index < frames.length) frames[index] = () => undefined;
    });

    const flush = vi.fn();
    const scheduler = createLatestAnimationFrameScheduler(flush);
    scheduler.schedule(10);
    scheduler.schedule(40);
    scheduler.schedule(72.5);

    expect(flush).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames[0]!(0);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(72.5);
  });
});

describe("reduceEfxbnTransport", () => {
  const idle: EfxbnTransportState = { progress: 0, playing: true, scrubbing: false };

  it("resumes playback from the scrubbed frame when play is pressed after a drag", () => {
    let state = reduceEfxbnTransport(idle, { type: "scrubStart" });
    state = reduceEfxbnTransport(state, { type: "scrubTo", progress: 55 });
    state = reduceEfxbnTransport(state, { type: "scrubEnd", progress: 55 });
    expect(state).toEqual({ progress: 55, playing: false, scrubbing: false });
    state = reduceEfxbnTransport(state, { type: "togglePlay" });
    expect(state).toEqual({ progress: 55, playing: true, scrubbing: false });
    state = reduceEfxbnTransport(state, { type: "setProgress", progress: 60 });
    expect(state.playing).toBe(true);
    expect(state.progress).toBe(60);
  });
});
