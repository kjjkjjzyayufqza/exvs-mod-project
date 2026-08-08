import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  SubtractiveBlending,
  Texture,
} from "three";
import { loadNutexbPreview } from "./EffectNutexbPreview";
import {
  evaluateEfxbnUvTransform,
  type EffectFolderPreviewPlan,
} from "./effectFolderPreviewPlan";
import {
  EFXBN_PREVIEW_FRAME_COUNT,
  resolveEfxbnEmitterPairs,
  simulateEfxbnEmitterPair,
  type EfxbnEmitterPair,
  isEfxbnStripBlock,
  efxbnRuntime,
} from "./efxbnSimulation";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";

type EfxbnParticlePreviewProps = {
  plan: EffectFolderPreviewPlan;
  progressRef: MutableRefObject<number>;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
  onSelectEffect: (effectIndex: number) => void;
};

const MAX_PARTICLES_PER_EMITTER = 2_048;

export function useEfxbnTexture(path: string | null): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    let ownedTexture: Texture | null = null;
    setTexture(null);
    if (!path) return;

    void loadNutexbPreview(path, "preview").then((dataUrl) => {
      if (!dataUrl || cancelled) return;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        ownedTexture = new Texture(image);
        ownedTexture.colorSpace = SRGBColorSpace;
        ownedTexture.flipY = false;
        ownedTexture.wrapS = RepeatWrapping;
        ownedTexture.wrapT = RepeatWrapping;
        ownedTexture.needsUpdate = true;
        setTexture(ownedTexture);
      };
      image.src = dataUrl;
    });

    return () => {
      cancelled = true;
      ownedTexture?.dispose();
    };
  }, [path]);
  return texture;
}

export function threeBlendState(blendState: number) {
  if (blendState === 2) return AdditiveBlending;
  if (blendState === 3) return SubtractiveBlending;
  return NormalBlending;
}

function createGeometry() {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([
        -0.5, -0.5, 0,
        0.5, -0.5, 0,
        0.5, 0.5, 0,
        -0.5, 0.5, 0,
      ]),
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute(
    "particleCenter",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 3), 3),
  );
  geometry.setAttribute(
    "particleSize",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  geometry.setAttribute(
    "particleColor",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 4), 4),
  );
  geometry.setAttribute(
    "particleRotation",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER), 1),
  );
  geometry.setAttribute(
    "particleUvScale",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  geometry.setAttribute(
    "particleUvOffset",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  geometry.instanceCount = 0;
  return geometry;
}

function createMaterial(pair: EfxbnEmitterPair, externalModelProxy: boolean) {
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
      selected: { value: 0 },
      externalModelProxy: { value: externalModelProxy ? 1 : 0 },
    },
    vertexShader: `
      attribute vec3 particleCenter;
      attribute vec2 particleSize;
      attribute vec4 particleColor;
      attribute float particleRotation;
      attribute vec2 particleUvScale;
      attribute vec2 particleUvOffset;
      varying vec2 vUv;
      varying vec2 vQuadUv;
      varying vec4 vColor;

      void main() {
        float c = cos(particleRotation);
        float s = sin(particleRotation);
        vec2 local = vec2(
          position.x * c - position.y * s,
          position.x * s + position.y * c
        ) * particleSize;
        vec4 viewCenter = modelViewMatrix * vec4(particleCenter, 1.0);
        viewCenter.xy += local;
        gl_Position = projectionMatrix * viewCenter;
        vUv = uv * particleUvScale + particleUvOffset;
        vQuadUv = uv;
        vColor = particleColor;
      }
    `,
    fragmentShader: `
      uniform sampler2D colorMap;
      uniform float hasColorMap;
      uniform float selected;
      uniform float externalModelProxy;
      varying vec2 vUv;
      varying vec2 vQuadUv;
      varying vec4 vColor;

      void main() {
        vec2 radial = vQuadUv * 2.0 - 1.0;
        float fallbackAlpha = smoothstep(1.0, 0.0, dot(radial, radial));
        vec4 texel = hasColorMap > 0.5
          ? texture2D(colorMap, vUv)
          : vec4(1.0, 1.0, 1.0, fallbackAlpha);
        vec4 color = texel * vColor;
        if (color.a < 0.01) discard;
        color.rgb *= 0.5;
        color.rgb = mix(color.rgb, color.rgb + vec3(0.12), selected);
        color.rgb = mix(color.rgb, vec3(1.0, 0.22, 0.68), externalModelProxy * 0.65);
        gl_FragColor = color;
      }
    `,
  });
}

function EfxbnParticleLayer({
  pair,
  plan,
  progressRef,
  selected,
  externalModelProxy,
  meshEmitterPointsByEffectIndex,
  onSelectEffect,
}: {
  pair: EfxbnEmitterPair;
  plan: EffectFolderPreviewPlan;
  progressRef: MutableRefObject<number>;
  selected: boolean;
  externalModelProxy: boolean;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
  onSelectEffect: (effectIndex: number) => void;
}) {
  const geometry = useMemo(() => createGeometry(), []);
  const material = useMemo(
    () => createMaterial(pair, externalModelProxy),
    [externalModelProxy, pair],
  );
  const textureBinding = plan.textureBindings.find(
    (binding) => binding.effectIndex === pair.target.index && binding.file !== null,
  );
  const texture = useEfxbnTexture(textureBinding?.file?.path ?? null);

  useEffect(() => {
    material.uniforms.colorMap.value = texture;
    material.uniforms.hasColorMap.value = texture ? 1 : 0;
    material.needsUpdate = true;
  }, [material, texture]);
  useEffect(() => {
    material.uniforms.selected.value = selected ? 1 : 0;
  }, [material, selected]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame(() => {
    const frame = (progressRef.current / 100) * EFXBN_PREVIEW_FRAME_COUNT;
    const particles = simulateEfxbnEmitterPair(
      pair,
      plan,
      frame,
      MAX_PARTICLES_PER_EMITTER,
      meshEmitterPointsByEffectIndex,
    );
    const center = geometry.getAttribute("particleCenter") as InstancedBufferAttribute;
    const size = geometry.getAttribute("particleSize") as InstancedBufferAttribute;
    const color = geometry.getAttribute("particleColor") as InstancedBufferAttribute;
    const rotation = geometry.getAttribute("particleRotation") as InstancedBufferAttribute;
    const uvScale = geometry.getAttribute("particleUvScale") as InstancedBufferAttribute;
    const uvOffset = geometry.getAttribute("particleUvOffset") as InstancedBufferAttribute;
    particles.forEach((particle, index) => {
      const uvTransform = evaluateEfxbnUvTransform(textureBinding?.parameter, particle.age, {
        particleSeed: particle.id,
      });
      center.setXYZ(index, ...particle.position);
      size.setXY(
        index,
        Math.max(0.006, particle.size[0] * (selected ? 1.12 : 1)),
        Math.max(0.006, particle.size[1] * (selected ? 1.12 : 1)),
      );
      color.setXYZW(index, ...particle.color);
      rotation.setX(index, particle.rotation);
      uvScale.setXY(index, ...uvTransform.scale);
      uvOffset.setXY(index, ...uvTransform.offset);
    });
    center.needsUpdate = true;
    size.needsUpdate = true;
    color.needsUpdate = true;
    rotation.needsUpdate = true;
    uvScale.needsUpdate = true;
    uvOffset.needsUpdate = true;
    geometry.instanceCount = particles.length;
  });

  return (
    <mesh
      name={externalModelProxy ? `efxbn-external-model-proxy-${pair.target.index}` : undefined}
      geometry={geometry}
      material={material}
      frustumCulled={false}
      onClick={(event) => {
        event.stopPropagation();
        onSelectEffect(pair.target.index);
      }}
    />
  );
}

export function EfxbnParticlePreview({
  plan,
  progressRef,
  selectedEffectIndex,
  hiddenEffectIndexes,
  meshEmitterPointsByEffectIndex,
  onSelectEffect,
}: EfxbnParticlePreviewProps) {
  const pairs = useMemo(() => resolveEfxbnEmitterPairs(plan), [plan]);
  const localModelEffectIndexes = useMemo(
    () => new Set(plan.targets.flatMap(
      (target) => target.effectIndex === null ? [] : [target.effectIndex],
    )),
    [plan.targets],
  );
  return (
    <group name="efxbn-particle-preview">
      {pairs.map((pair) => {
        const externalModelProxy = pair.target.modelHash.signed !== 0 &&
          !localModelEffectIndexes.has(pair.target.index);
        if ((isEfxbnStripBlock(pair.target) && !externalModelProxy) ||
            (pair.target.modelHash.signed !== 0 && !externalModelProxy)) return null;
        const emitterIndex = pair.emitter?.index ?? null;
        if (
          hiddenEffectIndexes.has(pair.target.index) ||
          (emitterIndex !== null && hiddenEffectIndexes.has(emitterIndex))
        ) {
          return null;
        }
        return (
          <EfxbnParticleLayer
            key={`${emitterIndex ?? "root"}-${pair.target.index}`}
            pair={pair}
            plan={plan}
            progressRef={progressRef}
            selected={selectedEffectIndex === pair.target.index || selectedEffectIndex === emitterIndex}
            externalModelProxy={externalModelProxy}
            meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
            onSelectEffect={onSelectEffect}
          />
        );
      })}
    </group>
  );
}
