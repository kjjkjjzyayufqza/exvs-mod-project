export type MotionClipLoadPolicyInput = {
  loadKey: string;
  attemptedLoadKey: string | null;
  hasClip: boolean;
  sampling: boolean;
  sampleError: string | null;
};

export function shouldStartMotionClipLoad({
  loadKey,
  attemptedLoadKey,
  hasClip,
  sampling,
  sampleError,
}: MotionClipLoadPolicyInput): boolean {
  if (sampling) {
    return false;
  }
  if (attemptedLoadKey !== loadKey) {
    return true;
  }
  if (hasClip || sampleError !== null) {
    return false;
  }
  return false;
}
