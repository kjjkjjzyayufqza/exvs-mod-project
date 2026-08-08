import { describe, expect, it } from "vitest";
import type {
  EffectFolderHash,
  EfxbnControlLookupEntry,
  EfxbnControlReferenceSummary,
  EfxbnEffectSummary,
} from "@/services/effectFolder/effectFolderService";
import type { EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import { makeEfxbnEffectBlock } from "./efxbnTestFactory";
import {
  resolveEfxbnEmitterPairs,
  resolveEfxbnModelPoolRequirements,
  simulateEfxbnEmitterPair,
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
