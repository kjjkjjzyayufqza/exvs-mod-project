import { Bloom, EffectComposer } from "@react-three/postprocessing";

/**
 * Selective bloom for high-luminance emissive (psycho-frame style). Tuned for EXVS-like preview
 * together with mesh emissiveIntensity boosts in SsbhModelCanvas.
 */
export function AnimePreviewPostFx() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur intensity={1.25} luminanceThreshold={0.26} luminanceSmoothing={0.16} radius={0.58} />
    </EffectComposer>
  );
}
