export function shouldRecomputeNormalsDuringSkinning(
  isTransformDragging: boolean,
  motionDriving: boolean,
): boolean {
  return !isTransformDragging && !motionDriving;
}
