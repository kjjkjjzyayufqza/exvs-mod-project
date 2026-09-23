/**
 * Static checks on the composed GLSL.
 *
 * The shaders are assembled from shared blocks, so the mistakes that are easy to
 * make are structural rather than arithmetic: declaring a uniform twice once a
 * block starts owning it, or forgetting an output on a pass that writes more than
 * one attachment. Both are link-time failures in the browser and neither shows up
 * in a type check, so they are caught here instead.
 */

import { describe, expect, test } from "vitest";

import { EXVS_DEFERRED_LIGHTING_FRAGMENT_GLSL } from "./exvsDeferredLightingShader";
import { EXVS_IBL_AMBIENT_FRAGMENT_GLSL } from "./exvsIblAmbientShader";
import { EXVS_COMPOSITE_FRAGMENT_GLSL } from "./exvsCompositeShader";
import { EXVS_CHARA_BASIC_FRAGMENT_GLSL } from "./exvsCharaBasicShader";
import {
  EXVS_DEPTH_REDUCE_FRAGMENT_GLSL,
  EXVS_SHADOW_RESOLVE_FRAGMENT_GLSL,
} from "./exvsShadowShader";
import {
  EXVS_SSAO_BLUR_FRAGMENT_GLSL,
  EXVS_SSAO_DOWNSAMPLE_FRAGMENT_GLSL,
  EXVS_SSAO_FRAGMENT_GLSL,
} from "./exvsSsaoShader";
import {
  EXVS_BLOOM_BRIGHT_FRAGMENT_GLSL,
  EXVS_BLOOM_COMBINE_FRAGMENT_GLSL,
  EXVS_BLOOM_DOWNSAMPLE_FRAGMENT_GLSL,
  EXVS_DOF_FRAGMENT_GLSL,
  EXVS_EFFECT_BLEND_FRAGMENT_GLSL,
  EXVS_FXAA_FRAGMENT_GLSL,
  EXVS_GAUSSIAN_BLUR_FRAGMENT_GLSL,
  EXVS_POST_FILTER_FRAGMENT_GLSL,
} from "./exvsPostShaders";
import {
  EXVS_GBUFFER_FRAGMENT_GLSL,
  EXVS_GBUFFER_VERTEX_GLSL,
  EXVS_DEPTH_ONLY_FRAGMENT_GLSL,
} from "./exvsGBufferShader";

const FRAGMENT_SHADERS: ReadonlyArray<readonly [string, string]> = [
  ["gBuffer", EXVS_GBUFFER_FRAGMENT_GLSL],
  ["depthOnly", EXVS_DEPTH_ONLY_FRAGMENT_GLSL],
  ["deferredLighting", EXVS_DEFERRED_LIGHTING_FRAGMENT_GLSL],
  ["iblAmbient", EXVS_IBL_AMBIENT_FRAGMENT_GLSL],
  ["shadowResolve", EXVS_SHADOW_RESOLVE_FRAGMENT_GLSL],
  ["depthReduce", EXVS_DEPTH_REDUCE_FRAGMENT_GLSL],
  ["ssaoDownsample", EXVS_SSAO_DOWNSAMPLE_FRAGMENT_GLSL],
  ["ssao", EXVS_SSAO_FRAGMENT_GLSL],
  ["ssaoBlur", EXVS_SSAO_BLUR_FRAGMENT_GLSL],
  ["composite", EXVS_COMPOSITE_FRAGMENT_GLSL],
  ["charaBasic", EXVS_CHARA_BASIC_FRAGMENT_GLSL],
  ["bloomBright", EXVS_BLOOM_BRIGHT_FRAGMENT_GLSL],
  ["bloomDownsample", EXVS_BLOOM_DOWNSAMPLE_FRAGMENT_GLSL],
  ["bloomCombine", EXVS_BLOOM_COMBINE_FRAGMENT_GLSL],
  ["gaussianBlur", EXVS_GAUSSIAN_BLUR_FRAGMENT_GLSL],
  ["dof", EXVS_DOF_FRAGMENT_GLSL],
  ["postFilter", EXVS_POST_FILTER_FRAGMENT_GLSL],
  ["effectBlend", EXVS_EFFECT_BLEND_FRAGMENT_GLSL],
  ["fxaa", EXVS_FXAA_FRAGMENT_GLSL],
];

/** Comments legitimately mention things like NaN, so they are stripped first. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function declaredUniformNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /^\s*uniform\s+[A-Za-z0-9_]+\s+([A-Za-z0-9_]+)\s*(?:\[[^\]]*\])?\s*;/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    names.push(match[1]);
    match = pattern.exec(source);
  }
  return names;
}

function outputLocations(source: string): number[] {
  const locations: number[] = [];
  const pattern = /layout\(location\s*=\s*(\d+)\)\s+out\s+/g;
  let match = pattern.exec(source);
  while (match !== null) {
    locations.push(Number(match[1]));
    match = pattern.exec(source);
  }
  return locations;
}

describe("composed fragment shaders", () => {
  test.each(FRAGMENT_SHADERS)("%s declares each uniform exactly once", (_name, source) => {
    const names = declaredUniformNames(source);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    expect(duplicates).toEqual([]);
  });

  test.each(FRAGMENT_SHADERS)("%s numbers its outputs from zero without gaps", (_name, source) => {
    const locations = outputLocations(source).sort((a, b) => a - b);
    expect(locations.length).toBeGreaterThan(0);
    expect(locations).toEqual(locations.map((_value, index) => index));
  });

  test.each(FRAGMENT_SHADERS)("%s has balanced braces", (_name, source) => {
    const open = (source.match(/\{/g) ?? []).length;
    const close = (source.match(/\}/g) ?? []).length;
    expect(open).toBe(close);
  });

  test.each(FRAGMENT_SHADERS)("%s leaves no unresolved template holes", (_name, source) => {
    // A mis-typed interpolation lands in the GLSL as the literal text, which the
    // compiler rejects. Comments are allowed to mention the same words.
    const code = stripComments(source);
    expect(code).not.toMatch(/\$\{/);
    expect(code).not.toContain("undefined");
    expect(code).not.toContain("NaN");
  });
});

/**
 * WebGL2 is GLSL ES 3.00. Everything here arrives in ES 3.10 or in desktop GL and
 * fails to compile in a browser, usually as "no matching overloaded function".
 * `textureGather` got into the ambient occlusion downsample this way.
 */
const ES_310_ONLY_BUILTINS = [
  "textureGather",
  "textureGatherOffset",
  "textureGatherOffsets",
  "textureQueryLevels",
  "textureQueryLod",
  "imageLoad",
  "imageStore",
  "imageSize",
  "imageAtomicAdd",
  "atomicAdd",
  "atomicCounter",
  "memoryBarrier",
  "barrier",
  "bitfieldExtract",
  "bitfieldInsert",
  "bitfieldReverse",
  "findLSB",
  "findMSB",
  "bitCount",
  "uaddCarry",
  "usubBorrow",
  "umulExtended",
  "imulExtended",
  "frexp",
  "ldexp",
  "packUnorm4x8",
  "packSnorm4x8",
  "unpackUnorm4x8",
  "unpackSnorm4x8",
  "interpolateAtCentroid",
  "interpolateAtSample",
  "interpolateAtOffset",
] as const;

describe("GLSL ES 3.00 conformance", () => {
  test.each(FRAGMENT_SHADERS)("%s uses no ES 3.10 builtin", (_name, source) => {
    const code = stripComments(source);
    const used = ES_310_ONLY_BUILTINS.filter((builtin) =>
      new RegExp(String.raw`\b${builtin}\s*\(`).test(code),
    );
    expect(used).toEqual([]);
  });

  test.each(FRAGMENT_SHADERS)("%s does not shadow a GLSL builtin name", (_name, source) => {
    // A variable named `step`, `mix` or `length` is legal and compiles on most
    // drivers, then fails on one of them. Cheaper to just not do it.
    const code = stripComments(source);
    const shadowed = ["step", "mix", "length", "normalize", "reflect", "cross", "distance"].filter(
      (builtin) =>
        new RegExp(String.raw`\b(?:float|vec2|vec3|vec4|int|ivec2)\s+${builtin}\b`).test(code),
    );
    expect(shadowed).toEqual([]);
  });
});

describe("G-buffer layout", () => {
  test("writes all four attachments", () => {
    expect(outputLocations(EXVS_GBUFFER_FRAGMENT_GLSL)).toEqual([0, 1, 2, 3]);
  });

  test("the lighting and ambient passes both write the two accumulation buffers", () => {
    expect(outputLocations(EXVS_DEFERRED_LIGHTING_FRAGMENT_GLSL)).toEqual([0, 1]);
    expect(outputLocations(EXVS_IBL_AMBIENT_FRAGMENT_GLSL)).toEqual([0, 1]);
  });

  test("the vertex shader feeds every varying the fragment shader reads", () => {
    const declared = (EXVS_GBUFFER_VERTEX_GLSL.match(/^out\s+\w+\s+(\w+);/gm) ?? []).map((line) =>
      line.replace(/^out\s+\w+\s+/, "").replace(";", ""),
    );
    for (const varying of declared) {
      expect(EXVS_GBUFFER_FRAGMENT_GLSL).toContain(varying);
    }
  });
});

describe("shared camera block", () => {
  test("every pass that reconstructs a position takes it from the shared uniforms", () => {
    for (const [name, source] of FRAGMENT_SHADERS) {
      if (!source.includes("exvsViewPositionFromDepth(") && !source.includes("exvsViewDepthFromDepth(")) {
        continue;
      }
      expect(source, `${name} should not redeclare the camera`).toContain(
        "uniform mat4 uExvsProjectionInverse;",
      );
      expect(source, `${name} should not carry a private projection uniform`).not.toMatch(
        /uniform mat4 uProjectionInverse;/,
      );
    }
  });
});
