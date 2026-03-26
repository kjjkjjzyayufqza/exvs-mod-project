import { Vector3 } from "three";

/**
 * GLSL uniforms for EXVS-style cel shading patched into MeshStandardMaterial (meshphysical fragment).
 * Key light direction is in world space, pointing from the surface toward the light (parallel to directional rays).
 */
export type AnimeExvsUniforms = {
  uAnimeKeyDir: { value: Vector3 };
};

export function createAnimeExvsUniforms(): AnimeExvsUniforms {
  return {
    uAnimeKeyDir: { value: new Vector3(0, 1, 0) },
  };
}

/**
 * Injects cel bands, cool shadow tint, rim, and specular boost after PBR lighting accumulation.
 */
export function animeExvsOnBeforeCompile(uniforms: AnimeExvsUniforms) {
  return (shader: { fragmentShader: string; uniforms: Record<string, { value: unknown }> }) => {
    const frag0 = shader.fragmentShader;
    const frag1 = frag0.replace(
      "#include <common>",
      `#include <common>
uniform vec3 uAnimeKeyDir;
uniform float uAnimeCelBands;
uniform float uAnimeRimStrength;
uniform float uAnimeRimPower;
uniform float uAnimeSpecularBoost;
`,
    );
    if (frag1 === frag0) {
      throw new Error("animeExvsMeshStandard: failed to inject uniforms after #include <common>");
    }
    shader.fragmentShader = frag1;

    const frag2 = shader.fragmentShader.replace(
      /vec3 outgoingLight = totalDiffuse \+ totalSpecular \+ totalEmissiveRadiance;/,
      `vec3 outgoingLight;
{
	vec3 n = normalize( geometryNormal );
	vec3 v = normalize( geometryViewDir );
	vec3 L = normalize( uAnimeKeyDir );
	float ndl = max( dot( n, L ), 0.0 );
	float cel = clamp( floor( ndl * uAnimeCelBands ) / max( uAnimeCelBands - 1.0, 1.0 ), 0.0, 1.0 );
	vec3 coolShade = vec3( 0.36, 0.44, 0.58 );
	vec3 warmLight = vec3( 1.0 );
	vec3 tone = mix( coolShade, warmLight, cel );
	float ndv = max( dot( n, v ), 0.0 );
	float rim = pow( max( 0.0, 1.0 - ndv ), uAnimeRimPower );
	vec3 rimCol = vec3( 0.18, 0.32, 0.48 );
	vec3 specBoost = totalSpecular * uAnimeSpecularBoost;
	outgoingLight = totalDiffuse * tone + specBoost + totalEmissiveRadiance + rimCol * rim * uAnimeRimStrength * diffuseColor.rgb;
}`,
    );
    if (frag2 === shader.fragmentShader) {
      throw new Error(
        "animeExvsMeshStandard: failed to patch outgoingLight (Three.js shader layout may have changed)",
      );
    }
    shader.fragmentShader = frag2;

    shader.uniforms.uAnimeKeyDir = uniforms.uAnimeKeyDir;
    shader.uniforms.uAnimeCelBands = { value: 3.0 };
    shader.uniforms.uAnimeRimStrength = { value: 0.5 };
    shader.uniforms.uAnimeRimPower = { value: 3.15 };
    shader.uniforms.uAnimeSpecularBoost = { value: 1.52 };
  };
}
