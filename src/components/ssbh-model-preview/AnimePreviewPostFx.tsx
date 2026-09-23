import { Bloom, EffectComposer } from "@react-three/postprocessing";

/**
 * Selective bloom for high-luminance emissive (psycho-frame style). Tuned for EXVS-like preview
 * together with mesh emissiveIntensity boosts in SsbhModelCanvas.
 */
export function AnimePreviewPostFx({
  intensity = 1.25,
  luminanceThreshold = 0.26,
  luminanceSmoothing = 0.16,
  radius = 0.58,
}: {
  intensity?: number;
  luminanceThreshold?: number;
  luminanceSmoothing?: number;
  radius?: number;
}) {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        mipmapBlur
        intensity={intensity}
        luminanceThreshold={luminanceThreshold}
        luminanceSmoothing={luminanceSmoothing}
        radius={radius}
      />
    </EffectComposer>
  );
}
