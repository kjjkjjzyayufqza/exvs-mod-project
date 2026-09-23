/**
 * Image based ambient lighting.
 *
 * Ported from `ps-9CA18D4459E4DBB5`, which adds into the same two accumulation
 * buffers the analytic lighting pass writes. Two details of the original are easy
 * to mistake for bugs and are deliberate:
 *
 *   - the specular cube is sampled in IBL space (`g_IBLWorldInverseMatrix`) while
 *     the diffuse cube is sampled in plain world space;
 *   - both samples negate the z axis of the direction, which is the handedness
 *     flip between the engine's world and the cube map's own frame.
 *
 * `IrradianceNormalTexture` is a screen-space normal the engine fills for its own
 * irradiance term. Nothing in an editor scene produces one, so it is an explicit
 * switch rather than an assumed input: with it off the diffuse lookup uses the
 * G-buffer normal, which is what an identity irradiance normal would give.
 *
 * The engine's only ambient source is the pair of cube maps a stage authors. The
 * editors light with an `AmbientLight` and a `HemisphereLight` instead, and those
 * are the controls the viewport already exposes, so they feed this pass as extra
 * irradiance. They carry the `1 / PI` that three.js applies to the same two lights,
 * which keeps a scene as bright here as it is in the standard render style; a
 * prefiltered irradiance cube already integrates that factor and does not.
 */

import {
  EXVS_BRDF_GLSL,
  EXVS_CUBEMAP_GLSL,
  EXVS_GBUFFER_CODEC_GLSL,
  exvsGlsl,
} from "./exvsShaderCommon";

export const EXVS_IBL_AMBIENT_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  EXVS_BRDF_GLSL,
  EXVS_CUBEMAP_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outDiffuse;
layout(location = 1) out vec4 outSpecular;

uniform sampler2D uDepthTexture;
uniform sampler2D uGBuffer0;
uniform sampler2D uGBuffer1;
uniform sampler2D uGBuffer2;
uniform sampler2D uGBuffer3;
uniform sampler2D uIrradianceNormalTexture;
uniform samplerCube uDiffuseMapCube;
uniform samplerCube uSpecularMapCube;

uniform bool uHasIrradianceNormal;
uniform bool uHasIblCube;
uniform vec3 uAmbientColor;
uniform vec3 uHemisphereSkyColor;
uniform vec3 uHemisphereGroundColor;
uniform vec3 uHemisphereUp;
uniform float uSpecularMipCount;
uniform float uIblScaling;
uniform vec3 uAoColor;
uniform mat3 uViewInverseRotation;
uniform mat3 uIblWorldInverseRotation;

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	float deviceDepth = texelFetch( uDepthTexture, pixel, 0 ).x;
	if ( deviceDepth >= 1.0 ) discard;

	vec4 gb2 = texelFetch( uGBuffer2, pixel, 0 );
	float flags = exvsUnpackFlags( gb2.z );
	if ( exvsHasFlag( flags, 8.0 ) ) discard;

	vec4 gb0 = texelFetch( uGBuffer0, pixel, 0 );
	vec3 albedo = texelFetch( uGBuffer1, pixel, 0 ).rgb;
	float ambientOcclusion = texelFetch( uGBuffer3, pixel, 0 ).w;

	float roughness = gb2.x;
	float metallic = gb2.y;

	vec3 n = exvsDecodeNormal( gb0.xy );
	vec3 f0 = mix( vec3( 0.04 ), albedo, metallic );

	vec3 irradianceNormal = n;
	if ( uHasIrradianceNormal ) {
		// The engine packs this normal into .zw, not .xy.
		irradianceNormal = exvsDecodeNormal( texture( uIrradianceNormalTexture, vUv ).zw );
	}

	vec3 viewPosition = exvsViewPositionFromDepth( vUv, deviceDepth );
	vec3 v = normalize( -viewPosition );

	vec3 nWorld = uViewInverseRotation * n;
	vec3 vWorld = uViewInverseRotation * v;
	vec3 irradianceNormalWorld = uViewInverseRotation * irradianceNormal;

	vec3 reflectionWorld = reflect( -vWorld, nWorld );
	vec3 reflectionIbl = normalize( uIblWorldInverseRotation * reflectionWorld );

	// Ambient occlusion darkens toward aoColor rather than toward black.
	vec3 aoTint = uAoColor * ( 1.0 - ambientOcclusion ) + ambientOcclusion;

	// --- specular -----------------------------------------------------------
	vec3 specularCube = vec3( 0.0 );
	if ( uHasIblCube ) {
		float mip = exvsSpecularCubeMip( roughness, uSpecularMipCount );
		specularCube = textureLod( uSpecularMapCube, exvsCubeDirection( reflectionIbl ), mip ).rgb * uIblScaling;
	}

	float nDotV = clamp( dot( nWorld, vWorld ), 0.0, 1.0 );
	outSpecular = vec4( aoTint * exvsEnvBRDFApprox( f0, roughness, nDotV ) * specularCube, 1.0 );

	// --- diffuse ------------------------------------------------------------
	float hemisphereWeight = 0.5 * dot( irradianceNormalWorld, uHemisphereUp ) + 0.5;
	vec3 irradiance =
		( uAmbientColor + mix( uHemisphereGroundColor, uHemisphereSkyColor, hemisphereWeight ) )
		* EXVS_INV_PI;

	if ( uHasIblCube ) {
		irradiance += textureLod( uDiffuseMapCube, exvsCubeDirection( irradianceNormalWorld ), 0.0 ).rgb * uIblScaling;
	}

	float alpha = roughness * roughness;
	float blinnPower = max( 2.0 / max( alpha * alpha, 1e-8 ) - 2.0, 1.0 );
	float glossTerm = clamp( log2( blinnPower ) * 0.057762, 0.0, 1.0 );

	float nDotVIrradiance = clamp( dot( irradianceNormalWorld, vWorld ), 0.0, 1.0 );
	float fresnelWeight = pow( 1.0 - nDotVIrradiance, 5.0 );

	vec3 kS = clamp( f0 + ( vec3( 1.0 ) - f0 ) * fresnelWeight / ( 4.0 - 3.0 * glossTerm ), 0.0, 1.0 );
	vec3 kD = vec3( 1.0 ) - kS;

	outDiffuse = vec4( aoTint * irradiance * kD, 1.0 );
}
`,
);
