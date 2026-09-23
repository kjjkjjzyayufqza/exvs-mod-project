/**
 * Scene lights, packed the way the shipped renderer's structured buffers pack them.
 *
 * The engine binds `DirectionalLights`, `PointLights` and `SphereAreaLights` as
 * structured buffers of 32, 32 and 48 bytes per element. WebGL2 has no structured
 * buffers, so each becomes a float data texture one texel row high, read back with
 * `texelFetch`. The field order is the engine's, so the lighting shader indexes
 * the same slots by the same names.
 *
 * `directionWS` points from the surface toward the light, which is how the tiled
 * lighting dispatch consumes it and how three.js's own directional light is
 * oriented once its target is taken into account.
 */

import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Vector3,
  type Object3D,
  type Scene,
} from "three";

import {
  EXVS_DIRECTIONAL_LIGHT_STRIDE,
  EXVS_MAX_DIRECTIONAL_LIGHTS,
  EXVS_MAX_POINT_LIGHTS,
  EXVS_MAX_SPHERE_AREA_LIGHTS,
  EXVS_POINT_LIGHT_STRIDE,
  EXVS_SPHERE_AREA_LIGHT_STRIDE,
} from "./shaders/exvsDeferredLightingShader";

/** A sphere area light, which three.js has no class for, is declared on an object. */
export type ExvsSphereAreaLightParams = {
  sourceRadius: number;
};

export type ExvsLightCounts = {
  directional: number;
  point: number;
  sphereArea: number;
};

type LightLike = Object3D & {
  isDirectionalLight?: boolean;
  isPointLight?: boolean;
  isAmbientLight?: boolean;
  isHemisphereLight?: boolean;
  color?: { r: number; g: number; b: number };
  groundColor?: { r: number; g: number; b: number };
  intensity?: number;
  distance?: number;
  target?: Object3D;
  visible: boolean;
};

/**
 * The ambient sources the engine has no constant buffer for.
 *
 * Its own ambient is the pair of cube maps a stage authors. The editors light
 * with an `AmbientLight` and a `HemisphereLight`, which are the controls their
 * viewports already expose, so the ambient pass takes them as extra irradiance.
 */
export type ExvsAmbientLighting = {
  ambientColor: Vector3;
  hemisphereSkyColor: Vector3;
  hemisphereGroundColor: Vector3;
  hemisphereUp: Vector3;
};

function createLightTexture(capacity: number, stride: number): DataTexture {
  const width = Math.max(1, capacity * stride);
  const texture = new DataTexture(
    new Float32Array(width * 4),
    width,
    1,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Reads a sphere area light's extra field off the object.
 *
 * A missing declaration means the light is an ordinary point light, not a
 * malformed sphere light, so this returns null rather than throwing. A present
 * but malformed one throws, because that is an authoring mistake.
 */
export function readSphereAreaLightParams(object: Object3D): ExvsSphereAreaLightParams | null {
  const raw = (object.userData as { exvsSphereAreaLight?: unknown }).exvsSphereAreaLight;
  if (raw === undefined) return null;
  if (raw === null || typeof raw !== "object") {
    throw new Error("readSphereAreaLightParams: userData.exvsSphereAreaLight must be an object");
  }
  const sourceRadius = (raw as { sourceRadius?: unknown }).sourceRadius;
  if (typeof sourceRadius !== "number" || !Number.isFinite(sourceRadius) || sourceRadius < 0) {
    throw new Error(
      "readSphereAreaLightParams: sourceRadius must be a finite number of at least zero",
    );
  }
  return { sourceRadius };
}

/**
 * Owns the three light data textures and refills them from the scene each frame.
 *
 * Refilling is a few dozen float writes plus one texture upload per light type,
 * and only when the packed contents actually changed.
 */
export class ExvsLightBuffers {
  readonly directionalTexture: DataTexture;
  readonly pointTexture: DataTexture;
  readonly sphereAreaTexture: DataTexture;

  private counts: ExvsLightCounts = { directional: 0, point: 0, sphereArea: 0 };
  private readonly keyLightDirection = new Vector3(0, 1, 0);
  private readonly ambient: ExvsAmbientLighting = {
    ambientColor: new Vector3(),
    hemisphereSkyColor: new Vector3(),
    hemisphereGroundColor: new Vector3(),
    hemisphereUp: new Vector3(0, 1, 0),
  };
  private readonly scratchPosition = new Vector3();
  private readonly scratchTarget = new Vector3();

  constructor() {
    this.directionalTexture = createLightTexture(
      EXVS_MAX_DIRECTIONAL_LIGHTS,
      EXVS_DIRECTIONAL_LIGHT_STRIDE,
    );
    this.pointTexture = createLightTexture(EXVS_MAX_POINT_LIGHTS, EXVS_POINT_LIGHT_STRIDE);
    this.sphereAreaTexture = createLightTexture(
      EXVS_MAX_SPHERE_AREA_LIGHTS,
      EXVS_SPHERE_AREA_LIGHT_STRIDE,
    );
  }

  getCounts(): ExvsLightCounts {
    return this.counts;
  }

  /**
   * The direction of the first directional light, which the shadow fit and the
   * character rim pass both read as the key light.
   */
  getKeyLightDirection(): Vector3 {
    return this.keyLightDirection;
  }

  getAmbientLighting(): ExvsAmbientLighting {
    return this.ambient;
  }

  update(scene: Scene): void {
    const directional = this.directionalTexture.image.data as Float32Array;
    const point = this.pointTexture.image.data as Float32Array;
    const sphereArea = this.sphereAreaTexture.image.data as Float32Array;

    directional.fill(0);
    point.fill(0);
    sphereArea.fill(0);

    let directionalCount = 0;
    let pointCount = 0;
    let sphereAreaCount = 0;
    let hasKeyLight = false;

    this.ambient.ambientColor.set(0, 0, 0);
    this.ambient.hemisphereSkyColor.set(0, 0, 0);
    this.ambient.hemisphereGroundColor.set(0, 0, 0);
    this.ambient.hemisphereUp.set(0, 1, 0);

    scene.traverseVisible((object) => {
      const light = object as LightLike;

      if (light.isAmbientLight === true) {
        const intensity = light.intensity ?? 1;
        this.ambient.ambientColor.x += (light.color?.r ?? 1) * intensity;
        this.ambient.ambientColor.y += (light.color?.g ?? 1) * intensity;
        this.ambient.ambientColor.z += (light.color?.b ?? 1) * intensity;
        return;
      }

      if (light.isHemisphereLight === true) {
        const intensity = light.intensity ?? 1;
        this.ambient.hemisphereSkyColor.x += (light.color?.r ?? 1) * intensity;
        this.ambient.hemisphereSkyColor.y += (light.color?.g ?? 1) * intensity;
        this.ambient.hemisphereSkyColor.z += (light.color?.b ?? 1) * intensity;
        this.ambient.hemisphereGroundColor.x += (light.groundColor?.r ?? 0) * intensity;
        this.ambient.hemisphereGroundColor.y += (light.groundColor?.g ?? 0) * intensity;
        this.ambient.hemisphereGroundColor.z += (light.groundColor?.b ?? 0) * intensity;
        // three orients a hemisphere light by its world position, not a target.
        light.getWorldPosition(this.scratchPosition);
        if (this.scratchPosition.lengthSq() > 1e-12) {
          this.ambient.hemisphereUp.copy(this.scratchPosition).normalize();
        }
        return;
      }

      if (light.isDirectionalLight === true) {
        if (directionalCount >= EXVS_MAX_DIRECTIONAL_LIGHTS) return;

        light.getWorldPosition(this.scratchPosition);
        if (light.target) light.target.getWorldPosition(this.scratchTarget);
        else this.scratchTarget.set(0, 0, 0);

        const direction = this.scratchPosition.sub(this.scratchTarget);
        if (direction.lengthSq() < 1e-12) return;
        direction.normalize();

        const base = directionalCount * EXVS_DIRECTIONAL_LIGHT_STRIDE * 4;
        directional[base + 0] = light.color?.r ?? 1;
        directional[base + 1] = light.color?.g ?? 1;
        directional[base + 2] = light.color?.b ?? 1;
        directional[base + 3] = light.intensity ?? 1;
        directional[base + 4] = direction.x;
        directional[base + 5] = direction.y;
        directional[base + 6] = direction.z;
        directional[base + 7] = 0;

        if (!hasKeyLight) {
          this.keyLightDirection.copy(direction);
          hasKeyLight = true;
        }
        directionalCount += 1;
        return;
      }

      if (light.isPointLight === true) {
        const sphereParams = readSphereAreaLightParams(light);
        light.getWorldPosition(this.scratchPosition);
        // A point light with no explicit range lights the whole scene; the
        // shipped falloff needs a finite radius, so zero means "no limit" and is
        // expressed as a very large one.
        const radius = light.distance !== undefined && light.distance > 0 ? light.distance : 1e6;

        if (sphereParams !== null) {
          if (sphereAreaCount >= EXVS_MAX_SPHERE_AREA_LIGHTS) return;
          const base = sphereAreaCount * EXVS_SPHERE_AREA_LIGHT_STRIDE * 4;
          sphereArea[base + 0] = light.color?.r ?? 1;
          sphereArea[base + 1] = light.color?.g ?? 1;
          sphereArea[base + 2] = light.color?.b ?? 1;
          sphereArea[base + 3] = light.intensity ?? 1;
          sphereArea[base + 4] = this.scratchPosition.x;
          sphereArea[base + 5] = this.scratchPosition.y;
          sphereArea[base + 6] = this.scratchPosition.z;
          sphereArea[base + 7] = radius;
          sphereArea[base + 8] = sphereParams.sourceRadius;
          sphereAreaCount += 1;
          return;
        }

        if (pointCount >= EXVS_MAX_POINT_LIGHTS) return;
        const base = pointCount * EXVS_POINT_LIGHT_STRIDE * 4;
        point[base + 0] = light.color?.r ?? 1;
        point[base + 1] = light.color?.g ?? 1;
        point[base + 2] = light.color?.b ?? 1;
        point[base + 3] = light.intensity ?? 1;
        point[base + 4] = this.scratchPosition.x;
        point[base + 5] = this.scratchPosition.y;
        point[base + 6] = this.scratchPosition.z;
        point[base + 7] = radius;
        pointCount += 1;
      }
    });

    if (!hasKeyLight) this.keyLightDirection.set(0, 1, 0);

    this.directionalTexture.needsUpdate = true;
    this.pointTexture.needsUpdate = true;
    this.sphereAreaTexture.needsUpdate = true;

    this.counts = {
      directional: directionalCount,
      point: pointCount,
      sphereArea: sphereAreaCount,
    };
  }

  dispose(): void {
    this.directionalTexture.dispose();
    this.pointTexture.dispose();
    this.sphereAreaTexture.dispose();
  }
}
