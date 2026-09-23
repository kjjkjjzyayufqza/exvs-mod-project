/**
 * Sample distribution shadow maps.
 *
 * Four partitions share one square atlas as a 2x2 grid. The shipped renderer
 * fills it in a single instanced draw whose `SV_ClipDistance` outputs clip each
 * instance to its own quadrant (`vs-7EBBB5D26CCB06BF`); WebGL2 exposes no clip
 * distances, so the port draws the four partitions as four viewports instead,
 * which produces the same atlas.
 *
 * The resolve is `ps-1EDEBAE73920DD10`. It keeps the shipped addressing scheme:
 * one view-to-light matrix shared by all partitions, plus a per-partition scale
 * and bias, rather than four independent matrices. The result is written into the
 * G-buffer's lighting mask, which is what every later pass reads.
 *
 * Positive view depth is `-viewPosition.z` here. Direct3D's view space runs the
 * other way, and that sign is the only change from the original.
 */

import { EXVS_GBUFFER_CODEC_GLSL, exvsGlsl } from "./exvsShaderCommon";

/** Partitions in the atlas. The shipped renderer is built around exactly four. */
export const EXVS_SHADOW_PARTITION_COUNT = 4;

export const EXVS_SHADOW_RESOLVE_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uDepthTexture;
uniform sampler2D uGBuffer2;
uniform sampler2DShadow uShadowAtlas;

// View space to the shared light clip space.
uniform mat4 uViewToLightProjection;

// xyz = scale, w = intervalEnd.
uniform vec4 uPartitionScale[${EXVS_SHADOW_PARTITION_COUNT}];
// xyz = bias, w = intervalBegin.
uniform vec4 uPartitionBias[${EXVS_SHADOW_PARTITION_COUNT}];

uniform float uDepthBias;

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	// Only shadow receivers are resolved; everything else stays fully lit.
	float flags = exvsUnpackFlags( texelFetch( uGBuffer2, pixel, 0 ).z );
	if ( ! exvsHasFlag( flags, 4.0 ) ) {
		outColor = vec4( 0.0, 0.0, 0.0, 1.0 );
		return;
	}

	float deviceDepth = texelFetch( uDepthTexture, pixel, 0 ).x;
	if ( deviceDepth >= 1.0 ) {
		outColor = vec4( 0.0, 0.0, 0.0, 1.0 );
		return;
	}

	vec3 viewPosition = exvsViewPositionFromDepth( vUv, deviceDepth );
	float viewDepth = -viewPosition.z;

	if ( viewDepth < uPartitionBias[ 0 ].w || viewDepth >= uPartitionScale[ ${EXVS_SHADOW_PARTITION_COUNT - 1} ].w ) {
		outColor = vec4( 0.0, 0.0, 0.0, 1.0 );
		return;
	}

	vec4 lightClip = uViewToLightProjection * vec4( viewPosition, 1.0 );
	vec3 lightNdc = lightClip.xyz / lightClip.w;
	// The original flips v here for Direct3D's texture origin. WebGL's origin is
	// already at the bottom, so all three components take the same mapping and the
	// partition fit on the CPU uses it too.
	vec3 lightUvz = lightNdc * 0.5 + 0.5;

	float shadow = 1.0;
	for ( int i = 0; i < ${EXVS_SHADOW_PARTITION_COUNT}; i ++ ) {
		if ( viewDepth >= uPartitionScale[ i ].w ) continue;

		vec3 scaled = lightUvz * uPartitionScale[ i ].xyz + uPartitionBias[ i ].xyz;

		// The atlas tile this partition owns, then the fractional position inside it.
		vec2 tile = vec2( float( i - 2 * ( i / 2 ) ), float( i / 2 ) ) * 0.5;
		vec2 atlasUv = clamp( fract( scaled.xy ) * 0.5 + tile, 0.0, 1.0 );

		float reference = clamp( scaled.z, 0.0, 1.0 ) - uDepthBias;
		shadow = texture( uShadowAtlas, vec3( atlasUv, reference ) );
		break;
	}

	outColor = vec4( 0.0, 0.0, 0.0, shadow );
}
`,
);

/**
 * Min and max view depth over the frame, halved each pass until one texel is left.
 *
 * Stands in for the depth reduction dispatch `cs-0593BB4DAB0DE410`, which walks a
 * tile per thread group and reduces through shared memory before an atomic min and
 * max. The result is the same pair of numbers; only the reduction shape differs.
 *
 * The first pass reads the depth texture and linearises; later passes read their
 * own output, so the two are separate entry points.
 */
export const EXVS_DEPTH_REDUCE_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform vec2 uSourceSize;
uniform float uNearClip;
uniform float uFarClip;
uniform bool uIsFirstPass;

void main() {
	ivec2 base = ivec2( gl_FragCoord.xy ) * 2;
	ivec2 maxTexel = ivec2( uSourceSize ) - 1;

	float minDepth = 3.402823466e38;
	float maxDepth = 0.0;

	for ( int y = 0; y < 2; y ++ ) {
		for ( int x = 0; x < 2; x ++ ) {
			ivec2 texel = min( base + ivec2( x, y ), maxTexel );
			vec2 pair;
			if ( uIsFirstPass ) {
				float deviceDepth = texelFetch( uSource, texel, 0 ).x;
				if ( deviceDepth >= 1.0 ) continue;
				float viewDepth = -exvsViewDepthFromDepth( deviceDepth );
				if ( viewDepth < uNearClip || viewDepth >= uFarClip ) continue;
				pair = vec2( viewDepth, viewDepth );
			} else {
				pair = texelFetch( uSource, texel, 0 ).xy;
				if ( pair.y <= 0.0 ) continue;
			}
			minDepth = min( minDepth, pair.x );
			maxDepth = max( maxDepth, pair.y );
		}
	}

	// An empty tile reports a max of zero, which the next level skips.
	if ( maxDepth <= 0.0 ) {
		outColor = vec4( 3.402823466e38, 0.0, 0.0, 1.0 );
		return;
	}

	outColor = vec4( minDepth, maxDepth, 0.0, 1.0 );
}
`,
);
