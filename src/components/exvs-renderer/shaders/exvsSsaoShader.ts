/**
 * Screen space ambient occlusion.
 *
 * Three shaders ship and all three are here:
 *   `ps-BFDD0CD4399077B3` — half resolution depth, a 2x2 gather reduced by max
 *   `ps-DD2FCC1D98B2FDF6` — the occlusion itself, hemisphere samples in rings
 *   `ps-F1E8F8B2457CDA69` / `ps-7CC29CADBC510360` — a separable depth-aware blur
 *
 * The blur is the expensive half, not the occlusion: 239 instructions against 85.
 * The two blur directions differ only in their axis, in whether they carry depth
 * through, and in the vertical pass's early-out for characters, so they are one
 * source here.
 *
 * One deliberate difference from the original. The shipped occlusion pass negates
 * the decoded normal's z, because its reconstructed view position runs +z away
 * from the camera while the G-buffer normal runs +z toward it. Both point the
 * same way in WebGL, so the negation is dropped rather than reproduced — keeping
 * it would tilt every sampling hemisphere backwards.
 */

import { EXVS_GBUFFER_CODEC_GLSL, exvsGlsl } from "./exvsShaderCommon";

/**
 * Half resolution linear depth, reduced by max so near geometry wins a texel.
 *
 * The original does this with a single `gather4`. WebGL2 is GLSL ES 3.00, where
 * `textureGather` does not exist — it arrives in 3.10 — so the same 2x2 block is
 * fetched explicitly. Same four texels, same reduction.
 */
export const EXVS_SSAO_DOWNSAMPLE_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uDepthTexture;
uniform vec2 uDepthSize;

void main() {
	ivec2 base = ivec2( gl_FragCoord.xy ) * 2;
	ivec2 maxTexel = ivec2( uDepthSize ) - 1;

	float deviceDepth = 0.0;
	for ( int y = 0; y < 2; y ++ ) {
		for ( int x = 0; x < 2; x ++ ) {
			ivec2 texel = min( base + ivec2( x, y ), maxTexel );
			deviceDepth = max( deviceDepth, texelFetch( uDepthTexture, texel, 0 ).x );
		}
	}

	outColor = vec4( -exvsViewDepthFromDepth( deviceDepth ), 0.0, 0.0, 1.0 );
}
`,
);

export const EXVS_SSAO_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  /* glsl */ `
in vec2 vUv;

// .x occlusion, .y view depth scaled by zscale. The blur reads both.
layout(location = 0) out vec4 outColor;

uniform sampler2D uDepthTexture;
uniform sampler2D uHalfDepthTexture;
uniform sampler2D uGBuffer0;


// cbSSAOAttribs
uniform float uRadius;
uniform float uThreshold;
uniform int uSampleRadiusNum;
uniform int uSampleRotateNum;
uniform float uMaxOcclusion;
uniform float uRadiusAmount;
uniform float uRadiusOffset;
uniform float uRevRotateNum;
uniform float uZScale;

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	float deviceDepth = texelFetch( uDepthTexture, pixel, 0 ).x;
	if ( deviceDepth >= 1.0 ) {
		outColor = vec4( 1.0, 0.0, 0.0, 1.0 );
		return;
	}

	vec3 viewPosition = exvsViewPositionFromDepth( vUv, deviceDepth );
	float viewDepth = -viewPosition.z;

	vec3 n = exvsDecodeNormal( texelFetch( uGBuffer0, pixel, 0 ).xy );

	// Sampling radius grows with distance, capped by cbSSAOAttribs.radius.
	float sampleRadius = min( viewDepth * uRadiusAmount + uRadiusOffset, uRadius );

	// The origin is lifted off the surface by a fraction of 1/512 of the two
	// distances, which is what keeps a flat surface from occluding itself.
	vec3 origin = viewPosition + n * ( ( sampleRadius + viewDepth ) * 0.001953 );

	// A basis perpendicular to the normal, built the way the original builds it:
	// one axis from the normal's own xz, the other from their cross product.
	vec3 tangent = normalize( vec3( n.z, 0.0, -n.x ) );
	vec3 bitangent = normalize( cross( n, tangent ) );

	// Per-pixel rotation so neighbouring pixels do not share a sample pattern.
	float pixelRotation = dot( gl_FragCoord.xy, vec2( 0.375, 0.375 ) );
	float invThreshold = 1.0 / -uThreshold;

	float occlusion = 0.0;

	for ( int ring = 0; ring < 8; ring ++ ) {
		if ( ring >= uSampleRadiusNum ) break;
		float ringScale = float( ring ) + 1.0;

		float rotateOffset = 0.0;
		for ( int spoke = 0; spoke < 16; spoke ++ ) {
			if ( spoke >= uSampleRotateNum ) break;

			float angle = ( pixelRotation + rotateOffset + ringScale * 0.375 ) * 6.283185;

			// The accumulated rotation offset doubles as the hemisphere height, so
			// successive samples climb the hemisphere as they sweep around it.
			float height = sqrt( rotateOffset );
			float ringRadius = sqrt( max( 1.0 - height * height, 0.0 ) );

			float sinAngle = sin( angle );
			float cosAngle = cos( angle );

			vec3 direction = bitangent * ( ringRadius * sinAngle )
				+ tangent * ( ringRadius * cosAngle )
				+ n * height;

			vec3 samplePosition = origin + direction * ( ringScale * sampleRadius );

			vec4 sampleClip = uExvsProjectionMatrix * vec4( samplePosition, 1.0 );
			vec2 sampleUv = sampleClip.xy / sampleClip.w * 0.5 + 0.5;

			float sampleDepth = texture( uHalfDepthTexture, sampleUv ).x;

			float difference = sampleDepth - viewDepth;
			float range = clamp( ( abs( difference ) - uThreshold ) * invThreshold, 0.0, 1.0 );
			float falloff = range * range * ( 3.0 - 2.0 * range );

			float occluded = sampleDepth < -samplePosition.z ? 1.0 : 0.0;
			occlusion += falloff * occluded;

			rotateOffset += uRevRotateNum;
		}

	}

	outColor = vec4(
		clamp( 1.0 - occlusion * uMaxOcclusion, 0.0, 1.0 ),
		viewDepth * uZScale,
		0.0,
		1.0
	);
}
`,
);

/**
 * One direction of the separable blur.
 *
 * Taps at distance m are rejected across a depth discontinuity by predicting the
 * depth at m from the depth at 1 and blending the tap back toward the centre by
 * how far the prediction misses. `uIsFinalPass` selects the vertical pass, which
 * skips characters entirely and writes only the occlusion.
 */
export const EXVS_SSAO_BLUR_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uAoTexture;
uniform sampler2D uGBuffer2;
uniform vec2 uTexelStep;
uniform vec2 uSourceSize;
uniform float uWeights[8];
uniform bool uIsFinalPass;

// The occlusion buffer is half resolution while the final pass writes at full
// resolution, so the tap centre comes from the normalised coordinate rather than
// from this pass's own pixel index.
vec2 exvsBlurTap( vec2 centrePixel, int offset ) {
	vec2 texel = centrePixel + vec2( offset ) * uTexelStep;
	texel = clamp( texel, vec2( 0.0 ), uSourceSize - 1.0 );
	return texelFetch( uAoTexture, ivec2( texel ), 0 ).xy;
}

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	if ( uIsFinalPass ) {
		// Characters are excluded from ambient occlusion. 1.0 is the identity for
		// the multiplicative blend this pass writes with.
		float flags = exvsUnpackFlags( texelFetch( uGBuffer2, pixel, 0 ).z );
		if ( exvsMaterialClass( flags ) == 64.0 ) {
			outColor = vec4( 1.0 );
			return;
		}
	}

	vec2 centrePixel = floor( vUv * uSourceSize );

	vec2 centre = exvsBlurTap( centrePixel, 0 );
	float centreAo = centre.x;
	float centreDepth = centre.y;

	float sum = centreAo * uWeights[ 0 ];

	vec2 nearPlus = exvsBlurTap( centrePixel, 1 );
	vec2 nearMinus = exvsBlurTap( centrePixel, -1 );
	vec2 nearDepth = vec2( nearPlus.y, nearMinus.y ) - centreDepth;

	sum += uWeights[ 1 ] * ( nearPlus.x + nearMinus.x );

	for ( int m = 2; m < 8; m ++ ) {
		vec2 plus = exvsBlurTap( centrePixel, m );
		vec2 minus = exvsBlurTap( centrePixel, -m );

		vec2 measured = vec2( plus.y, minus.y ) - centreDepth;
		vec2 predicted = nearDepth * float( m );
		vec2 error = min( abs( predicted - measured ), vec2( 1.0 ) );

		vec2 blended = mix( vec2( plus.x, minus.x ), vec2( centreAo ), error );
		sum += uWeights[ m ] * ( blended.x + blended.y );
	}

	if ( uIsFinalPass ) {
		outColor = vec4( 1.0, 1.0, 1.0, sum );
	} else {
		outColor = vec4( sum, centreDepth, 0.0, 1.0 );
	}
}
`,
);
