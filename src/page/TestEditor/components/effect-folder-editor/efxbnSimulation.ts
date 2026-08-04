import type { EfxbnEffectSummary } from "@/services/effectFolder/effectFolderService";
import { evaluateEfxbnControl, type EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";

export const EFXBN_PREVIEW_FRAME_COUNT = 120;
export const EFXBN_PREVIEW_FPS = 60;
export const EFXBN_MODEL_POOL_LIMIT = 64;
export const EFXBN_SIMULATION_LIMIT = 2_048;

export type EfxbnEmitterPair = {
  emitter: EfxbnEffectSummary | null;
  target: EfxbnEffectSummary;
};

export type EfxbnPreviewParticle = {
  id: number;
  emitterEffectIndex: number | null;
  targetEffectIndex: number;
  age: number;
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
  let age = Math.max(0, frame - spawnFrame);
  if ((target.actionFlags & 1) !== 0) age %= lifeTime;
  else if (age >= lifeTime) return null;

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
  const historySamples: Array<{ age: number; position: [number, number, number] }> = target.effectType === 2
    ? [{ age: 0, position: [...position] }]
    : [];
  const stripInterval = Math.max(EPSILON, target.stripSegmentInterval || 1);
  let nextStripSample = stripInterval;
  while (elapsed < age) {
    const step = Math.min(
      1,
      age - elapsed,
      target.effectType === 2 ? Math.max(EPSILON, nextStripSample - elapsed) : Number.POSITIVE_INFINITY,
    );
    const progress = Math.min(100, ((elapsed + step) / lifeTime) * 100);
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
    if (target.effectType === 2 && elapsed + EPSILON >= nextStripSample) {
      historySamples.push({ age: elapsed, position: [...position] });
      nextStripSample += stripInterval;
    }
  }
  if (target.effectType === 2 &&
      (historySamples.length === 0 || Math.abs(historySamples[historySamples.length - 1].age - age) > EPSILON)) {
    historySamples.push({ age, position: [...position] });
  }

  const progress = Math.min(100, (age / lifeTime) * 100);
  const scaleX = controlValue(target, plan, "scaleBaseX", progress);
  const scaleY = controlValue(target, plan, "scaleBaseY", progress);
  const scaleZ = controlValue(target, plan, "scaleBaseZ", progress);
  const scale: [number, number, number] = [
    Math.abs(target.sizeBase[0] * sizeRandom[0] * scaleX),
    Math.abs(target.sizeBase[1] * sizeRandom[1] * scaleY),
    Math.abs(target.sizeBase[2] * sizeRandom[2] * scaleZ),
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
    history: target.effectType === 2
      ? historySamples
          .filter((sample) => sample.age >= Math.max(0, age - Math.max(0, target.stripSegmentLife)))
          .map((sample) => sample.position)
      : [],
  };
}

export function resolveEfxbnEmitterPairs(plan: EffectFolderPreviewPlan): EfxbnEmitterPair[] {
  const pairedTargets = new Set<number>();
  const pairs: EfxbnEmitterPair[] = plan.effectBlocks.flatMap((emitter) => {
    if (emitter.effectType !== 9 || emitter.referencedEffectIndex < 0) return [];
    const target = plan.effectBlocks.find((block) => block.index === emitter.referencedEffectIndex);
    if (!target) return [];
    pairedTargets.add(target.index);
    return [{ emitter, target }];
  });
  for (const target of plan.effectBlocks) {
    if (target.effectType === 9 || pairedTargets.has(target.index)) continue;
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
    const looping = emitter ? (emitter.actionFlags & 1) !== 0 : false;
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

export function resolveEfxbnModelPoolRequirements(
  plan: EffectFolderPreviewPlan,
  limit = EFXBN_MODEL_POOL_LIMIT,
): EfxbnModelPoolRequirement[] {
  const localModelEffects = new Set(
    plan.targets.flatMap((target) => target.effectIndex === null ? [] : [target.effectIndex]),
  );
  return resolveEfxbnEmitterPairs(plan).flatMap((pair) => {
    if (!localModelEffects.has(pair.target.index)) return [];
    let required = 0;
    for (let frame = 0; frame <= EFXBN_PREVIEW_FRAME_COUNT; frame += 1) {
      required = Math.max(
        required,
        simulateEfxbnEmitterPair(pair, plan, frame, EFXBN_SIMULATION_LIMIT).length,
      );
      if (required >= EFXBN_SIMULATION_LIMIT) break;
    }
    return [{ pair, required, capacity: Math.min(required, limit) }];
  });
}
