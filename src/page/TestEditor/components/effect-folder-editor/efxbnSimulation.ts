import type {
  EfxbnEffectSummary,
  EfxbnRuntimeNormalization,
} from "@/services/effectFolder/effectFolderService";
import { evaluateEfxbnControl, type EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";

/**
 * Window used when an effect declares no lifetime at all. Every other effect derives its own —
 * see `resolveEfxbnPreviewFrameCount`.
 */
export const EFXBN_PREVIEW_FRAME_COUNT = 120;
export const EFXBN_PREVIEW_FPS = 60;
/** Below this a short effect strobes rather than reads as an animation. */
export const EFXBN_PREVIEW_MIN_FRAME_COUNT = 30;
/** The longest effect in the shipped corpus runs 600 frames; nothing needs more. */
export const EFXBN_PREVIEW_MAX_FRAME_COUNT = 600;
export const EFXBN_MODEL_POOL_LIMIT = 64;
export const EFXBN_MODEL_POOL_GLOBAL_LIMIT = 128;
export const EFXBN_SIMULATION_LIMIT = 2_048;
export const EFXBN_STRIP_HISTORY_SAMPLE_LIMIT = 2_048;
export const EFXBN_STRIP_MIN_SEGMENT_INTERVAL = 1 / 16;

export type EfxbnEmitterPair = {
  emitter: EfxbnEffectSummary | null;
  target: EfxbnEffectSummary;
};

export type EfxbnPreviewParticle = {
  id: number;
  emitterEffectIndex: number | null;
  targetEffectIndex: number;
  age: number;
  /** `SEfxElementInstance.lifeCount`. Wraps to 1 on loop, clamps at `lifeTime` on force-loop. */
  phaseAge: number;
  lifeTime: number;
  position: [number, number, number];
  size: [number, number];
  scale: [number, number, number];
  color: [number, number, number, number];
  rotation: number;
  rotationEuler: [number, number, number];
  history: EfxbnStripHistoryNode[];
};

/**
 * One strip ring-buffer node.
 *
 * `EfxExtractedDrawInfoStrip3rd` gives every node its own segment endpoints (which is where the
 * width lives) and its own `prevColorAlpha` / `currentColorAlpha`, so a ribbon is not a uniform
 * extrusion of the head particle's size and colour.
 */
export type EfxbnStripHistoryNode = {
  position: [number, number, number];
  /** Half-width at the node: `sizeBase.x * sizeRandom.x * scaleBaseX` at that node's phase. */
  width: number;
  color: [number, number, number, number];
};

const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const UINT32_RANGE = 4_294_967_296;
const EPSILON = 0.00001;

type RandomSource = {
  nextUint: () => number;
  nextUnit: () => number;
  nextSigned: () => number;
};

function lcgStep(seed: number): number {
  return (Math.imul(seed, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
}

function makeRandomSource(initialSeed: number): RandomSource {
  let seed = initialSeed >>> 0;
  const nextUint = () => {
    seed = lcgStep(seed);
    return seed;
  };
  const nextUnit = () => nextUint() / UINT32_RANGE;
  return { nextUint, nextUnit, nextSigned: () => nextUnit() * 2 - 1 };
}

function pairSeed(emitterIndex: number | null, targetIndex: number): number {
  return (
    Math.imul((emitterIndex ?? 0x6d2b79f5) ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(targetIndex ^ 0xc2b2ae35, 0x27d4eb2d)
  ) >>> 0;
}

/** SplitMix32 finalizer — turns adjacent particle ids into uncorrelated seeds. */
function mixSeed(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97) >>> 0;
  return (mixed ^ (mixed >>> 15)) >>> 0;
}

/**
 * The seed one particle draws all of its own randomness from.
 *
 * Every particle must own its stream. The preview replays the whole emission history on each
 * rendered frame, and an expired particle stops drawing partway through its own spawn; with one
 * shared stream that shift lands on every particle emitted after it, so the entire live cloud
 * re-randomised its lifetime, size and rotation each time any earlier particle died — the effect
 * flickered continuously. The engine seeds per instance for the same reason
 * (`efxSpawnParticleCommon3rd` advances an LCG stored on the instance).
 */
function particleSeed(pair: number, particleId: number): number {
  return mixSeed((pair + Math.imul(particleId + 1, 0x9e3779b9)) >>> 0);
}

function randomizedBase(base: number, randomRate: number, random: RandomSource): number {
  return base * (1 + random.nextSigned() * randomRate);
}

/** `actionFlags & 1` — the loop bit, already forced on by the loader when `0x08000000` is set. */
const EFXBN_ACTION_FLAG_LOOP = 0x1;
/**
 * `actionFlags & 0x08000000`. Both the emitter and the particle kinetic shaders clamp
 * `lifeCount` at `lifeTime` under this flag, so the instance never reaches the expiry test.
 */
const EFXBN_ACTION_FLAG_FORCE_LOOP = 0x0800_0000;
/** `actionFlags & 0x200` — suppresses the emitter's delay restart on a loop cycle. */
const EFXBN_ACTION_FLAG_KEEP_DELAY = 0x200;

/**
 * Number of frames one life cycle spans.
 *
 * `efxKineticParticleBillboard3rd` expires an instance when `lifeTime < lifeCount + 1`, so with
 * `lifeCount` tracking the particle's age the last living age is `floor(lifeTime) - 1` and the
 * cycle repeats every `floor(lifeTime)` frames.
 */
function lifeCycleFrames(lifeTime: number): number {
  return Math.max(1, Math.floor(lifeTime));
}

/**
 * `SEfxElementInstance.lifeCount` at a given age, reproducing the kinetic shader's recurrence.
 *
 * ```text
 * add   r2.z, lifeCount, l(1.000000)      ; next
 * lt    r2.w, lifeTime, r2.z              ; would overrun
 * and   r1.w, forceLoop, r2.w
 * movc  r4.x, r1.w, lifeTime, r2.z        ; force-loop clamps instead of advancing
 * lt    r1.w, lifeTime, r4.x              ; expired
 * movc  r6.xyzw, loopBit, r3.wyxz, ...    ; r3.w = l(1.000000) — the wrap target
 * ```
 *
 * Nothing else is touched on the wrap, which is why a looping particle's position is continuous.
 */
export function efxbnParticleLifeCount(
  age: number,
  lifeTime: number,
  looping: boolean,
  forceLooping: boolean,
): number {
  if (age <= 0) return 0;
  if (forceLooping) return Math.min(age, lifeTime);
  const cycle = lifeCycleFrames(lifeTime);
  if (!looping || age < cycle) return age;
  return ((age - cycle) % cycle) + 1;
}

/** True once a non-looping instance has passed `lifeTime < lifeCount + 1`. */
function isExpiredAtAge(age: number, lifeTime: number): boolean {
  return age >= lifeCycleFrames(lifeTime);
}

/**
 * Number of particles one emission tick releases.
 *
 * `efxKineticEmitterCommon3rd`:
 * ```text
 * bfi  r5.w, l(31), l(1), numEmitCountRandom, l(1)  ; 2R + 1
 * udiv null, r5.w, lcg(seed), r5.w                  ; seed % (2R + 1)
 * iadd r5.x, -numEmitCountRandom, r5.w              ; centred on zero
 * iadd r1.w, numEmit, r5.x
 * ult  r5.x, l(0), meshEmitterCount
 * movc r1.w, r5.x, meshEmitterCount, r1.w
 * ige  r5.z, r1.w, l(1)                             ; nothing emits below one
 * ```
 *
 * `meshEmitterCount` is zero in all 40,309 blocks of the shipped corpus, so the override is
 * carried for fidelity rather than for coverage.
 */
export function resolveEfxbnEmitCount(
  numEmit: number,
  numEmitCountRandom: number,
  meshEmitterCount: number,
  seed: number,
): number {
  if (meshEmitterCount > 0) return meshEmitterCount;
  const range = numEmitCountRandom * 2 + 1;
  const offset = (lcgStep(seed) % range) - numEmitCountRandom;
  return Math.max(0, numEmit + offset);
}

export type EfxbnSpawnBasis = {
  x: [number, number, number];
  y: [number, number, number];
  z: [number, number, number];
};

/**
 * The `spawnSystem` matrix `efxSpawnParticleCommon3rd` writes at instance offset 320, expressed
 * as its three column vectors.
 *
 * The shader builds it from two spawn-form angles and stores rows at `l(320)`/`l(336)`/`l(352)`
 * with `l(368)` fixed at `(0, 0, 0, 1)`. Expanding its `sincos`/`dp2`/`dp3` chain with the third
 * angle at zero — which is what every spawn-form branch except types 4 and 8 leaves it at — gives
 *
 * ```text
 * column0 = ( cos B,          0,      -sin B       )
 * column1 = ( sin A sin B,    cos A,   sin A cos B )
 * column2 = ( cos A sin B,   -sin A,   cos A cos B )
 * ```
 *
 * i.e. `Ry(B) * Rx(A)`, so **column 1 is exactly the spawn direction**. The no-emitter branch
 * writes the identity and the preview's no-emitter direction is `+Y`, which is the same thing.
 * Recovering `A` and `B` from a unit direction therefore reproduces the shader's basis.
 */
export function efxbnSpawnBasis(direction: readonly [number, number, number]): EfxbnSpawnBasis {
  const unit = normalize3(direction);
  const cosPolar = unit[1];
  const sinPolar = Math.hypot(unit[0], unit[2]);
  const azimuth = sinPolar < EPSILON ? 0 : Math.atan2(unit[0], unit[2]);
  const sinAzimuth = Math.sin(azimuth);
  const cosAzimuth = Math.cos(azimuth);
  return {
    x: [cosAzimuth, 0, -sinAzimuth],
    y: [unit[0], unit[1], unit[2]],
    z: [cosPolar * sinAzimuth, -sinPolar, cosPolar * cosAzimuth],
  };
}

function controlValue(
  block: EfxbnEffectSummary,
  plan: EffectFolderPreviewPlan,
  name: string,
  progress: number,
): number {
  return evaluateEfxbnControl(
    block.controlReferences.find((reference) => reference.name === name),
    plan.controlLookupEntries,
    progress,
  );
}

function normalize3(value: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < EPSILON) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function rotateDirection(
  direction: readonly [number, number, number],
  pitch: number,
  yaw: number,
): [number, number, number] {
  const pitchSin = Math.sin(pitch);
  const pitchCos = Math.cos(pitch);
  const yawSin = Math.sin(yaw);
  const yawCos = Math.cos(yaw);
  const pitched: [number, number, number] = [
    direction[0],
    direction[1] * pitchCos - direction[2] * pitchSin,
    direction[1] * pitchSin + direction[2] * pitchCos,
  ];
  return [
    pitched[0] * yawCos + pitched[2] * yawSin,
    pitched[1],
    -pitched[0] * yawSin + pitched[2] * yawCos,
  ];
}

function spawnPositionAndDirection(
  emitter: EfxbnEffectSummary,
  plan: EffectFolderPreviewPlan,
  emitterProgress: number,
  random: RandomSource,
  meshEmitterPointsByEffectIndex?: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>,
): {
  position: [number, number, number];
  direction: [number, number, number];
  color: [number, number, number, number];
} {
  const lengths = emitter.spawnFormLength;
  const spreadX = controlValue(emitter, plan, "spreadX", emitterProgress) * random.nextSigned();
  const spreadY = controlValue(emitter, plan, "spreadY", emitterProgress) * random.nextSigned();
  let position: [number, number, number] = [0, 0, 0];
  let direction: [number, number, number] = [0, 1, 0];
  let color: [number, number, number, number] = [1, 1, 1, 1];

  switch (emitter.spawnFormType) {
    case 1:
    case 6:
      position = [0, (random.nextUnit() - 0.5) * lengths[0], 0];
      break;
    case 3: {
      const angleStart = controlValue(emitter, plan, "spawnForm0", emitterProgress);
      const angleEnd = controlValue(emitter, plan, "spawnForm1", emitterProgress);
      const angle = angleStart + (angleEnd - angleStart) * random.nextUnit();
      const radius = lengths[0];
      position = [
        Math.cos(angle) * radius,
        (random.nextUnit() - 0.5) * lengths[1],
        Math.sin(angle) * radius,
      ];
      direction = normalize3([position[0], 0, position[2]]);
      break;
    }
    case 4:
    case 8:
      position = [
        (random.nextUnit() - 0.5) * lengths[0],
        (random.nextUnit() - 0.5) * lengths[1],
        (random.nextUnit() - 0.5) * lengths[2],
      ];
      direction = normalize3(position);
      break;
    case 9:
    case 10: {
      const points = meshEmitterPointsByEffectIndex?.get(emitter.index) ?? [];
      const point = points[Math.floor(random.nextUnit() * points.length)];
      if (point) {
        position = [...point.position];
        direction = normalize3(point.normal);
        color = [...point.color];
        const offsetRadius = (random.nextUnit() - 0.5) * lengths[1];
        const offsetAngle = random.nextUnit() * Math.PI * 2;
        position[0] += Math.cos(offsetAngle) * offsetRadius;
        position[2] += Math.sin(offsetAngle) * offsetRadius;
      }
      break;
    }
    default:
      direction = normalize3([
        random.nextSigned(),
        random.nextSigned(),
        random.nextSigned(),
      ]);
      break;
  }

  return {
    position: [
      position[0] + emitter.positionOffset[0],
      position[1] + emitter.positionOffset[1],
      position[2] + emitter.positionOffset[2],
    ],
    direction: normalize3(rotateDirection(direction, spreadX, spreadY)),
    color,
  };
}

function simulateParticle(
  pair: EfxbnEmitterPair,
  plan: EffectFolderPreviewPlan,
  spawnFrame: number,
  frame: number,
  particleId: number,
  random: RandomSource,
  emitterProgress: number,
  meshEmitterPointsByEffectIndex?: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>,
): EfxbnPreviewParticle | null {
  const target = pair.target;
  const lifeTime = randomizedBase(target.lifeTimeBase, target.lifeTimeRandom, random);
  if (lifeTime <= EPSILON) return null;
  const age = Math.max(0, frame - spawnFrame);
  const actionFlags = efxbnRuntime(target).actionFlags;
  const looping = (actionFlags & EFXBN_ACTION_FLAG_LOOP) !== 0;
  const forceLooping = (actionFlags & EFXBN_ACTION_FLAG_FORCE_LOOP) !== 0;
  if (!looping && !forceLooping && isExpiredAtAge(age, lifeTime)) return null;
  const phaseAge = efxbnParticleLifeCount(age, lifeTime, looping, forceLooping);
  // `mul r1.y, lifeTimeRatio, lifeCount ; div r1.y, r1.y, lifeTimeBase` with
  // `lifeTimeRatio = lifeTimeBase / lifeTime`, i.e. lifeCount over the randomised lifetime.
  const curveProgress = (sampleAge: number) =>
    (efxbnParticleLifeCount(sampleAge, lifeTime, looping, forceLooping) / lifeTime) * 100;

  const spawn = pair.emitter
    ? spawnPositionAndDirection(
        pair.emitter,
        plan,
        emitterProgress,
        random,
        meshEmitterPointsByEffectIndex,
      )
    : {
        position: [0, 0, 0] as [number, number, number],
        direction: [0, 1, 0] as [number, number, number],
        color: [1, 1, 1, 1] as [number, number, number, number],
      };
  const position: [number, number, number] = [
    spawn.position[0] + target.positionOffset[0],
    spawn.position[1] + target.positionOffset[1],
    spawn.position[2] + target.positionOffset[2],
  ];
  const speedRate: [number, number, number] = [
    1 + random.nextSigned() * target.speedRandom[0],
    1 + random.nextSigned() * target.speedRandom[1],
    1 + random.nextSigned() * target.speedRandom[2],
  ];
  const sizeRandom: [number, number, number] = [
    1 + random.nextSigned() * target.sizeRandom[0],
    1 + random.nextSigned() * target.sizeRandom[1],
    1 + random.nextSigned() * target.sizeRandom[2],
  ];
  if ((target.actionFlags & 0x10) !== 0) {
    sizeRandom[1] = sizeRandom[0];
    sizeRandom[2] = sizeRandom[0];
  }
  const rotationBase: [number, number, number] = [
    target.rotationBase[0] + random.nextSigned() * target.rotationRandom[0],
    target.rotationBase[1] + random.nextSigned() * target.rotationRandom[1],
    target.rotationBase[2] + random.nextSigned() * target.rotationRandom[2],
  ];
  // `speedBase` is authored in the particle's spawn frame; the kinetic shader transforms it with
  // `dp4 r2.x, spawnSystemRow, speed` and adds the result to the stored position each frame.
  const basis = efxbnSpawnBasis(spawn.direction);
  let gravityVelocity = 0;
  let directionVelocity = 0;
  let elapsed = 0;
  // A strip node freezes the particle's own state at the moment it entered the ring buffer.
  const stripNodeAt = (
    sampleAge: number,
    samplePosition: readonly [number, number, number],
  ): { age: number; node: EfxbnStripHistoryNode } => {
    const nodeProgress = curveProgress(sampleAge);
    return {
      age: sampleAge,
      node: {
        position: [samplePosition[0], samplePosition[1], samplePosition[2]],
        width:
          Math.abs(
            target.sizeBase[0] *
              sizeRandom[0] *
              controlValue(target, plan, "scaleBaseX", nodeProgress),
          ) * 0.5,
        color: [
          controlValue(target, plan, "colorR", nodeProgress) * spawn.color[0],
          controlValue(target, plan, "colorG", nodeProgress) * spawn.color[1],
          controlValue(target, plan, "colorB", nodeProgress) * spawn.color[2],
          Math.max(0, controlValue(target, plan, "colorA", nodeProgress) * spawn.color[3]),
        ],
      },
    };
  };
  const historySamples: Array<{ age: number; node: EfxbnStripHistoryNode }> =
    target.effectType === EFXBN_ELEMENT_TYPE.strip ? [stripNodeAt(0, position)] : [];
  const authoredStripInterval = target.stripSegmentInterval;
  const stripInterval = Number.isFinite(authoredStripInterval) && authoredStripInterval > 0
    ? Math.max(EFXBN_STRIP_MIN_SEGMENT_INTERVAL, authoredStripInterval)
    : 1;
  let nextStripSample = stripInterval;
  while (elapsed < age) {
    const canSampleStrip = target.effectType === EFXBN_ELEMENT_TYPE.strip &&
      historySamples.length < EFXBN_STRIP_HISTORY_SAMPLE_LIMIT;
    const step = Math.min(
      1,
      age - elapsed,
      canSampleStrip ? Math.max(EPSILON, nextStripSample - elapsed) : Number.POSITIVE_INFINITY,
    );
    const progress = curveProgress(elapsed + step);
    const localSpeed: [number, number, number] = [
      controlValue(target, plan, "speedBaseX", progress) * speedRate[0],
      controlValue(target, plan, "speedBaseY", progress) * speedRate[1],
      controlValue(target, plan, "speedBaseZ", progress) * speedRate[2],
    ];
    const velocity: [number, number, number] = [
      basis.x[0] * localSpeed[0] + basis.y[0] * localSpeed[1] + basis.z[0] * localSpeed[2],
      basis.x[1] * localSpeed[0] + basis.y[1] * localSpeed[1] + basis.z[1] * localSpeed[2],
      basis.x[2] * localSpeed[0] + basis.y[2] * localSpeed[1] + basis.z[2] * localSpeed[2],
    ];
    if ((target.actionFlags & 0x4000) !== 0) {
      directionVelocity += controlValue(target, plan, "directionAccel", progress) * step;
    }
    if ((target.actionFlags & 0x1000) !== 0) {
      gravityVelocity += controlValue(target, plan, "worldGravityAccel", progress) * step;
    }
    position[0] += (velocity[0] + spawn.direction[0] * directionVelocity) * step;
    position[1] += (velocity[1] + spawn.direction[1] * directionVelocity + gravityVelocity) * step;
    position[2] += (velocity[2] + spawn.direction[2] * directionVelocity) * step;
    elapsed += step;
    if (canSampleStrip && elapsed + EPSILON >= nextStripSample) {
      historySamples.push(stripNodeAt(elapsed, position));
      nextStripSample += stripInterval;
    }
  }
  if (target.effectType === EFXBN_ELEMENT_TYPE.strip &&
      (historySamples.length === 0 || Math.abs(historySamples[historySamples.length - 1].age - age) > EPSILON)) {
    const finalSample = stripNodeAt(age, position);
    if (historySamples.length < EFXBN_STRIP_HISTORY_SAMPLE_LIMIT) historySamples.push(finalSample);
    else historySamples[historySamples.length - 1] = finalSample;
  }

  const progress = curveProgress(age);
  const scaleX = controlValue(target, plan, "scaleBaseX", progress);
  const scaleY = controlValue(target, plan, "scaleBaseY", progress);
  const scaleZ = controlValue(target, plan, "scaleBaseZ", progress);
  const scale: [number, number, number] = [
    target.sizeBase[0] * sizeRandom[0] * scaleX,
    target.sizeBase[1] * sizeRandom[1] * scaleY,
    target.sizeBase[2] * sizeRandom[2] * scaleZ,
  ];
  const rotationEuler: [number, number, number] = [
    rotationBase[0] + target.rotationSpeed[0] * age,
    rotationBase[1] + target.rotationSpeed[1] * age,
    rotationBase[2] + target.rotationSpeed[2] * age,
  ];
  return {
    id: particleId,
    emitterEffectIndex: pair.emitter?.index ?? null,
    targetEffectIndex: target.index,
    age,
    phaseAge,
    lifeTime,
    position,
    size: [scale[0], scale[1]],
    scale,
    color: [
      controlValue(target, plan, "colorR", progress) * spawn.color[0],
      controlValue(target, plan, "colorG", progress) * spawn.color[1],
      controlValue(target, plan, "colorB", progress) * spawn.color[2],
      Math.max(0, controlValue(target, plan, "colorA", progress) * spawn.color[3]),
    ],
    rotation: rotationEuler[2],
    rotationEuler,
    history: target.effectType === EFXBN_ELEMENT_TYPE.strip
      ? historySamples
          .filter((sample) => sample.age >= Math.max(0, age - Math.max(0, efxbnRuntime(target).stripSegmentLife)))
          .map((sample) => sample.node)
      : [],
  };
}

/**
 * `SEfxElementData.elementType` values.
 *
 * Only three types draw anything: `sub_140145DF0` writes the per-slot enable gate at
 * `slot + 916` as `elementType == 1 || elementType == 3 || elementType == 5`, and
 * `sub_140188E30` picks `efxDrawModel` for type 3 and `efxDrawFace` otherwise. The
 * strip-specific defaults in `sub_140146590` are gated on `elementType == 5`.
 *
 * The remaining values are structural containers that only spawn children. A survey
 * of the 4,201 shipped EFXBN files (36,737 blocks) finds types 1, 3, 5, 6, 8, 9, 10
 * and 11 — and no type 2 at all.
 */
export const EFXBN_ELEMENT_TYPE = {
  billboard: 1,
  model: 3,
  strip: 5,
} as const;

const EFXBN_DRAWABLE_ELEMENT_TYPES = new Set<number>([
  EFXBN_ELEMENT_TYPE.billboard,
  EFXBN_ELEMENT_TYPE.model,
  EFXBN_ELEMENT_TYPE.strip,
]);

export function isEfxbnStripBlock(block: EfxbnEffectSummary): boolean {
  return block.effectType === EFXBN_ELEMENT_TYPE.strip;
}

/**
 * How `efxConstructDrawBufferBillboard3rd` orients a billboard quad.
 *
 * ```text
 * and  r15.xyzw, actionFlags, l(32, 0x20000000, 0x02000000, 0x00400000)
 * ult  r15.xyz,  l(0, 0, 0, 0), r15.xyzx
 * or   r1.w,     r15.y, r15.x        ; 0x20 or 0x20000000 -> the axis-locked basis
 * if_nz r1.w ... else ... and r0.w, actionFlags, l(128)   ; 0x80 -> the element's own rotation
 * ```
 *
 * The names are the flag values' behaviour, not engine vocabulary — the HLSL has none.
 * Over the 7,395 shipped billboard blocks: camera-facing 5,139, axis-locked 1,652,
 * element-rotation 604.
 */
export const EFXBN_BILLBOARD_BASIS = {
  /** Quad lies in the camera plane and spins by the particle's Z rotation. */
  cameraFacing: 0,
  /** Quad is oriented entirely by the particle's own rotation. `actionFlags & 0x80`. */
  elementRotation: 1,
  /** Quad keeps the particle's up axis and yaws toward the camera. `0x20` or `0x20000000`. */
  cameraAxis: 2,
} as const;

export type EfxbnBillboardBasis =
  (typeof EFXBN_BILLBOARD_BASIS)[keyof typeof EFXBN_BILLBOARD_BASIS];

const EFXBN_ACTION_FLAG_AXIS_BILLBOARD = 0x20;
const EFXBN_ACTION_FLAG_AXIS_BILLBOARD_ALT = 0x2000_0000;
const EFXBN_ACTION_FLAG_ELEMENT_ROTATION = 0x80;

export function resolveEfxbnBillboardBasis(block: EfxbnEffectSummary): EfxbnBillboardBasis {
  const actionFlags = efxbnRuntime(block).actionFlags;
  if (
    (actionFlags & (EFXBN_ACTION_FLAG_AXIS_BILLBOARD | EFXBN_ACTION_FLAG_AXIS_BILLBOARD_ALT)) !== 0
  ) {
    return EFXBN_BILLBOARD_BASIS.cameraAxis;
  }
  if ((actionFlags & EFXBN_ACTION_FLAG_ELEMENT_ROTATION) !== 0) {
    return EFXBN_BILLBOARD_BASIS.elementRotation;
  }
  return EFXBN_BILLBOARD_BASIS.cameraFacing;
}

/**
 * Pixel-shader variants and the draw-scheme masks that select them.
 *
 * `sub_140188E30` appends one suffix per mask that shares **any** bit with the block's
 * draw-scheme flag, in this order — they are masks, not enum values, so a single bit such as
 * `0x80` is enough to pull in the whole ColorEx variant.
 */
export const EFXBN_SHADER_VARIANT_MASKS = [
  ["AddMix", 0x40],
  ["ColorEx", 0x280],
  ["Light", 0x20804],
  ["MultiUV", 0x1000],
  ["Soft", 0x10001],
  ["HLight", 0x20000],
] as const satisfies ReadonlyArray<readonly [string, number]>;

export type EfxbnShaderVariant = (typeof EFXBN_SHADER_VARIANT_MASKS)[number][0];

/**
 * Draw-scheme bit that skips the `rgb * 0.5` the base Face and Model pixel shaders otherwise
 * apply. Set on 104 of the 21,408 shipped drawable blocks, so the halving is the common case.
 */
export const DRAW_SCHEME_FULL_BRIGHTNESS = 0x40000;

/** Draw-scheme bit set when the block binds a UV-offset map, i.e. the ColorEx distortion path. */
export const DRAW_SCHEME_UV_OFFSET_MAP = 0x80;

export type EfxbnShaderVariantOptions = {
  /**
   * Whether the block's model mesh carries two or more vertex attribute streams of type 17.
   * The backend cannot know this, so the MultiUV group stays out of the flag until a caller
   * that resolved the mesh says otherwise.
   */
  meshHasSecondUvSet?: boolean;
};

/** The pixel-shader variants the game would compile for this block. */
export function resolveEfxbnShaderVariants(
  block: EfxbnEffectSummary,
  options: EfxbnShaderVariantOptions = {},
): EfxbnShaderVariant[] {
  const scheme = efxbnRuntime(block).drawScheme;
  const flag = options.meshHasSecondUvSet ? scheme.flag | scheme.meshMultiUvFlag : scheme.flag;
  return EFXBN_SHADER_VARIANT_MASKS.filter(([, mask]) => (flag & mask) !== 0).map(
    ([name]) => name,
  );
}

/**
 * Loader-derived values for a block.
 *
 * The backend always fills these in. Reading the authored fields instead would diverge
 * from the game, so a missing record is an error rather than something to work around.
 */
export function efxbnRuntime(block: EfxbnEffectSummary): EfxbnRuntimeNormalization {
  if (!block.runtime) {
    throw new Error(`EFXBN block ${block.index} is missing loader normalization.`);
  }
  return block.runtime;
}

export function isEfxbnDrawableBlock(block: EfxbnEffectSummary): boolean {
  return EFXBN_DRAWABLE_ELEMENT_TYPES.has(block.effectType);
}

/** Valid child block indices declared by `childIndexSize` and `childIndexArray`. */
export function efxbnChildIndexes(block: EfxbnEffectSummary): number[] {
  const childCount = Math.min(block.childIndexSize, block.childIndexArray.length);
  return block.childIndexArray.slice(0, childCount).filter((index) => index >= 0);
}

/** A block is an emitter when it declares at least one child. */
export function isEfxbnEmitterBlock(block: EfxbnEffectSummary): boolean {
  return efxbnChildIndexes(block).length > 0;
}

/** Blocks that declare `childIndex` as one of their children. */
export function findEfxbnParentBlocks(
  blocks: readonly EfxbnEffectSummary[],
  childIndex: number,
): EfxbnEffectSummary[] {
  return blocks.filter((block) => efxbnChildIndexes(block).includes(childIndex));
}

/**
 * Expands the block tree into one pair per parent/child edge.
 *
 * A block declares up to eight children through `childIndexArray`, so an emitter
 * that spawns several distinct targets produces several pairs. Drawable blocks that
 * no parent references render on their own with a null emitter.
 */
export function resolveEfxbnEmitterPairs(plan: EffectFolderPreviewPlan): EfxbnEmitterPair[] {
  const blocksByIndex = new Map(plan.effectBlocks.map((block) => [block.index, block]));
  const pairedTargets = new Set<number>();
  const pairs: EfxbnEmitterPair[] = [];

  for (const emitter of plan.effectBlocks) {
    const childCount = Math.min(emitter.childIndexSize, emitter.childIndexArray.length);
    for (let slot = 0; slot < childCount; slot += 1) {
      const childIndex = emitter.childIndexArray[slot];
      if (childIndex < 0) continue;
      const target = blocksByIndex.get(childIndex);
      if (!target) {
        throw new Error(
          `EFXBN block ${emitter.index} references child block ${childIndex}, which does not exist.`,
        );
      }
      pairedTargets.add(target.index);
      pairs.push({ emitter, target });
    }
  }

  for (const target of plan.effectBlocks) {
    if (pairedTargets.has(target.index) || !isEfxbnDrawableBlock(target)) continue;
    pairs.push({ emitter: null, target });
  }
  return pairs;
}

export function simulateEfxbnEmitterPair(
  pair: EfxbnEmitterPair,
  plan: EffectFolderPreviewPlan,
  frame: number,
  maxParticles = 2_048,
  meshEmitterPointsByEffectIndex?: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>,
): EfxbnPreviewParticle[] {
  const clampedFrame = Math.max(0, frame);
  const seed = pairSeed(pair.emitter?.index ?? null, pair.target.index);
  // Emitter-level draws only: its own lifetime, then two per emission tick. Particle draws come
  // from `particleSeed`, so a particle expiring can never shift what the emitter rolls next.
  const random = makeRandomSource(seed);
  const particles: EfxbnPreviewParticle[] = [];
  const emitter = pair.emitter;
  // `efxSpawnEmitterCommon3rd` randomises the emitter's own lifetime exactly like a particle's
  // and stores `lifeTimeRatio = lifeTimeBase / lifeTime` beside it, which is what every emitter
  // curve is then sampled through.
  const lifeTimeBase = emitter?.lifeTimeBase ?? 0;
  const emitterLifeTime = emitter
    ? randomizedBase(lifeTimeBase, emitter.lifeTimeRandom, random)
    : 0;
  const emitterLifeTimeRatio = emitterLifeTime > EPSILON ? lifeTimeBase / emitterLifeTime : 0;
  const emitterActionFlags = emitter ? efxbnRuntime(emitter).actionFlags : 0;
  const emitterLooping = (emitterActionFlags & EFXBN_ACTION_FLAG_LOOP) !== 0;
  const emitterForceLooping = (emitterActionFlags & EFXBN_ACTION_FLAG_FORCE_LOOP) !== 0;
  // On a loop cycle the emitter restarts `lifeCount` at zero only when it re-arms its emission
  // delay: `movc r3.yz, r1.wwww, ...` with `r1.w = (actionFlags & 512) == 0 && delayEmitTimeBase > 0`.
  const loopRestartLifeCount =
    (emitterActionFlags & EFXBN_ACTION_FLAG_KEEP_DELAY) === 0 &&
    (emitter?.delayEmitTimeBase ?? 0) > 0
      ? 0
      : 1;

  let generatorCounter = 0;
  let delayCounter = emitter?.delayEmitTimeBase ?? 0;
  let lifeCount = 0;
  let particleId = 0;
  const lastTick = Math.floor(clampedFrame);
  for (let tick = 0; tick <= lastTick && particles.length < maxParticles; tick += 1) {
    if (emitter) {
      const next = lifeCount + 1;
      const clamped = emitterForceLooping && emitterLifeTime < next ? emitterLifeTime : next;
      if (emitterLifeTime < clamped) {
        if (!emitterLooping) break;
        lifeCount = loopRestartLifeCount;
        delayCounter = loopRestartLifeCount === 0 ? emitter.delayEmitTimeBase : delayCounter;
      } else {
        lifeCount = clamped;
      }
    }
    if (Math.abs(delayCounter) >= EPSILON) {
      delayCounter -= 1;
      continue;
    }

    if (generatorCounter <= EPSILON) {
      const emitCount = emitter
        ? resolveEfxbnEmitCount(
            emitter.numEmit,
            emitter.numEmitCountRandom,
            emitter.meshEmitterCount,
            random.nextUint(),
          )
        : Math.max(0, pair.target.numEmit);
      const emitterProgress =
        lifeTimeBase > EPSILON ? ((emitterLifeTimeRatio * lifeCount) / lifeTimeBase) * 100 : 0;
      for (let index = 0; index < emitCount && particles.length < maxParticles; index += 1) {
        const particle = simulateParticle(
          pair,
          plan,
          tick,
          clampedFrame,
          particleId,
          makeRandomSource(particleSeed(seed, particleId)),
          emitterProgress,
          meshEmitterPointsByEffectIndex,
        );
        particleId += 1;
        if (particle) particles.push(particle);
      }
      generatorCounter = randomizedBase(
        emitter?.intervalBase ?? Number.POSITIVE_INFINITY,
        emitter?.intervalRandom ?? 0,
        random,
      );
    }
    generatorCounter -= 1;
  }
  return particles;
}

/** Longest a block can live once spawned, taking the randomised upper bound. */
function maxBlockLifeTime(block: EfxbnEffectSummary): number {
  const spread = Math.max(0, block.lifeTimeRandom);
  return Math.max(0, block.lifeTimeBase) * (1 + spread);
}

function subtreeSpan(
  block: EfxbnEffectSummary,
  blocksByIndex: ReadonlyMap<number, EfxbnEffectSummary>,
  visiting: Set<number>,
): number {
  if (visiting.has(block.index)) return 0;
  visiting.add(block.index);
  let childSpan = 0;
  for (const childIndex of efxbnChildIndexes(block)) {
    const child = blocksByIndex.get(childIndex);
    if (child) childSpan = Math.max(childSpan, subtreeSpan(child, blocksByIndex, visiting));
  }
  visiting.delete(block.index);
  return Math.max(0, block.delayEmitTimeBase) + maxBlockLifeTime(block) + childSpan;
}

/**
 * How many frames the timeline spans before it wraps back to the start.
 *
 * The preview used to play every effect over a fixed 120-frame window, which is wrong in both
 * directions. 42.6% of the shipped corpus is one-shot, and 77.2% of those finish in under half
 * that window — the median fills a quarter of it. Such an effect played for half a second and
 * then left an empty viewport for a second and a half before snapping back, which reads as a
 * blink rather than an animation. At the other end 6.9% of effects need more than 120 frames and
 * were cut off mid-flight.
 *
 * An emitter produces from its delay until its life ends, and the last thing it spawns lives its
 * own full span after that, so an effect's length is the longest root-to-leaf sum down the child
 * tree.
 *
 * A **looping** effect never ends on its own, so its length says nothing about how often the
 * timeline should restart — and restarting every cycle would make it pulse. Those keep at least
 * the fixed window, so the wrap stays as rare as it was.
 */
export function resolveEfxbnPreviewFrameCount(blocks: readonly EfxbnEffectSummary[]): number {
  const blocksByIndex = new Map(blocks.map((block) => [block.index, block]));
  const childIndexes = new Set(blocks.flatMap((block) => efxbnChildIndexes(block)));
  let longest = 0;
  for (const block of blocks) {
    if (childIndexes.has(block.index)) continue;
    longest = Math.max(longest, subtreeSpan(block, blocksByIndex, new Set()));
  }
  // A cycle leaves every block parented, so fall back to the deepest span from any of them.
  if (longest === 0) {
    for (const block of blocks) {
      longest = Math.max(longest, subtreeSpan(block, blocksByIndex, new Set()));
    }
  }
  const loops = blocks.some(
    (block) => (efxbnRuntime(block).actionFlags & EFXBN_ACTION_FLAG_LOOP) !== 0,
  );
  const floor = loops ? EFXBN_PREVIEW_FRAME_COUNT : EFXBN_PREVIEW_MIN_FRAME_COUNT;
  return Math.min(EFXBN_PREVIEW_MAX_FRAME_COUNT, Math.max(floor, Math.ceil(longest)));
}

export type EfxbnModelPoolRequirement = {
  pair: EfxbnEmitterPair;
  required: number;
  capacity: number;
};

export type EfxbnModelPoolPlan = {
  requirements: EfxbnModelPoolRequirement[];
  capacityByEffectIndex: ReadonlyMap<number, number>;
  totalRequired: number;
  totalCapacity: number;
  limitedEffectCount: number;
  globalLimit: number;
  truncated: boolean;
};

function normalizedPoolLimit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function resolveEfxbnModelPoolPlan(
  plan: EffectFolderPreviewPlan,
  frameCount = EFXBN_PREVIEW_FRAME_COUNT,
  perEffectLimit = EFXBN_MODEL_POOL_LIMIT,
  globalLimit = EFXBN_MODEL_POOL_GLOBAL_LIMIT,
): EfxbnModelPoolPlan {
  const normalizedPerEffectLimit = normalizedPoolLimit(perEffectLimit, EFXBN_MODEL_POOL_LIMIT);
  const normalizedGlobalLimit = normalizedPoolLimit(globalLimit, EFXBN_MODEL_POOL_GLOBAL_LIMIT);
  const localModelEffects = new Set(
    plan.targets.flatMap((target) => target.effectIndex === null ? [] : [target.effectIndex]),
  );
  const rawRequirements = resolveEfxbnEmitterPairs(plan).flatMap((pair) => {
    if (!localModelEffects.has(pair.target.index)) return [];
    let required = 0;
    for (let frame = 0; frame <= frameCount; frame += 1) {
      required = Math.max(
        required,
        simulateEfxbnEmitterPair(pair, plan, frame, EFXBN_SIMULATION_LIMIT).length,
      );
      if (required >= EFXBN_SIMULATION_LIMIT) break;
    }
    return [{ pair, required }];
  });

  const requiredByEffectIndex = new Map(
    rawRequirements.map((requirement) => [requirement.pair.target.index, requirement.required]),
  );
  for (const target of plan.targets) {
    if (target.effectIndex === null) continue;
    const block = plan.effectBlocks.find((candidate) => candidate.index === target.effectIndex);
    if (!block || (block.spawnFormType !== 9 && block.spawnFormType !== 10)) continue;
    requiredByEffectIndex.set(
      target.effectIndex,
      Math.max(1, requiredByEffectIndex.get(target.effectIndex) ?? 0),
    );
  }

  const orderedEffectIndexes = plan.targets.flatMap((target) =>
    target.effectIndex === null || !requiredByEffectIndex.has(target.effectIndex)
      ? []
      : [target.effectIndex]
  ).filter((effectIndex, index, values) => values.indexOf(effectIndex) === index);
  const desiredCapacityByEffectIndex = new Map(
    orderedEffectIndexes.map((effectIndex) => [
      effectIndex,
      Math.min(requiredByEffectIndex.get(effectIndex) ?? 0, normalizedPerEffectLimit),
    ]),
  );
  const capacityByEffectIndex = new Map(orderedEffectIndexes.map((effectIndex) => [effectIndex, 0]));
  let remaining = Math.min(
    normalizedGlobalLimit,
    Array.from(desiredCapacityByEffectIndex.values()).reduce((sum, capacity) => sum + capacity, 0),
  );
  while (remaining > 0) {
    let progressed = false;
    for (const effectIndex of orderedEffectIndexes) {
      if (remaining <= 0) break;
      const current = capacityByEffectIndex.get(effectIndex) ?? 0;
      const desired = desiredCapacityByEffectIndex.get(effectIndex) ?? 0;
      if (current >= desired) continue;
      capacityByEffectIndex.set(effectIndex, current + 1);
      remaining -= 1;
      progressed = true;
    }
    if (!progressed) break;
  }

  const requirements = rawRequirements.map((requirement) => ({
    ...requirement,
    capacity: capacityByEffectIndex.get(requirement.pair.target.index) ?? 0,
  }));
  const totalRequired = Array.from(requiredByEffectIndex.values()).reduce((sum, required) => sum + required, 0);
  const totalCapacity = Array.from(capacityByEffectIndex.values()).reduce((sum, capacity) => sum + capacity, 0);
  const limitedEffectCount = orderedEffectIndexes.filter(
    (effectIndex) => (capacityByEffectIndex.get(effectIndex) ?? 0) < (requiredByEffectIndex.get(effectIndex) ?? 0),
  ).length;
  return {
    requirements,
    capacityByEffectIndex,
    totalRequired,
    totalCapacity,
    limitedEffectCount,
    globalLimit: normalizedGlobalLimit,
    truncated: totalCapacity < totalRequired,
  };
}

export function resolveEfxbnModelPoolRequirements(
  plan: EffectFolderPreviewPlan,
  limit = EFXBN_MODEL_POOL_LIMIT,
  frameCount = EFXBN_PREVIEW_FRAME_COUNT,
): EfxbnModelPoolRequirement[] {
  return resolveEfxbnModelPoolPlan(plan, frameCount, limit, Number.MAX_SAFE_INTEGER).requirements;
}

export type EfxbnModelInstanceBinding = {
  /** One entry per pool slot; null where that slot has no live particle this frame. */
  slots: (EfxbnPreviewParticle | null)[];
  /** The slot each live particle holds, to feed back in on the next frame. */
  slotByParticleId: Map<number, number>;
};

/**
 * Bind live particles to model-instance pool slots, keeping a slot with its particle.
 *
 * The pool loads one model per slot and drives it from whichever particle it is given. Reading
 * the live-particle array by position does not work: the array closes up when a particle expires,
 * so every instance behind it snaps onto a different particle's position, scale and colour on
 * that single frame. With particles expiring continuously that is a permanent flicker across the
 * whole model half of the preview.
 *
 * Slots are therefore held across frames — the engine allocates instances from a free list for
 * the same reason — and released only when the particle that owned one is gone. Particle ids are
 * assigned in emission order and never reused, so they identify a particle across frames.
 */
export function bindEfxbnModelInstanceSlots(
  particles: readonly EfxbnPreviewParticle[],
  capacity: number,
  previousSlotByParticleId: ReadonlyMap<number, number>,
): EfxbnModelInstanceBinding {
  const size = Math.max(0, Math.floor(capacity));
  const slots = new Array<EfxbnPreviewParticle | null>(size).fill(null);
  const slotByParticleId = new Map<number, number>();
  if (size === 0) return { slots, slotByParticleId };

  const unplaced: EfxbnPreviewParticle[] = [];
  for (const particle of particles) {
    const held = previousSlotByParticleId.get(particle.id);
    if (held === undefined || held >= size || slots[held] !== null) {
      unplaced.push(particle);
      continue;
    }
    slots[held] = particle;
    slotByParticleId.set(particle.id, held);
  }

  let cursor = 0;
  for (const particle of unplaced) {
    while (cursor < size && slots[cursor] !== null) cursor += 1;
    if (cursor >= size) break;
    slots[cursor] = particle;
    slotByParticleId.set(particle.id, cursor);
  }
  return { slots, slotByParticleId };
}
