/**
 * Shadow partition fitting.
 *
 * The shipped renderer splits the shadow range with three compute dispatches:
 * `cs-0593BB4DAB0DE410` reduces the depth buffer to the frame's nearest and
 * farthest lit sample, `cs-BB08E59E9F819118` cuts that range into four
 * logarithmic partitions, and `cs-B357508955901E89` turns each partition's
 * light-space bounds into the scale and bias the shadow passes address the atlas
 * with.
 *
 * The first is reproduced on the GPU by `EXVS_DEPTH_REDUCE_FRAGMENT_GLSL`. The
 * second is reproduced here exactly. The third is reproduced here from the
 * partition's frustum corners rather than from a per-pixel scatter of the depth
 * buffer, which is the one approximation in the chain: corner bounds are a
 * superset of the scatter's bounds, so a partition can come out slightly looser
 * than the game's and never tighter. It costs some texel density and cannot
 * produce an artefact.
 */

import { Matrix4, Vector3, type PerspectiveCamera } from "three";

import { EXVS_SHADOW_PARTITION_COUNT } from "./shaders/exvsShadowShader";
import type { ExvsSdsmSettings } from "./exvsRenderSettings";

export type ExvsShadowPartition = {
  /** View depths this partition covers. */
  intervalBegin: number;
  intervalEnd: number;
  /** Applied to the shared light clip position, mapped to [0,1]. */
  scale: Vector3;
  bias: Vector3;
};

export type ExvsShadowFit = {
  /** View space to the shared light clip space, which every partition refines. */
  viewToLightProjection: Matrix4;
  partitions: ExvsShadowPartition[];
};

const CORNER_SIGNS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * Cuts `[minDepth, maxDepth]` into four logarithmic partitions.
 *
 * The first partition starts at the near clip and the last ends at the far clip
 * whatever the measured range was, so nothing between the camera and the nearest
 * lit sample falls outside the cascade set.
 */
export function computeExvsPartitionIntervals(
  minDepth: number,
  maxDepth: number,
  nearClip: number,
  farClip: number,
): { begin: number; end: number }[] {
  const safeMin = Math.max(minDepth, nearClip, 1e-4);
  const safeMax = Math.max(maxDepth, safeMin * 1.0001);
  const ratio = Math.log(safeMax / safeMin);
  const count = EXVS_SHADOW_PARTITION_COUNT;

  const intervals: { begin: number; end: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const begin = i === 0 ? nearClip : safeMin * Math.exp((ratio * i) / count);
    const end = i === count - 1 ? farClip : safeMin * Math.exp((ratio * (i + 1)) / count);
    intervals.push({ begin, end });
  }
  return intervals;
}

/** The eight view-space corners of the slab between two view depths. */
function partitionCorners(
  camera: PerspectiveCamera,
  begin: number,
  end: number,
  out: Vector3[],
): void {
  const tanHalfFov = Math.tan(((camera.fov * Math.PI) / 180) * 0.5);
  let index = 0;
  for (const depth of [begin, end]) {
    const halfHeight = tanHalfFov * depth;
    const halfWidth = halfHeight * camera.aspect;
    for (const [sx, sy] of CORNER_SIGNS) {
      // three.js view space looks down -z, so a positive view depth is -z.
      out[index].set(sx * halfWidth, sy * halfHeight, -depth);
      index += 1;
    }
  }
}

/**
 * Builds the shared light matrix and the per-partition scale and bias.
 *
 * `lightDirection` points from the scene toward the light, which is the same
 * convention the light buffers use.
 */
export function fitExvsShadowPartitions(
  camera: PerspectiveCamera,
  lightDirection: Vector3,
  minDepth: number,
  maxDepth: number,
  settings: ExvsSdsmSettings,
): ExvsShadowFit {
  // The cascade set covers the shadow range, which is its own parameter. Using the
  // camera's clip range instead would stretch four partitions over the viewport's
  // five-million-unit far plane and leave nothing to compare against.
  const shadowNear = Math.max(settings.shadowNear, camera.near);
  const shadowFar = Math.max(Math.min(settings.shadowFar, camera.far), shadowNear * 1.001);
  const intervals = computeExvsPartitionIntervals(
    Math.max(minDepth, shadowNear),
    Math.min(maxDepth, shadowFar),
    shadowNear,
    shadowFar,
  );

  const corners: Vector3[] = [];
  for (let i = 0; i < 8; i += 1) corners.push(new Vector3());

  // --- the shared light frame ------------------------------------------------
  // Everything the cascade set covers, so each partition is a sub-box of it.
  partitionCorners(camera, intervals[0].begin, intervals[intervals.length - 1].end, corners);

  const viewToWorld = camera.matrixWorld;
  const worldCorners = corners.map((corner) => corner.clone().applyMatrix4(viewToWorld));

  const centre = new Vector3();
  for (const corner of worldCorners) centre.add(corner);
  centre.multiplyScalar(1 / worldCorners.length);

  const direction = lightDirection.clone().normalize();
  if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);

  // A light "camera" placed far enough back that the whole set is in front of it.
  let radius = 0;
  for (const corner of worldCorners) radius = Math.max(radius, corner.distanceTo(centre));
  radius = Math.max(radius, 1e-3);

  const up = Math.abs(direction.y) > 0.99 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0);
  const eye = centre.clone().addScaledVector(direction, radius * 2);

  const lightView = new Matrix4().lookAt(eye, centre, up).setPosition(eye).invert();

  const lightProjection = new Matrix4().makeOrthographic(
    -radius,
    radius,
    radius,
    -radius,
    0.01,
    radius * 4,
  );

  const viewToLightProjection = new Matrix4()
    .multiplyMatrices(lightProjection, lightView)
    .multiply(viewToWorld);

  // --- per-partition fit -----------------------------------------------------
  const partitions: ExvsShadowPartition[] = [];
  const border = settings.borderLightSpace;
  const dilation = settings.dilationFactor;
  const dilationScale = 1 - 2 * dilation;

  for (const interval of intervals) {
    partitionCorners(camera, interval.begin, interval.end, corners);

    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const corner of corners) {
      const clip = corner.clone().applyMatrix4(viewToLightProjection);
      // Orthographic, so w is 1 and the clip position is already normalised.
      const uvz = clip.multiplyScalar(0.5).addScalar(0.5);
      min.min(uvz);
      max.max(uvz);
    }

    min.sub(new Vector3(border[0], border[1], border[2]));
    max.add(new Vector3(border[0], border[1], border[2]));

    const scale = new Vector3(
      1 / Math.max(max.x - min.x, 1e-6),
      1 / Math.max(max.y - min.y, 1e-6),
      1 / Math.max(max.z - min.z, 1e-6),
    );
    const bias = new Vector3(-min.x * scale.x, -min.y * scale.y, -min.z * scale.z);

    // The dilation shrinks the partition inside its tile so a filter tap cannot
    // reach across the tile border into a neighbour.
    scale.multiplyScalar(dilationScale);
    bias.multiplyScalar(dilationScale).addScalar(dilation).addScalar(-0.5);

    const maxScale = settings.maxScale;
    const clamped = new Vector3(
      Math.min(scale.x, maxScale[0]),
      Math.min(scale.y, maxScale[1]),
      Math.min(scale.z, maxScale[2]),
    );
    const ratio = new Vector3(clamped.x / scale.x, clamped.y / scale.y, clamped.z / scale.z);

    partitions.push({
      intervalBegin: interval.begin,
      intervalEnd: interval.end,
      scale: clamped,
      bias: new Vector3(
        ratio.x * bias.x + 0.5,
        ratio.y * bias.y + 0.5,
        ratio.z * bias.z + 0.5,
      ),
    });
  }

  return { viewToLightProjection, partitions };
}

/**
 * The matrix a partition's shadow map is rendered with.
 *
 * The resolve reads the atlas at `lightUvz * scale + bias`, so a draw has to land
 * where that lookup will read. In normalised device coordinates that is the
 * shared matrix followed by the same affine map, doubled out of `[0,1]` space.
 */
export function partitionRenderMatrix(
  viewToLightProjection: Matrix4,
  partition: ExvsShadowPartition,
  cameraWorldMatrixInverse: Matrix4,
): Matrix4 {
  const { scale, bias } = partition;
  const refine = new Matrix4().set(
    scale.x, 0, 0, scale.x + 2 * bias.x - 1,
    0, scale.y, 0, scale.y + 2 * bias.y - 1,
    0, 0, scale.z, scale.z + 2 * bias.z - 1,
    0, 0, 0, 1,
  );
  // viewToLightProjection already folds in the camera's world matrix, so the
  // world-to-view matrix has to be put back in front of it for a world-space draw.
  return refine.multiply(viewToLightProjection).multiply(cameraWorldMatrixInverse);
}
