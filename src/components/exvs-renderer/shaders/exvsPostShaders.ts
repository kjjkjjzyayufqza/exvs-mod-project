/**
 * The post chain, in the order the frame runs it.
 *
 *   bloom bright pass   `ps-9706A0FCC0F096FE`
 *   bloom downsample    `ps-9ED7554FA76C4F62`
 *   gaussian blur       `ps-9F0C489CD27F7102` / `ps-ABDA4280201B04B7`
 *   bloom combine       `ps-4BD2FA2CCAC97EBD`
 *   depth of field      `ps-FF3A4EAB5AB00EF3`
 *   effect blend        `ps-092DD88CBCD380C9`
 *   post filter         `ps-9417D9CEC02D40F9`
 *   antialiasing        `ps-3E6DFF52EB37B249`
 *
 * The bloom threshold is a hard luminance cut with no soft knee, and the
 * downsample's four taps are offset by a fraction of the pixel coordinate rather
 * than by a texel size — both are unusual, both are what ships, and both are
 * reproduced.
 *
 * The antialiasing shader is Timothy Lottes' FXAA 3.11 compiled with
 * `FXAA_PC`, `FXAA_GREEN_AS_LUMA` and quality preset 12. That is readable
 * straight off its constant buffer, which keeps the library's own field names,
 * and off its five search steps of 1.0, 1.5, 2.0, 4.0 and 12.0.
 */

import { EXVS_COLOR_GLSL, EXVS_GBUFFER_CODEC_GLSL, exvsGlsl } from "./exvsShaderCommon";
import { EXVS_TONE_CURVE_ROWS } from "./exvsCompositeShader";

/** Luminance weights the bright pass uses. Rec. 601, not Rec. 709. */
export const EXVS_BLOOM_LUMA_WEIGHTS: [number, number, number] = [0.299, 0.587, 0.114];

export const EXVS_BLOOM_BRIGHT_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform float uBloomThreshold;

void main() {
	vec4 texel = texture( uSource, vUv );
	float luma = dot( vec3( ${EXVS_BLOOM_LUMA_WEIGHTS[0]}, ${EXVS_BLOOM_LUMA_WEIGHTS[1]}, ${EXVS_BLOOM_LUMA_WEIGHTS[2]} ), texel.rgb );
	// A hard cut, not a soft knee: below the threshold the texel contributes nothing.
	outColor = luma > uBloomThreshold ? texel : vec4( 0.0 );
}
`;

export const EXVS_BLOOM_DOWNSAMPLE_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform float uBlendValue;

void main() {
	// The shipped shader derives its offsets from the pixel coordinate, so the
	// sample spread shrinks toward the bottom right of the screen. Reproduced.
	vec4 relative = vec4( 1.0, 1.0, -1.0, -1.0 ) / gl_FragCoord.xyxy;
	vec4 offsetUv = vUv.xyxy * relative + vUv.xyxy;

	vec3 sum = texture( uSource, offsetUv.zw ).rgb;
	sum += texture( uSource, offsetUv.zy ).rgb;
	sum += texture( uSource, offsetUv.xy ).rgb;
	sum += texture( uSource, offsetUv.xw ).rgb;

	outColor = vec4( sum * 0.25, uBlendValue );
}
`;

export const EXVS_BLOOM_COMBINE_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform sampler2D uLightBuffer;
uniform float uBrightScale;

void main() {
	vec4 relative = vec4( 1.0, 1.0, -1.0, -1.0 ) / gl_FragCoord.xyxy;
	vec4 offsetUv = vUv.xyxy * relative + vUv.xyxy;

	vec4 sum = texture( uLightBuffer, offsetUv.zw );
	sum += texture( uLightBuffer, offsetUv.zy );
	sum += texture( uLightBuffer, offsetUv.xy );
	sum += texture( uLightBuffer, offsetUv.xw );

	outColor = sum * uBrightScale * 0.25 + texture( uSource, vUv );
}
`;

/**
 * One direction of the separable gaussian.
 *
 * The weights and offsets come from a structured buffer in the original; here
 * they are a uniform array of `vec2(offset, weight)` pairs with the same
 * symmetric two-tap accumulation.
 */
export const EXVS_GAUSSIAN_BLUR_MAX_STEPS = 16;

export const EXVS_GAUSSIAN_BLUR_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform vec2 uPixelSize;
uniform vec2 uDirection;
uniform float uUvOffset;
uniform int uStepCount;
uniform vec2 uWeightAndOffset[${EXVS_GAUSSIAN_BLUR_MAX_STEPS}];

void main() {
	vec2 centre = vUv + uUvOffset;
	vec3 sum = vec3( 0.0 );

	for ( int i = 0; i < ${EXVS_GAUSSIAN_BLUR_MAX_STEPS}; i ++ ) {
		if ( i >= uStepCount ) break;
		vec2 weightAndOffset = uWeightAndOffset[ i ];
		vec2 tapOffset = uDirection * ( weightAndOffset.x * uPixelSize );
		vec3 pair = texture( uSource, centre + tapOffset ).rgb + texture( uSource, centre - tapOffset ).rgb;
		sum += weightAndOffset.y * pair;
	}

	outColor = vec4( sum, 0.05 );
}
`;

export const EXVS_DOF_FRAGMENT_GLSL = exvsGlsl(
  EXVS_GBUFFER_CODEC_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform sampler2D uSoftBlurred;
uniform sampler2D uHardBlurred;
uniform sampler2D uDepthTexture;

uniform float uSubjectDistance;
uniform float uCircleOfConfusion;
uniform float uBokehBias;

void main() {
	ivec2 pixel = ivec2( gl_FragCoord.xy );

	float deviceDepth = texelFetch( uDepthTexture, pixel, 0 ).x;
	vec3 sharp = texelFetch( uSource, pixel, 0 ).rgb;

	float viewDepth = -exvsViewDepthFromDepth( deviceDepth );

	// Relative defocus, then biased and saturated into a blend weight.
	float relative = ( uSubjectDistance - viewDepth ) / max( viewDepth, 1e-4 );
	float defocus = clamp( abs( relative * uCircleOfConfusion ) * uBokehBias - uBokehBias, 0.0, 1.0 );

	vec3 soft = texture( uSoftBlurred, vUv ).rgb;
	vec3 color = sharp * ( 1.0 - defocus ) + soft * ( defocus * ( 1.0 - defocus ) );

	vec3 hard = texture( uHardBlurred, vUv ).rgb;
	outColor = vec4( hard * ( defocus * defocus ) + color, defocus );
}
`,
);

/**
 * The screen filters.
 *
 * Every stage is behind the enable its own parameter block carries, so a scene
 * that turns them all off passes the image through untouched — which is how the
 * game runs outside of a scripted moment.
 */
export const EXVS_POST_FILTER_FRAGMENT_GLSL = exvsGlsl(
  EXVS_COLOR_GLSL,
  /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uInputTexture;
uniform sampler3D uLutTexture;

uniform bool uColorGradingEnabled;

// radialBlurParam
uniform bool uRadialBlurEnabled;
uniform float uRadialBlurPower;
uniform float uRadialBlurRadiusPower;
uniform float uRadialBlurBlendRate;
uniform vec2 uRadialBlurScreenPos;

// addColorParam
uniform bool uAddColorRadialEnabled;
uniform vec4 uAddColorRadial;
uniform float uAddColorRadiusPower;
uniform vec2 uAddColorScreenPos;

// colorFilterParam
uniform bool uColorFilterEnabled;
uniform vec4 uColorFilterColor;

// negaFilterParam
uniform bool uNegativeEnabled;
uniform float uNegativePivot;

// glitchFilterParam
uniform bool uGlitchEnabled;
uniform vec2 uChromaAberrationUv;
uniform vec3 uChromaAberrationColor;
uniform float uScanNoiseThreshold;
uniform float uNoiseWidth;
uniform vec3 uNoiseColor0;
uniform vec3 uNoiseColor1;
uniform vec4 uGlitchRand;

void main() {
	vec3 color;

	if ( uGlitchEnabled ) {
		// Three channels sampled along a randomised offset, then a scan band
		// tinted by one of two noise colours.
		float spread = uGlitchRand.w * 2.0 - 1.0;
		vec3 axis = spread * vec3( uGlitchRand.y, uGlitchRand.z, uGlitchRand.x );
		vec3 alongU = axis.zxy * uChromaAberrationUv.x;
		vec3 alongV = -axis.xzy * uChromaAberrationUv.y;

		float r = texture( uInputTexture, vUv + vec2( alongU.x, alongV.x ) * uChromaAberrationColor.x ).r;
		float g = texture( uInputTexture, vUv + vec2( alongU.y, alongV.y ) * uChromaAberrationColor.y ).g;
		float b = texture( uInputTexture, vUv + vec2( alongU.z, alongV.z ) * uChromaAberrationColor.z ).b;
		color = vec3( r, g, b );

		bool inBand = vUv.y > uGlitchRand.w && vUv.y < uGlitchRand.z * uNoiseWidth + uGlitchRand.w;
		if ( inBand && uGlitchRand.x < uScanNoiseThreshold ) {
			color *= uGlitchRand.y > 0.5 ? uNoiseColor0 : uNoiseColor1;
		}
	} else {
		color = texture( uInputTexture, vUv ).rgb;
	}

	if ( uRadialBlurEnabled ) {
		vec2 toCentre = vec2( uRadialBlurScreenPos.x - vUv.x, ( 1.0 - uRadialBlurScreenPos.y ) - vUv.y );
		float distanceToCentre = length( toCentre );
		vec2 stepUv = toCentre * uRadialBlurPower * ( 1.0 / 9.0 );

		vec3 blurred = texture( uInputTexture, clamp( vUv + stepUv, 0.0, 1.0 ) ).rgb * 0.2;
		for ( int i = 2; i < 10; i ++ ) {
			vec2 tapUv = clamp( vUv + stepUv * float( i ), 0.0, 1.0 );
			blurred += texture( uInputTexture, tapUv ).rgb * ( 0.222222 - float( i ) * 0.022222 );
		}

		float falloff = clamp( 1.0 - distanceToCentre * uRadialBlurRadiusPower * 2.020305, 0.0, 1.0 );
		float weight = falloff * uRadialBlurBlendRate;
		color = color * ( 1.0 - weight ) + blurred * weight;
	}

	if ( uAddColorRadialEnabled ) {
		vec2 toCentre = vec2( uAddColorScreenPos.x - vUv.x, ( 1.0 - uAddColorScreenPos.y ) - vUv.y );
		float falloff = max( 1.0 - length( toCentre ) * 2.020305, 0.0 );
		color += uAddColorRadial.rgb * pow( falloff, uAddColorRadiusPower ) * uAddColorRadial.w;
	}

	if ( uColorFilterEnabled ) {
		color += uColorFilterColor.rgb * uColorFilterColor.w;
	}

	color = exvsGammaEncode( color );

	if ( uColorGradingEnabled ) {
		vec3 coord = min( color, vec3( 1.0 ) ) * 0.9375 + 0.03125;
		color = texture( uLutTexture, coord ).rgb;
	}

	if ( uNegativeEnabled ) {
		color = abs( color - uNegativePivot );
	}

	outColor = vec4( color, 1.0 );
}
`,
);

/**
 * The effect blend and tone curve pass, `ps-092DD88CBCD380C9`.
 *
 * Four effect layers — half and full strength, behind and in front — are folded
 * together back to front, then run through rows 8 to 11 of the tone curve
 * lookup, the block reserved for effects.
 */
export const EXVS_EFFECT_BLEND_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uToneCurveLUTMap;
uniform sampler2D uEffectBlendHalfBack;
uniform sampler2D uEffectBlendFullBack;
uniform sampler2D uEffectBlendHalfFront;
uniform sampler2D uEffectBlendFullFront;

void main() {
	vec4 halfBack = texture( uEffectBlendHalfBack, vUv );
	vec4 fullBack = texture( uEffectBlendFullBack, vUv );
	vec4 halfFront = texture( uEffectBlendHalfFront, vUv );
	vec4 fullFront = texture( uEffectBlendFullFront, vUv );

	vec3 front = halfFront.rgb * fullFront.a + fullFront.rgb;
	float frontAlpha = halfFront.a * fullFront.a;

	vec3 back = fullBack.rgb * frontAlpha + front;
	float backAlpha = fullBack.a * frontAlpha;

	vec3 blended = clamp( halfBack.rgb * backAlpha + back, 0.0, 1.0 );

	vec3 curved = vec3(
		texture( uToneCurveLUTMap, vec2( blended.r, ${EXVS_TONE_CURVE_ROWS.effectRed} ) ).x,
		texture( uToneCurveLUTMap, vec2( blended.g, ${EXVS_TONE_CURVE_ROWS.effectGreen} ) ).x,
		texture( uToneCurveLUTMap, vec2( blended.b, ${EXVS_TONE_CURVE_ROWS.effectBlue} ) ).x
	);

	float coverage = 1.0 - halfBack.a * backAlpha;
	float curvedAlpha = coverage <= 1.0
		? texture( uToneCurveLUTMap, vec2( coverage, ${EXVS_TONE_CURVE_ROWS.effectAlpha} ) ).x
		: coverage;

	outColor = vec4( curved, curvedAlpha );
}
`;

/**
 * FXAA 3.11, PC quality path, luminance taken from the green channel, preset 12.
 *
 * The five search steps below are preset 12's own, and the `1/12` subpixel term
 * and the `-2x + 3` smoothing are the library's.
 */
export const EXVS_FXAA_FRAGMENT_GLSL = /* glsl */ `
in vec2 vUv;

layout(location = 0) out vec4 outColor;

uniform sampler2D uSource;
uniform vec2 uRcpFrame;
uniform float uQualitySubpix;
uniform float uQualityEdgeThreshold;
uniform float uQualityEdgeThresholdMin;

float exvsLuma( vec3 rgb ) {
	return rgb.g;
}

// Preset 12's search steps. Spelled out rather than held in a const array, which
// some ES 3.00 drivers will not index dynamically.
float exvsFxaaStep( int i ) {
	if ( i == 1 ) return 1.5;
	if ( i == 2 ) return 2.0;
	if ( i == 3 ) return 4.0;
	return 12.0;
}

void main() {
	vec2 posM = vUv;

	vec4 rgbyM = texture( uSource, posM );
	float lumaM = exvsLuma( rgbyM.rgb );

	float lumaS = exvsLuma( textureOffset( uSource, posM, ivec2( 0, 1 ) ).rgb );
	float lumaE = exvsLuma( textureOffset( uSource, posM, ivec2( 1, 0 ) ).rgb );
	float lumaN = exvsLuma( textureOffset( uSource, posM, ivec2( 0, -1 ) ).rgb );
	float lumaW = exvsLuma( textureOffset( uSource, posM, ivec2( -1, 0 ) ).rgb );

	float maxSM = max( lumaS, lumaM );
	float minSM = min( lumaS, lumaM );
	float maxESM = max( lumaE, maxSM );
	float minESM = min( lumaE, minSM );
	float maxWN = max( lumaN, lumaW );
	float minWN = min( lumaN, lumaW );
	float rangeMax = max( maxWN, maxESM );
	float rangeMin = min( minWN, minESM );
	float range = rangeMax - rangeMin;

	float rangeMaxScaled = rangeMax * uQualityEdgeThreshold;
	float rangeMaxClamped = max( uQualityEdgeThresholdMin, rangeMaxScaled );

	if ( range < rangeMaxClamped ) {
		outColor = rgbyM;
		return;
	}

	float lumaNW = exvsLuma( textureOffset( uSource, posM, ivec2( -1, -1 ) ).rgb );
	float lumaSE = exvsLuma( textureOffset( uSource, posM, ivec2( 1, 1 ) ).rgb );
	float lumaNE = exvsLuma( textureOffset( uSource, posM, ivec2( 1, -1 ) ).rgb );
	float lumaSW = exvsLuma( textureOffset( uSource, posM, ivec2( -1, 1 ) ).rgb );

	float lumaNS = lumaN + lumaS;
	float lumaWE = lumaW + lumaE;
	float subpixRcpRange = 1.0 / range;
	float subpixNSWE = lumaNS + lumaWE;
	float edgeHorz1 = -2.0 * lumaM + lumaNS;
	float edgeVert1 = -2.0 * lumaM + lumaWE;

	float lumaNESE = lumaNE + lumaSE;
	float lumaNWNE = lumaNW + lumaNE;
	float edgeHorz2 = -2.0 * lumaE + lumaNESE;
	float edgeVert2 = -2.0 * lumaN + lumaNWNE;

	float lumaNWSW = lumaNW + lumaSW;
	float lumaSWSE = lumaSW + lumaSE;
	float edgeHorz4 = abs( edgeHorz1 ) * 2.0 + abs( edgeHorz2 );
	float edgeVert4 = abs( edgeVert1 ) * 2.0 + abs( edgeVert2 );
	float edgeHorz3 = -2.0 * lumaW + lumaNWSW;
	float edgeVert3 = -2.0 * lumaS + lumaSWSE;
	float edgeHorz = abs( edgeHorz3 ) + edgeHorz4;
	float edgeVert = abs( edgeVert3 ) + edgeVert4;

	float subpixNWSWNESE = lumaNWSW + lumaNESE;
	float lengthSign = uRcpFrame.x;
	bool horzSpan = edgeHorz >= edgeVert;
	float subpixA = subpixNSWE * 2.0 + subpixNWSWNESE;

	if ( ! horzSpan ) { lumaN = lumaW; lumaS = lumaE; }
	else { lengthSign = uRcpFrame.y; }
	float subpixB = subpixA * ( 1.0 / 12.0 ) - lumaM;

	float gradientN = lumaN - lumaM;
	float gradientS = lumaS - lumaM;
	float lumaNN = lumaN + lumaM;
	float lumaSS = lumaS + lumaM;
	bool pairN = abs( gradientN ) >= abs( gradientS );
	float gradient = max( abs( gradientN ), abs( gradientS ) );
	if ( pairN ) lengthSign = -lengthSign;
	float subpixC = clamp( abs( subpixB ) * subpixRcpRange, 0.0, 1.0 );

	vec2 posB = posM;
	vec2 offNP = horzSpan ? vec2( uRcpFrame.x, 0.0 ) : vec2( 0.0, uRcpFrame.y );
	if ( ! horzSpan ) posB.x += lengthSign * 0.5;
	else posB.y += lengthSign * 0.5;

	vec2 posN = posB - offNP;
	vec2 posP = posB + offNP;
	float subpixD = -2.0 * subpixC + 3.0;
	float lumaEndN = exvsLuma( texture( uSource, posN ).rgb );
	float subpixE = subpixC * subpixC;
	float lumaEndP = exvsLuma( texture( uSource, posP ).rgb );

	if ( ! pairN ) { lumaNN = lumaSS; }
	float gradientScaled = gradient * 0.25;
	float lumaMM = lumaM - lumaNN * 0.5;
	float subpixF = subpixD * subpixE;
	bool lumaMLTZero = lumaMM < 0.0;

	lumaEndN -= lumaNN * 0.5;
	lumaEndP -= lumaNN * 0.5;
	bool doneN = abs( lumaEndN ) >= gradientScaled;
	bool doneP = abs( lumaEndP ) >= gradientScaled;
	bool doneNP = ( ! doneN ) || ( ! doneP );

	// Five steps: 1.0 is already taken above, then 1.5, 2.0, 4.0 and 12.0.
	for ( int i = 1; i < 5; i ++ ) {
		if ( ! doneNP ) break;
		float searchStep = exvsFxaaStep( i );
		if ( ! doneN ) posN -= offNP * searchStep;
		if ( ! doneP ) posP += offNP * searchStep;
		if ( ! doneN ) lumaEndN = exvsLuma( texture( uSource, posN ).rgb ) - lumaNN * 0.5;
		if ( ! doneP ) lumaEndP = exvsLuma( texture( uSource, posP ).rgb ) - lumaNN * 0.5;
		doneN = abs( lumaEndN ) >= gradientScaled;
		doneP = abs( lumaEndP ) >= gradientScaled;
		doneNP = ( ! doneN ) || ( ! doneP );
	}

	float dstN = horzSpan ? posM.x - posN.x : posM.y - posN.y;
	float dstP = horzSpan ? posP.x - posM.x : posP.y - posM.y;

	bool goodSpanN = ( lumaEndN < 0.0 ) != lumaMLTZero;
	float spanLength = dstP + dstN;
	bool goodSpanP = ( lumaEndP < 0.0 ) != lumaMLTZero;
	float spanLengthRcp = 1.0 / spanLength;

	bool directionN = dstN < dstP;
	float dst = min( dstN, dstP );
	bool goodSpan = directionN ? goodSpanN : goodSpanP;
	float subpixG = subpixF * subpixF;
	float pixelOffset = -dst * spanLengthRcp + 0.5;
	float subpixH = subpixG * uQualitySubpix;

	float pixelOffsetGood = goodSpan ? pixelOffset : 0.0;
	float pixelOffsetSubpix = max( pixelOffsetGood, subpixH );

	if ( ! horzSpan ) posM.x += pixelOffsetSubpix * lengthSign;
	else posM.y += pixelOffsetSubpix * lengthSign;

	outColor = vec4( texture( uSource, posM ).rgb, rgbyM.a );
}
`;
