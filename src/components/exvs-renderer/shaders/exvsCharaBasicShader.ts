/**
 * The additive character rim light and environment reflection.
 *
 * Ported from `ps-0CB737AB94786C65`, the pass that reads `vsngCharaBasic`. It is
 * drawn as geometry again after the deferred resolve, but it takes its normal
 * from the G-buffer rather than from its own interpolation, so the rim follows
 * the normal-mapped surface and not the faceted mesh.
 *
 * One transcription note worth keeping. The half vector is built as
 * `normalize(V - directionWS)`, which reads as a sign error against the tiled
 * lighting dispatch, where the same field is used directly as the direction
 * toward the light. Both are reproduced as written rather than reconciled: the
 * dumps do not say which way the engine fills the buffer for this pass, and
 * "correcting" one of them would change the look of the thing being reproduced.
 * `docs/exvs2-deferred-renderer.md` records this as open.
 */

import { EXVS_CUBEMAP_GLSL, EXVS_GBUFFER_CODEC_GLSL, exvsGlsl } from "./exvsShaderCommon";

export const EXVS_CHARA_BASIC_VERTEX_GLSL = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
// Drawn against the depth the composite wrote through, so it encodes depth the
// same way the G-buffer did.
#include <logdepthbuf_pars_vertex>

out vec2 vUv0;
out vec3 vWorldPosition;

void main() {
	#include <skinbase_vertex>

	vec3 transformed = position;
	#include <skinning_vertex>

	vec4 localPosition = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
		localPosition = instanceMatrix * localPosition;
	#endif

	vec4 worldPosition = modelMatrix * localPosition;
	vWorldPosition = worldPosition.xyz;
	vUv0 = uv;

	gl_Position = projectionMatrix * viewMatrix * worldPosition;

	#include <logdepthbuf_vertex>
}
`;

export const EXVS_CHARA_BASIC_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  EXVS_CUBEMAP_GLSL,
  /* glsl */ `
#include <logdepthbuf_pars_fragment>

in vec2 vUv0;
in vec3 vWorldPosition;

layout(location = 0) out vec4 outColor;

uniform sampler2D uBaseColorMap;
uniform sampler2D uRoughnesAndMaskMap;
uniform sampler2D uGBufferNormal;
uniform samplerCube uBariSpecularMap;

uniform mat3 uLayer0UVTransform;
uniform bool uHasBaseColorMap;
uniform bool uHasRoughnesAndMaskMap;
uniform bool uEnableAlphaTest;
uniform float uAlphaTestThreshold;
uniform float uRoughness;
uniform float uSpecularMipCount;

// vsngCharaBasic
uniform float uFresnelBias;
uniform float uFresnelPower;
uniform float uReflectionScale;
uniform vec4 uRimlightColor;
uniform float uRimlightPower;
uniform float uFresnelRatio;

// DirectionalLights[0].directionWS
uniform vec3 uKeyLightDirection;

uniform mat3 uViewInverseRotation;

void main() {
	vec2 uv = ( uLayer0UVTransform * vec3( vUv0, 1.0 ) ).xy;

	if ( uEnableAlphaTest && uHasBaseColorMap ) {
		if ( texture( uBaseColorMap, uv ).a < uAlphaTestThreshold ) discard;
	}

	#include <logdepthbuf_fragment>

	ivec2 pixel = ivec2( gl_FragCoord.xy );
	vec3 n = exvsDecodeNormal( texelFetch( uGBufferNormal, pixel, 0 ).xy );
	vec3 nWorld = normalize( uViewInverseRotation * n );

	float roughness = uRoughness;
	float mask = 1.0;
	if ( uHasRoughnesAndMaskMap ) {
		vec4 roughnessAndMask = texture( uRoughnesAndMaskMap, vUv0 );
		roughness = roughnessAndMask.x;
		mask = roughnessAndMask.w;
	}

	vec3 v = normalize( cameraPosition - vWorldPosition );
	vec3 reflectionWorld = reflect( -v, nWorld );

	vec3 h = normalize( v - uKeyLightDirection );
	float fresnelBase = 1.0 - clamp( dot( h, nWorld ), 0.0, 1.0 );
	float fresnel = uFresnelBias + ( 1.0 - uFresnelBias ) * pow( fresnelBase, uFresnelPower );

	// The mip is the raw roughness scaled by the chain length, not the curve the
	// ambient pass uses.
	float mip = roughness * uSpecularMipCount;
	vec3 reflection = textureLod( uBariSpecularMap, exvsCubeDirection( reflectionWorld ), mip ).rgb;
	reflection *= mask * fresnel * uReflectionScale;

	float rim = pow( 1.0 - clamp( dot( v, nWorld ), 0.0, 1.0 ), uRimlightPower );
	vec3 rimlight = rim * uRimlightColor.rgb * uRimlightColor.w;

	outColor = vec4( reflection * uFresnelRatio + rimlight, fresnelBase * uFresnelRatio );
}
`,
);
