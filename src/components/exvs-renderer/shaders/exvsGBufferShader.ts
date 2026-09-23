/**
 * The G-buffer writers.
 *
 * Ported from the shipped OB pixel shaders `ps-A46F9C9D4B98F6ED` (character,
 * reads `vsngCharaGBufferControl`), `ps-302B77184673BB7D` (background with a
 * baked light map) and `ps-2B5EEB07C38FE518` (background without one). The three
 * differ only in how they fill targets 1 and 3, so they are one source here with
 * the character path behind `EXVS_CHARA` and the light map path behind
 * `EXVS_LIGHT_MAP`.
 *
 * Layout, which every later pass depends on:
 *
 *   target 0  .xy  view-space normal, equal-area encoded
 *             .z   emissive intensity
 *             .w   0
 *   target 1  .rgb albedo
 *             .a   lighting mask; the shadow resolve overwrites it
 *   target 2  .x   roughness
 *             .y   metallic
 *             .z   flag byte / 255
 *             .w   diffuse-only ambient occlusion offset
 *   target 3  .rgb emissive, or the baked light map
 *             .a   ambient occlusion; the SSAO blur overwrites it
 */

import { EXVS_GBUFFER_CODEC_GLSL } from "./exvsShaderCommon";

/**
 * The cutoff the shipped shaders hard-code, used when a mesh declares
 * `EnableAlphaTest`.
 *
 * It is unusually high: a texel has to be almost fully opaque to survive. The
 * numatb flag that turns it on is not carried on a resolved binding, and applying
 * a 0.95 cutoff to a material that never asked for one erases it, so this is
 * reached only through an explicit `userData.exvs.enableAlphaTest`. Everything
 * else cuts at whatever its own material's `alphaTest` says, which is the same
 * hole the other render styles punch in the same texture.
 */
export const EXVS_ALPHA_TEST_THRESHOLD = 0.95;

export const EXVS_GBUFFER_VERTEX_GLSL = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
// This canvas runs a logarithmic depth buffer, and the forward materials drawn
// after the composite write one. The G-buffer has to agree with them, and the
// depth reconstruction in every screen-space pass has to invert the same curve.
#include <logdepthbuf_pars_vertex>

// The stock meshes carry their light map / ambient occlusion set as "uv2".
// three.js only declares that attribute for its own materials when a texture
// claims channel 2, so it is declared here instead.
#ifdef EXVS_HAS_UV1
	in vec2 uv2;
#endif

out vec3 vViewNormal;
out vec3 vViewPosition;
out vec2 vUv0;
out vec2 vUv1;

void main() {
	#include <skinbase_vertex>

	vec3 objectNormal = normal;
	#include <skinnormal_vertex>

	vec3 transformed = position;
	#include <skinning_vertex>

	// Instanced stage geometry carries its transform per instance. Without this the
	// whole batch collapses onto the first instance's position.
	vec4 mvPosition = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		mvPosition = instanceMatrix * mvPosition;
		mat3 instanceNormalMatrix = mat3( instanceMatrix );
		objectNormal /= vec3(
			dot( instanceNormalMatrix[ 0 ], instanceNormalMatrix[ 0 ] ),
			dot( instanceNormalMatrix[ 1 ], instanceNormalMatrix[ 1 ] ),
			dot( instanceNormalMatrix[ 2 ], instanceNormalMatrix[ 2 ] )
		);
		objectNormal = instanceNormalMatrix * objectNormal;
	#endif
	mvPosition = modelViewMatrix * mvPosition;

	vViewNormal = normalize( normalMatrix * objectNormal );
	vViewPosition = mvPosition.xyz;
	vUv0 = uv;
	#ifdef EXVS_HAS_UV1
		vUv1 = uv2;
	#else
		vUv1 = uv;
	#endif

	gl_Position = projectionMatrix * mvPosition;

	#include <logdepthbuf_vertex>
}
`;

export const EXVS_GBUFFER_FRAGMENT_GLSL = /* glsl */ `
${EXVS_GBUFFER_CODEC_GLSL}

#include <logdepthbuf_pars_fragment>

in vec3 vViewNormal;
in vec3 vViewPosition;
in vec2 vUv0;
in vec2 vUv1;

layout(location = 0) out vec4 gBuffer0;
layout(location = 1) out vec4 gBuffer1;
layout(location = 2) out vec4 gBuffer2;
layout(location = 3) out vec4 gBuffer3;

// nuUVTransformCBuffer.Layer0UVTransform, as a 3x3 so three's Matrix3 can drive it.
uniform mat3 uLayer0UVTransform;

uniform sampler2D uBaseColorMap;
uniform sampler2D uNormalMap;
uniform sampler2D uMetallicMap;
uniform sampler2D uRoughnessMap;
uniform sampler2D uAmbientOcclusionMap;
uniform sampler2D uEmissiveMap;
uniform sampler2D uLightMap;

uniform bool uHasBaseColorMap;
uniform bool uUseNormalMap;
uniform bool uUseBC5NormalMap;
uniform bool uUseMetallicMap;
uniform bool uUseRoughnessMap;
uniform bool uUseAO;
uniform bool uUseEmissiveMap;
uniform bool uEnableAlphaTest;
uniform float uAlphaTestThreshold;

// UpdatePerObject
uniform vec3 uF0;
uniform float uRoughness;
uniform float uEmissiveScale;
uniform float uDiffuseLightingAOOffset;
uniform vec3 uBaseColorFactor;
// The engine has no such scalar, but the editor's materials carry one and the
// other render styles honour it, so the same map reads the same way in all of them.
uniform float uAoMapIntensity;

// The flag byte's material class and shadow bits, already packed on the CPU.
uniform float uFlagByte;

#ifdef EXVS_CHARA
	// vsngCharaGBufferControl
	uniform vec4 uGBufferDiffuseMultiply;
	uniform vec4 uGBufferEmissiveColorMultiply;
	uniform float uGBufferRoughnessMultiply;
	uniform vec4 uGBufferDamage;
#endif

// Derivative tangent frame. The stock meshes carry no tangent attribute, so the
// frame the shipped vertex shader passes down is rebuilt here instead; the
// resulting basis is the same one three.js uses for the identical situation.
mat3 exvsTangentFrame( vec3 n, vec3 viewPosition, vec2 uv ) {
	vec3 dp1 = dFdx( viewPosition );
	vec3 dp2 = dFdy( viewPosition );
	vec2 duv1 = dFdx( uv );
	vec2 duv2 = dFdy( uv );

	vec3 dp2perp = cross( dp2, n );
	vec3 dp1perp = cross( n, dp1 );
	vec3 t = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 b = dp2perp * duv1.y + dp1perp * duv2.y;

	float det = max( dot( t, t ), dot( b, b ) );
	float scale = det == 0.0 ? 0.0 : inversesqrt( det );
	return mat3( t * scale, b * scale, n );
}

void main() {
	vec2 uv = ( uLayer0UVTransform * vec3( vUv0, 1.0 ) ).xy;

	vec4 baseColor = vec4( uBaseColorFactor, 1.0 );
	if ( uHasBaseColorMap ) {
		baseColor = texture( uBaseColorMap, uv ) * vec4( uBaseColorFactor, 1.0 );
	}

	if ( uEnableAlphaTest && baseColor.a < uAlphaTestThreshold ) {
		discard;
	}

	#include <logdepthbuf_fragment>

	// --- normal -------------------------------------------------------------
	vec3 n = normalize( vViewNormal );
	if ( uUseNormalMap ) {
		vec3 tangentNormal;
		if ( uUseBC5NormalMap ) {
			vec2 xy = texture( uNormalMap, uv ).xy * 2.0 - 1.0;
			float z = sqrt( 1.0 - min( dot( xy, xy ), 1.0 ) );
			tangentNormal = vec3( xy, z );
		} else {
			tangentNormal = texture( uNormalMap, uv ).xyz * 2.0 - 1.0;
		}
		n = normalize( exvsTangentFrame( n, vViewPosition, uv ) * tangentNormal );
	}

	// --- albedo and the lighting mask ---------------------------------------
	float flags = uFlagByte;
	float emissiveIntensity;
	vec3 emissive;
	float lightingMask = 1.0;

	#ifdef EXVS_CHARA

		gBuffer1.rgb = mix( baseColor.rgb, uGBufferDiffuseMultiply.rgb, uGBufferDiffuseMultiply.w );

		if ( uUseEmissiveMap ) {
			// The shipped shader lifts the sampled emissive by 1/2.2 before use.
			vec3 lit = pow( max( texture( uEmissiveMap, uv ).rgb, vec3( 0.0 ) ), vec3( 0.454545 ) )
				* uGBufferEmissiveColorMultiply.rgb;
			vec3 damaged = mix( lit, uGBufferDamage.rgb, uGBufferDamage.w );
			emissive = uEmissiveScale > 0.0 ? damaged : uGBufferDamage.rgb * uGBufferDamage.w;
		} else {
			emissive = uGBufferDamage.rgb * uGBufferDamage.w;
		}

		emissiveIntensity = clamp( uGBufferDamage.w * 4.0, 0.0, 1.0 ) * ( 1.0 - uEmissiveScale ) + uEmissiveScale;

	#else

		gBuffer1.rgb = baseColor.rgb;

		#ifdef EXVS_LIGHT_MAP
			vec4 lightMapTexel = texture( uLightMap, vUv1 );
			emissive = lightMapTexel.rgb;
			emissiveIntensity = 0.0;
			// A baked light map carries its own shadow term in alpha.
			lightingMask = lightMapTexel.a;
		#else
			if ( uUseEmissiveMap ) {
				emissive = pow( max( texture( uEmissiveMap, uv ).rgb, vec3( 0.0 ) ), vec3( 0.454545 ) );
				emissiveIntensity = uEmissiveScale;
			} else {
				emissive = vec3( 0.0 );
				emissiveIntensity = 0.0;
			}
		#endif

	#endif

	gBuffer1.a = lightingMask;

	// --- material channels ---------------------------------------------------
	float roughness = uUseRoughnessMap ? texture( uRoughnessMap, uv ).x : uRoughness;
	roughness = max( roughness, 0.01 );
	#ifdef EXVS_CHARA
		roughness *= uGBufferRoughnessMultiply;
	#endif

	float metallic = uUseMetallicMap ? texture( uMetallicMap, uv ).x : uF0.x;

	#if defined( EXVS_LIGHT_MAP )
		float aoSample = uUseAO ? texture( uAmbientOcclusionMap, vUv1 ).x : 1.0;
	#else
		float aoSample = uUseAO ? texture( uAmbientOcclusionMap, uv ).x : 1.0;
	#endif
	float ao = ( aoSample - 1.0 ) * uAoMapIntensity + 1.0;

	gBuffer0 = vec4( exvsEncodeNormal( n ), emissiveIntensity, 0.0 );
	gBuffer2 = vec4( roughness, metallic, flags / 255.0, clamp( uDiffuseLightingAOOffset, 0.0, 1.0 ) );
	gBuffer3 = vec4( emissive, ao );
}
`;

/** Depth-only draw, used by the pre-pass and by every shadow partition. */
export const EXVS_DEPTH_ONLY_VERTEX_GLSL = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

out vec2 vUv0;

void main() {
	#include <skinbase_vertex>

	vec3 transformed = position;
	#include <skinning_vertex>

	vec4 mvPosition = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		mvPosition = instanceMatrix * mvPosition;
	#endif

	vUv0 = uv;
	gl_Position = projectionMatrix * modelViewMatrix * mvPosition;
}
`;

export const EXVS_DEPTH_ONLY_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv0;

layout(location = 0) out vec4 outColor;

uniform sampler2D uBaseColorMap;
uniform mat3 uLayer0UVTransform;
uniform bool uHasBaseColorMap;
uniform bool uEnableAlphaTest;
uniform float uAlphaTestThreshold;

void main() {
	if ( uEnableAlphaTest && uHasBaseColorMap ) {
		vec2 uv = ( uLayer0UVTransform * vec3( vUv0, 1.0 ) ).xy;
		if ( texture( uBaseColorMap, uv ).a < uAlphaTestThreshold ) {
			discard;
		}
	}
	outColor = vec4( 1.0 );
}
`;
