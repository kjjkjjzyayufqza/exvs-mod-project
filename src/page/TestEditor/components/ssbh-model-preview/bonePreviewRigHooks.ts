import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { Box3, BufferAttribute, BufferGeometry, Group, LineBasicMaterial, Matrix4, Vector3 } from "three";
import { decodeBonePoseInto, encodeBonePose } from "./bonePoseHistory";
import { applyRestLocalMatrices } from "./bonePreviewRigInternals";
import type { BoneJson, BuiltMeshDraw } from "./types";

export function useDisposableLineMaterial(): LineBasicMaterial {
  const lineMat = useMemo(
    () =>
      new LineBasicMaterial({
        color: "#fbbf24",
        depthTest: true,
        transparent: true,
        opacity: 0.95,
      }),
    [],
  );
  useEffect(() => {
    return () => lineMat.dispose();
  }, [lineMat]);
  return lineMat;
}

export function useArmatureRestAndInvBind(
  armatureRef: RefObject<Group | null>,
  boneRefs: MutableRefObject<(Group | null)[]>,
  invBindRef: MutableRefObject<Matrix4[]>,
  paletteRef: MutableRefObject<Matrix4[]>,
  bones: BoneJson[],
  poseResetNonce: number,
  setArmatureLayoutTick: Dispatch<SetStateAction<number>>,
): void {
  useLayoutEffect(() => {
    applyRestLocalMatrices(boneRefs.current, bones);
    armatureRef.current?.updateMatrixWorld(true);
    const n = bones.length;
    while (invBindRef.current.length < n) {
      invBindRef.current.push(new Matrix4());
      paletteRef.current.push(new Matrix4());
    }
    invBindRef.current.length = n;
    paletteRef.current.length = n;
    for (let i = 0; i < n; i++) {
      const g = boneRefs.current[i];
      if (g) {
        invBindRef.current[i]!.copy(g.matrixWorld).invert();
      } else {
        invBindRef.current[i]!.identity();
      }
    }
    setArmatureLayoutTick((t) => t + 1);
  }, [bones, poseResetNonce, setArmatureLayoutTick]);
}

/**
 * Keeps context ref in sync with current bone transforms. Updates during render; clears on unmount only.
 */
export function useBonePoseGetterRef(
  bonePoseGetterRef: MutableRefObject<(() => Float32Array) | null>,
  boneRefs: MutableRefObject<(Group | null)[]>,
  boneCount: number,
  enabled = true,
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    const fn = () => encodeBonePose(boneRefs.current, boneCount);
    bonePoseGetterRef.current = fn;
    return () => {
      if (bonePoseGetterRef.current === fn) {
        bonePoseGetterRef.current = null;
      }
    };
  }, [bonePoseGetterRef, enabled, boneCount]);
}

export function useBonePoseApplyLayout(
  armatureRef: RefObject<Group | null>,
  boneRefs: MutableRefObject<(Group | null)[]>,
  bonesLength: number,
  bonePoseApplyNonce: number,
  bonePoseToApply: Float32Array | null,
  onBonePoseApplyConsumed: () => void,
  enabled = true,
): void {
  useLayoutEffect(() => {
    if (!enabled) return;
    if (bonePoseToApply === null) return;
    decodeBonePoseInto(bonePoseToApply, boneRefs.current, bonesLength);
    armatureRef.current?.updateMatrixWorld(true);
    onBonePoseApplyConsumed();
  }, [enabled, bonePoseApplyNonce, bonePoseToApply, bonesLength, onBonePoseApplyConsumed]);
}

export function useJointPickRadiusFromBounds(
  armatureRef: RefObject<Group | null>,
  bones: BoneJson[],
  draws: BuiltMeshDraw[],
  poseResetNonce: number,
): number {
  const [jointPickRadius, setJointPickRadius] = useState(0.028);

  useLayoutEffect(() => {
    const root = armatureRef.current?.parent;
    if (!root) return;
    const box = new Box3().setFromObject(root);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    setJointPickRadius(Math.max(0.012, Math.min(0.09, maxDim * 0.017)));
  }, [bones, draws, poseResetNonce]);

  return jointPickRadius;
}

export function useSkeletonLineGeometry(lineSegmentCount: number): {
  lineGeom: BufferGeometry;
  lineGeomRef: MutableRefObject<BufferGeometry | null>;
} {
  const lineGeomRef = useRef<BufferGeometry | null>(null);
  const lineGeom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(lineSegmentCount * 2 * 3), 3));
    lineGeomRef.current = g;
    return g;
  }, [lineSegmentCount]);
  return { lineGeom, lineGeomRef };
}
