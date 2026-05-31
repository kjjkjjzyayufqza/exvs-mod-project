/**
 * Re-export of the shared SSBH texture pool. The implementation now lives in
 * `@/components/ssbh-model-preview/ssbhTextureUpload` so the Scene Editor
 * (`MapViewport`) and the Unit Model preview (`SsbhModelCanvas`) share one pool.
 */
export { SceneTexturePool } from "@/components/ssbh-model-preview/ssbhTextureUpload";
