/**
 * Analytic lighting over the G-buffer.
 *
 * Ported from the tiled lighting dispatch `cs-D3FABD508AD39F40`. That shader is a
 * compute pass whose 16x16 groups each read a tile's light index list; WebGL2 has
 * no compute stage, so this runs as one fullscreen draw that walks the light
 * lists directly. The culling is what is lost, not the shading: every arithmetic
 * step, constant and accumulation order below is the dispatch's own, so a pixel
 * comes out bit-comparable for the light counts an editor scene carries.
 *
 * Two targets out, matching the dispatch's two unordered access views:
 *   location 0  DiffuseLightAccumulationBuffer
 *   location 1  SpecularLightAccumulationBuffer
 *
 * Three light shapes ship. Only the directional lights are masked by the G-buffer
 * lighting mask, because that mask is where the shadow resolve writes its result
 * and the shadow maps only ever cover the sun.
 */

import {
  EXVS_BRDF_GLSL,
  EXVS_GBUFFER_CODEC_GLSL,
  exvsGlsl,
} from "./exvsShaderCommon";

/** Light list capacities. The loops break on the live count, not on these. */
export const EXVS_MAX_DIRECTIONAL_LIGHTS = 4;
export const EXVS_MAX_POINT_LIGHTS = 32;
export const EXVS_MAX_SPHERE_AREA_LIGHTS = 8;

/** Texels per light in each data texture. */
export const EXVS_DIRECTIONAL_LIGHT_STRIDE = 2;
export const EXVS_POINT_LIGHT_STRIDE = 2;
export const EXVS_SPHERE_AREA_LIGHT_STRIDE = 3;

export const EXVS_DEFERRED_LIGHTING_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  EXVS_BRDF_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outDiffuse;
layout(location = 1) out vec4 outSpecular;

uniform sampler2D uDepthTexture;
uniform sampler2D uGBuffer0;
uniform sampler2D uGBuffer1;
uniform sampler2D uGBuffer2;
uniform sampler2D uGBuffer3;

// Two texels per light: [ color.rgb, intensity ], [ directionWS.xyz, 0 ].
uniform sampler2D uDirectionalLights;
// Two texels per light: [ color.rgb, intensity ], [ positionWS.xyz, attenuationRadius ].
uniform sampler2D uPointLights;
// Three texels: the point light pair, then [ sourceRadius, 0, 0, 0 ].
uniform sampler2D uSphereAreaLights;

uniform int uNumDirectionalLights;
uniform int uNumPointLights;
uniform int uNumSphereAreaLights;

// World to view. The rotation alone transforms light directions; the full matrix
// transforms light positions.
uniform mat4 uViewMatrix;
uniform mat3 uViewRotation;

vec4 exvsLightTexel( sampler2D lights, int index, int stride, int slot ) {
	return texelFetch( lights, ivec2( index * stride + slot, 0 ), 0 );
}

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	float deviceDepth = texelFetch( uDepthTexture, pixel, 0 ).x;
	if ( deviceDepth >= 1.0 ) discard;

	vec4 gb2 = texelFetch( uGBuffer2, pixel, 0 );
	float flags = exvsUnpackFlags( gb2.z );
	if ( exvsHasFlag( flags, 8.0 ) ) discard;

	vec4 gb0 = texelFetch( uGBuffer0, pixel, 0 );
	vec4 gb1 = texelFetch( uGBuffer1, pixel, 0 );
	float ambientOcclusion = texelFetch( uGBuffer3, pixel, 0 ).w;

	vec3 n = exvsDecodeNormal( gb0.xy );
	vec3 albedo = gb1.rgb;
	float lightingMask = gb1.a;
	float roughness = gb2.x;
	float metallic = gb2.y;
	float diffuseAo = clamp( gb2.w + ambientOcclusion, 0.0, 1.0 );

	vec3 f0 = mix( vec3( 0.04 ), albedo, metallic );
	vec3 oneMinusF0 = vec3( 1.0 ) - f0;

	vec3 viewPosition = exvsViewPositionFromDepth( vUv, deviceDepth );
	vec3 v = normalize( -viewPosition );

	float alpha = roughness * roughness;
	float alpha2 = alpha * alpha;
	float nDotV = clamp( dot( n, v ), 0.0, 1.0 );
	float g1View = exvsSmithG1Term( nDotV, alpha );

	vec3 diffuseAccum = vec3( 0.0 );
	vec3 specularAccum = vec3( 0.0 );

	// --- directional -------------------------------------------------------
	// Gated on the lighting mask as a whole, exactly as the dispatch is: a fully
	// shadowed pixel skips the sun entirely and the composite substitutes
	// vsngShadowParameter.shadowColor for it.
	if ( lightingMask != 0.0 ) {
		for ( int i = 0; i < ${EXVS_MAX_DIRECTIONAL_LIGHTS}; i ++ ) {
			if ( i >= uNumDirectionalLights ) break;

			vec4 colorIntensity = exvsLightTexel( uDirectionalLights, i, ${EXVS_DIRECTIONAL_LIGHT_STRIDE}, 0 );
			vec3 directionWS = exvsLightTexel( uDirectionalLights, i, ${EXVS_DIRECTIONAL_LIGHT_STRIDE}, 1 ).xyz;

			vec3 l = normalize( uViewRotation * directionWS );
			float nDotL = clamp( dot( n, l ), 0.0, 1.0 );

			vec3 h = normalize( l + v );
			float nDotH = clamp( dot( n, h ), 0.0, 1.0 );
			float vDotH = clamp( dot( v, h ), 0.0, 1.0 );

			vec3 fresnel = f0 + oneMinusF0 * exp2( ( -5.55473 * vDotH - 6.98316 ) * vDotH );
			vec3 lightColor = colorIntensity.rgb * colorIntensity.w;

			vec3 diffuse = lightColor * ( vec3( 1.0 ) - fresnel ) * ( nDotL * EXVS_INV_PI );
			diffuseAccum += diffuse * lightingMask * diffuseAo;

			float d = exvsDistributionGGX( nDotH, alpha2 );
			float vis = exvsVisibilitySmith( g1View, nDotL, alpha );
			vec3 specular = lightColor * fresnel * d * vis * nDotL;
			specularAccum += specular * lightingMask * ambientOcclusion;
		}
	}

	// --- point --------------------------------------------------------------
	for ( int i = 0; i < ${EXVS_MAX_POINT_LIGHTS}; i ++ ) {
		if ( i >= uNumPointLights ) break;

		vec4 colorIntensity = exvsLightTexel( uPointLights, i, ${EXVS_POINT_LIGHT_STRIDE}, 0 );
		vec4 positionRadius = exvsLightTexel( uPointLights, i, ${EXVS_POINT_LIGHT_STRIDE}, 1 );

		vec3 lightViewPosition = ( uViewMatrix * vec4( positionRadius.xyz, 1.0 ) ).xyz;
		vec3 toLight = lightViewPosition - viewPosition;
		float distanceSq = dot( toLight, toLight );
		if ( positionRadius.w < sqrt( distanceSq ) ) continue;

		float attenuation = exvsPointAttenuation( distanceSq, positionRadius.w );
		vec3 l = toLight * inversesqrt( distanceSq );

		vec3 h = normalize( l + v );
		float nDotH = clamp( dot( n, h ), 0.0, 1.0 );
		float vDotH = clamp( dot( v, h ), 0.0, 1.0 );
		float nDotL = clamp( dot( n, l ), 0.0, 1.0 );

		vec3 fresnel = f0 + oneMinusF0 * exp2( ( -5.55473 * vDotH - 6.98316 ) * vDotH );
		vec3 lightColor = colorIntensity.rgb * colorIntensity.w * attenuation;

		diffuseAccum += lightColor * ( vec3( 1.0 ) - fresnel ) * ( nDotL * EXVS_INV_PI ) * diffuseAo;

		float d = exvsDistributionGGX( nDotH, alpha2 );
		float vis = exvsVisibilitySmith( g1View, nDotL, alpha );
		specularAccum += lightColor * fresnel * d * vis * nDotL * ambientOcclusion;
	}

	// --- sphere area --------------------------------------------------------
	// Karis's representative point: the specular lobe is evaluated against the
	// point on the sphere nearest the reflection ray, and normalised for the
	// widening that causes.
	vec3 reflectionDir = reflect( -v, n );
	float alphaClamped = max( alpha, 0.01 );

	for ( int i = 0; i < ${EXVS_MAX_SPHERE_AREA_LIGHTS}; i ++ ) {
		if ( i >= uNumSphereAreaLights ) break;

		vec4 colorIntensity = exvsLightTexel( uSphereAreaLights, i, ${EXVS_SPHERE_AREA_LIGHT_STRIDE}, 0 );
		vec4 positionRadius = exvsLightTexel( uSphereAreaLights, i, ${EXVS_SPHERE_AREA_LIGHT_STRIDE}, 1 );
		float sourceRadius = exvsLightTexel( uSphereAreaLights, i, ${EXVS_SPHERE_AREA_LIGHT_STRIDE}, 2 ).x;

		vec3 lightViewPosition = ( uViewMatrix * vec4( positionRadius.xyz, 1.0 ) ).xyz;
		vec3 toLight = lightViewPosition - viewPosition;
		float distanceSq = dot( toLight, toLight );
		float lightDistance = sqrt( distanceSq );
		if ( positionRadius.w < lightDistance ) continue;

		vec3 l = toLight * inversesqrt( distanceSq );
		float nDotLUnmodified = clamp( dot( n, l ), 0.0, 1.0 );

		vec3 representative = l;
		float sphereNormalization = 1.0;
		if ( sourceRadius > 0.0 ) {
			float widened = clamp( alphaClamped + sourceRadius / ( 2.0 * distanceSq ), 0.0, 1.0 );
			sphereNormalization = alphaClamped / widened;
			sphereNormalization *= sphereNormalization;

			vec3 centerToRay = reflectionDir * dot( toLight, reflectionDir ) - toLight;
			float invCenterToRay = inversesqrt( max( dot( centerToRay, centerToRay ), 1e-8 ) );
			float pull = clamp( sourceRadius * invCenterToRay, 0.0, 1.0 );
			// The dispatch doubles the light vector before adding the pull; the
			// result is normalised, so only the ratio of the two terms survives.
			representative = normalize( toLight * 2.0 + centerToRay * pull );
		}

		float t = lightDistance / max( positionRadius.w, 1e-4 );
		t = t * t;
		float window = max( 1.0 - t * t, 0.0 );
		window = window * window;
		float attenuation = window / ( distanceSq + 1.0 );

		float nDotL = clamp( dot( representative, n ), 0.0, 1.0 );
		vec3 h = normalize( representative + v );
		float nDotH = clamp( dot( n, h ), 0.0, 1.0 );
		float vDotH = clamp( dot( v, h ), 0.0, 1.0 );

		vec3 fresnel = f0 + oneMinusF0 * exp2( ( -5.55473 * vDotH - 6.98316 ) * vDotH );
		vec3 lightColor = colorIntensity.rgb * ( attenuation * colorIntensity.w );

		diffuseAccum += lightColor * ( vec3( 1.0 ) - fresnel ) * ( nDotLUnmodified * EXVS_INV_PI ) * diffuseAo;

		float d = exvsDistributionGGX( nDotH, alpha2 ) * sphereNormalization;
		float vis = exvsVisibilitySmith( g1View, nDotL, alpha );
		specularAccum += lightColor * fresnel * d * vis * nDotL * ambientOcclusion;
	}

	outDiffuse = vec4( diffuseAccum, 1.0 );
	outSpecular = vec4( specularAccum, 1.0 );
}
`,
);
