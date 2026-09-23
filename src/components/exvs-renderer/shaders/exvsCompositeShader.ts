/**
 * The composite.
 *
 * Ported from `ps-CE7B7A3265CC4F9D`, the heaviest shader in the game: 262
 * instructions over fifteen textures. It resolves the G-buffer against the two
 * light accumulation buffers, then runs the stage-authored screen effects, the
 * HSV tone curve, the ramp fog and the colour grading lookup, and finally writes
 * depth back through so the forward passes after it can still test against the
 * scene.
 *
 * The stage effects — the character special overlay, the border grid projection,
 * the XZ projection — are each behind the same enable the original tests. A scene
 * that supplies none of them takes none of the branches, which is what the game
 * does on a stage that authors none of them.
 *
 * The tone curve lookup is a twelve-row texture sampled at row centres
 * `(2i + 1) / 24`. Rows 0-3 are the background curves, 4-7 the character curves,
 * and 8-11 belong to the effect filter rather than to this pass.
 */

import {
  EXVS_COLOR_GLSL,
  EXVS_GBUFFER_CODEC_GLSL,
  exvsGlsl,
} from "./exvsShaderCommon";

/** Row centres of the tone curve lookup texture. */
export const EXVS_TONE_CURVE_ROWS = {
  backgroundRed: 1 / 24,
  backgroundGreen: 3 / 24,
  backgroundBlue: 5 / 24,
  backgroundSaturation: 7 / 24,
  charaRed: 9 / 24,
  charaGreen: 11 / 24,
  charaBlue: 13 / 24,
  charaSaturation: 15 / 24,
  effectRed: 17 / 24,
  effectGreen: 19 / 24,
  effectBlue: 21 / 24,
  effectAlpha: 23 / 24,
} as const;

export const EXVS_COMPOSITE_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  EXVS_COLOR_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uGBuffer0;
uniform sampler2D uGBuffer1;
uniform sampler2D uGBuffer2;
uniform sampler2D uGBuffer3;
uniform sampler2D uDiffuseLAB;
uniform sampler2D uSpecularLAB;
uniform sampler2D uDepthMap;
uniform sampler2D uToneCurveLUTMap;
uniform sampler2D uCharaSpecialTexture;
uniform sampler2D uRampFogColorTexture;
uniform sampler2D uBorderProjectionTexture;
uniform sampler2D uProjectionXZTexture;
uniform sampler3D uColorGradingLUT;

uniform bool uHasCharaSpecial;
uniform bool uHasRampFog;
uniform bool uHasBorderProjection;
uniform bool uProjectionXZEnabled;
uniform bool uToneCurveEnabled;
uniform bool uColorGradingEnabled;

uniform mat4 uViewInverse;

// vsngShadowParameter.shadowColor
uniform vec3 uShadowColor;

// PERSCENE_VSNG
uniform float uBrightnessRatio;
uniform float uRampfogRgbBoost;
uniform float uRampfogAlphaBoost;
uniform float uMapfogAttenStart;
uniform float uMapfogAttenEnd;
uniform vec2 uMapfogSize;
uniform vec2 uMapfogCenter;
uniform vec2 uProjectionXZDiv;
uniform vec2 uProjectionXZOffset;
uniform float uProjectionXZRatio;

// The colour the original substitutes for a pixel that came out as NaN.
const vec3 EXVS_NAN_GUARD = vec3( 0.219, 0.247, 0.278 );

float exvsToneCurve( float value, float row ) {
	if ( value > 1.0 ) return value;
	return texture( uToneCurveLUTMap, vec2( value, row ) ).x;
}

vec3 exvsApplyToneCurve( vec3 color, float redRow, float greenRow, float blueRow, float saturationRow ) {
	vec3 hsv = exvsRgbToHsv( color );
	float saturation = hsv.y <= 1.0
		? texture( uToneCurveLUTMap, vec2( hsv.y, saturationRow ) ).x
		: hsv.y;
	vec3 curved = exvsHsvToRgb( vec3( hsv.x, saturation, hsv.z ) );
	return vec3(
		exvsToneCurve( curved.r, redRow ),
		exvsToneCurve( curved.g, greenRow ),
		exvsToneCurve( curved.b, blueRow )
	);
}

vec3 exvsColorGrade( vec3 color ) {
	vec3 encoded = exvsGammaEncode( color );
	// A 32 cube lookup: the half-texel inset is 1/32 and the span 31/32.
	vec3 coord = min( encoded, vec3( 1.0 ) ) * 0.9375 + 0.03125;
	vec3 graded = texture( uColorGradingLUT, coord ).rgb;
	vec3 selected = mix( graded, encoded, step( vec3( 1.0 ), encoded ) );
	return exvsGammaDecode( selected );
}

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	vec4 gb0 = texelFetch( uGBuffer0, pixel, 0 );
	vec4 gb1 = texelFetch( uGBuffer1, pixel, 0 );
	vec4 gb2 = texelFetch( uGBuffer2, pixel, 0 );
	vec4 gb3 = texelFetch( uGBuffer3, pixel, 0 );

	float emissiveIntensity = gb0.z;
	vec3 albedo = gb1.rgb;
	float lightingMask = gb1.a;
	float metallic = gb2.y;
	float flags = exvsUnpackFlags( gb2.z );
	bool isLightMap = exvsHasFlag( flags, 1.0 );
	bool isChara = exvsMaterialClass( flags ) == 64.0;

	// A light map lands in the emissive slot but is a lighting term, so it is
	// added to the diffuse accumulation rather than emitted on its own.
	vec3 emissiveLinear = isLightMap ? vec3( 0.0 ) : exvsGammaDecode( gb3.rgb ) * emissiveIntensity;
	vec3 lightMap = isLightMap ? gb3.rgb : vec3( 0.0 );

	vec3 diffuseAlbedo = albedo * ( 1.0 - metallic );
	vec3 diffuseLight = texelFetch( uDiffuseLAB, pixel, 0 ).rgb;
	vec3 specularLight = texelFetch( uSpecularLAB, pixel, 0 ).rgb;

	vec3 color = diffuseAlbedo * ( lightMap + diffuseLight ) + specularLight + emissiveLinear;

	// A pixel the sun never reached takes the stage's flat shadow colour.
	if ( lightingMask == 0.0 ) color += uShadowColor;

	if ( any( notEqual( color, color ) ) ) color = EXVS_NAN_GUARD;

	float deviceDepth = texelFetch( uDepthMap, pixel, 0 ).x;

	// The game draws a sky into the G-buffer; an editor scene has none, so a pixel
	// no geometry reached keeps the viewport's own background and its cleared depth.
	if ( deviceDepth >= 1.0 ) discard;

	vec3 viewPosition = exvsViewPositionFromDepth( vUv, deviceDepth );
	vec3 worldPosition = ( uViewInverse * vec4( viewPosition, 1.0 ) ).xyz;
	float viewDepth = -viewPosition.z;

	// --- border projection ---------------------------------------------------
	vec4 border = vec4( 0.0 );
	if ( uHasBorderProjection && ! isChara ) {
		border = texture( uBorderProjectionTexture, vUv );
	}

	// --- character special overlay -------------------------------------------
	if ( uHasCharaSpecial ) {
		vec4 special = texelFetch( uCharaSpecialTexture, pixel, 0 );
		float strength = special.w * special.w;
		color = color * ( 1.0 - strength ) + color * strength * 0.5;
		color += special.rgb * ( lightingMask * 0.5 + 0.5 );
	}

	// --- XZ projection --------------------------------------------------------
	// Only where nothing emits, which is how the original gates it.
	if ( uProjectionXZEnabled && dot( emissiveLinear, emissiveLinear ) == 0.0 ) {
		vec2 projectionUv = worldPosition.xz / uProjectionXZDiv + uProjectionXZOffset;
		vec3 projection = texture( uProjectionXZTexture, projectionUv ).rgb;
		color *= 1.0 + uProjectionXZRatio * ( projection - 1.0 );
	}

	// --- tone curve ------------------------------------------------------------
	if ( uToneCurveEnabled ) {
		if ( isChara ) {
			color = exvsApplyToneCurve(
				color,
				${EXVS_TONE_CURVE_ROWS.charaRed},
				${EXVS_TONE_CURVE_ROWS.charaGreen},
				${EXVS_TONE_CURVE_ROWS.charaBlue},
				${EXVS_TONE_CURVE_ROWS.charaSaturation}
			);
		} else {
			color = exvsApplyToneCurve(
				color,
				${EXVS_TONE_CURVE_ROWS.backgroundRed},
				${EXVS_TONE_CURVE_ROWS.backgroundGreen},
				${EXVS_TONE_CURVE_ROWS.backgroundBlue},
				${EXVS_TONE_CURVE_ROWS.backgroundSaturation}
			);
			// brightness_ratio is applied to the background only.
			color *= uBrightnessRatio;
		}
	}

	// --- ramp fog ---------------------------------------------------------------
	// The fog's weight is the ramp texture's own alpha, so a stage that authors no
	// ramp fog is not fogged at all. Distance alone never produces fog here.
	if ( uHasRampFog ) {
		float fogRange = max( uMapfogAttenEnd - uMapfogAttenStart, 1e-4 );
		float fogFactor = ( clamp( viewDepth, uMapfogAttenStart, uMapfogAttenEnd ) - uMapfogAttenStart ) / fogRange;

		vec2 fogUv = ( worldPosition.xz - uMapfogCenter ) / uMapfogSize + 0.5;
		vec4 fogTexel = texture( uRampFogColorTexture, fogUv );

		vec3 fogColor = fogTexel.rgb * uRampfogRgbBoost;
		float fogAlpha = fogTexel.a * fogFactor * uRampfogAlphaBoost;
		fogAlpha *= fogAlpha;
		if ( ! isChara ) fogAlpha *= uBrightnessRatio;

		color = color * ( 1.0 - fogAlpha ) + fogColor * fogAlpha;
	}

	// --- colour grading ----------------------------------------------------------
	if ( uColorGradingEnabled ) color = exvsColorGrade( color );

	outColor = vec4( color * ( 1.0 - border.a ) + border.rgb * border.a, 1.0 );
	gl_FragDepth = deviceDepth;
}
`,
);
