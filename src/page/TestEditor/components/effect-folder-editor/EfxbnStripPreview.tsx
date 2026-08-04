import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, type MutableRefObject } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
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
} from "./efxbnSimulation";
import { buildEfxbnStripMeshData } from "./efxbnStripGeometry";
import { threeBlendState, useEfxbnTexture } from "./EfxbnParticlePreview";

const MAX_STRIP_VERTICES = 16_384;
const MAX_STRIP_PARTICLES = 256;

function createStripMaterial(pair: EfxbnEmitterPair) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: pair.target.zWriteEnable !== 0,
    depthTest: pair.target.zTestEnable !== 0,
    blending: threeBlendState(pair.target.blendState),
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      colorMap: { value: null },
      hasColorMap: { value: 0 },
      uvScale: { value: [1, 1] },
      uvOffset: { value: [0, 0] },
    },
    vertexShader: `
      attribute vec3 previousCenter;
      attribute vec3 nextCenter;
      attribute float ribbonSide;
      attribute float ribbonWidth;
      attribute vec4 ribbonColor;
      uniform vec2 uvScale;
      uniform vec2 uvOffset;
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
        vUv = uv * uvScale + uvOffset;
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
  const geometry = useMemo(() => new BufferGeometry(), []);
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
    const data = buildEfxbnStripMeshData(particles, pair.target, MAX_STRIP_VERTICES);
    geometry.dispose();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(data.centers), 3));
    geometry.setAttribute("previousCenter", new BufferAttribute(new Float32Array(data.previousCenters), 3));
    geometry.setAttribute("nextCenter", new BufferAttribute(new Float32Array(data.nextCenters), 3));
    geometry.setAttribute("ribbonSide", new BufferAttribute(new Float32Array(data.sides), 1));
    geometry.setAttribute("ribbonWidth", new BufferAttribute(new Float32Array(data.widths), 1));
    geometry.setAttribute("uv", new BufferAttribute(new Float32Array(data.uvs), 2));
    geometry.setAttribute("ribbonColor", new BufferAttribute(new Float32Array(data.colors), 4));
    geometry.setIndex(data.indices);
    const representative = particles[0];
    const uv = evaluateEfxbnUvTransform(textureBinding?.parameter, representative?.age ?? 0, {
      particleSeed: representative?.id ?? pair.target.index,
    });
    material.uniforms.uvScale.value = uv.scale;
    material.uniforms.uvOffset.value = uv.offset;
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
    () => resolveEfxbnEmitterPairs(plan).filter((pair) => pair.target.effectType === 2),
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
