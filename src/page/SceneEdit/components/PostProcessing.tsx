import {
    Bloom,
    DepthOfField,
    EffectComposer,
    Noise,
    Vignette,
    FXAA,
    SMAA,
    ToneMapping,
    SSAO
} from '@react-three/postprocessing';

export function PostProcessing() {
    return (
        <EffectComposer>
            {/* Anti-aliasing effects */}
            <FXAA />
            <SMAA />

            {/* Depth and lighting effects */}
            <DepthOfField focusDistance={0} focalLength={0.005} bokehScale={0.1} height={480} />
            <Bloom luminanceThreshold={0} luminanceSmoothing={0.9} height={300} />

            {/* Ambient occlusion */}
            <SSAO />

            {/* Color and tone effects */}
            <ToneMapping />

            {/* Final effects */}
        </EffectComposer>
    );
}
