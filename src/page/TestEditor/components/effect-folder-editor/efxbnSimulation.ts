import type {
  EfxbnEffectSummary,
  EfxbnRuntimeNormalization,
} from "@/services/effectFolder/effectFolderService";
import { evaluateEfxbnControl, type EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";

export const EFXBN_PREVIEW_FRAME_COUNT = 120;
export const EFXBN_PREVIEW_FPS = 60;
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
  phaseAge: number;
  lifeTime: number;
  position: [number, number, number];
  size: [number, number];
  scale: [number, number, number];
  color: [number, number, number, number];
  rotation: number;
  rotationEuler: [number, number, number];
  history: [number, number, number][];
};

const LCG_MULTIPLIER = 1_664_525;
const LCG_INCREMENT = 1_013_904_223;
const UINT32_RANGE = 4_294_967_296;
const EPSILON = 0.00001;

type RandomSource = {
  nextUnit: () => number;
  nextSigned: () => number;
};

function makeRandomSource(initialSeed: number): RandomSource {
  let seed = initialSeed >>> 0;
  const nextUnit = () => {
    seed = (Math.imul(seed, LCG_MULTIPLIER) + LCG_INCREMENT) >>> 0;
    return seed / UINT32_RANGE;
  };
  return { nextUnit, nextSigned: () => nextUnit() * 2 - 1 };
}

function pairSeed(emitterIndex: number | null, targetIndex: number): number {
  return (
    Math.imul((emitterIndex ?? 0x6d2b79f5) ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(targetIndex ^ 0xc2b2ae35, 0x27d4eb2d)
  ) >>> 0;
}

function randomizedBase(base: number, randomRate: number, random: RandomSource): number {
  return base * (1 + random.nextSigned() * randomRate);
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
  const looping = isLooping(target);
  if (!looping && age >= lifeTime) return null;
  const phaseAge = looping ? age % lifeTime : age;
  const curveProgress = (sampleAge: number) => {
    const samplePhase = looping ? sampleAge % lifeTime : Math.min(sampleAge, lifeTime);
    return (samplePhase / lifeTime) * 100;
  };

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
  let gravityVelocity = 0;
  let directionVelocity = 0;
  let elapsed = 0;
  const historySamples: Array<{ age: number; position: [number, number, number] }> = target.effectType === EFXBN_ELEMENT_TYPE.strip
    ? [{ age: 0, position: [...position] }]
    : [];
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
    const velocity: [number, number, number] = [
      controlValue(target, plan, "speedBaseX", progress) * speedRate[0],
      controlValue(target, plan, "speedBaseY", progress) * speedRate[1],
      controlValue(target, plan, "speedBaseZ", progress) * speedRate[2],
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
      historySamples.push({ age: elapsed, position: [...position] });
      nextStripSample += stripInterval;
    }
  }
  if (target.effectType === EFXBN_ELEMENT_TYPE.strip &&
      (historySamples.length === 0 || Math.abs(historySamples[historySamples.length - 1].age - age) > EPSILON)) {
    const finalSample = { age, position: [...position] as [number, number, number] };
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
          .map((sample) => sample.position)
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

function isLooping(block: EfxbnEffectSummary): boolean {
  return (efxbnRuntime(block).actionFlags & 1) !== 0;
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
  const random = makeRandomSource(pairSeed(pair.emitter?.index ?? null, pair.target.index));
  const particles: EfxbnPreviewParticle[] = [];
  const emitter = pair.emitter;
  let generatorCounter = 0;
  let delayCounter = emitter?.delayEmitTimeBase ?? 0;
  let particleId = 0;
  const lastTick = Math.floor(clampedFrame);
  for (let tick = 0; tick <= lastTick && particles.length < maxParticles; tick += 1) {
    const emitterLifeTime = Math.max(EPSILON, emitter?.lifeTimeBase ?? 1);
    const looping = emitter ? isLooping(emitter) : false;
    if (emitter && !looping && tick > emitterLifeTime) break;
    if (Math.abs(delayCounter) >= EPSILON) {
      delayCounter -= 1;
      continue;
    }

    if (generatorCounter <= EPSILON) {
      const emitCount = Math.max(0, emitter?.numEmit ?? pair.target.numEmit ?? 1);
      const emitterProgress = ((tick % emitterLifeTime) / emitterLifeTime) * 100;
      for (let index = 0; index < emitCount && particles.length < maxParticles; index += 1) {
        const particle = simulateParticle(
          pair,
          plan,
          tick,
          clampedFrame,
          particleId,
          random,
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
    for (let frame = 0; frame <= EFXBN_PREVIEW_FRAME_COUNT; frame += 1) {
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
): EfxbnModelPoolRequirement[] {
  return resolveEfxbnModelPoolPlan(plan, limit, Number.MAX_SAFE_INTEGER).requirements;
}
