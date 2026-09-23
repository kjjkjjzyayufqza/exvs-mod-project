/**
 * GLSL shared by every pass of the EXVS2 deferred renderer port.
 *
 * The encodings and BRDF terms here are transcriptions of the shipped OB shaders:
 * the G-buffer writer `ps-A46F9C9D4B98F6ED`, the tiled lighting dispatch
 * `cs-D3FABD508AD39F40` and the ambient pass `ps-9CA18D4459E4DBB5`. Constants are
 * reproduced exactly, including the ones that look arbitrary, because the look of
 * the game depends on them.
 *
 * Direct3D and WebGL differ in two ways that matter and in no others:
 *   - clip space depth is `[0, 1]` there and `[-1, 1]` here, so depth has to be
 *     rescaled before it meets a projection inverse;
 *   - matrices are row-major with row vectors there and column-major with column
 *     vectors here, so every `mul(v, M)` becomes `M * v`.
 * Neither changes any of the arithmetic below.
 */

/** Packs and unpacks the G-buffer, plus depth and flag helpers. */
export const EXVS_GBUFFER_CODEC_GLSL = /* glsl */ `
// Lambert azimuthal equal-area projection of a view-space normal into two
// channels. The shipped G-buffer writer stores the result in target 0 .xy.
vec2 exvsEncodeNormal( vec3 n ) {
	float f = sqrt( n.z * 8.0 + 8.0 );
	return n.xy / f + 0.5;
}

vec3 exvsDecodeNormal( vec2 enc ) {
	vec2 fenc = enc * 4.0 - 2.0;
	float f = dot( fenc, fenc );
	float g = sqrt( 1.0 - f * 0.25 );
	return vec3( fenc * g, 1.0 - f * 0.5 );
}

// The flag byte lives in target 2 .z as flags/255.
float exvsUnpackFlags( float packed ) {
	return floor( packed * 255.0 + 0.5 );
}

bool exvsHasFlag( float flags, float bit ) {
	return mod( floor( flags / bit ), 2.0 ) >= 1.0;
}

// The material class is the high nibble; only 0 (background) and 64 (chara) ship.
float exvsMaterialClass( float flags ) {
	return floor( flags / 16.0 ) * 16.0;
}

// The camera, shared by every pass that reads depth. Declared here rather than per
// shader so the logarithmic branch below has everything it needs wherever it runs.
uniform mat4 uExvsProjectionMatrix;
uniform mat4 uExvsProjectionInverse;
// three.js's logDepthBufFC: 2 / log2( far + 1 ). Zero when the depth buffer is linear.
uniform float uExvsLogDepthBufFC;

// Window depth to view space.
//
// Two differences from the shipped shader, neither of them arithmetic. Direct3D
// writes [0,1] clip depth where WebGL writes [-1,1], hence the rescale; and this
// canvas may be running three.js's logarithmic depth buffer, which stores
// log2( w + 1 ) * logDepthBufFC * 0.5 instead of the projected z. The second is
// inverted analytically rather than approximated.
vec3 exvsViewPositionFromDepth( vec2 screenUv, float deviceDepth ) {
	vec2 ndc = screenUv * 2.0 - 1.0;

	if ( uExvsLogDepthBufFC > 0.0 ) {
		float w = exp2( deviceDepth / ( uExvsLogDepthBufFC * 0.5 ) ) - 1.0;
		// w is the perspective divisor, which for a right-handed view is -z.
		float viewZ = -w;
		return vec3(
			ndc.x * w / uExvsProjectionMatrix[ 0 ][ 0 ],
			ndc.y * w / uExvsProjectionMatrix[ 1 ][ 1 ],
			viewZ
		);
	}

	vec4 clip = vec4( ndc, deviceDepth * 2.0 - 1.0, 1.0 );
	vec4 view = uExvsProjectionInverse * clip;
	return view.xyz / view.w;
}

// View-space depth alone, for the passes that only need the distance.
float exvsViewDepthFromDepth( float deviceDepth ) {
	if ( uExvsLogDepthBufFC > 0.0 ) {
		return -( exp2( deviceDepth / ( uExvsLogDepthBufFC * 0.5 ) ) - 1.0 );
	}
	vec4 clip = vec4( 0.0, 0.0, deviceDepth * 2.0 - 1.0, 1.0 );
	vec4 view = uExvsProjectionInverse * clip;
	return view.z / view.w;
}
`;

/**
 * The analytic BRDF the tiled lighting dispatch runs per light.
 *
 * `alpha` is `roughness * roughness` and `alpha2` its square, matching the
 * shipped code which squares the G-buffer roughness twice. The visibility term is
 * the Smith-Schlick denominator pair with `k = alpha / 2`, and the fresnel is
 * Karis's spherical gaussian rather than a `pow`.
 */
export const EXVS_BRDF_GLSL = /* glsl */ `
const float EXVS_INV_PI = 0.318309886;

float exvsDistributionGGX( float nDotH, float alpha2 ) {
	float d = nDotH * nDotH * ( alpha2 - 1.0 ) + 1.0;
	return alpha2 * EXVS_INV_PI / max( d * d, 1e-8 );
}

// 1 / ( 4 * G1(V) * G1(L) ), with the Smith-Schlick denominators kept separate so
// the view half can be hoisted out of the light loop exactly as the original does.
float exvsVisibilitySmith( float g1View, float nDotL, float alpha ) {
	float k = alpha * 0.5;
	float g1Light = ( 1.0 - k ) * nDotL + k;
	return 0.25 / max( g1View * g1Light, 1e-6 );
}

float exvsSmithG1Term( float nDotX, float alpha ) {
	float k = alpha * 0.5;
	return ( 1.0 - k ) * nDotX + k;
}

vec3 exvsFresnelSphericalGaussian( vec3 f0, float vDotH ) {
	float e = exp2( ( -5.55473 * vDotH - 6.98316 ) * vDotH );
	return f0 + ( 1.0 - f0 ) * e;
}

// Windowed inverse square falloff: saturate(1 - (d/r)^4)^2 / (d^2 + 0.001).
float exvsPointAttenuation( float distanceSq, float attenuationRadius ) {
	float d = sqrt( distanceSq );
	float t = d / max( attenuationRadius, 1e-4 );
	t = t * t;
	float window = max( 1.0 - t * t, 0.0 );
	window = window * window;
	return window / ( distanceSq + 0.001 );
}

// Lazarov's analytic environment BRDF, used by the ambient pass in place of a
// lookup table. The four constants are reproduced from the shipped shader.
vec3 exvsEnvBRDFApprox( vec3 f0, float roughness, float nDotV ) {
	const vec4 c0 = vec4( -1.0, -0.0275, -0.572, 0.022 );
	const vec4 c1 = vec4( 1.0, 0.0425, 1.04, -0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( -9.28 * nDotV ) ) * r.x + r.y;
	vec2 ab = vec2( -1.04, 1.04 ) * a004 + r.zw;
	return f0 * ab.x + ab.y;
}
`;

/**
 * Cube map conventions.
 *
 * The shipped ambient and rim passes both sample with the z axis negated, which
 * is the handedness flip between the engine's left-handed world and the cube
 * map's own frame. Reproducing it keeps reflections on the correct side.
 */
export const EXVS_CUBEMAP_GLSL = /* glsl */ `
vec3 exvsCubeDirection( vec3 dir ) {
	return vec3( dir.x, dir.y, -dir.z );
}

// Roughness to mip, as the ambient pass computes it: a Blinn power derived from
// the GGX alpha, mapped through an exponential and spread over the chain minus
// the three smallest levels.
float exvsSpecularCubeMip( float roughness, float mipCount ) {
	float alpha = roughness * roughness;
	float blinnPower = max( 2.0 / max( alpha * alpha, 1e-8 ) - 2.0, 0.0 );
	float t = exp( -10.0 / max( sqrt( blinnPower ), 1e-4 ) );
	t = clamp( ( t - 0.00098 ) * 1.007963, 0.0, 1.0 );
	return max( mipCount - 1.0 - 3.0, 0.0 ) * ( 1.0 - t );
}
`;

/** sRGB transfer helpers. The shipped shaders spell these out as log/exp pairs. */
export const EXVS_COLOR_GLSL = /* glsl */ `
vec3 exvsGammaDecode( vec3 c ) {
	return pow( max( c, vec3( 0.0 ) ), vec3( 2.2 ) );
}

vec3 exvsGammaEncode( vec3 c ) {
	return pow( max( c, vec3( 0.0 ) ), vec3( 0.454545 ) );
}

vec3 exvsRgbToHsv( vec3 c ) {
	vec4 k = vec4( 0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0 );
	vec4 p = mix( vec4( c.bg, k.wz ), vec4( c.gb, k.xy ), step( c.b, c.g ) );
	vec4 q = mix( vec4( p.xyw, c.r ), vec4( c.r, p.yzx ), step( p.x, c.r ) );
	float d = q.x - min( q.w, q.y );
	return vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + 1e-10 ) ), d / ( q.x + 1e-10 ), q.x );
}

vec3 exvsHsvToRgb( vec3 c ) {
	vec3 p = abs( fract( c.xxx + vec3( 1.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 );
	return c.z * mix( vec3( 1.0 ), clamp( p - 1.0, 0.0, 1.0 ), c.y );
}
`;

/** The fullscreen triangle every screen-space pass is drawn with. */
export const EXVS_FULLSCREEN_VERTEX_GLSL = /* glsl */ `
out vec2 vUv;

void main() {
	vUv = uv;
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

/** Concatenation helper so a pass can list only the blocks it uses. */
export function exvsGlsl(...blocks: string[]): string {
  return blocks.join("\n");
}
