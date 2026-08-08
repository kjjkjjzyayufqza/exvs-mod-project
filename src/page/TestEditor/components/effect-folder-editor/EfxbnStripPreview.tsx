import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type MutableRefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  ShaderMaterial,
} from "three";
import type { EffectFolderPreviewPlan } from "./effectFolderPreviewPlan";
import { evaluateEfxbnUvTransform } from "./effectFolderPreviewPlan";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";
import {
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
import { threeBlendState, useEfxbnTexture } from "./EfxbnParticlePreview";

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
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      colorMap: { value: null },
      hasColorMap: { value: 0 },
    },
    vertexShader: `
      attribute vec3 previousCenter;
      attribute vec3 nextCenter;
      attribute float ribbonSide;
      attribute float ribbonWidth;
      attribute vec4 ribbonColor;
      varying vec2 vUv;
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
        vColor = ribbonColor;
      }
    `,
    fragmentShader: `
      uniform sampler2D colorMap;
      uniform float hasColorMap;
      varying vec2 vUv;
      varying vec4 vColor;
      void main() {
        vec4 texel = hasColorMap > 0.5 ? texture2D(colorMap, vUv) : vec4(1.0);
        vec4 color = texel * vColor;
        if (color.a < 0.01) discard;
        color.rgb *= 0.5;
        gl_FragColor = color;
      }
    `,
  });
}

function EfxbnStripLayer({
  pair,
  plan,
  progressRef,
  meshEmitterPointsByEffectIndex,
}: {
  pair: EfxbnEmitterPair;
  plan: EffectFolderPreviewPlan;
  progressRef: MutableRefObject<number>;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
}) {
  const geometry = useMemo(createStripGeometry, []);
  const material = useMemo(() => createStripMaterial(pair), [pair]);
  const textureBinding = plan.textureBindings.find(
    (binding) => binding.effectIndex === pair.target.index && binding.file !== null,
  );
  const texture = useEfxbnTexture(textureBinding?.file?.path ?? null);
  useEffect(() => {
    material.uniforms.colorMap.value = texture;
    material.uniforms.hasColorMap.value = texture ? 1 : 0;
  }, [material, texture]);
  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(() => {
    const frame = (progressRef.current / 100) * EFXBN_PREVIEW_FRAME_COUNT;
    const particles = simulateEfxbnEmitterPair(
      pair, plan, frame, MAX_STRIP_PARTICLES, meshEmitterPointsByEffectIndex,
    );
    const data = buildEfxbnStripMeshData(
      particles,
      pair.target,
      EFXBN_STRIP_VERTEX_LIMIT,
      (particle) => evaluateEfxbnUvTransform(textureBinding?.parameter, particle.age, {
        particleSeed: particle.id,
      }),
    );
    updateFloatAttribute(geometry, "position", data.centers);
    updateFloatAttribute(geometry, "previousCenter", data.previousCenters);
    updateFloatAttribute(geometry, "nextCenter", data.nextCenters);
    updateFloatAttribute(geometry, "ribbonSide", data.sides);
    updateFloatAttribute(geometry, "ribbonWidth", data.widths);
    updateFloatAttribute(geometry, "uv", data.uvs);
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
  progressRef,
  hiddenEffectIndexes,
  meshEmitterPointsByEffectIndex,
}: {
  plan: EffectFolderPreviewPlan;
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
      progressRef={progressRef}
      meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
    />;
  })}</group>;
}
