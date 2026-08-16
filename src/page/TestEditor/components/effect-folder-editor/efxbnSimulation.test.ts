import { describe, expect, it } from "vitest";
import type {
  EffectFolderHash,
  EfxbnControlLookupEntry,
  EfxbnControlReferenceSummary,
  EfxbnEffectSummary,
} from "@/services/effectFolder/effectFolderService";
import type { EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import { makeEfxbnEffectBlock, makeEfxbnRuntime } from "./efxbnTestFactory";
import {
  bindEfxbnModelInstanceSlots,
  EFXBN_PREVIEW_FRAME_COUNT,
  EFXBN_PREVIEW_MAX_FRAME_COUNT,
  EFXBN_PREVIEW_MIN_FRAME_COUNT,
  efxbnParticleLifeCount,
  resolveEfxbnPreviewFrameCount,
  efxbnSpawnBasis,
  resolveEfxbnEmitCount,
  resolveEfxbnEmitterPairs,
  resolveEfxbnModelPoolRequirements,
  resolveEfxbnShaderVariants,
  simulateEfxbnEmitterPair,
  type EfxbnPreviewParticle,
} from "./efxbnSimulation";

const ZERO_HASH: EffectFolderHash = { signed: 0, unsigned: 0, hex: "0x00000000" };

function block(overrides: Partial<EfxbnEffectSummary>): EfxbnEffectSummary {
  return makeEfxbnEffectBlock(overrides);
}

function directControls(values: Record<string, number>) {
  const entries: EfxbnControlLookupEntry[] = [];
  const references: EfxbnControlReferenceSummary[] = [];
  Object.entries(values).forEach(([name, value], index) => {
    entries.push({ index, keyF32Bits: 0, key: 0, valueF32Bits: 0, value });
    references.push({ index, name, rawOffset: 0, runtimeOffset: 0, selector: 1, lookupIndex: index });
  });
  return { entries, references };
}

function linearControl(name: string, from: number, to: number, lookupIndex: number) {
  return {
    reference: {
      index: lookupIndex,
      name,
      rawOffset: 0,
      runtimeOffset: 0,
      selector: 2,
      lookupIndex,
    } satisfies EfxbnControlReferenceSummary,
    entries: [
      { index: lookupIndex, keyF32Bits: 0, key: 0, valueF32Bits: 0, value: from },
      { index: lookupIndex + 1, keyF32Bits: 0, key: 100, valueF32Bits: 0, value: to },
    ] satisfies EfxbnControlLookupEntry[],
  };
}

function plan(effectBlocks: EfxbnEffectSummary[], controlLookupEntries: EfxbnControlLookupEntry[]): EffectFolderPreviewPlan {
  return {
    kind: "efxbn",
    key: "fixture",
    targets: [],
    localAnimationCount: 0,
    unresolvedModelHashes: [],
    unresolvedAnimationHashes: [],
    unresolvedTextureHashes: [],
    textureParameters: [],
    textureBindings: [],
    localTextureCount: 0,
    commonModelCount: 0,
    commonTextureCount: 0,
    effectBlocks,
    controlLookupEntries,
  };
}

describe("EFXBN frame simulation", () => {
  it("uses wrapper topology and reaches the expected steady particle count for the 167 pattern", () => {
    const wrapper = block({
      index: 0,
      effectType: 9,
      referencedEffectIndex: 1,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 1,
      intervalBase: 1,
      numEmit: 3,
      actionFlags: 1,
      spawnFormType: 3,
      spawnFormLength: [0.7, 0, 0, 0],
    });
    const target = block({ index: 1, lifeTimeBase: 16 });
    const sourcePlan = plan([wrapper, target], []);
    const pairs = resolveEfxbnEmitterPairs(sourcePlan);

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ emitter: { index: 0 }, target: { index: 1 } });
    expect(simulateEfxbnEmitterPair(pairs[0], sourcePlan, 20)).toHaveLength(48);
  });

  it("applies the shader counter order so interval two emits on frames 0, 2, and 4", () => {
    const wrapper = block({
      index: 0,
      effectType: 9,
      referencedEffectIndex: 1,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 1,
      intervalBase: 2,
      numEmit: 2,
      actionFlags: 1,
    });
    const target = block({ index: 1, lifeTimeBase: 20 });
    const sourcePlan = plan([wrapper, target], []);

    expect(simulateEfxbnEmitterPair(resolveEfxbnEmitterPairs(sourcePlan)[0], sourcePlan, 4)).toHaveLength(6);
  });

  it("evaluates per-particle curves and frame-based gravity instead of global UI progress", () => {
    const wrapperControls = directControls({ spawnForm0: 0, spawnForm1: 0, spreadX: 0, spreadY: 0 });
    const targetControls = directControls({
      speedBaseX: 0,
      speedBaseY: 0.02,
      speedBaseZ: 0,
      scaleBaseX: 1,
      scaleBaseY: 1,
      colorR: 1,
      colorG: 1,
      colorB: 1,
      worldGravityAccel: -0.02,
      directionAccel: 0,
    });
    const alpha = linearControl("colorA", 1, 0, wrapperControls.entries.length + targetControls.entries.length);
    const offset = wrapperControls.entries.length;
    const shiftedTargetReferences = targetControls.references.map((reference) => ({
      ...reference,
      index: reference.index + offset,
      lookupIndex: reference.lookupIndex + offset,
    }));
    const shiftedTargetEntries = targetControls.entries.map((entry) => ({
      ...entry,
      index: entry.index + offset,
    }));
    const wrapper = block({
      index: 0,
      effectType: 9,
      referencedEffectIndex: 1,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 1,
      intervalBase: 100,
      actionFlags: 1,
      // Spawn form 1 leaves the spawn basis at identity, so speedBase reads as world XYZ here.
      spawnFormType: 1,
      controlReferences: wrapperControls.references,
    });
    const target = block({
      index: 1,
      lifeTimeBase: 20,
      actionFlags: 0x1000,
      controlReferences: [...shiftedTargetReferences, alpha.reference],
    });
    const sourcePlan = plan(
      [wrapper, target],
      [...wrapperControls.entries, ...shiftedTargetEntries, ...alpha.entries],
    );
    const particle = simulateEfxbnEmitterPair(resolveEfxbnEmitterPairs(sourcePlan)[0], sourcePlan, 2)[0];

    expect(particle.position[1]).toBeCloseTo(-0.02, 6);
    expect(particle.color[3]).toBeCloseTo(0.9, 6);
  });

  it("sizes a bounded local model pool from live shader particles", () => {
    const modelHash = { signed: 7, unsigned: 7, hex: "0x00000007" };
    const wrapper = block({
      index: 0,
      effectType: 9,
      referencedEffectIndex: 1,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 1,
      intervalBase: 1,
      numEmit: 2,
      actionFlags: 1,
    });
    const target = block({ index: 1, modelHash, lifeTimeBase: 3 });
    const sourcePlan = {
      ...plan([wrapper, target], []),
      targets: [{
        effectIndex: 1,
        modelHash,
        modelPath: "E:\\effect\\model.numdlb",
        animationHash: null,
        animationPath: null,
        source: "pack" as const,
      }],
    };

    expect(resolveEfxbnModelPoolRequirements(sourcePlan, 4)[0]).toMatchObject({
      required: 6,
      capacity: 4,
      pair: { target: { index: 1 } },
    });
  });

  it("spawns type 9 particles from decoded mesh points and multiplies vertex color", () => {
    const controls = directControls({
      speedBaseX: 0,
      speedBaseY: 0,
      speedBaseZ: 0,
      scaleBaseX: 1,
      scaleBaseY: 1,
      scaleBaseZ: 1,
      colorR: 1,
      colorG: 1,
      colorB: 1,
      colorA: 1,
    });
    const wrapper = block({
      index: 0,
      effectType: 9,
      referencedEffectIndex: 1,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      spawnFormType: 9,
      spawnFormLength: [0, 0, 0, 0],
      positionOffset: [10, 0, 0, 0],
    });
    const target = block({ index: 1, controlReferences: controls.references });
    const sourcePlan = plan([wrapper, target], controls.entries);
    const points = new Map([[0, [{
      position: [1, 2, 3] as [number, number, number],
      normal: [0, 1, 0] as [number, number, number],
      color: [0.5, 0.6, 0.7, 0.8] as [number, number, number, number],
    }]]]);
    const particle = simulateEfxbnEmitterPair(
      resolveEfxbnEmitterPairs(sourcePlan)[0],
      sourcePlan,
      0,
      1,
      points,
    )[0];

    expect(particle.position).toEqual([11, 2, 3]);
    expect(particle.color).toEqual([0.5, 0.6, 0.7, 0.8]);
  });
});

describe("EFXBN particle life count (efxKineticParticleBillboard3rd)", () => {
  // `add r2.z, lifeCount, 1 ; lt lifeTime, that ; movc ... ; movc r6.xyzw, loopBit,
  //  r3.wyxz(=1.0, ...), r4.xyzw` — expiry resets lifeCount to 1.0 and touches nothing else.
  it("counts up, then wraps to one instead of zero when the loop bit is set", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((age) => efxbnParticleLifeCount(age, 4, true, false)))
      .toEqual([0, 1, 2, 3, 1, 2, 3]);
  });

  it("clamps at lifeTime under the force-loop flag so the emitter never expires", () => {
    expect([0, 3, 4, 9].map((age) => efxbnParticleLifeCount(age, 4, true, true)))
      .toEqual([0, 3, 4, 4]);
  });

  it("counts straight up when neither loop flag is set", () => {
    expect([0, 1, 5].map((age) => efxbnParticleLifeCount(age, 4, false, false)))
      .toEqual([0, 1, 5]);
  });
});

describe("EFXBN spawn basis (efxSpawnParticleCommon3rd)", () => {
  // spawnSystem column 1 is the spawn direction: with C = 0 the shader builds
  // column0 = (cosB, 0, -sinB), column1 = (sinA sinB, cosA, sinA cosB), column2 =
  // (cosA sinB, -sinA, cosA cosB), i.e. Ry(azimuth) * Rx(polar).
  it("is the identity when the direction is +Y, which is the no-emitter case", () => {
    const basis = efxbnSpawnBasis([0, 1, 0]);
    const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    [basis.x, basis.y, basis.z].forEach((column, columnIndex) => {
      column.forEach((value, row) => expect(value).toBeCloseTo(identity[columnIndex][row], 6));
    });
  });

  it("puts the spawn direction on column 1 and stays orthonormal", () => {
    const direction: [number, number, number] = [0.6, 0, 0.8];
    const basis = efxbnSpawnBasis(direction);
    expect(basis.y[0]).toBeCloseTo(0.6, 6);
    expect(basis.y[2]).toBeCloseTo(0.8, 6);
    const dot = (a: readonly number[], b: readonly number[]) =>
      a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    expect(dot(basis.x, basis.y)).toBeCloseTo(0, 6);
    expect(dot(basis.y, basis.z)).toBeCloseTo(0, 6);
    expect(dot(basis.x, basis.z)).toBeCloseTo(0, 6);
    expect(dot(basis.x, basis.x)).toBeCloseTo(1, 6);
  });
});

describe("EFXBN emit count randomisation (efxKineticEmitterCommon3rd)", () => {
  // bfi r5.w, l(31), l(1), numEmitCountRandom, l(1)  →  2R + 1
  // udiv null, r5.w, lcg(seed), r5.w ; iadd r5.x, -R, r5.w ; iadd numEmit, r5.x
  it("offsets numEmit by lcg(seed) % (2R + 1) - R", () => {
    expect(resolveEfxbnEmitCount(5, 0, 0, 0x1234_5678)).toBe(5);
    const randomised = resolveEfxbnEmitCount(5, 2, 0, 0x1234_5678);
    expect(randomised).toBeGreaterThanOrEqual(3);
    expect(randomised).toBeLessThanOrEqual(7);
    expect(resolveEfxbnEmitCount(5, 2, 0, 0x1234_5678)).toBe(randomised);
  });

  it("replaces the count entirely when meshEmitterCount is set", () => {
    expect(resolveEfxbnEmitCount(5, 2, 9, 0x1234_5678)).toBe(9);
  });
});

describe("EFXBN Phase A simulation semantics", () => {
  const kinematicControls = (speed: Record<string, number>) =>
    directControls({
      speedBaseX: 0,
      speedBaseY: 0,
      speedBaseZ: 0,
      scaleBaseX: 1,
      scaleBaseY: 1,
      scaleBaseZ: 1,
      colorR: 1,
      colorG: 1,
      colorB: 1,
      colorA: 1,
      ...speed,
    });

  it("wraps a looping particle's curve phase without rebuilding its position", () => {
    const controls = kinematicControls({ speedBaseY: 1 });
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 200,
      intervalBase: 1000,
      numEmit: 1,
      actionFlags: 1,
      // Spawn form 1 keeps the spawn basis at identity so speedBaseY reads as world +Y.
      spawnFormType: 1,
      controlReferences: controls.references,
    });
    const target = block({
      index: 1,
      lifeTimeBase: 4,
      actionFlags: 1,
      controlReferences: controls.references,
    });
    const sourcePlan = plan([emitter, target], controls.entries);
    const pair = resolveEfxbnEmitterPairs(sourcePlan)[0];

    const frames = [3, 4, 5].map((frame) => simulateEfxbnEmitterPair(pair, sourcePlan, frame)[0]);
    expect(frames.map((particle) => particle.phaseAge)).toEqual([3, 1, 2]);
    // Position keeps accumulating straight through the cycle boundary.
    expect(frames[1].position[1]).toBeGreaterThan(frames[0].position[1]);
    expect(frames[2].position[1]).toBeGreaterThan(frames[1].position[1]);
  });

  it("keeps every live particle's randomised state fixed as the frame advances past an expiry", () => {
    const controls = kinematicControls({ speedBaseY: 1 });
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 400,
      intervalBase: 1,
      numEmit: 3,
      spawnFormType: 1,
      controlReferences: controls.references,
    });
    // A randomised lifetime means particles emitted on the same tick expire on different frames,
    // which is what re-randomises everything behind them when the draw stream is shared.
    const target = block({
      index: 1,
      lifeTimeBase: 6,
      lifeTimeRandom: 0.6,
      sizeRandom: [0.5, 0.5, 0.5, 0],
      rotationRandom: [1, 1, 1, 0],
      controlReferences: controls.references,
    });
    const sourcePlan = plan([emitter, target], controls.entries);
    const pair = resolveEfxbnEmitterPairs(sourcePlan)[0];

    const lifeTimeById = new Map<number, number>();
    const rotationById = new Map<number, string>();
    for (let frame = 4; frame <= 24; frame += 1) {
      for (const particle of simulateEfxbnEmitterPair(pair, sourcePlan, frame)) {
        const knownLifeTime = lifeTimeById.get(particle.id);
        if (knownLifeTime === undefined) {
          lifeTimeById.set(particle.id, particle.lifeTime);
          rotationById.set(particle.id, particle.rotationEuler.join(","));
          continue;
        }
        expect(
          particle.lifeTime,
          `particle ${particle.id} was re-randomised at frame ${frame}`,
        ).toBeCloseTo(knownLifeTime, 10);
        expect(rotationById.get(particle.id)).toBe(particle.rotationEuler.join(","));
      }
    }
    // The fixture has to actually exercise expiry, or the assertion above proves nothing.
    expect(lifeTimeById.size).toBeGreaterThan(20);
  });

  it("keeps a model instance slot bound to the same particle while that particle lives", () => {
    const controls = kinematicControls({ speedBaseY: 1 });
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 400,
      intervalBase: 1,
      numEmit: 2,
      spawnFormType: 1,
      controlReferences: controls.references,
    });
    const target = block({
      index: 1,
      lifeTimeBase: 8,
      lifeTimeRandom: 0.6,
      controlReferences: controls.references,
    });
    const sourcePlan = plan([emitter, target], controls.entries);
    const pair = resolveEfxbnEmitterPairs(sourcePlan)[0];
    const capacity = 24;

    let previous = new Map<number, number>();
    const slotHistory = new Map<number, number>();
    let expiries = 0;
    let live = 0;
    for (let frame = 2; frame <= 40; frame += 1) {
      const particles = simulateEfxbnEmitterPair(pair, sourcePlan, frame, capacity);
      const binding = bindEfxbnModelInstanceSlots(particles, capacity, previous);
      previous = binding.slotByParticleId;
      if (particles.length < live) expiries += 1;
      live = particles.length;

      binding.slots.forEach((particle, slot) => {
        if (!particle) return;
        const knownSlot = slotHistory.get(particle.id);
        if (knownSlot === undefined) {
          slotHistory.set(particle.id, slot);
          return;
        }
        expect(knownSlot, `particle ${particle.id} moved slot at frame ${frame}`).toBe(slot);
      });
      // Every live particle must be on screen; the pool is wider than the live set here.
      expect(binding.slots.filter(Boolean)).toHaveLength(particles.length);
    }
    // Without expiries in the run, a stable-slot assertion proves nothing.
    expect(expiries).toBeGreaterThan(0);
  });

  it("reuses a freed model instance slot for a later particle", () => {
    const particle = (id: number) =>
      ({ id, position: [0, 0, 0] }) as unknown as EfxbnPreviewParticle;

    const first = bindEfxbnModelInstanceSlots([particle(0), particle(1)], 2, new Map());
    expect(first.slots.map((entry) => entry?.id ?? null)).toEqual([0, 1]);

    const afterExpiry = bindEfxbnModelInstanceSlots(
      [particle(1), particle(2)],
      2,
      first.slotByParticleId,
    );
    expect(afterExpiry.slots.map((entry) => entry?.id ?? null)).toEqual([2, 1]);
  });

  it("drops nothing and allocates no slot when the pool has no capacity", () => {
    const binding = bindEfxbnModelInstanceSlots([], 0, new Map());
    expect(binding.slots).toEqual([]);
    expect(binding.slotByParticleId.size).toBe(0);
  });

  it("randomises emitter lifetime so differently seeded pairs stop emitting at different frames", () => {
    const controls = kinematicControls({});
    const makePlan = (emitterIndex: number, targetIndex: number) => {
      const emitter = block({
        index: emitterIndex,
        effectType: 9,
        childIndexSize: 1,
        childIndexArray: [targetIndex, -1, -1, -1, -1, -1, -1, -1],
        lifeTimeBase: 40,
        lifeTimeRandom: 0.5,
        intervalBase: 1,
        numEmit: 1,
        controlReferences: controls.references,
      });
      const target = block({ index: targetIndex, lifeTimeBase: 1000, actionFlags: 1 });
      return plan([emitter, target], controls.entries);
    };
    const countAt = (emitterIndex: number, targetIndex: number) => {
      const sourcePlan = makePlan(emitterIndex, targetIndex);
      return simulateEfxbnEmitterPair(resolveEfxbnEmitterPairs(sourcePlan)[0], sourcePlan, 80).length;
    };

    const first = countAt(0, 1);
    const second = countAt(2, 3);
    expect(first).not.toBe(second);
    // life = 40 * (1 +/- 0.5), so the emitter must stop between 20 and 60 emissions.
    for (const count of [first, second]) {
      expect(count).toBeGreaterThanOrEqual(20);
      expect(count).toBeLessThanOrEqual(61);
    }
  });

  it("drives emitter curves from lifeTimeRatio * lifeCount rather than a raw frame modulo", () => {
    // spreadX ramps 0 -> PI/2 across the emitter's life, so a randomised lifetime moves the
    // sample point. lifeTimeRandom 0 keeps ratio 1 and pins the ramp to lifeTimeBase.
    const ramp = linearControl("spreadX", 0, Math.PI / 2, 0);
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 10,
      intervalBase: 1,
      numEmit: 1,
      controlReferences: [ramp.reference],
    });
    const controls = kinematicControls({ speedBaseY: 1 });
    const target = block({ index: 1, lifeTimeBase: 100, controlReferences: controls.references });
    const sourcePlan = plan([emitter, target], [...ramp.entries, ...controls.entries]);
    const particles = simulateEfxbnEmitterPair(
      resolveEfxbnEmitterPairs(sourcePlan)[0],
      sourcePlan,
      10,
    );

    // The emitter dies once lifeCount passes lifeTimeBase, so it emits exactly 10 times.
    expect(particles).toHaveLength(10);
  });

  it("applies speedBase in the particle's own spawn frame, not world space", () => {
    const controls = kinematicControls({ speedBaseY: 1 });
    const ringAngle = Math.PI / 2;
    const angleControls = directControls({ spawnForm0: ringAngle, spawnForm1: ringAngle });
    const shiftedControls = controls.references.map((reference) => ({
      ...reference,
      index: reference.index + angleControls.entries.length,
      lookupIndex: reference.lookupIndex + angleControls.entries.length,
    }));
    const shiftedEntries = controls.entries.map((entry) => ({
      ...entry,
      index: entry.index + angleControls.entries.length,
    }));
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 100,
      intervalBase: 1000,
      numEmit: 1,
      spawnFormType: 3,
      spawnFormLength: [2, 0, 0, 0],
      controlReferences: angleControls.references,
    });
    const target = block({ index: 1, lifeTimeBase: 100, controlReferences: shiftedControls });
    const sourcePlan = plan([emitter, target], [...angleControls.entries, ...shiftedEntries]);
    const particle = simulateEfxbnEmitterPair(
      resolveEfxbnEmitterPairs(sourcePlan)[0],
      sourcePlan,
      4,
    )[0];

    // The ring places the particle at +Z with an outward direction, so speedBaseY travels
    // along +Z and leaves world Y alone.
    expect(particle.position[2]).toBeGreaterThan(4);
    expect(particle.position[1]).toBeCloseTo(0, 6);
  });
});

describe("EFXBN preview window", () => {
  it("spans the emitter's own life plus the tail of the particles it spawns", () => {
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 60,
      delayEmitTimeBase: 10,
    });
    const target = block({ index: 1, lifeTimeBase: 20 });

    expect(resolveEfxbnPreviewFrameCount([emitter, target])).toBe(90);
  });

  it("follows a nested emitter chain rather than stopping at the first child", () => {
    const root = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 40,
    });
    const middle = block({
      index: 1,
      effectType: 6,
      childIndexSize: 1,
      childIndexArray: [2, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 30,
      delayEmitTimeBase: 5,
    });
    const leaf = block({ index: 2, lifeTimeBase: 25 });

    expect(resolveEfxbnPreviewFrameCount([root, middle, leaf])).toBe(100);
  });

  it("covers the randomised upper bound of a lifetime, not just its base", () => {
    const solo = block({ index: 0, lifeTimeBase: 40, lifeTimeRandom: 0.5 });

    expect(resolveEfxbnPreviewFrameCount([solo])).toBe(60);
  });

  it("clamps a very short effect up and a very long one down", () => {
    expect(resolveEfxbnPreviewFrameCount([block({ index: 0, lifeTimeBase: 4 })])).toBe(
      EFXBN_PREVIEW_MIN_FRAME_COUNT,
    );
    expect(resolveEfxbnPreviewFrameCount([block({ index: 0, lifeTimeBase: 9_000 })])).toBe(
      EFXBN_PREVIEW_MAX_FRAME_COUNT,
    );
  });

  it("never shortens the window for a looping effect, which has no natural end", () => {
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 20,
      actionFlags: 1,
    });
    const target = block({ index: 1, lifeTimeBase: 10 });

    // One cycle is 30 frames; restarting that often would make the effect pulse.
    expect(resolveEfxbnPreviewFrameCount([emitter, target])).toBe(EFXBN_PREVIEW_FRAME_COUNT);
  });

  it("still extends past the fixed window for a long looping effect", () => {
    const emitter = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 200,
      actionFlags: 1,
    });
    const target = block({ index: 1, lifeTimeBase: 40 });

    expect(resolveEfxbnPreviewFrameCount([emitter, target])).toBe(240);
  });

  it("survives a child cycle instead of recursing forever", () => {
    const first = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 20,
    });
    const second = block({
      index: 1,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [0, -1, -1, -1, -1, -1, -1, -1],
      lifeTimeBase: 20,
    });

    expect(resolveEfxbnPreviewFrameCount([first, second])).toBe(40);
  });

  it("falls back to the minimum window when no block declares a lifetime", () => {
    expect(resolveEfxbnPreviewFrameCount([])).toBe(EFXBN_PREVIEW_MIN_FRAME_COUNT);
  });
});

describe("EFXBN block topology", () => {
  it("pairs every declared child, not only the first", () => {
    const wrapper = block({
      index: 0,
      effectType: 9,
      childIndexSize: 3,
      childIndexArray: [1, 2, 3, -1, -1, -1, -1, -1],
      referencedEffectIndex: 1,
    });
    const children = [1, 2, 3].map((index) => block({ index }));

    const pairs = resolveEfxbnEmitterPairs(plan([wrapper, ...children], []));

    expect(pairs).toHaveLength(3);
    expect(pairs.map((pair) => pair.target.index)).toEqual([1, 2, 3]);
    expect(pairs.every((pair) => pair.emitter?.index === 0)).toBe(true);
  });

  it("treats any block with children as an emitter, not just element type 9", () => {
    const emitter = block({
      index: 0,
      effectType: 1,
      childIndexSize: 1,
      childIndexArray: [1, -1, -1, -1, -1, -1, -1, -1],
    });
    const child = block({ index: 1 });

    const pairs = resolveEfxbnEmitterPairs(plan([emitter, child], []));

    // The emitter is drawable itself, so it also renders standalone.
    expect(pairs).toHaveLength(2);
    expect(pairs[0].emitter?.index).toBe(0);
    expect(pairs[0].target.index).toBe(1);
    expect(pairs[1].emitter).toBeNull();
    expect(pairs[1].target.index).toBe(0);
  });

  it("ignores child slots past childIndexSize", () => {
    const wrapper = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [1, 2, -1, -1, -1, -1, -1, -1],
    });

    const pairs = resolveEfxbnEmitterPairs(
      plan([wrapper, block({ index: 1 }), block({ index: 2 })], []),
    );

    expect(pairs.filter((pair) => pair.emitter !== null)).toHaveLength(1);
    expect(pairs[0].target.index).toBe(1);
  });

  it("does not render non-drawable element types standalone", () => {
    const orphanWrapper = block({ index: 0, effectType: 9, childIndexSize: 0 });

    const pairs = resolveEfxbnEmitterPairs(plan([orphanWrapper], []));

    expect(pairs).toHaveLength(0);
  });

  it("throws when a child index points at a missing block", () => {
    const wrapper = block({
      index: 0,
      effectType: 9,
      childIndexSize: 1,
      childIndexArray: [7, -1, -1, -1, -1, -1, -1, -1],
    });

    expect(() => resolveEfxbnEmitterPairs(plan([wrapper], []))).toThrow(
      /references child block 7/,
    );
  });
});

describe("resolveEfxbnShaderVariants", () => {
  const withFlag = (flag: number, meshMultiUvFlag = 0) =>
    makeEfxbnEffectBlock({ runtime: makeEfxbnRuntime({ drawScheme: { flag, meshMultiUvFlag } }) });

  it("selects every variant whose mask shares a bit with the draw scheme", () => {
    // Masks are any-bit-hit, not equality: sub_140188E30 tests `flag & mask`.
    expect(resolveEfxbnShaderVariants(withFlag(0))).toEqual([]);
    expect(resolveEfxbnShaderVariants(withFlag(0x40))).toEqual(["AddMix"]);
    // 0x80 is one bit of the 0x280 ColorEx mask, so it alone selects ColorEx.
    expect(resolveEfxbnShaderVariants(withFlag(0x90))).toEqual(["ColorEx"]);
    // enableSoftParticle (0x1) is one bit of the 0x10001 Soft mask. Both flags are real:
    // 001gundam_002chrgel_001/0/0/14.efxbn blocks 2 and 8.
    expect(resolveEfxbnShaderVariants(withFlag(0x411))).toEqual(["Soft"]);
    expect(resolveEfxbnShaderVariants(withFlag(0x491))).toEqual(["ColorEx", "Soft"]);
    // Lighting bit 0x4 hits the Light mask; 0x20000 hits both Light and HLight.
    expect(resolveEfxbnShaderVariants(withFlag(0x20004))).toEqual(["Light", "HLight"]);
  });

  it("only reports MultiUV once the caller confirms the mesh has a second UV set", () => {
    const block = withFlag(0x10, 0x1000);
    expect(resolveEfxbnShaderVariants(block)).toEqual([]);
    expect(resolveEfxbnShaderVariants(block, { meshHasSecondUvSet: true })).toEqual(["MultiUV"]);
  });
});
