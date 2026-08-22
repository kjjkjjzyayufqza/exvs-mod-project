import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  AddEquation,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  ClampToEdgeWrapping,
  CustomBlending,
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  MirroredRepeatWrapping,
  NoBlending,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  type Blending,
  type Mesh,
  type Side,
  type Wrapping,
} from "three";
import type { EfxbnControlLookupEntry } from "@/services/effectFolder/effectFolderService";
import { loadNutexbPreview } from "./EffectNutexbPreview";
import {
  evaluateEfxbnUvTransform,
  resolveEfxbnColorMapBinding,
  resolveEfxbnUvOffsetMapBinding,
  EFXBN_ADDRESS_MODE,
  type EffectFolderPreviewPlan,
} from "./effectFolderPreviewPlan";
import {
  resolveEfxbnBillboardBasis,
  resolveEfxbnEmitterPairs,
  simulateEfxbnPreviewFrame,
  type EfxbnEmitterPair,
  isEfxbnStripBlock,
  efxbnRuntime,
  DRAW_SCHEME_FULL_BRIGHTNESS,
} from "./efxbnSimulation";
import type { EfxbnMeshEmitterPoint } from "./efxbnMeshEmitter";
import {
  EFXBN_BLEND_STATE,
  efxbnParticleDrawOrder,
  efxbnParticleSortsFrontToBack,
  efxbnRequiresParticleDepthSort,
  resolveEfxbnCameraFadeRange,
  resolveEfxbnViewAngleRamp,
} from "./efxbnBillboardShading";
import { efxbnUsesSoftParticle, resolveEfxbnSoftParticleRange } from "./efxbnSoftParticle";

type EfxbnParticlePreviewProps = {
  plan: EffectFolderPreviewPlan;
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>;
  progressRef: MutableRefObject<number>;
  /** Playback window in frames, derived from the effect's own length. */
  frameCount: number;
  selectedEffectIndex: number | null;
  hiddenEffectIndexes: ReadonlySet<number>;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
  /** Linear view depth of the opaque scene; null while no host model contributes any. */
  sceneDepthTextureRef: MutableRefObject<Texture | null>;
  onSelectEffect: (effectIndex: number) => void;
};

function livePlan(
  plan: EffectFolderPreviewPlan,
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>,
): EffectFolderPreviewPlan {
  const entries = controlLookupEntriesRef.current;
  if (entries === plan.controlLookupEntries) return plan;
  return { ...plan, controlLookupEntries: entries };
}

const MAX_PARTICLES_PER_EMITTER = 2_048;

/**
 * The WebGL wrap mode for an authored addressingMode.
 *
 * BORDER has no WebGL2 equivalent, so it clamps here and the fragment shaders zero alpha
 * outside the 0..1 range to reproduce the transparent-black border. MIRROR_ONCE never occurs
 * in the shipped corpus and has no faithful mapping, so it is rejected rather than guessed.
 */
export function threeWrapForEfxbnAddressMode(mode: number): Wrapping {
  switch (mode) {
    case EFXBN_ADDRESS_MODE.wrap:
      return RepeatWrapping;
    case EFXBN_ADDRESS_MODE.mirror:
      return MirroredRepeatWrapping;
    case EFXBN_ADDRESS_MODE.clamp:
    case EFXBN_ADDRESS_MODE.border:
      return ClampToEdgeWrapping;
    default:
      throw new Error(`Unsupported EFXBN addressing mode: ${mode}`);
  }
}

/** `blendState` that selects the AddMix pixel-shader variant (draw-scheme bit `0x40`). */
export const EFXBN_BLEND_STATE_ADD_MIX = EFXBN_BLEND_STATE.addMix;

/** True when the sampler must fade to the transparent border outside the authored UV range. */
export function usesEfxbnBorderAddressing(mode: number | undefined): boolean {
  return mode === EFXBN_ADDRESS_MODE.border;
}

export function useEfxbnTexture(
  path: string | null,
  addressMode: number = EFXBN_ADDRESS_MODE.wrap,
): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    let ownedTexture: Texture | null = null;
    setTexture(null);
    if (!path) return;
    const wrap = threeWrapForEfxbnAddressMode(addressMode);

    void loadNutexbPreview(path, "preview").then((dataUrl) => {
      if (!dataUrl || cancelled) return;
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        ownedTexture = new Texture(image);
        ownedTexture.colorSpace = SRGBColorSpace;
        ownedTexture.flipY = false;
        ownedTexture.wrapS = wrap;
        ownedTexture.wrapT = wrap;
        ownedTexture.needsUpdate = true;
        setTexture(ownedTexture);
      };
      image.src = dataUrl;
    });

    return () => {
      cancelled = true;
      ownedTexture?.dispose();
    };
  }, [addressMode, path]);
  return texture;
}

/**
 * `blendState` mapped through the engine's own D3D11 translation tables.
 *
 * `sub_140174B30` -> `sub_1401774B0(blendState, desc)` seeds a 48-byte-per-render-target
 * descriptor from `sub_140085A50(preset)` and patches render target 0. The descriptor is then
 * consumed by `sub_1400876A0` -> `sub_14007BC50` -> `sub_140087530`, whose vtables name the type
 * `nu::StateCacheMixin<nu::BlendState_x64>`. That constructor resolves the descriptor fields
 * through two lookup tables, which is what fixes the namespace:
 *
 * ```text
 * *((_DWORD *)v5 - 7) = dword_141AA7CD8[B[0]]    ; srcBlend
 * *((_DWORD *)v5 - 5) = dword_141AA7D18[B[4]]    ; blendOp
 * *((_DWORD *)v5 - 6) = dword_141AA7CD8[B[8]]    ; destBlend
 * *((_DWORD *)v5 - 4) = dword_141AA7CD8[B[12]]   ; srcBlendAlpha
 * *((_DWORD *)v5 - 2) = dword_141AA7D18[B[16]]   ; blendOpAlpha
 * *((_DWORD *)v5 - 3) = dword_141AA7CD8[B[20]]   ; destBlendAlpha
 * ```
 *
 * `dword_141AA7CD8 = [1,2,5,7,3,9,6,8,4,10,11,18,16,19,17,0]` is a permutation of `D3D11_BLEND`
 * (0 ZERO, 1 ONE, 2 SRC_ALPHA, 6 INV_SRC_ALPHA, ...) and `dword_141AA7D18 = [1,2,3,4,5,0]` is
 * `D3D11_BLEND_OP` (0 ADD, 1 SUBTRACT, ...). Resolving each preset plus its patch gives:
 *
 * | blendState | src | op | dst | result |
 * | --- | --- | --- | --- | --- |
 * | 0 | ONE | ADD | ZERO | opaque |
 * | 1 | SRC_ALPHA | ADD | INV_SRC_ALPHA | standard alpha |
 * | 2 | SRC_ALPHA | ADD | ONE | additive |
 * | 4 | ONE | ADD | INV_SRC_ALPHA | premultiplied alpha (the AddMix variant) |
 *
 * `blendState == 3` occurs in none of the 40,309 shipped blocks, so it is rejected rather than
 * mapped: the preset-3 descriptor was never resolved and guessing it would be a fabrication.
 */
export function threeBlendState(blendState: number): Blending {
  switch (blendState) {
    case 0:
      return NoBlending;
    case 1:
      return NormalBlending;
    case 2:
      return AdditiveBlending;
    case 4:
      return CustomBlending;
    default:
      throw new Error(`Unsupported EFXBN blendState: ${blendState}`);
  }
}

/**
 * The extra three.js material fields `blendState == 4` needs.
 *
 * `CustomBlending` defaults to `SrcAlpha / OneMinusSrcAlpha`; the AddMix path wants
 * `ONE / INV_SRC_ALPHA`, i.e. premultiplied alpha, which is exactly what its pixel shader
 * produces (`rgb = c.rgb * c.a`).
 */
export function efxbnCustomBlendFactors(blendState: number): {
  blendSrc: typeof OneFactor;
  blendDst: typeof OneMinusSrcAlphaFactor;
  blendEquation: typeof AddEquation;
} | null {
  return blendState === 4
    ? {
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendEquation: AddEquation,
      }
    : null;
}

/**
 * Human-readable names for the resolved blend equations, for the inspector.
 *
 * Every entry is the descriptor the engine actually builds, not a guess; `3` is absent because
 * no shipped block uses it and its preset was never resolved.
 */
export const EFXBN_BLEND_STATE_LABELS: Readonly<Record<number, string>> = {
  0: "opaque (ONE / ZERO)",
  1: "alpha (SRC_ALPHA / INV_SRC_ALPHA)",
  2: "additive (SRC_ALPHA / ONE)",
  4: "premultiplied (ONE / INV_SRC_ALPHA)",
};

/** Human-readable names for `cullingType`, from `D3D11_CULL_MODE` via `dword_141AA7C88`. */
export const EFXBN_CULLING_TYPE_LABELS: Readonly<Record<number, string>> = {
  0: "no culling",
  1: "cull back",
  2: "cull front",
};

/**
 * `cullingType` mapped through the engine's `D3D11_CULL_MODE` translation table.
 *
 * `sub_140177660` reads block `+0x170` and writes the rasterizer descriptor's cull index as
 * `0 -> 2`, `1 -> 0`, `2 -> 1`, everything else `0`. `sub_1400871F0` -> `sub_14007B510` ->
 * `sub_140087150` then resolves that index through `dword_141AA7C88 = [3, 2, 1]`, and
 * `D3D11_CULL_MODE` is `1 NONE, 2 FRONT, 3 BACK`. So `cullingType` 0 culls nothing, 1 culls back
 * faces and 2 culls front faces. Corpus split: 36,567 / 3,449 / 293.
 */
export function threeSideForEfxbnCullingType(cullingType: number): Side {
  switch (cullingType) {
    case 0:
      return DoubleSide;
    case 1:
      return FrontSide;
    case 2:
      return BackSide;
    default:
      throw new Error(`Unsupported EFXBN cullingType: ${cullingType}`);
  }
}

/**
 * Quad half-extents for one particle.
 *
 * `sizeBase * sizeRandom * scaleBase` is signed and the game never clamps it: 122 shipped blocks
 * author a negative `sizeBase` component (which mirrors the quad) and 44 author a magnitude below
 * the `0.006` floor the preview used to apply. A `Math.max(0.006, ...)` destroyed both.
 */
export function efxbnBillboardQuadSize(
  size: readonly [number, number],
  emphasis: number,
): [number, number] {
  return [size[0] * emphasis, size[1] * emphasis];
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
  // The element-rotation and axis-locked bases need all three angles, not just the Z spin.
  geometry.setAttribute(
    "particleRotationEuler",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 3), 3),
  );
  geometry.setAttribute(
    "particleUvScale",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  geometry.setAttribute(
    "particleUvOffset",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  // The UV-offset map has its own scroll/atlas animation, so it needs a second UV set.
  geometry.setAttribute(
    "particleOffsetUvScale",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  geometry.setAttribute(
    "particleOffsetUvOffset",
    new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES_PER_EMITTER * 2), 2),
  );
  geometry.instanceCount = 0;
  return geometry;
}

function createMaterial(pair: EfxbnEmitterPair, externalModelProxy: boolean) {
  const viewAngleRamp = resolveEfxbnViewAngleRamp(pair.target);
  const cameraFadeRange = resolveEfxbnCameraFadeRange(pair.target);
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
      selected: { value: 0 },
      externalModelProxy: { value: externalModelProxy ? 1 : 0 },
      addMix: { value: pair.target.blendState === EFXBN_BLEND_STATE_ADD_MIX ? 1 : 0 },
      basisMode: { value: resolveEfxbnBillboardBasis(pair.target) },
      centerPivot: { value: [pair.target.centerPivot[0], pair.target.centerPivot[1]] },
      // Both view-dependent vertex-colour terms need the camera in the mesh's own space.
      cameraLocalPosition: { value: new Vector3() },
      cameraLocalForward: { value: new Vector3(0, 0, -1) },
      hasViewAngleRamp: { value: viewAngleRamp ? 1 : 0 },
      viewAngleStartColor: { value: viewAngleRamp?.startColor ?? [1, 1, 1, 1] },
      viewAngleEndColor: { value: viewAngleRamp?.endColor ?? [1, 1, 1, 1] },
      viewAngleThreshold: { value: viewAngleRamp?.threshold ?? 0 },
      viewAnglePower: { value: viewAngleRamp?.power ?? 1 },
      hasCameraFade: { value: cameraFadeRange === null ? 0 : 1 },
      cameraFadeRange: { value: cameraFadeRange ?? 0 },
      sceneDepth: { value: null },
      hasSceneDepth: { value: 0 },
      softParticleRange: {
        value: efxbnUsesSoftParticle(pair.target)
          ? resolveEfxbnSoftParticleRange(pair.target)
          : 0,
      },
    },
    vertexShader: `
      attribute vec3 particleCenter;
      attribute vec2 particleSize;
      attribute vec4 particleColor;
      attribute float particleRotation;
      attribute vec3 particleRotationEuler;
      attribute vec2 particleUvScale;
      attribute vec2 particleUvOffset;
      attribute vec2 particleOffsetUvScale;
      attribute vec2 particleOffsetUvOffset;
      uniform float basisMode;
      uniform vec2 centerPivot;
      uniform vec3 cameraLocalPosition;
      uniform vec3 cameraLocalForward;
      uniform float hasViewAngleRamp;
      uniform vec4 viewAngleStartColor;
      uniform vec4 viewAngleEndColor;
      uniform float viewAngleThreshold;
      uniform float viewAnglePower;
      uniform float hasCameraFade;
      uniform float cameraFadeRange;
      varying vec2 vUv;
      varying vec2 vOffsetUv;
      varying vec2 vQuadUv;
      varying vec4 vColor;
      varying vec4 vClipPosition;

      // Intrinsic XYZ order, matching how the model-particle path hands rotationEuler to three.js.
      mat3 efxRotation(vec3 euler) {
        vec3 s = sin(euler);
        vec3 c = cos(euler);
        mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, c.x, s.x, 0.0, -s.x, c.x);
        mat3 ry = mat3(c.y, 0.0, -s.y, 0.0, 1.0, 0.0, s.y, 0.0, c.y);
        mat3 rz = mat3(c.z, s.z, 0.0, -s.z, c.z, 0.0, 0.0, 0.0, 1.0);
        return rz * ry * rx;
      }

      void main() {
        // efxConstructDrawBufferBillboard3rd offsets the quad centre by
        // (width * centerPivotX, height * centerPivotY) * 0.5 before laying out the corners.
        vec2 quad = position.xy * particleSize;
        vec2 pivot = particleSize * centerPivot * 0.5;
        // The quad's plane normal, which both view-dependent colour terms are measured against.
        // A screen-facing quad borrows the camera axis, exactly as the engine's basis does.
        vec3 quadNormal = cameraLocalForward;
        if (basisMode > 0.5) {
          mat3 rotation = efxRotation(particleRotationEuler);
          vec3 right = rotation[0];
          vec3 up = rotation[1];
          quadNormal = rotation[2];
          if (basisMode > 1.5) {
            // Axis-locked: keep the element up axis and yaw the quad toward the camera.
            vec3 axisRight = cross(up, particleCenter - cameraLocalPosition);
            float axisLength = length(axisRight);
            right = axisLength > 1e-5 ? axisRight / axisLength : rotation[0];
            quadNormal = normalize(cross(right, up));
          }
          vec3 world = particleCenter + right * (quad.x + pivot.x) + up * (quad.y + pivot.y);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
        } else {
          float c = cos(particleRotation);
          float s = sin(particleRotation);
          vec2 spun = vec2(
            position.x * c - position.y * s,
            position.x * s + position.y * c
          ) * particleSize;
          vec4 viewCenter = modelViewMatrix * vec4(particleCenter, 1.0);
          viewCenter.xy += spun + pivot;
          gl_Position = projectionMatrix * viewCenter;
        }
        vClipPosition = gl_Position;
        vUv = uv * particleUvScale + particleUvOffset;
        vOffsetUv = uv * particleOffsetUvScale + particleOffsetUvOffset;
        vQuadUv = uv;

        // efxConstructDrawBufferBillboard3rd folds two view-dependent terms into the vertex
        // colour before the pixel shader ever samples, so neither appears in efxDrawFace*PS.
        vColor = particleColor;
        vec3 toParticle = particleCenter - cameraLocalPosition;
        float toParticleLength = length(toParticle);
        // A particle sitting exactly on the camera has no view direction. Normalizing it would
        // hand NaN to the ramp and drop the quad for that frame, so treat it as face-on.
        vec3 toParticleDir = toParticleLength > 1e-5 ? toParticle / toParticleLength : quadNormal;
        if (hasViewAngleRamp > 0.5) {
          // rim is 0 face-on and 1 edge-on, so a rotated quad fades out instead of showing a
          // hard opaque sliver. Every shipped block that enables this ramps alpha down to 0.
          float rim = 1.0 - abs(dot(toParticleDir, quadNormal));
          float rampSpan = max(1.0 - viewAngleThreshold, 1e-5);
          float ramp = rim > viewAngleThreshold
            ? pow((rim - viewAngleThreshold) / rampSpan, viewAnglePower)
            : 0.0;
          vColor *= mix(viewAngleStartColor, viewAngleEndColor, ramp);
        }
        if (hasCameraFade > 0.5) {
          // Hidden inside half the range, linear to the full range, untouched beyond it.
          float depth = dot(toParticle, quadNormal);
          float ratio = depth / cameraFadeRange;
          vColor.a *= depth > cameraFadeRange ? 1.0 : (ratio < 0.5 ? 0.0 : ratio * 2.0 - 1.0);
        }
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
      uniform float selected;
      uniform float externalModelProxy;
      uniform sampler2D sceneDepth;
      uniform float hasSceneDepth;
      uniform float softParticleRange;
      varying vec2 vUv;
      varying vec2 vOffsetUv;
      varying vec2 vQuadUv;
      varying vec4 vColor;
      varying vec4 vClipPosition;

      // hkImageAddressMode BORDER has no WebGL2 equivalent: the texture clamps and this zeroes
      // alpha outside the authored range, which is the D3D transparent-black border.
      float efxBorderAlpha(vec2 uvValue, float enabled) {
        if (enabled < 0.5) return 1.0;
        vec2 inside = step(vec2(0.0), uvValue) * step(uvValue, vec2(1.0));
        return inside.x * inside.y;
      }

      void main() {
        // efxDrawFaceColorExPS, drawSchemeFlag bit 0x80: the offset map displaces the colour
        // UV by offset.a * (offset.rg - 0.5) * distortion, and scales alpha by offset.a.
        vec2 colorUv = vUv;
        float offsetAlpha = 1.0;
        if (hasUvOffsetMap > 0.5) {
          vec4 offsetTexel = texture2D(uvOffsetMap, vOffsetUv);
          offsetAlpha = offsetTexel.a * efxBorderAlpha(vOffsetUv, offsetBorder);
          colorUv += offsetTexel.a * (offsetTexel.rg - 0.5) * distortion;
        }
        vec2 radial = vQuadUv * 2.0 - 1.0;
        float fallbackAlpha = smoothstep(1.0, 0.0, dot(radial, radial));
        vec4 texel = hasColorMap > 0.5
          ? texture2D(colorMap, colorUv)
          : vec4(1.0, 1.0, 1.0, fallbackAlpha);
        vec4 color = texel * vColor;
        color.a *= offsetAlpha * efxBorderAlpha(colorUv, colorBorder);
        // efxDrawModelSoftPS.yyadorigi.hlsl:66. The Face pixel shaders were extracted without
        // a Soft variant, but sub_140188E30 builds efxDrawFaceSoft names from the same
        // 0x10001 mask, and efxDrawFacePS is identical to efxDrawModelPS apart from which
        // constant-buffer component holds the flag word — so the Model term applies here.
        if (hasSceneDepth > 0.5 && softParticleRange > 0.0) {
          // D3D samples with V flipped; a WebGL render target is bottom-up, so V is not.
          vec2 screenUv = vClipPosition.xy / vClipPosition.w * 0.5 + 0.5;
          float sceneViewDepth = texture2D(sceneDepth, screenUv).r;
          // A texel the pre-pass never wrote is infinitely far, like a cleared depth buffer.
          if (sceneViewDepth > 0.0) {
            color.a *= clamp((sceneViewDepth - vClipPosition.w) / softParticleRange, 0.0, 1.0);
          }
        }
        if (color.a < 0.01) discard;
      // efxDrawFaceAddMixPS (drawSchemeFlag 0x40, i.e. blendState 4): premultiply rgb by alpha
      // and drop alpha entirely once the texel is bright, so highlights add instead of blend.
      if (addMix > 0.5) {
        float bright = step(0.8, max(color.r, max(color.g, color.b)));
        color.rgb *= color.a;
        color.a = mix(color.a, 0.0, bright);
      }
        // The base Face and Model shaders halve rgb unless drawSchemeFlag has 0x40000.
        color.rgb *= mix(0.5, 1.0, fullBrightness);
        color.rgb = mix(color.rgb, color.rgb + vec3(0.12), selected);
        color.rgb = mix(color.rgb, vec3(1.0, 0.22, 0.68), externalModelProxy * 0.65);
        gl_FragColor = color;
      }
    `,
  });
}

/**
 * Everything `createMaterial` bakes in, as one string.
 *
 * The plan is rebuilt on every document edit so the preview shows the edit immediately, which
 * means `pair` is a fresh object each time. Keying the material on the pair would rebuild a
 * `ShaderMaterial` — and reset its GPU program — on every keystroke. Keying it on the render
 * state rebuilds only when the render state actually changed, which is exactly when it must.
 */
function materialSignature(pair: EfxbnEmitterPair, externalModelProxy: boolean): string {
  const target = pair.target;
  const runtime = efxbnRuntime(target);
  const ramp = resolveEfxbnViewAngleRamp(target);
  return [
    externalModelProxy ? 1 : 0,
    runtime.zWriteEnable,
    target.zTestEnable,
    target.blendState,
    target.cullingType,
    runtime.drawScheme.flag,
    runtime.softParticleRange,
    resolveEfxbnBillboardBasis(target),
    target.centerPivot.join(","),
    resolveEfxbnCameraFadeRange(target) ?? "none",
    ramp
      ? [ramp.startColor.join(","), ramp.endColor.join(","), ramp.threshold, ramp.power].join("|")
      : "none",
  ].join("/");
}

function EfxbnParticleLayer({
  pair,
  plan,
  controlLookupEntriesRef,
  progressRef,
  frameCount,
  selected,
  externalModelProxy,
  meshEmitterPointsByEffectIndex,
  sceneDepthTextureRef,
  onSelectEffect,
}: {
  pair: EfxbnEmitterPair;
  plan: EffectFolderPreviewPlan;
  controlLookupEntriesRef: MutableRefObject<readonly EfxbnControlLookupEntry[]>;
  progressRef: MutableRefObject<number>;
  frameCount: number;
  selected: boolean;
  externalModelProxy: boolean;
  meshEmitterPointsByEffectIndex: ReadonlyMap<number, readonly EfxbnMeshEmitterPoint[]>;
  sceneDepthTextureRef: MutableRefObject<Texture | null>;
  onSelectEffect: (effectIndex: number) => void;
}) {
  const geometry = useMemo(() => createGeometry(), []);
  const signature = materialSignature(pair, externalModelProxy);
  const material = useMemo(
    () => createMaterial(pair, externalModelProxy),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the baked render state,
    // not on the pair, so a value edit does not rebuild the GPU program. See materialSignature.
    [signature],
  );
  const meshRef = useRef<Mesh>(null);
  const worldToLocalRef = useRef(new Matrix4());
  const requiresDepthSort = useMemo(
    () => efxbnRequiresParticleDepthSort(pair.target),
    [pair.target],
  );
  const sortsFrontToBack = useMemo(
    () => efxbnParticleSortsFrontToBack(pair.target),
    [pair.target],
  );
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
    material.needsUpdate = true;
  }, [material, texture, textureBinding]);
  useEffect(() => {
    material.uniforms.uvOffsetMap.value = offsetTexture;
    material.uniforms.hasUvOffsetMap.value = offsetTexture ? 1 : 0;
    // distortionU/V come from the offset-map parameter, not the colour one: across all 5,741
    // shipped ColorEx blocks the colour parameter carries a single constant 0.1/0.1 while the
    // offset parameter carries 157 distinct authored values.
    material.uniforms.distortion.value = [
      offsetBinding?.parameter.uvDistortionPowerU ?? 0,
      offsetBinding?.parameter.uvDistortionPowerV ?? 0,
    ];
    material.uniforms.offsetBorder.value =
      usesEfxbnBorderAddressing(offsetBinding?.parameter.addressingMode) ? 1 : 0;
    material.needsUpdate = true;
  }, [material, offsetBinding, offsetTexture]);
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

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const sceneDepthTexture = sceneDepthTextureRef.current;
    material.uniforms.sceneDepth.value = sceneDepthTexture;
    material.uniforms.hasSceneDepth.value =
      sceneDepthTexture && (material.uniforms.softParticleRange.value as number) > 0 ? 1 : 0;
    const frame = (progressRef.current / 100) * frameCount;
    const particles = simulateEfxbnPreviewFrame(
      pair,
      livePlan(plan, controlLookupEntriesRef),
      frame,
      MAX_PARTICLES_PER_EMITTER,
      meshEmitterPointsByEffectIndex,
    );

    // Particle positions are authored in the mesh's own space, so the camera has to come to
    // them rather than the other way round.
    mesh.updateWorldMatrix(true, false);
    const worldToLocal = worldToLocalRef.current.copy(mesh.matrixWorld).invert();
    const cameraLocalPosition = material.uniforms.cameraLocalPosition.value as Vector3;
    cameraLocalPosition
      .setFromMatrixPosition(state.camera.matrixWorld)
      .applyMatrix4(worldToLocal);
    (material.uniforms.cameraLocalForward.value as Vector3)
      .set(0, 0, -1)
      .transformDirection(state.camera.matrixWorld)
      .transformDirection(worldToLocal);

    // efxMakeSortInfoBillboardDrawerID3rd + efxSortParticle3rd draw the farthest particle first.
    const drawOrder = requiresDepthSort
      ? efxbnParticleDrawOrder(
          particles.map((particle) => particle.position),
          [cameraLocalPosition.x, cameraLocalPosition.y, cameraLocalPosition.z],
          sortsFrontToBack,
        )
      : null;

    const center = geometry.getAttribute("particleCenter") as InstancedBufferAttribute;
    const size = geometry.getAttribute("particleSize") as InstancedBufferAttribute;
    const color = geometry.getAttribute("particleColor") as InstancedBufferAttribute;
    const rotation = geometry.getAttribute("particleRotation") as InstancedBufferAttribute;
    const rotationEuler = geometry.getAttribute("particleRotationEuler") as InstancedBufferAttribute;
    const uvScale = geometry.getAttribute("particleUvScale") as InstancedBufferAttribute;
    const uvOffset = geometry.getAttribute("particleUvOffset") as InstancedBufferAttribute;
    const offsetUvScale = geometry.getAttribute("particleOffsetUvScale") as InstancedBufferAttribute;
    const offsetUvOffset = geometry.getAttribute("particleOffsetUvOffset") as InstancedBufferAttribute;
    particles.forEach((_unsorted, index) => {
      const particle = particles[drawOrder ? drawOrder[index]! : index]!;
      const uvTransform = evaluateEfxbnUvTransform(textureBinding?.parameter, particle.age, {
        particleSeed: particle.id,
      });
      const offsetUvTransform = evaluateEfxbnUvTransform(offsetBinding?.parameter, particle.age, {
        particleSeed: particle.id,
      });
      center.setXYZ(index, ...particle.position);
      size.setXY(index, ...efxbnBillboardQuadSize(particle.size, selected ? 1.12 : 1));
      color.setXYZW(index, ...particle.color);
      rotation.setX(index, particle.rotation);
      rotationEuler.setXYZ(index, ...particle.rotationEuler);
      uvScale.setXY(index, ...uvTransform.scale);
      uvOffset.setXY(index, ...uvTransform.offset);
      offsetUvScale.setXY(index, ...offsetUvTransform.scale);
      offsetUvOffset.setXY(index, ...offsetUvTransform.offset);
    });
    center.needsUpdate = true;
    size.needsUpdate = true;
    color.needsUpdate = true;
    rotation.needsUpdate = true;
    rotationEuler.needsUpdate = true;
    uvScale.needsUpdate = true;
    uvOffset.needsUpdate = true;
    offsetUvScale.needsUpdate = true;
    offsetUvOffset.needsUpdate = true;
    geometry.instanceCount = particles.length;
  });

  return (
    <mesh
      ref={meshRef}
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
  controlLookupEntriesRef,
  progressRef,
  frameCount,
  selectedEffectIndex,
  hiddenEffectIndexes,
  meshEmitterPointsByEffectIndex,
  sceneDepthTextureRef,
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
            controlLookupEntriesRef={controlLookupEntriesRef}
            progressRef={progressRef}
            frameCount={frameCount}
            selected={selectedEffectIndex === pair.target.index || selectedEffectIndex === emitterIndex}
            externalModelProxy={externalModelProxy}
            meshEmitterPointsByEffectIndex={meshEmitterPointsByEffectIndex}
            sceneDepthTextureRef={sceneDepthTextureRef}
            onSelectEffect={onSelectEffect}
          />
        );
      })}
    </group>
  );
}
