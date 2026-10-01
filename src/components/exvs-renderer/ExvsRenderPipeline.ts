/**
 * The frame.
 *
 * Runs the OB renderer's pass graph over a three.js scene:
 *
 *   1  shadow atlas        four partitions, depth only
 *   2  G-buffer            four targets plus depth
 *   3  depth reduction     next frame's partition bounds
 *   4  ambient occlusion   full resolution; sample taps read half-resolution depth
 *   5  shadow resolve      into target 1's alpha
 *   6  analytic lighting   into the two accumulation buffers
 *   7  ambient lighting    added into the same two
 *   8  composite           resolves the G-buffer and writes depth back through
 *   9  character rim       additive, over the composited image
 *  10  forward             transparent materials and editor helpers, depth tested
 *  11  bloom               bright pass, halving chain, separable blur, combine
 *  12  depth of field
 *  12b effect blend         four effect layers plus the effect tone curve rows
 *  13  post filter         screen effects, gamma, colour grading
 *  14  antialiasing        FXAA, straight to the canvas
 *
 * Nothing in the scene is modified permanently. Materials are swapped for the
 * duration of a pass and put back, and visibility is saved and restored the same
 * way, so every existing editor behaviour keeps owning its own objects.
 */

import {
  AdditiveBlending,
  AlwaysDepth,
  Color,
  CustomBlending,
  DstAlphaFactor,
  GLSL3,
  Matrix3,
  Matrix4,
  Mesh,
  NoBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SrcColorFactor,
  Vector2,
  Vector3,
  Vector4,
  ZeroFactor,
  type BufferGeometry,
  type CubeTexture,
  type Material,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";

import {
  ExvsMaterialCache,
  type ExvsCharaBasicFrameState,
} from "./exvsGBufferMaterial";
import { ExvsLightBuffers } from "./exvsLightBuffers";
import {
  assertExvsRendererCapabilities,
  ExvsRenderTargets,
} from "./exvsRenderTargets";
import {
  createDefaultExvsRenderSettings,
  readExvsObjectParams,
  type ExvsObjectParams,
  type ExvsRenderSettings,
} from "./exvsRenderSettings";
import {
  fitExvsShadowPartitions,
  partitionRenderMatrix,
  type ExvsShadowFit,
} from "./exvsSdsmPartitions";
import { EXVS_FULLSCREEN_VERTEX_GLSL } from "./shaders/exvsShaderCommon";
import { EXVS_DEFERRED_LIGHTING_FRAGMENT_GLSL } from "./shaders/exvsDeferredLightingShader";
import { EXVS_IBL_AMBIENT_FRAGMENT_GLSL } from "./shaders/exvsIblAmbientShader";
import { EXVS_COMPOSITE_FRAGMENT_GLSL } from "./shaders/exvsCompositeShader";
import {
  EXVS_DEPTH_REDUCE_FRAGMENT_GLSL,
  EXVS_SHADOW_PARTITION_COUNT,
  EXVS_SHADOW_RESOLVE_FRAGMENT_GLSL,
} from "./shaders/exvsShadowShader";
import {
  EXVS_SSAO_BLUR_FRAGMENT_GLSL,
  EXVS_SSAO_DOWNSAMPLE_FRAGMENT_GLSL,
  EXVS_SSAO_FRAGMENT_GLSL,
} from "./shaders/exvsSsaoShader";
import {
  EXVS_BLOOM_BRIGHT_FRAGMENT_GLSL,
  EXVS_BLOOM_COMBINE_FRAGMENT_GLSL,
  EXVS_BLOOM_DOWNSAMPLE_FRAGMENT_GLSL,
  EXVS_DOF_FRAGMENT_GLSL,
  EXVS_EFFECT_BLEND_FRAGMENT_GLSL,
  EXVS_FXAA_FRAGMENT_GLSL,
  EXVS_GAUSSIAN_BLUR_FRAGMENT_GLSL,
  EXVS_GAUSSIAN_BLUR_MAX_STEPS,
  EXVS_POST_FILTER_FRAGMENT_GLSL,
} from "./shaders/exvsPostShaders";

/** Optional stage-authored inputs the composite and the ambient pass can consume. */
export type ExvsSceneTextures = {
  diffuseMapCube: CubeTexture | null;
  specularMapCube: CubeTexture | null;
  irradianceNormal: Texture | null;
  toneCurveLut: Texture | null;
  colorGradingLut: Texture | null;
  charaSpecial: Texture | null;
  rampFogColor: Texture | null;
  borderProjection: Texture | null;
  projectionXZ: Texture | null;
  /**
   * The four effect layers the effect blend pass folds together, back to front.
   * All four must be present for the pass to run, which is the same rule the
   * engine follows.
   */
  effectBlendHalfBack: Texture | null;
  effectBlendFullBack: Texture | null;
  effectBlendHalfFront: Texture | null;
  effectBlendFullFront: Texture | null;
};

export function createEmptyExvsSceneTextures(): ExvsSceneTextures {
  return {
    diffuseMapCube: null,
    specularMapCube: null,
    irradianceNormal: null,
    toneCurveLut: null,
    colorGradingLut: null,
    charaSpecial: null,
    rampFogColor: null,
    borderProjection: null,
    projectionXZ: null,
    effectBlendHalfBack: null,
    effectBlendFullBack: null,
    effectBlendHalfFront: null,
    effectBlendFullFront: null,
  };
}

type RenderableClassification = {
  /** Opaque meshes that write the G-buffer. */
  deferred: Mesh[];
  /** Meshes the additive rim pass draws a second time. */
  charaBasic: Mesh[];
  /** Everything drawn forward after the composite: transparency and editor helpers. */
  forward: Object3D[];
  /** Every renderable, so visibility can be restored exactly. */
  all: Object3D[];
  /** The per-mesh parameters, resolved once per frame. */
  params: Map<Mesh, ExvsObjectParams>;
  /**
   * The first cube map any material in the scene carries.
   *
   * The engine binds a stage-authored cube for its image based lighting. An editor
   * scene has no stage record to read one from, so the cube the numatb binding
   * already resolved onto the material is used unless a caller supplies one.
   */
  sceneEnvMap: CubeTexture | null;
};

type RenderableLike = Object3D & {
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isSprite?: boolean;
  material?: Material | Material[];
  geometry?: BufferGeometry;
};

const SHADOW_TILES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

export class ExvsRenderPipeline {
  settings: ExvsRenderSettings;
  sceneTextures: ExvsSceneTextures;

  private readonly renderer: WebGLRenderer;
  private readonly targets: ExvsRenderTargets;
  private readonly materials = new ExvsMaterialCache();
  private readonly lights = new ExvsLightBuffers();

  private readonly fullscreenScene = new Scene();
  private readonly fullscreenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fullscreenQuad: Mesh;

  /**
   * Stands in for the light's point of view while a partition is drawn.
   *
   * The partition matrix already carries world to light clip, so this camera
   * contributes an identity view and its projection does all the work.
   */
  private readonly shadowCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  private readonly deferredLightingMaterial: ShaderMaterial;
  private readonly iblAmbientMaterial: ShaderMaterial;
  private readonly shadowResolveMaterial: ShaderMaterial;
  private readonly depthReduceMaterial: ShaderMaterial;
  private readonly ssaoDownsampleMaterial: ShaderMaterial;
  private readonly ssaoMaterial: ShaderMaterial;
  private readonly ssaoBlurMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;
  private readonly bloomBrightMaterial: ShaderMaterial;
  private readonly bloomDownsampleMaterial: ShaderMaterial;
  private readonly bloomCombineMaterial: ShaderMaterial;
  private readonly gaussianBlurMaterial: ShaderMaterial;
  private readonly dofMaterial: ShaderMaterial;
  private readonly effectBlendMaterial: ShaderMaterial;
  private readonly postFilterMaterial: ShaderMaterial;
  private readonly fxaaMaterial: ShaderMaterial;

  private shadowFit: ExvsShadowFit | null = null;
  private measuredMinDepth = 0;
  private measuredMaxDepth = 0;
  private depthReadbackInFlight = false;
  private depthReadbackRejected = false;
  private readonly depthReadbackBuffer = new Float32Array(4);

  private readonly savedVisibility = new Map<Object3D, boolean>();
  private readonly savedMaterials = new Map<Mesh, Material | Material[]>();

  private readonly scratchMatrix4 = new Matrix4();
  private readonly scratchVector2 = new Vector2();
  private readonly charaBasicViewRotation = new Matrix3();
  private readonly cameraDependentMaterials: ShaderMaterial[] = [];
  private readonly scratchColor = new Color();
  private readonly previousClearColor = new Color();
  private readonly backgroundColor = new Color();
  private hasBackgroundColor = false;

  constructor(renderer: WebGLRenderer, settings?: Partial<ExvsRenderSettings>) {
    assertExvsRendererCapabilities(renderer);

    this.renderer = renderer;
    this.settings = { ...createDefaultExvsRenderSettings(), ...settings };
    this.sceneTextures = createEmptyExvsSceneTextures();

    const size = renderer.getDrawingBufferSize(new Vector2());
    this.targets = new ExvsRenderTargets(
      size.x,
      size.y,
      this.settings.sdsm.atlasSize,
      this.settings.bloom.iterations,
    );

    this.fullscreenQuad = new Mesh(new PlaneGeometry(2, 2));
    this.fullscreenQuad.frustumCulled = false;
    this.fullscreenScene.add(this.fullscreenQuad);
    this.shadowCamera.matrixAutoUpdate = false;

    this.deferredLightingMaterial = this.createFullscreenMaterial(
      EXVS_DEFERRED_LIGHTING_FRAGMENT_GLSL,
      {
        uDepthTexture: { value: null },
        uGBuffer0: { value: null },
        uGBuffer1: { value: null },
        uGBuffer2: { value: null },
        uGBuffer3: { value: null },
        uDirectionalLights: { value: this.lights.directionalTexture },
        uPointLights: { value: this.lights.pointTexture },
        uSphereAreaLights: { value: this.lights.sphereAreaTexture },
        uNumDirectionalLights: { value: 0 },
        uNumPointLights: { value: 0 },
        uNumSphereAreaLights: { value: 0 },
        uViewMatrix: { value: new Matrix4() },
        uViewRotation: { value: new Matrix3() },
      },
    );

    this.iblAmbientMaterial = this.createFullscreenMaterial(EXVS_IBL_AMBIENT_FRAGMENT_GLSL, {
      uDepthTexture: { value: null },
      uGBuffer0: { value: null },
      uGBuffer1: { value: null },
      uGBuffer2: { value: null },
      uGBuffer3: { value: null },
      uIrradianceNormalTexture: { value: null },
      uDiffuseMapCube: { value: null },
      uSpecularMapCube: { value: null },
      uHasIrradianceNormal: { value: false },
      uHasIblCube: { value: false },
      uAmbientColor: { value: new Vector3() },
      uHemisphereSkyColor: { value: new Vector3() },
      uHemisphereGroundColor: { value: new Vector3() },
      uHemisphereUp: { value: new Vector3(0, 1, 0) },
      uSpecularMipCount: { value: 1 },
      uIblScaling: { value: 1 },
      uAoColor: { value: new Vector3() },
      uViewInverseRotation: { value: new Matrix3() },
      uIblWorldInverseRotation: { value: new Matrix3() },
    });
    this.iblAmbientMaterial.blending = AdditiveBlending;

    this.shadowResolveMaterial = this.createFullscreenMaterial(
      EXVS_SHADOW_RESOLVE_FRAGMENT_GLSL,
      {
        uDepthTexture: { value: null },
        uGBuffer2: { value: null },
        uShadowAtlas: { value: null },
        uViewToLightProjection: { value: new Matrix4() },
        uPartitionScale: {
          value: Array.from({ length: EXVS_SHADOW_PARTITION_COUNT }, () => new Vector4()),
        },
        uPartitionBias: {
          value: Array.from({ length: EXVS_SHADOW_PARTITION_COUNT }, () => new Vector4()),
        },
        uDepthBias: { value: 0 },
      },
    );
    // Keep the colour channels, replace alpha by multiplying the shadow into it.
    // The early-out writes 1.0, which leaves a non-receiver untouched, and a
    // baked light map's own shadow in alpha survives combined with the dynamic one.
    this.shadowResolveMaterial.blending = CustomBlending;
    this.shadowResolveMaterial.blendSrc = ZeroFactor;
    this.shadowResolveMaterial.blendDst = OneFactor;
    this.shadowResolveMaterial.blendSrcAlpha = DstAlphaFactor;
    this.shadowResolveMaterial.blendDstAlpha = ZeroFactor;

    this.depthReduceMaterial = this.createFullscreenMaterial(EXVS_DEPTH_REDUCE_FRAGMENT_GLSL, {
      uSource: { value: null },
      uSourceSize: { value: new Vector2() },
      uNearClip: { value: 0.1 },
      uFarClip: { value: 1000 },
      uIsFirstPass: { value: true },
    });

    this.ssaoDownsampleMaterial = this.createFullscreenMaterial(
      EXVS_SSAO_DOWNSAMPLE_FRAGMENT_GLSL,
      {
        uDepthTexture: { value: null },
        uDepthSize: { value: new Vector2() },
      },
    );

    this.ssaoMaterial = this.createFullscreenMaterial(EXVS_SSAO_FRAGMENT_GLSL, {
      uDepthTexture: { value: null },
      uHalfDepthTexture: { value: null },
      uGBuffer0: { value: null },
      uRadius: { value: 1 },
      uThreshold: { value: 0.35 },
      uSampleRadiusNum: { value: 3 },
      uSampleRotateNum: { value: 4 },
      uMaxOcclusion: { value: 0.9 },
      uRadiusAmount: { value: 0.08 },
      uRadiusOffset: { value: 0.04 },
      uRevRotateNum: { value: 0.25 },
      uZScale: { value: 0.01 },
    });

    this.ssaoBlurMaterial = this.createFullscreenMaterial(EXVS_SSAO_BLUR_FRAGMENT_GLSL, {
      uAoTexture: { value: null },
      uGBuffer2: { value: null },
      uTexelStep: { value: new Vector2(1, 0) },
      uSourceSize: { value: new Vector2() },
      uWeights: { value: new Array<number>(8).fill(0) },
      uIsFinalPass: { value: false },
    });

    this.compositeMaterial = this.createFullscreenMaterial(EXVS_COMPOSITE_FRAGMENT_GLSL, {
      uGBuffer0: { value: null },
      uGBuffer1: { value: null },
      uGBuffer2: { value: null },
      uGBuffer3: { value: null },
      uDiffuseLAB: { value: null },
      uSpecularLAB: { value: null },
      uDepthMap: { value: null },
      uToneCurveLUTMap: { value: null },
      uCharaSpecialTexture: { value: null },
      uRampFogColorTexture: { value: null },
      uBorderProjectionTexture: { value: null },
      uProjectionXZTexture: { value: null },
      uColorGradingLUT: { value: null },
      uHasCharaSpecial: { value: false },
      uHasRampFog: { value: false },
      uHasBorderProjection: { value: false },
      uProjectionXZEnabled: { value: false },
      uToneCurveEnabled: { value: false },
      uColorGradingEnabled: { value: false },
      uViewInverse: { value: new Matrix4() },
      uShadowColor: { value: new Vector3() },
      uBrightnessRatio: { value: 1 },
      uRampfogRgbBoost: { value: 1 },
      uRampfogAlphaBoost: { value: 1 },
      uMapfogAttenStart: { value: 40 },
      uMapfogAttenEnd: { value: 260 },
      uMapfogSize: { value: new Vector2(1000, 1000) },
      uMapfogCenter: { value: new Vector2() },
      uProjectionXZDiv: { value: new Vector2(1, 1) },
      uProjectionXZOffset: { value: new Vector2() },
      uProjectionXZRatio: { value: 0 },
    });
    // The composite owns depth for everything drawn after it. A depth write only
    // happens with the depth test enabled, so the test is enabled and made to
    // always pass rather than switched off.
    this.compositeMaterial.depthTest = true;
    this.compositeMaterial.depthFunc = AlwaysDepth;
    this.compositeMaterial.depthWrite = true;

    this.bloomBrightMaterial = this.createFullscreenMaterial(EXVS_BLOOM_BRIGHT_FRAGMENT_GLSL, {
      uSource: { value: null },
      uBloomThreshold: { value: 1 },
    });
    this.bloomDownsampleMaterial = this.createFullscreenMaterial(
      EXVS_BLOOM_DOWNSAMPLE_FRAGMENT_GLSL,
      {
        uSource: { value: null },
        uBlendValue: { value: 1 },
      },
    );
    this.bloomCombineMaterial = this.createFullscreenMaterial(
      EXVS_BLOOM_COMBINE_FRAGMENT_GLSL,
      {
        uSource: { value: null },
        uLightBuffer: { value: null },
        uBrightScale: { value: 1 },
      },
    );

    this.gaussianBlurMaterial = this.createFullscreenMaterial(
      EXVS_GAUSSIAN_BLUR_FRAGMENT_GLSL,
      {
        uSource: { value: null },
        uPixelSize: { value: new Vector2() },
        uDirection: { value: new Vector2(1, 0) },
        uUvOffset: { value: 0 },
        uStepCount: { value: 0 },
        uWeightAndOffset: {
          value: Array.from({ length: EXVS_GAUSSIAN_BLUR_MAX_STEPS }, () => new Vector2()),
        },
      },
    );

    this.dofMaterial = this.createFullscreenMaterial(EXVS_DOF_FRAGMENT_GLSL, {
      uSource: { value: null },
      uSoftBlurred: { value: null },
      uHardBlurred: { value: null },
      uDepthTexture: { value: null },
      uSubjectDistance: { value: 12 },
      uCircleOfConfusion: { value: 1 },
      uBokehBias: { value: 1 },
    });

    this.effectBlendMaterial = this.createFullscreenMaterial(EXVS_EFFECT_BLEND_FRAGMENT_GLSL, {
      uToneCurveLUTMap: { value: null },
      uEffectBlendHalfBack: { value: null },
      uEffectBlendFullBack: { value: null },
      uEffectBlendHalfFront: { value: null },
      uEffectBlendFullFront: { value: null },
    });
    // The pass outputs a premultiplied layer that goes over the scene.
    this.effectBlendMaterial.blending = CustomBlending;
    this.effectBlendMaterial.blendSrc = OneFactor;
    this.effectBlendMaterial.blendDst = OneMinusSrcAlphaFactor;

    this.postFilterMaterial = this.createFullscreenMaterial(EXVS_POST_FILTER_FRAGMENT_GLSL, {
      uInputTexture: { value: null },
      uLutTexture: { value: null },
      uColorGradingEnabled: { value: false },
      uRadialBlurEnabled: { value: false },
      uRadialBlurPower: { value: 0 },
      uRadialBlurRadiusPower: { value: 1 },
      uRadialBlurBlendRate: { value: 0 },
      uRadialBlurScreenPos: { value: new Vector2(0.5, 0.5) },
      uAddColorRadialEnabled: { value: false },
      uAddColorRadial: { value: [0, 0, 0, 0] },
      uAddColorRadiusPower: { value: 1 },
      uAddColorScreenPos: { value: new Vector2(0.5, 0.5) },
      uColorFilterEnabled: { value: false },
      uColorFilterColor: { value: [1, 1, 1, 1] },
      uNegativeEnabled: { value: false },
      uNegativePivot: { value: 0.5 },
      uGlitchEnabled: { value: false },
      uChromaAberrationUv: { value: new Vector2() },
      uChromaAberrationColor: { value: new Vector3() },
      uScanNoiseThreshold: { value: 0 },
      uNoiseWidth: { value: 0 },
      uNoiseColor0: { value: new Vector3(1, 1, 1) },
      uNoiseColor1: { value: new Vector3(1, 1, 1) },
      uGlitchRand: { value: [0, 0, 0, 0] },
    });

    this.fxaaMaterial = this.createFullscreenMaterial(EXVS_FXAA_FRAGMENT_GLSL, {
      uSource: { value: null },
      uRcpFrame: { value: new Vector2() },
      uQualitySubpix: { value: 0.75 },
      uQualityEdgeThreshold: { value: 0.166 },
      uQualityEdgeThresholdMin: { value: 0.0833 },
    });
  }

  setSize(width: number, height: number): void {
    this.targets.setSize(width, height);
  }

  dispose(): void {
    this.targets.dispose();
    this.materials.dispose();
    this.lights.dispose();
    this.fullscreenQuad.geometry.dispose();
    for (const material of [
      this.deferredLightingMaterial,
      this.iblAmbientMaterial,
      this.shadowResolveMaterial,
      this.depthReduceMaterial,
      this.ssaoDownsampleMaterial,
      this.ssaoMaterial,
      this.ssaoBlurMaterial,
      this.compositeMaterial,
      this.bloomBrightMaterial,
      this.bloomDownsampleMaterial,
      this.bloomCombineMaterial,
      this.effectBlendMaterial,
      this.gaussianBlurMaterial,
      this.dofMaterial,
      this.postFilterMaterial,
      this.fxaaMaterial,
    ]) {
      material.dispose();
    }
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    const renderer = this.renderer;
    const size = renderer.getDrawingBufferSize(this.scratchVector2);
    this.targets.setSize(size.x, size.y);
    this.targets.setShadowAtlasSize(this.settings.sdsm.atlasSize);
    this.targets.setBloomIterations(this.settings.bloom.iterations);

    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    this.syncCameraUniforms(camera);
    this.lights.update(scene);

    const classification = this.classify(scene);

    const previousAutoClear = renderer.autoClear;
    const previousTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    renderer.getClearColor(this.previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();

    // A scene background forces three.js to clear on every render call, which
    // would wipe the composited image when the forward pass draws over it. The
    // background is taken over here and painted as the scene colour's clear
    // instead, then handed back untouched.
    this.backgroundColor.set(0, 0, 0);
    this.hasBackgroundColor = false;
    if (previousBackground !== null && (previousBackground as Color).isColor === true) {
      this.backgroundColor.copy(previousBackground as Color);
      this.hasBackgroundColor = true;
    }
    scene.background = null;
    renderer.autoClear = false;

    try {
      this.renderShadowAtlas(scene, camera, classification);
      this.renderGBuffer(scene, camera, classification);
      this.reduceDepth(camera);
      this.renderAmbientOcclusion(camera);
      this.resolveShadows(camera);
      this.renderLighting(camera, classification);
      this.renderComposite(camera);
      this.renderCharaBasic(scene, camera, classification);
      this.renderForward(scene, camera, classification);
      this.renderPostChain(camera);
    } finally {
      scene.background = previousBackground;
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(this.previousClearColor, previousClearAlpha);
      renderer.setRenderTarget(previousTarget);
    }
  }

  // --- scene classification -------------------------------------------------

  private classify(scene: Scene): RenderableClassification {
    const deferred: Mesh[] = [];
    const charaBasic: Mesh[] = [];
    const forward: Object3D[] = [];
    const all: Object3D[] = [];
    const params = new Map<Mesh, ExvsObjectParams>();
    // drei's <Environment> leaves a PMREM texture here, which is a 2D atlas and
    // cannot be sampled as a cube; only a genuine cube map is usable.
    const environment = scene.environment as CubeTexture | null;
    let sceneEnvMap: CubeTexture | null =
      environment !== null && environment.isCubeTexture === true ? environment : null;

    scene.traverseVisible((object) => {
      const renderable = object as RenderableLike;
      const isRenderable =
        renderable.isMesh === true ||
        renderable.isLine === true ||
        renderable.isPoints === true ||
        renderable.isSprite === true;
      if (!isRenderable) return;

      all.push(object);

      if (renderable.isMesh !== true || renderable.material === undefined) {
        forward.push(object);
        return;
      }

      const material = renderable.material;
      // A multi-material mesh has one material per group and no single G-buffer
      // description, so it is drawn forward with what it already carries.
      if (Array.isArray(material)) {
        forward.push(object);
        return;
      }

      if (sceneEnvMap === null) {
        const envMap = (material as Material & { envMap?: Texture | null }).envMap;
        if (envMap && (envMap as CubeTexture).isCubeTexture === true) {
          sceneEnvMap = envMap as CubeTexture;
        }
      }

      if (material.transparent === true) {
        forward.push(object);
        return;
      }

      const mesh = object as Mesh;
      const objectParams = readExvsObjectParams(mesh.userData);
      params.set(mesh, objectParams);
      deferred.push(mesh);
      if (objectParams.charaBasic) charaBasic.push(mesh);
    });

    return { deferred, charaBasic, forward, all, params, sceneEnvMap };
  }

  private beginIsolatedPass(all: Object3D[], visibleSet: Set<Object3D>): void {
    this.savedVisibility.clear();
    for (const object of all) {
      this.savedVisibility.set(object, object.visible);
      object.visible = visibleSet.has(object);
    }
  }

  private endIsolatedPass(): void {
    for (const [object, visible] of this.savedVisibility) object.visible = visible;
    this.savedVisibility.clear();
  }

  private swapMaterials(meshes: Mesh[], resolve: (mesh: Mesh) => Material): void {
    this.savedMaterials.clear();
    for (const mesh of meshes) {
      this.savedMaterials.set(mesh, mesh.material);
      mesh.material = resolve(mesh);
    }
  }

  private restoreMaterials(): void {
    for (const [mesh, material] of this.savedMaterials) mesh.material = material;
    this.savedMaterials.clear();
  }

  // --- passes ---------------------------------------------------------------

  private renderShadowAtlas(
    scene: Scene,
    camera: PerspectiveCamera,
    classification: RenderableClassification,
  ): void {
    const renderer = this.renderer;
    const atlas = this.targets.shadowAtlas;

    renderer.setRenderTarget(atlas);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear(true, true, false);

    if (!this.settings.sdsm.enabled) {
      this.shadowFit = null;
      return;
    }

    const casters = classification.deferred.filter(
      (mesh) => classification.params.get(mesh)?.isShadowCaster === true,
    );
    if (casters.length === 0) {
      this.shadowFit = null;
      return;
    }

    const hasMeasuredRange = this.measuredMaxDepth > this.measuredMinDepth;
    const fit = fitExvsShadowPartitions(
      camera,
      this.lights.getKeyLightDirection(),
      hasMeasuredRange ? this.measuredMinDepth : this.settings.sdsm.shadowNear,
      hasMeasuredRange ? this.measuredMaxDepth : this.settings.sdsm.shadowFar,
      this.settings.sdsm,
    );
    this.shadowFit = fit;

    const visibleSet = new Set<Object3D>(casters);
    this.beginIsolatedPass(classification.all, visibleSet);
    this.swapMaterials(casters, (mesh) => {
      const params = classification.params.get(mesh);
      if (params === undefined) {
        throw new Error("ExvsRenderPipeline: a shadow caster was classified without parameters");
      }
      return this.materials.getDepthOnlyMaterial(mesh.material as Material, params);
    });

    const half = this.targets.shadowAtlas.width * 0.5;
    const shadowCamera = this.shadowCamera;
    const worldToView = this.scratchMatrix4.copy(camera.matrixWorld).invert();

    try {
      for (let i = 0; i < EXVS_SHADOW_PARTITION_COUNT; i += 1) {
        const [col, row] = SHADOW_TILES[i];
        renderer.setViewport(col * half, row * half, half, half);
        renderer.setScissor(col * half, row * half, half, half);
        renderer.setScissorTest(true);

        shadowCamera.matrixWorld.identity();
        shadowCamera.matrixWorldInverse.identity();
        shadowCamera.projectionMatrix.copy(
          partitionRenderMatrix(fit.viewToLightProjection, fit.partitions[i], worldToView),
        );
        shadowCamera.projectionMatrixInverse.copy(shadowCamera.projectionMatrix).invert();

        renderer.render(scene, shadowCamera);
      }
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, atlas.width, atlas.height);
      this.restoreMaterials();
      this.endIsolatedPass();
    }
  }

  private renderGBuffer(
    scene: Scene,
    camera: PerspectiveCamera,
    classification: RenderableClassification,
  ): void {
    const renderer = this.renderer;
    const size = this.targets.getSize();

    renderer.setRenderTarget(this.targets.gBuffer);
    renderer.setViewport(0, 0, size.width, size.height);
    renderer.state.buffers.depth.setMask(true);
    // Target 0's alpha is zero and target 1's alpha is one wherever geometry
    // lands, so clearing to zero leaves the sky reading as unlit, unshadowed.
    renderer.setClearColor(this.scratchColor.setRGB(0, 0, 0), 0);
    renderer.clear(true, true, false);

    const visibleSet = new Set<Object3D>(classification.deferred);
    this.beginIsolatedPass(classification.all, visibleSet);
    this.swapMaterials(classification.deferred, (mesh) => {
      const params = classification.params.get(mesh);
      if (params === undefined) {
        throw new Error("ExvsRenderPipeline: a deferred mesh was classified without parameters");
      }
      return this.materials.getGBufferMaterial(
        mesh.material as Material,
        mesh.geometry,
        params,
        this.settings,
      );
    });

    try {
      renderer.render(scene, camera);
    } finally {
      this.restoreMaterials();
      this.endIsolatedPass();
    }
  }

  private reduceDepth(camera: PerspectiveCamera): void {
    if (!this.settings.sdsm.enabled) return;

    const renderer = this.renderer;
    const chain = this.targets.depthReduceChain;
    if (chain.length === 0) return;

    const uniforms = this.depthReduceMaterial.uniforms;
    uniforms.uNearClip.value = Math.max(this.settings.sdsm.shadowNear, camera.near);
    uniforms.uFarClip.value = Math.min(this.settings.sdsm.shadowFar, camera.far);

    const gBufferSize = this.targets.getSize();
    uniforms.uSource.value = this.targets.gBuffer.depthTexture;
    uniforms.uIsFirstPass.value = true;
    (uniforms.uSourceSize.value as Vector2).set(gBufferSize.width, gBufferSize.height);
    this.blit(this.depthReduceMaterial, chain[0]);

    uniforms.uIsFirstPass.value = false;
    for (let i = 1; i < chain.length; i += 1) {
      const source = chain[i - 1];
      uniforms.uSource.value = source.texture;
      (uniforms.uSourceSize.value as Vector2).set(source.width, source.height);
      this.blit(this.depthReduceMaterial, chain[i]);
    }

    this.requestDepthReadback(chain[chain.length - 1]);
  }

  /**
   * Pulls the reduced near and far back one frame late.
   *
   * A synchronous read would stall the pipeline on a fence every frame. Shadow
   * partitions built from the previous frame's bounds are what sample
   * distribution shadow maps do in practice, and a one frame lag is invisible at
   * any camera speed an editor produces.
   */
  private requestDepthReadback(target: WebGLRenderTarget): void {
    if (this.depthReadbackInFlight || this.depthReadbackRejected) return;
    this.depthReadbackInFlight = true;

    void this.renderer
      .readRenderTargetPixelsAsync(target, 0, 0, 1, 1, this.depthReadbackBuffer)
      .then(() => {
        const minDepth = this.depthReadbackBuffer[0];
        const maxDepth = this.depthReadbackBuffer[1];
        if (Number.isFinite(minDepth) && Number.isFinite(maxDepth) && maxDepth > minDepth) {
          this.measuredMinDepth = minDepth;
          this.measuredMaxDepth = maxDepth;
        }
      })
      .catch(() => {
        // Some drivers refuse to read a float colour attachment back. Asking again
        // every frame would do nothing but stall, and the partitions already have a
        // correct range to fall back on: the camera's own near and far. They are
        // looser than the measured bounds, never wrong.
        this.depthReadbackRejected = true;
      })
      .finally(() => {
        this.depthReadbackInFlight = false;
      });
  }

  private renderAmbientOcclusion(camera: PerspectiveCamera): void {
    const ssao = this.settings.ssao;
    if (!ssao.enabled) return;

    const gBuffer = this.targets.gBuffer;
    const size = this.targets.getSize();

    const downsample = this.ssaoDownsampleMaterial.uniforms;
    downsample.uDepthTexture.value = gBuffer.depthTexture;
    (downsample.uDepthSize.value as Vector2).set(size.width, size.height);
    this.blit(this.ssaoDownsampleMaterial, this.targets.halfDepth);

    const occlusion = this.ssaoMaterial.uniforms;
    occlusion.uDepthTexture.value = gBuffer.depthTexture;
    occlusion.uHalfDepthTexture.value = this.targets.halfDepth.texture;
    occlusion.uGBuffer0.value = gBuffer.textures[0];
    occlusion.uRadius.value = ssao.radius;
    occlusion.uThreshold.value = ssao.threshold;
    occlusion.uSampleRadiusNum.value = ssao.sampleRadiusNum;
    occlusion.uSampleRotateNum.value = ssao.sampleRotateNum;
    occlusion.uMaxOcclusion.value = ssao.maxOcclusion;
    occlusion.uRadiusAmount.value = ssao.radiusAmount;
    occlusion.uRadiusOffset.value = ssao.radiusOffset;
    occlusion.uRevRotateNum.value = 1 / Math.max(ssao.sampleRotateNum, 1);
    occlusion.uZScale.value = ssao.zscale;
    this.blit(this.ssaoMaterial, this.targets.ssao);

    if (!ssao.blurEnabled) return;

    const blur = this.ssaoBlurMaterial.uniforms;
    const occlusionTarget = this.targets.ssao;
    blur.uWeights.value = ssao.blurWeights;
    (blur.uSourceSize.value as Vector2).set(occlusionTarget.width, occlusionTarget.height);
    blur.uGBuffer2.value = gBuffer.textures[2];

    blur.uAoTexture.value = occlusionTarget.texture;
    (blur.uTexelStep.value as Vector2).set(1, 0);
    blur.uIsFinalPass.value = false;
    this.ssaoBlurMaterial.blending = NoBlending;
    this.blit(this.ssaoBlurMaterial, this.targets.ssaoBlur);

    // The vertical pass lands in the G-buffer's own ambient occlusion channel,
    // multiplied so a baked occlusion map and the screen-space term combine.
    blur.uAoTexture.value = this.targets.ssaoBlur.texture;
    (blur.uTexelStep.value as Vector2).set(0, 1);
    blur.uIsFinalPass.value = true;
    this.ssaoBlurMaterial.blending = CustomBlending;
    this.ssaoBlurMaterial.blendSrc = ZeroFactor;
    this.ssaoBlurMaterial.blendDst = SrcColorFactor;
    this.ssaoBlurMaterial.blendSrcAlpha = ZeroFactor;
    this.ssaoBlurMaterial.blendDstAlpha = SrcColorFactor;
    this.blitFullResolution(this.ssaoBlurMaterial, this.targets.gBuffer, 3);
  }

  private resolveShadows(camera: PerspectiveCamera): void {
    const fit = this.shadowFit;
    if (fit === null) return;

    const uniforms = this.shadowResolveMaterial.uniforms;
    uniforms.uDepthTexture.value = this.targets.gBuffer.depthTexture;
    uniforms.uGBuffer2.value = this.targets.gBuffer.textures[2];
    uniforms.uShadowAtlas.value = this.targets.shadowAtlas.depthTexture;
    (uniforms.uViewToLightProjection.value as Matrix4).copy(fit.viewToLightProjection);
    uniforms.uDepthBias.value = this.settings.sdsm.depthBias;

    const scales = uniforms.uPartitionScale.value as Vector4[];
    const biases = uniforms.uPartitionBias.value as Vector4[];
    for (let i = 0; i < EXVS_SHADOW_PARTITION_COUNT; i += 1) {
      const partition = fit.partitions[i];
      scales[i].set(partition.scale.x, partition.scale.y, partition.scale.z, partition.intervalEnd);
      biases[i].set(partition.bias.x, partition.bias.y, partition.bias.z, partition.intervalBegin);
    }

    this.blitFullResolution(this.shadowResolveMaterial, this.targets.gBuffer, 1);
  }

  private renderLighting(
    camera: PerspectiveCamera,
    classification: RenderableClassification,
  ): void {
    const renderer = this.renderer;
    const gBuffer = this.targets.gBuffer;
    const counts = this.lights.getCounts();

    renderer.setRenderTarget(this.targets.lightAccumulation);
    renderer.setClearColor(this.scratchColor.setRGB(0, 0, 0), 0);
    renderer.clear(true, false, false);

    const lighting = this.deferredLightingMaterial.uniforms;
    lighting.uDepthTexture.value = gBuffer.depthTexture;
    lighting.uGBuffer0.value = gBuffer.textures[0];
    lighting.uGBuffer1.value = gBuffer.textures[1];
    lighting.uGBuffer2.value = gBuffer.textures[2];
    lighting.uGBuffer3.value = gBuffer.textures[3];
    lighting.uNumDirectionalLights.value = counts.directional;
    lighting.uNumPointLights.value = counts.point;
    lighting.uNumSphereAreaLights.value = counts.sphereArea;
    (lighting.uViewMatrix.value as Matrix4).copy(camera.matrixWorldInverse);
    (lighting.uViewRotation.value as Matrix3).setFromMatrix4(camera.matrixWorldInverse);
    this.blit(this.deferredLightingMaterial, this.targets.lightAccumulation);

    if (!this.settings.ibl.useIbl) return;

    // The cube maps are optional. Without them this pass still runs, carrying the
    // scene's ambient and hemisphere lights, which is the only ambient an editor
    // scene has; skipping it is what left every surface the sun missed at black.
    const specularCube = this.sceneTextures.specularMapCube ?? classification.sceneEnvMap;
    const diffuseCube = this.sceneTextures.diffuseMapCube ?? specularCube;
    const hasIblCube = specularCube !== null && diffuseCube !== null;

    const sceneAmbient = this.lights.getAmbientLighting();
    const ambient = this.iblAmbientMaterial.uniforms;
    ambient.uHasIblCube.value = hasIblCube;
    (ambient.uAmbientColor.value as Vector3).copy(sceneAmbient.ambientColor);
    (ambient.uHemisphereSkyColor.value as Vector3).copy(sceneAmbient.hemisphereSkyColor);
    (ambient.uHemisphereGroundColor.value as Vector3).copy(sceneAmbient.hemisphereGroundColor);
    (ambient.uHemisphereUp.value as Vector3).copy(sceneAmbient.hemisphereUp);
    ambient.uDepthTexture.value = gBuffer.depthTexture;
    ambient.uGBuffer0.value = gBuffer.textures[0];
    ambient.uGBuffer1.value = gBuffer.textures[1];
    ambient.uGBuffer2.value = gBuffer.textures[2];
    ambient.uGBuffer3.value = gBuffer.textures[3];
    ambient.uIrradianceNormalTexture.value = this.sceneTextures.irradianceNormal;
    ambient.uHasIrradianceNormal.value = this.sceneTextures.irradianceNormal !== null;
    ambient.uDiffuseMapCube.value = diffuseCube;
    ambient.uSpecularMapCube.value = specularCube;
    ambient.uSpecularMipCount.value = specularCube === null ? 1 : mipCountOf(specularCube);
    ambient.uIblScaling.value = this.settings.ibl.iblScaling;
    (ambient.uAoColor.value as Vector3).fromArray(this.settings.shadowParameter.aoColor);
    (ambient.uViewInverseRotation.value as Matrix3).setFromMatrix4(camera.matrixWorld);
    (ambient.uIblWorldInverseRotation.value as Matrix3).setFromMatrix4(
      this.scratchMatrix4.makeRotationY(-this.settings.ibl.iblYaw),
    );
    this.blit(this.iblAmbientMaterial, this.targets.lightAccumulation);
  }

  private renderComposite(camera: PerspectiveCamera): void {
    const renderer = this.renderer;
    const gBuffer = this.targets.gBuffer;
    const filter = this.settings.sceneFilter;
    const post = this.settings.postFilter;
    const textures = this.sceneTextures;

    const uniforms = this.compositeMaterial.uniforms;
    uniforms.uGBuffer0.value = gBuffer.textures[0];
    uniforms.uGBuffer1.value = gBuffer.textures[1];
    uniforms.uGBuffer2.value = gBuffer.textures[2];
    uniforms.uGBuffer3.value = gBuffer.textures[3];
    uniforms.uDiffuseLAB.value = this.targets.lightAccumulation.textures[0];
    uniforms.uSpecularLAB.value = this.targets.lightAccumulation.textures[1];
    uniforms.uDepthMap.value = gBuffer.depthTexture;
    uniforms.uToneCurveLUTMap.value = textures.toneCurveLut;
    uniforms.uCharaSpecialTexture.value = textures.charaSpecial;
    uniforms.uRampFogColorTexture.value = textures.rampFogColor;
    uniforms.uBorderProjectionTexture.value = textures.borderProjection;
    uniforms.uProjectionXZTexture.value = textures.projectionXZ;
    uniforms.uColorGradingLUT.value = textures.colorGradingLut;
    uniforms.uHasCharaSpecial.value = textures.charaSpecial !== null;
    uniforms.uHasRampFog.value = textures.rampFogColor !== null;
    uniforms.uHasBorderProjection.value = textures.borderProjection !== null;
    uniforms.uProjectionXZEnabled.value = textures.projectionXZ !== null;
    uniforms.uToneCurveEnabled.value = post.toneCurveEnabled && textures.toneCurveLut !== null;
    uniforms.uColorGradingEnabled.value =
      post.colorGradingEnabled && textures.colorGradingLut !== null;
    (uniforms.uViewInverse.value as Matrix4).copy(camera.matrixWorld);
    (uniforms.uShadowColor.value as Vector3).fromArray(this.settings.shadowParameter.shadowColor);
    uniforms.uBrightnessRatio.value = filter.brightnessRatio;
    uniforms.uRampfogRgbBoost.value = filter.rampfogRgbBoost;
    uniforms.uRampfogAlphaBoost.value = filter.rampfogAlphaBoost;
    uniforms.uMapfogAttenStart.value = filter.mapfogAttenStart;
    uniforms.uMapfogAttenEnd.value = filter.mapfogAttenEnd;

    renderer.setRenderTarget(this.targets.sceneColor);
    renderer.setViewport(0, 0, this.targets.sceneColor.width, this.targets.sceneColor.height);
    renderer.state.buffers.depth.setMask(true);
    // The composite discards where nothing was drawn, so this clear is what shows
    // through as the background.
    renderer.setClearColor(
      this.hasBackgroundColor ? this.backgroundColor : this.scratchColor.setRGB(0, 0, 0),
      1,
    );
    renderer.clear(true, true, false);
    this.blit(this.compositeMaterial, this.targets.sceneColor, false);
  }

  private renderCharaBasic(
    scene: Scene,
    camera: PerspectiveCamera,
    classification: RenderableClassification,
  ): void {
    const basic = this.settings.charaBasic;
    if (!basic.enabled || classification.charaBasic.length === 0) return;

    const specularCube = this.sceneTextures.specularMapCube ?? classification.sceneEnvMap;
    if (specularCube === null) return;

    const frame: ExvsCharaBasicFrameState = {
      gBufferNormal: this.targets.gBuffer.textures[0],
      bariSpecularMap: specularCube,
      specularMipCount: mipCountOf(specularCube),
      keyLightDirection: this.lights.getKeyLightDirection(),
      viewInverseRotation: this.charaBasicViewRotation.setFromMatrix4(camera.matrixWorld),
    };

    const renderer = this.renderer;
    renderer.setRenderTarget(this.targets.sceneColor);

    const visibleSet = new Set<Object3D>(classification.charaBasic);
    this.beginIsolatedPass(classification.all, visibleSet);
    this.swapMaterials(classification.charaBasic, (mesh) => {
      const params = classification.params.get(mesh);
      if (params === undefined) {
        throw new Error("ExvsRenderPipeline: a rim-pass mesh was classified without parameters");
      }
      return this.materials.getCharaBasicMaterial(
        mesh.material as Material,
        params,
        this.settings,
        frame,
      );
    });

    try {
      renderer.render(scene, camera);
    } finally {
      this.restoreMaterials();
      this.endIsolatedPass();
    }
  }

  private renderForward(
    scene: Scene,
    camera: PerspectiveCamera,
    classification: RenderableClassification,
  ): void {
    if (classification.forward.length === 0) return;

    const renderer = this.renderer;
    renderer.setRenderTarget(this.targets.sceneColor);

    const visibleSet = new Set<Object3D>(classification.forward);
    this.beginIsolatedPass(classification.all, visibleSet);
    try {
      renderer.render(scene, camera);
    } finally {
      this.endIsolatedPass();
    }
  }

  /**
   * Folds the four effect layers over the scene and runs them through the tone
   * curve rows reserved for effects.
   *
   * Nothing in an editor scene fills those layers today, so the pass is skipped
   * unless a caller supplies all four, exactly as the stage-authored inputs the
   * composite reads are gated.
   *
   * @returns true when the pass ran and wrote into sceneColor.
   */
  private renderEffectBlend(source: WebGLRenderTarget): boolean {
    const textures = this.sceneTextures;
    const layers = [
      textures.effectBlendHalfBack,
      textures.effectBlendFullBack,
      textures.effectBlendHalfFront,
      textures.effectBlendFullFront,
    ];
    if (layers.some((layer) => layer === null) || textures.toneCurveLut === null) {
      return false;
    }

    // Bloom and depth of field land in a ping-pong target. The effect layer is
    // premultiplied over whatever is already in sceneColor, so that image has to
    // be copied back first. When neither pass ran, sceneColor already holds the
    // composite and copying it onto itself would sample the attachment being written.
    if (source !== this.targets.sceneColor) {
      const combine = this.bloomCombineMaterial.uniforms;
      const savedBrightScale = combine.uBrightScale.value as number;
      combine.uSource.value = source.texture;
      combine.uLightBuffer.value = source.texture;
      combine.uBrightScale.value = 0;
      this.bloomCombineMaterial.blending = NoBlending;
      this.blit(this.bloomCombineMaterial, this.targets.sceneColor);
      combine.uBrightScale.value = savedBrightScale;
    }

    const uniforms = this.effectBlendMaterial.uniforms;
    uniforms.uToneCurveLUTMap.value = textures.toneCurveLut;
    uniforms.uEffectBlendHalfBack.value = layers[0];
    uniforms.uEffectBlendFullBack.value = layers[1];
    uniforms.uEffectBlendHalfFront.value = layers[2];
    uniforms.uEffectBlendFullFront.value = layers[3];

    this.blit(this.effectBlendMaterial, this.targets.sceneColor);
    return true;
  }

  private renderPostChain(camera: PerspectiveCamera): void {
    const bloom = this.settings.bloom;
    const dof = this.settings.dof;
    const post = this.settings.postFilter;
    const fxaa = this.settings.fxaa;

    let source: WebGLRenderTarget = this.targets.sceneColor;

    if (bloom.enabled && this.targets.bloomChain.length > 0) {
      source = this.renderBloom(source);
    }

    if (dof.enabled) {
      source = this.renderDepthOfField(source, camera);
    }

    if (this.renderEffectBlend(source)) {
      source = this.targets.sceneColor;
    }

    const filter = this.postFilterMaterial.uniforms;
    filter.uInputTexture.value = source.texture;
    filter.uLutTexture.value = this.sceneTextures.colorGradingLut;
    filter.uColorGradingEnabled.value =
      post.colorGradingEnabled && this.sceneTextures.colorGradingLut !== null;
    filter.uRadialBlurEnabled.value = post.radialBlurEnabled;
    filter.uRadialBlurPower.value = post.radialBlurPower;
    filter.uRadialBlurRadiusPower.value = post.radialBlurRadiusPower;
    filter.uRadialBlurBlendRate.value = post.radialBlurBlendRate;
    (filter.uRadialBlurScreenPos.value as Vector2).fromArray(post.radialBlurScreenPos);
    filter.uAddColorRadialEnabled.value = post.addColorEnabled;
    filter.uAddColorRadial.value = post.addColor;
    filter.uAddColorRadiusPower.value = post.addColorRadiusPower;
    (filter.uAddColorScreenPos.value as Vector2).fromArray(post.addColorScreenPos);
    filter.uColorFilterEnabled.value = post.colorFilterEnabled;
    filter.uColorFilterColor.value = post.colorFilterColor;
    filter.uNegativeEnabled.value = post.negativeEnabled;
    filter.uNegativePivot.value = post.negativePivot;

    const postTarget = source === this.targets.postPing ? this.targets.postPong : this.targets.postPing;
    this.blit(this.postFilterMaterial, postTarget);
    source = postTarget;

    if (fxaa.enabled) {
      const size = this.targets.getSize();
      const antialias = this.fxaaMaterial.uniforms;
      antialias.uSource.value = source.texture;
      (antialias.uRcpFrame.value as Vector2).set(1 / size.width, 1 / size.height);
      antialias.uQualitySubpix.value = fxaa.subpixelQuality;
      antialias.uQualityEdgeThreshold.value = fxaa.edgeThreshold;
      antialias.uQualityEdgeThresholdMin.value = fxaa.edgeThresholdMin;
      this.blit(this.fxaaMaterial, null);
      return;
    }

    const passthrough = this.postFilterMaterial.uniforms;
    passthrough.uInputTexture.value = source.texture;
    this.blit(this.postFilterMaterial, null);
  }

  private renderBloom(source: WebGLRenderTarget): WebGLRenderTarget {
    const bloom = this.settings.bloom;
    const chain = this.targets.bloomChain;
    const blurTargets = this.targets.bloomBlur;

    this.bloomBrightMaterial.uniforms.uSource.value = source.texture;
    this.bloomBrightMaterial.uniforms.uBloomThreshold.value = bloom.bloomThreshold;
    this.blit(this.bloomBrightMaterial, chain[0]);

    this.bloomDownsampleMaterial.uniforms.uBlendValue.value = bloom.blendValue;
    for (let i = 1; i < chain.length; i += 1) {
      this.bloomDownsampleMaterial.uniforms.uSource.value = chain[i - 1].texture;
      this.blit(this.bloomDownsampleMaterial, chain[i]);
    }

    // A separable gaussian on the smallest level, which is what spreads the bloom.
    const smallest = chain[chain.length - 1];
    this.applyGaussianBlur(smallest, blurTargets[blurTargets.length - 1], smallest);

    // Combine back up the chain rather than only at the bottom. The combine shader
    // takes a colour buffer and a light buffer, which is what a progressive
    // upsample needs; folding only the smallest level in leaves a one pixel
    // highlight diluted to nothing by the time it reaches the output.
    const combine = this.bloomCombineMaterial.uniforms;
    combine.uBrightScale.value = bloom.brightScale;

    let upper = smallest;
    for (let i = chain.length - 2; i >= 0; i -= 1) {
      combine.uSource.value = chain[i].texture;
      combine.uLightBuffer.value = upper.texture;
      // Into the scratch target at this level, so no pass reads what it writes.
      this.blit(this.bloomCombineMaterial, blurTargets[i]);
      upper = blurTargets[i];
    }

    combine.uSource.value = source.texture;
    combine.uLightBuffer.value = upper.texture;
    this.blit(this.bloomCombineMaterial, this.targets.postPing);
    return this.targets.postPing;
  }

  /**
   * Two passes of the separable gaussian, horizontal into `scratch` and vertical
   * back into `destination`.
   */
  private applyGaussianBlur(
    source: WebGLRenderTarget,
    scratch: WebGLRenderTarget,
    destination: WebGLRenderTarget,
  ): void {
    const uniforms = this.gaussianBlurMaterial.uniforms;
    const weights = uniforms.uWeightAndOffset.value as Vector2[];
    const stepCount = 5;
    // Offsets in texels and their normalised gaussian weights.
    const offsets = [0, 1, 2, 3, 4];
    const raw = [0.2270270, 0.1945946, 0.1216216, 0.0540541, 0.0162162];
    for (let i = 0; i < stepCount; i += 1) weights[i].set(offsets[i], raw[i]);
    uniforms.uStepCount.value = stepCount;
    uniforms.uUvOffset.value = 0;

    (uniforms.uPixelSize.value as Vector2).set(1 / source.width, 1 / source.height);
    uniforms.uSource.value = source.texture;
    (uniforms.uDirection.value as Vector2).set(1, 0);
    this.blit(this.gaussianBlurMaterial, scratch);

    (uniforms.uPixelSize.value as Vector2).set(1 / scratch.width, 1 / scratch.height);
    uniforms.uSource.value = scratch.texture;
    (uniforms.uDirection.value as Vector2).set(0, 1);
    this.blit(this.gaussianBlurMaterial, destination);
  }

  private renderDepthOfField(
    source: WebGLRenderTarget,
    camera: PerspectiveCamera,
  ): WebGLRenderTarget {
    const dof = this.settings.dof;
    const chain = this.targets.bloomChain;
    const blurTargets = this.targets.bloomBlur;
    if (chain.length < 2) return source;

    // The soft and hard blurs are two levels of the same halving chain.
    this.bloomDownsampleMaterial.uniforms.uSource.value = source.texture;
    this.bloomDownsampleMaterial.uniforms.uBlendValue.value = 1;
    this.blit(this.bloomDownsampleMaterial, chain[0]);
    this.applyGaussianBlur(chain[0], blurTargets[0], chain[0]);

    this.bloomDownsampleMaterial.uniforms.uSource.value = chain[0].texture;
    this.blit(this.bloomDownsampleMaterial, chain[1]);
    this.applyGaussianBlur(chain[1], blurTargets[1], chain[1]);

    const uniforms = this.dofMaterial.uniforms;
    uniforms.uSource.value = source.texture;
    uniforms.uSoftBlurred.value = chain[0].texture;
    uniforms.uHardBlurred.value = chain[1].texture;
    uniforms.uDepthTexture.value = this.targets.gBuffer.depthTexture;
    uniforms.uSubjectDistance.value = dof.subjectDistance;
    uniforms.uCircleOfConfusion.value = dof.circleOfConfusion;
    uniforms.uBokehBias.value = dof.bokehBias;

    const destination =
      source === this.targets.postPing ? this.targets.postPong : this.targets.postPing;
    this.blit(this.dofMaterial, destination);
    return destination;
  }

  // --- helpers --------------------------------------------------------------

  /**
   * A screen-space pass.
   *
   * Every one of them gets the shared camera block whether or not its shader reads
   * it, so `syncCameraUniforms` has a single uniform naming to write and an unused
   * declaration simply gets optimised away.
   */
  private createFullscreenMaterial(
    fragmentShader: string,
    uniforms: Record<string, { value: unknown }>,
  ): ShaderMaterial {
    const material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: EXVS_FULLSCREEN_VERTEX_GLSL,
      fragmentShader,
      uniforms: {
        ...uniforms,
        uExvsProjectionMatrix: { value: new Matrix4() },
        uExvsProjectionInverse: { value: new Matrix4() },
        uExvsLogDepthBufFC: { value: 0 },
      },
    });
    material.depthTest = false;
    material.depthWrite = false;
    material.blending = NoBlending;
    this.cameraDependentMaterials.push(material);
    return material;
  }

  /**
   * Pushes the camera and the depth encoding onto every screen-space pass.
   *
   * `logDepthBufFC` is zero unless the canvas asked for a logarithmic depth
   * buffer, which this project's viewports do because their far plane is five
   * million units out. The depth helpers branch on it.
   */
  private syncCameraUniforms(camera: PerspectiveCamera): void {
    const logarithmic = this.renderer.capabilities.logarithmicDepthBuffer === true;
    const logDepthBufFC = logarithmic ? 2.0 / (Math.log(camera.far + 1.0) / Math.LN2) : 0;
    for (const material of this.cameraDependentMaterials) {
      const uniforms = material.uniforms;
      (uniforms.uExvsProjectionMatrix.value as Matrix4).copy(camera.projectionMatrix);
      (uniforms.uExvsProjectionInverse.value as Matrix4).copy(camera.projectionMatrixInverse);
      uniforms.uExvsLogDepthBufFC.value = logDepthBufFC;
    }
  }

  private blit(
    material: ShaderMaterial,
    target: WebGLRenderTarget | null,
    resetViewport = true,
  ): void {
    const renderer = this.renderer;
    renderer.setRenderTarget(target);
    if (resetViewport) {
      if (target === null) {
        const size = renderer.getDrawingBufferSize(this.scratchVector2);
        renderer.setViewport(0, 0, size.x, size.y);
      } else {
        renderer.setViewport(0, 0, target.width, target.height);
      }
    }
    this.fullscreenQuad.material = material;
    renderer.render(this.fullscreenScene, this.fullscreenCamera);
  }

  /**
   * A blit into exactly one attachment of a multi-target framebuffer.
   *
   * The shadow resolve and the ambient occlusion blur each blend into a single
   * G-buffer attachment and must leave the other three untouched, so every other
   * draw buffer is masked off for the duration of the draw.
   */
  private blitFullResolution(
    material: ShaderMaterial,
    target: WebGLRenderTarget,
    attachmentIndex: number,
  ): void {
    const renderer = this.renderer;
    const gl = renderer.getContext() as WebGL2RenderingContext;

    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, target.width, target.height);

    const drawBuffers: number[] = [];
    for (let i = 0; i < target.textures.length; i += 1) {
      drawBuffers.push(i === attachmentIndex ? gl.COLOR_ATTACHMENT0 + i : gl.NONE);
    }
    gl.drawBuffers(drawBuffers);

    this.fullscreenQuad.material = material;
    renderer.render(this.fullscreenScene, this.fullscreenCamera);

    const restored: number[] = [];
    for (let i = 0; i < target.textures.length; i += 1) restored.push(gl.COLOR_ATTACHMENT0 + i);
    gl.drawBuffers(restored);
  }
}

function imageEdge(image: unknown): { width: number; height: number } {
  if (Array.isArray(image)) return imageEdge(image[0]);
  if (image !== null && typeof image === "object") {
    const record = image as { width?: number; height?: number; image?: unknown };
    if (record.image !== undefined && record.image !== image) {
      const nested = imageEdge(record.image);
      if (nested.width > 1 || nested.height > 1) return nested;
    }
    if (typeof record.width === "number" && typeof record.height === "number") {
      return { width: record.width, height: record.height };
    }
  }
  return { width: 1, height: 1 };
}

function mipCountOf(texture: Texture): number {
  const mipmaps = (texture as unknown as { mipmaps?: unknown[] }).mipmaps;
  if (Array.isArray(mipmaps) && mipmaps.length > 0) return mipmaps.length;
  const { width, height } = imageEdge(texture.image);
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}
