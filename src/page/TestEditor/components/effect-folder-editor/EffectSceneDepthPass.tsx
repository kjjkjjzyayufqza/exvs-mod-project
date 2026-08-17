import { useThree } from "@react-three/fiber";
import { useEffect, type MutableRefObject } from "react";
import {
  Color,
  FloatType,
  NearestFilter,
  type Object3D,
  RedFormat,
  type Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import {
  EFFECT_SCENE_DEPTH_LAYER,
  applyEffectSceneDepthLayer,
  resolveEffectSceneDepthTargetSize,
} from "./efxbnSoftParticle";

/**
 * Renders the host model's linear view depth into an offscreen target so soft particles have
 * something to fade against.
 *
 * The game samples the scene depth buffer at `t7` and linearizes it with `A / (z - B)`
 * (`efxDrawModelSoftPS.yyadorigi.hlsl:66`). Reproducing that here would mean decoding three's
 * depth encoding — and this canvas runs with `logarithmicDepthBuffer: true`, so the hardware
 * buffer is `log2(w + 1)` rather than the perspective `z/w` the formula assumes. Writing view
 * depth straight into a colour target sidesteps the encoding entirely and is exactly the value
 * the reconstruction was there to produce.
 *
 * Only the host model contributes. In game the buffer holds the stage and the units; in the
 * preview the host model *is* the scene, and effect blocks that write depth (1.8% of the
 * corpus) are deliberately excluded because their draw order relative to each other is not
 * knowable outside the engine.
 */

const DEPTH_CLEAR_COLOR = new Color(0, 0, 0);

function createLinearViewDepthMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    // The chunk sequence is three's own, so GPU skinning, morph targets, batching and
    // instancing all keep working under `scene.overrideMaterial` — the renderer defines
    // USE_SKINNING and friends from the object, not from the material.
    vertexShader: `
      #include <common>
      #include <batching_pars_vertex>
      #include <skinning_pars_vertex>
      #include <morphtarget_pars_vertex>
      varying float vEfxViewDepth;

      void main() {
        #include <batching_vertex>
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        // Under a perspective projection the fragment's clip w is its view depth, which is what
        // the soft term compares against. Negating view-space z gives the same quantity.
        vEfxViewDepth = -mvPosition.z;
      }
    `,
    fragmentShader: `
      varying float vEfxViewDepth;

      void main() {
        gl_FragColor = vec4( vEfxViewDepth, 0.0, 0.0, 1.0 );
      }
    `,
  });
}

function createDepthTarget(): WebGLRenderTarget {
  return new WebGLRenderTarget(1, 1, {
    format: RedFormat,
    type: FloatType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
  });
}

function assertFloatTargetSupport(gl: WebGLRenderer): void {
  if (!gl.capabilities.isWebGL2 || !gl.extensions.has("EXT_color_buffer_float")) {
    throw new Error(
      "Soft particles need a float render target (WebGL2 + EXT_color_buffer_float), " +
        "which this renderer does not provide.",
    );
  }
}

const scratchSize = new Vector2();
const scratchClearColor = new Color();

function renderEffectSceneDepth(
  gl: WebGLRenderer,
  scene: Scene,
  camera: Parameters<WebGLRenderer["render"]>[1],
  target: WebGLRenderTarget,
  material: ShaderMaterial,
): void {
  gl.getDrawingBufferSize(scratchSize);
  const [width, height] = resolveEffectSceneDepthTargetSize(scratchSize.x, scratchSize.y);
  if (target.width !== width || target.height !== height) {
    target.setSize(width, height);
  }

  const previousTarget = gl.getRenderTarget();
  const previousOverride = scene.overrideMaterial;
  const previousBackground = scene.background;
  const previousLayerMask = camera.layers.mask;
  const previousClearAlpha = gl.getClearAlpha();
  gl.getClearColor(scratchClearColor);

  try {
    // The scene background is a solid Color here, and the background pass would write it into
    // the depth target as if every pixel held that much depth.
    scene.background = null;
    scene.overrideMaterial = material;
    camera.layers.set(EFFECT_SCENE_DEPTH_LAYER);
    gl.setRenderTarget(target);
    gl.setClearColor(DEPTH_CLEAR_COLOR, 1);
    gl.clear(true, true, false);
    gl.render(scene, camera);
  } finally {
    gl.setRenderTarget(previousTarget);
    gl.setClearColor(scratchClearColor, previousClearAlpha);
    camera.layers.mask = previousLayerMask;
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;
  }
}

export type EffectSceneDepthPassProps = {
  /** Object name of the host model's instance group, or null when no host is loaded. */
  hostObjectName: string | null;
  /** Receives the depth texture, or null while no host contributes depth. */
  sceneDepthTextureRef: MutableRefObject<Texture | null>;
};

export function EffectSceneDepthPass({
  hostObjectName,
  sceneDepthTextureRef,
}: EffectSceneDepthPassProps) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if (!hostObjectName) {
      sceneDepthTextureRef.current = null;
      return;
    }
    assertFloatTargetSupport(gl);

    const target = createDepthTarget();
    const material = createLinearViewDepthMaterial();
    const previousOnBeforeRender = scene.onBeforeRender;
    let layeredHost: Object3D | null = null;
    let rendering = false;

    scene.onBeforeRender = function sceneDepthOnBeforeRender(
      this: Scene,
      renderer,
      renderScene,
      camera,
      ...rest
    ) {
      previousOnBeforeRender.call(this, renderer, renderScene, camera, ...rest);
      // The nested render below re-enters this hook, and the axes gizmo renders to its own
      // target; neither should refresh the depth.
      if (rendering || renderer.getRenderTarget() !== null) return;

      const host = renderScene.getObjectByName(hostObjectName) ?? null;
      // Draws stream in after the group mounts, so re-stamp every frame rather than once.
      applyEffectSceneDepthLayer(layeredHost, host);
      layeredHost = host;
      if (!host) {
        sceneDepthTextureRef.current = null;
        return;
      }

      rendering = true;
      try {
        renderEffectSceneDepth(renderer, renderScene, camera, target, material);
        sceneDepthTextureRef.current = target.texture;
      } finally {
        rendering = false;
      }
    };

    return () => {
      scene.onBeforeRender = previousOnBeforeRender;
      applyEffectSceneDepthLayer(layeredHost, null);
      sceneDepthTextureRef.current = null;
      target.dispose();
      material.dispose();
    };
  }, [gl, hostObjectName, scene, sceneDepthTextureRef]);

  return null;
}
