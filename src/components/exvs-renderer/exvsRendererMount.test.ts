import { describe, expect, test } from "vitest";

import {
  EXVS_PIPELINE_BUILD_ATTEMPTS,
  EXVS_TAKE_OVER_PRIORITY,
  exvsPipelineBuildShouldRetry,
  exvsTakeOverPriority,
  isExvsDrawingBufferReady,
} from "./exvsRendererMount";

describe("exvs renderer mount", () => {
  test("a collapsed drawing buffer is not ready to allocate targets", () => {
    expect(isExvsDrawingBufferReady(0, 0)).toBe(false);
    expect(isExvsDrawingBufferReady(1, 400)).toBe(false);
    expect(isExvsDrawingBufferReady(800, 600)).toBe(true);
  });

  test("takeover waits until a pipeline exists so a failed first build cannot freeze the standard frame", () => {
    expect(exvsTakeOverPriority(false)).toBe(0);
    expect(exvsTakeOverPriority(true)).toBe(EXVS_TAKE_OVER_PRIORITY);
  });

  test("a failed build is retried and then reported instead of being cached for the life of the renderer", () => {
    expect(exvsPipelineBuildShouldRetry(0, false)).toBe(true);
    expect(exvsPipelineBuildShouldRetry(EXVS_PIPELINE_BUILD_ATTEMPTS - 2, false)).toBe(true);
    expect(exvsPipelineBuildShouldRetry(EXVS_PIPELINE_BUILD_ATTEMPTS - 1, false)).toBe(false);
    expect(exvsPipelineBuildShouldRetry(0, true)).toBe(false);
  });
});
