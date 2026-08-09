import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type MutableRefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ShaderMaterial,
} from "three";
import type { EfxbnControlLookupEntry } from "@/services/effectFolder/effectFolderService";
import type { EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import {
  evaluateEfxbnUvTransform,
  resolveEfxbnColorMapBinding,
  resolveEfxbnUvOffsetMapBinding,
  EFXBN_ADDRESS_MODE,
} from "./effectFolderPreviewPlan";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";
import {
  DRAW_SCHEME_FULL_BRIGHTNESS,
  EFXBN_PREVIEW_FRAME_COUNT,
  resolveEfxbnEmitterPairs,
  simulateEfxbnEmitterPair,
  type EfxbnEmitterPair,
  isEfxbnStripBlock,
  efxbnRuntime,
} from "./efxbnSimulation";
import {
  buildEfxbnStripMeshData,
  EFXBN_STRIP_VERTEX_LIMIT,
} from "./efxbnStripGeometry";
import {
  efxbnCustomBlendFactors,
  EFXBN_BLEND_STATE_ADD_MIX,
  threeBlendState,
  threeSideForEfxbnCullingType,
  useEfxbnTexture,
  usesEfxbnBorderAddressing,
} from "./EfxbnParticlePreview";

const MAX_STRIP_PARTICLES = 256;
const MAX_STRIP_INDICES = (EFXBN_STRIP_VERTEX_LIMIT / 2) * 6;

function dynamicAttribute(length: number, itemSize: number): BufferAttribute {
  return new BufferAttribute(new Float32Array(length), itemSize).setUsage(DynamicDrawUsage);
}

function createStripGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT * 3, 3));
  geometry.setAttribute("previousCenter", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT * 3, 3));
  geometry.setAttribute("nextCenter", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT * 3, 3));
  geometry.setAttribute("ribbonSide", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT, 1));
  geometry.setAttribute("ribbonWidth", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT, 1));
  geometry.setAttribute("uv", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT * 2, 2));
  geometry.setAttribute("offsetUv", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT * 2, 2));
  geometry.setAttribute("ribbonColor", dynamicAttribute(EFXBN_STRIP_VERTEX_LIMIT * 4, 4));
  geometry.setIndex(
    new BufferAttribute(new Uint16Array(MAX_STRIP_INDICES), 1).setUsage(DynamicDrawUsage),
  );
  geometry.setDrawRange(0, 0);
  return geometry;
}

function updateFloatAttribute(
  geometry: BufferGeometry,
  name: string,
  values: readonly number[],
): void {
  const attribute = geometry.getAttribute(name) as BufferAttribute;
  (attribute.array as Float32Array).set(values);
  attribute.needsUpdate = true;
}

function createStripMaterial(pair: EfxbnEmitterPair) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: efxbnRuntime(pair.target).zWriteEnable !== 0,
    depthTest: pair.target.zTestEnable !== 0,
    blending: threeBlendState(pair.target.blendState),
    ...efxbnCustomBlendFactors(pair.target.blendState),
    side: threeSideForEfxbnCullingType(pair.target.cullingType),
    toneMapped: false,
    uniforms: {
      colorMap: { value: null },
      hasColorMap: { value: 0 },
      uvOffsetMap: { value: null },
      hasUvOffsetMap: { value: 0 },
      distortion: { value: [0, 0] },
      colorBorder: { value: 0 },
      offsetBorder: { value: 0 },
      fullBrightness: {
        value: (efxbnRuntime(pair.target).drawScheme.flag & DRAW_SCHEME_FULL_BRIGHTNESS) !== 0 ? 1 : 0,
      },
      addMix: { value: pair.target.blendState === EFXBN_BLEND_STATE_ADD_MIX ? 1 : 0 },
    },
    vertexShader: `
      attribute vec3 previousCenter;
      attribute vec3 nextCenter;
      attribute float ribbonSide;
      attribute float ribbonWidth;
      attribute vec4 ribbonColor;
      attribute vec2 offsetUv;
      varying vec2 vUv;
      varying vec2 vOffsetUv;
      varying vec4 vColor;
      void main() {
        vec4 center = modelViewMatrix * vec4(position, 1.0);
        vec2 previous = (modelViewMatrix * vec4(previousCenter, 1.0)).xy;
        vec2 next = (modelViewMatrix * vec4(nextCenter, 1.0)).xy;
        vec2 tangent = next - previous;
        tangent = length(tangent) < 0.00001 ? vec2(0.0, 1.0) : normalize(tangent);
        center.xy += vec2(-tangent.y, tangent.x) * ribbonSide * ribbonWidth;
        gl_Position = projectionMatrix * center;
        vUv = uv;
        vOffsetUv = offsetUv;
        vColor = ribbonColor;
      }
    `,
    fragmentShader: `
      uniform sampler2D colorMap;
      uniform float hasColorMap;
      uniform sampler2D uvOffsetMap;
      uniform float hasUvOffsetMap;
      uniform vec2 distortion;
      uniform float colorBorder;
      uniform float offsetBorder;
      uniform float fullBrightness;
      uniform float addMix;
      varying vec2 vUv;
      varying vec2 vOffsetUv;
      varying vec4 vColor;
      float efxBorderAlpha(vec2 uvValue, float enabled) {
        if (enabled < 0.5) return 1.0;
        vec2 inside = step(vec2(0.0), uvValue) * step(uvValue, vec2(1.0));
        return inside.x * inside.y;
      }

      void main() {
        // Same ColorEx 0x80 path as the billboard shader; see EfxbnParticlePreview.
        vec2 colorUv = vUv;
        float offsetAlpha = 1.0;
        if (hasUvOffsetMap > 0.5) {
          vec4 offsetTexel = texture2D(uvOffsetMap, vOffsetUv);
          offsetAlpha = offsetTexel.a * efxBorderAlpha(vOffsetUv, offsetBorder);
          colorUv += offsetTexel.a * (offsetTexel.rg - 0.5) * distortion;
        }
        vec4 texel = hasColorMap > 0.5 ? texture2D(colorMap, colorUv) : vec4(1.0);
        vec4 color = texel * vColor;
        color.a *= offsetAlpha * efxBorderAlpha(colorUv, colorBorder);
        if (color.a < 0.01) discard;
        // Same AddMix 0x40 path as the billboard shader; see EfxbnParticlePreview.
        if (addMix > 0.5) {
          float bright = step(0.8, max(color.r, max(color.g, color.b)));
          color.rgb *= color.a;
          color.a = mix(color.a, 0.0, bright);
        }
        color.rgb *= mix(0.5, 1.0, fullBrightness);
        gl_FragColor = color;
      }
    `,
  });
}

function livePlan(
  plan: EffectFolderPreviewPlan,
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>,
): EffectFolderPreviewPlan {
  const entries = controlLookupEntriesRef.current;
  if (entries === plan.controlLookupEntries) return plan;
  return { ...plan, controlLookupEntries: entries };
}

function EfxbnStripLayer({
  pair,
  plan,
  controlLookupEntriesRef,
  progressRef,
  meshEmitterPointsByEffectIndex,
}: {
  pair: EfxbnEmitterPair;
  plan: EffectFolderPreviewPlan;
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>;
  progressRef: MutableRefObject<number>;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
}) {
  const geometry = useMemo(createStripGeometry, []);
  const material = useMemo(() => createStripMaterial(pair), [pair]);
  const textureBinding = resolveEfxbnColorMapBinding(plan, pair.target.index);
  const texture = useEfxbnTexture(
    textureBinding?.file?.path ?? null,
    textureBinding?.parameter.addressingMode ?? EFXBN_ADDRESS_MODE.wrap,
  );
  const offsetBinding = resolveEfxbnUvOffsetMapBinding(plan, pair.target.index);
  const offsetTexture = useEfxbnTexture(
    offsetBinding?.file?.path ?? null,
    offsetBinding?.parameter.addressingMode ?? EFXBN_ADDRESS_MODE.wrap,
  );
  useEffect(() => {
    material.uniforms.colorMap.value = texture;
    material.uniforms.hasColorMap.value = texture ? 1 : 0;
    material.uniforms.colorBorder.value =
      usesEfxbnBorderAddressing(textureBinding?.parameter.addressingMode) ? 1 : 0;
  }, [material, texture, textureBinding]);
  useEffect(() => {
    material.uniforms.uvOffsetMap.value = offsetTexture;
    material.uniforms.hasUvOffsetMap.value = offsetTexture ? 1 : 0;
    material.uniforms.distortion.value = [
      offsetBinding?.parameter.uvDistortionPowerU ?? 0,
      offsetBinding?.parameter.uvDistortionPowerV ?? 0,
    ];
    material.uniforms.offsetBorder.value =
      usesEfxbnBorderAddressing(offsetBinding?.parameter.addressingMode) ? 1 : 0;
  }, [material, offsetBinding, offsetTexture]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    const frame = (progressRef.current / 100) * EFXBN_PREVIEW_FRAME_COUNT;
    const particles = simulateEfxbnEmitterPair(
      pair,
      livePlan(plan, controlLookupEntriesRef),
      frame,
      MAX_STRIP_PARTICLES,
      meshEmitterPointsByEffectIndex,
    );
    const data = buildEfxbnStripMeshData(
      particles,
      pair.target,
      EFXBN_STRIP_VERTEX_LIMIT,
      (particle) => evaluateEfxbnUvTransform(textureBinding?.parameter, particle.age, {
        particleSeed: particle.id,
      }),
      (particle) => evaluateEfxbnUvTransform(offsetBinding?.parameter, particle.age, {
        particleSeed: particle.id,
      }),
    );
    updateFloatAttribute(geometry, "position", data.centers);
    updateFloatAttribute(geometry, "previousCenter", data.previousCenters);
    updateFloatAttribute(geometry, "nextCenter", data.nextCenters);
    updateFloatAttribute(geometry, "ribbonSide", data.sides);
    updateFloatAttribute(geometry, "ribbonWidth", data.widths);
    updateFloatAttribute(geometry, "uv", data.uvs);
    updateFloatAttribute(geometry, "offsetUv", data.offsetUvs);
    updateFloatAttribute(geometry, "ribbonColor", data.colors);
    const index = geometry.getIndex();
    if (index) {
      (index.array as Uint16Array).set(data.indices);
      index.needsUpdate = true;
    }
    geometry.setDrawRange(0, data.indices.length);
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}

export function EfxbnStripPreview({
  plan,
  controlLookupEntriesRef,
  progressRef,
  hiddenEffectIndexes,
  meshEmitterPointsByEffectIndex,
}: {
  plan: EffectFolderPreviewPlan;
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>;
  progressRef: MutableRefObject<number>;
  hiddenEffectIndexes: ReadonlySet<number>;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
}) {
  const pairs = useMemo(
    () => resolveEfxbnEmitterPairs(plan).filter((pair) => isEfxbnStripBlock(pair.target)),
    [plan],
  );
  return <group name="efxbn-strip-preview">{pairs.map((pair) => {
    const emitterIndex = pair.emitter?.index ?? null;
    if (hiddenEffectIndexes.has(pair.target.index) ||
        (emitterIndex !== null && hiddenEffectIndexes.has(emitterIndex))) return null;
    return <EfxbnStripLayer
      key={`${emitterIndex ?? "root"}-${pair.target.index}`}
      pair={pair}
      plan={plan}
      controlLookupEntriesRef={controlLookupEntriesRef}
      progressRef={progressRef}
      meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
    />;
  })}</group>;
}
