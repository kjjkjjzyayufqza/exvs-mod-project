import { describe, expect, test } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";

import {
  computeExvsPartitionIntervals,
  fitExvsShadowPartitions,
} from "./exvsSdsmPartitions";
import { createDefaultExvsRenderSettings } from "./exvsRenderSettings";
import { EXVS_SHADOW_PARTITION_COUNT } from "./shaders/exvsShadowShader";

describe("computeExvsPartitionIntervals", () => {
  test("produces one interval per shadow partition", () => {
    const intervals = computeExvsPartitionIntervals(1, 100, 0.1, 1000);
    expect(intervals).toHaveLength(EXVS_SHADOW_PARTITION_COUNT);
  });

  test("anchors the first interval at the near clip and the last at the far clip", () => {
    // The shipped split dispatch pins both ends whatever the measured range was,
    // so nothing in front of the nearest lit sample falls outside the cascades.
    const intervals = computeExvsPartitionIntervals(5, 80, 0.25, 900);
    expect(intervals[0].begin).toBe(0.25);
    expect(intervals[intervals.length - 1].end).toBe(900);
  });

  test("splits the measured range logarithmically", () => {
    // Arrange
    const minDepth = 2;
    const maxDepth = 32;

    // Act
    const intervals = computeExvsPartitionIntervals(minDepth, maxDepth, 0.1, 1000);

    // Assert — successive interior cuts differ by a constant ratio.
    const cuts = intervals.slice(0, -1).map((interval) => interval.end);
    const ratios = cuts.slice(1).map((cut, i) => cut / cuts[i]);
    for (const ratio of ratios) expect(ratio).toBeCloseTo(ratios[0], 5);
  });

  test("leaves the intervals contiguous", () => {
    const intervals = computeExvsPartitionIntervals(3, 60, 0.1, 500);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i].begin).toBeCloseTo(intervals[i - 1].end, 5);
    }
  });

  test("survives a degenerate measured range", () => {
    // A frame where the reduction found a single depth, or none at all.
    const intervals = computeExvsPartitionIntervals(10, 10, 0.1, 400);
    expect(intervals).toHaveLength(EXVS_SHADOW_PARTITION_COUNT);
    for (const interval of intervals) {
      expect(Number.isFinite(interval.begin)).toBe(true);
      expect(Number.isFinite(interval.end)).toBe(true);
      expect(interval.end).toBeGreaterThan(interval.begin);
    }
  });
});

describe("fitExvsShadowPartitions", () => {
  function makeCamera(): PerspectiveCamera {
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 500);
    camera.position.set(0, 10, 30);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    return camera;
  }

  test("returns a scale and bias per partition", () => {
    // Arrange
    const camera = makeCamera();
    const settings = createDefaultExvsRenderSettings().sdsm;

    // Act
    const fit = fitExvsShadowPartitions(camera, new Vector3(0.3, 1, 0.2), 2, 120, settings);

    // Assert
    expect(fit.partitions).toHaveLength(EXVS_SHADOW_PARTITION_COUNT);
    for (const partition of fit.partitions) {
      expect(Number.isFinite(partition.scale.x)).toBe(true);
      expect(Number.isFinite(partition.bias.x)).toBe(true);
      expect(partition.intervalEnd).toBeGreaterThan(partition.intervalBegin);
    }
  });

  test("maps every corner of a partition into the unit square it owns", () => {
    // The atlas lookup reads `lightUvz * scale + bias` and expects [0,1]; a corner
    // landing outside would wrap into a neighbouring tile through the fract.
    const camera = makeCamera();
    const settings = createDefaultExvsRenderSettings().sdsm;
    const fit = fitExvsShadowPartitions(camera, new Vector3(0.3, 1, 0.2), 2, 120, settings);

    const tanHalfFov = Math.tan(((camera.fov * Math.PI) / 180) * 0.5);
    for (const partition of fit.partitions) {
      for (const depth of [partition.intervalBegin, partition.intervalEnd]) {
        const halfHeight = tanHalfFov * depth;
        const halfWidth = halfHeight * camera.aspect;
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          const clip = new Vector3(sx * halfWidth, sy * halfHeight, -depth).applyMatrix4(
            fit.viewToLightProjection,
          );
          const uvz = clip.multiplyScalar(0.5).addScalar(0.5);
          const scaled = new Vector3(
            uvz.x * partition.scale.x + partition.bias.x,
            uvz.y * partition.scale.y + partition.bias.y,
            uvz.z * partition.scale.z + partition.bias.z,
          );
          expect(scaled.x).toBeGreaterThanOrEqual(-1e-3);
          expect(scaled.x).toBeLessThanOrEqual(1 + 1e-3);
          expect(scaled.y).toBeGreaterThanOrEqual(-1e-3);
          expect(scaled.y).toBeLessThanOrEqual(1 + 1e-3);
        }
      }
    }
  });

  test("covers the shadow range, not the camera's far plane", () => {
    // Both viewports run a far plane five million units out. Stretching four
    // partitions across that leaves no depth precision, every receiver shadows
    // itself, and the directional light reads as switched off.
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 5_000_000);
    camera.position.set(300, 300, 300);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const settings = createDefaultExvsRenderSettings().sdsm;

    const fit = fitExvsShadowPartitions(camera, new Vector3(0.3, 1, 0.2), 0, 0, settings);

    const last = fit.partitions[fit.partitions.length - 1];
    expect(last.intervalEnd).toBeLessThanOrEqual(settings.shadowFar);
    expect(fit.partitions[0].intervalBegin).toBeGreaterThanOrEqual(settings.shadowNear);
  });

  test("never lets the shadow range exceed the camera's own clip range", () => {
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 50);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();

    const settings = createDefaultExvsRenderSettings().sdsm;
    const fit = fitExvsShadowPartitions(camera, new Vector3(0, 1, 0), 2, 40, settings);

    expect(fit.partitions[fit.partitions.length - 1].intervalEnd).toBeLessThanOrEqual(camera.far);
  });

  test("keeps a straight-down light from collapsing the light basis", () => {
    // lookAt with an up vector parallel to the direction has no defined rotation,
    // so the fit picks a different up in that case.
    const camera = makeCamera();
    const settings = createDefaultExvsRenderSettings().sdsm;

    const fit = fitExvsShadowPartitions(camera, new Vector3(0, 1, 0), 2, 120, settings);

    for (const element of fit.viewToLightProjection.elements) {
      expect(Number.isFinite(element)).toBe(true);
    }
  });
});
