import type { SsbhModelPreviewInstance } from "./types";

export function hasAnyPreviewSkeleton(previewInstances: readonly SsbhModelPreviewInstance[]): boolean {
  return previewInstances.some((instance) => instance.bundle.skel !== null);
}

export function shouldRenderPreviewSkeletonLines(
  showSkeleton: boolean,
  previewInstances: readonly SsbhModelPreviewInstance[],
): boolean {
  return showSkeleton && hasAnyPreviewSkeleton(previewInstances);
}
