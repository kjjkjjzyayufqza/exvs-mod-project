import { TransformControls, useCursor } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import { BufferAttribute, Group, Matrix4, Object3D, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { bonePosesEqual, encodeBonePose } from "./bonePoseHistory";
import {
  useArmatureRestAndInvBind,
  useBonePoseApplyLayout,
  useBonePoseGetterRef,
  useDisposableLineMaterial,
  useJointPickRadiusFromBounds,
  useSkeletonLineGeometry,
} from "./bonePreviewRigHooks";
import type { BuiltMeshDraw, BoneJson, SkelDataJson } from "./types";

function buildChildrenByParent(bones: BoneJson[]): number[][] {
  const ch: number[][] = bones.map(() => []);
  for (let i = 0; i < bones.length; i++) {
    const p = bones[i]!.parent_index;
    if (p !== null && p !== undefined && p >= 0 && p < bones.length) {
      ch[p]!.push(i);
    }
  }
  return ch;
}

function rootBoneIndices(bones: BoneJson[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bones.length; i++) {
    const p = bones[i]!.parent_index;
    if (p === null || p === undefined) {
      out.push(i);
    }
  }
  return out;
}

function BoneJointHit({
  boneIndex,
  selected,
  radius,
  onSelect,
}: {
  boneIndex: number;
  selected: boolean;
  radius: number;
  onSelect: (index: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  return (
    <mesh
      onPointerDown={(e) => {
        e.stopPropagation();
        onSelect(boneIndex);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        setHovered(false);
      }}
    >
      <sphereGeometry args={[radius, 18, 18]} />
      <meshBasicMaterial
        color={selected ? "#22c55e" : hovered ? "#94a3b8" : "#64748b"}
        transparent
        opacity={selected ? 0.58 : hovered ? 0.4 : 0.26}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function BoneTree({
  boneIndex,
  bones,
  childrenByParent,
  refs,
  selectedBoneIndex,
  jointPickRadius,
  onSelectBone,
}: {
  boneIndex: number;
  bones: BoneJson[];
  childrenByParent: number[][];
  refs: React.MutableRefObject<(Group | null)[]>;
  selectedBoneIndex: number | null;
  jointPickRadius: number;
  onSelectBone: (index: number) => void;
}) {
  const kids = childrenByParent[boneIndex] ?? [];
  const selected = selectedBoneIndex === boneIndex;
  return (
    <group
      ref={(el) => {
        refs.current[boneIndex] = el;
      }}
      name={bones[boneIndex]!.name}
    >
      <BoneJointHit
        boneIndex={boneIndex}
        selected={selected}
        radius={jointPickRadius}
        onSelect={onSelectBone}
      />
      {kids.map((ci) => (
        <BoneTree
          key={ci}
          boneIndex={ci}
          bones={bones}
          childrenByParent={childrenByParent}
          refs={refs}
          selectedBoneIndex={selectedBoneIndex}
          jointPickRadius={jointPickRadius}
          onSelectBone={onSelectBone}
        />
      ))}
    </group>
  );
}

const _pal = new Matrix4();
const _acc = new Vector3();
const _tmpV = new Vector3();

function applyCpuSkinning(draw: BuiltMeshDraw, palette: Matrix4[], updateNormals: boolean) {
  const skin = draw.skin;
  if (!skin) return;
  const posAttr = draw.geometry.getAttribute("position") as BufferAttribute;
  const out = posAttr.array as Float32Array;
  const bind = skin.bindPositions;
  const idx = skin.boneIndices;
  const wt = skin.boneWeights;
  const n = posAttr.count;
  for (let v = 0; v < n; v++) {
    const bx = bind[v * 3]!;
    const by = bind[v * 3 + 1]!;
    const bz = bind[v * 3 + 2]!;
    let wsum = 0;
    for (let k = 0; k < 4; k++) {
      wsum += wt[v * 4 + k]!;
    }
    if (wsum < 1e-8) {
      out[v * 3] = bx;
      out[v * 3 + 1] = by;
      out[v * 3 + 2] = bz;
      continue;
    }
    _acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const wk = wt[v * 4 + k]!;
      if (wk <= 0) continue;
      const bi = idx[v * 4 + k]!;
      _pal.copy(palette[bi]!);
      _tmpV.set(bx, by, bz);
      _tmpV.applyMatrix4(_pal);
      _acc.addScaledVector(_tmpV, wk);
    }
    out[v * 3] = _acc.x;
    out[v * 3 + 1] = _acc.y;
    out[v * 3 + 2] = _acc.z;
  }
  posAttr.needsUpdate = true;
  if (updateNormals) {
    draw.geometry.computeVertexNormals();
  }
}

type BonePreviewRigProps = {
  skel: SkelDataJson;
  draws: BuiltMeshDraw[];
  /** When false, skinning still runs but gizmo, picking, and pose ref sync are disabled (multi-instance preview). */
  isInteractionTarget?: boolean;
  selectedBoneIndex: number | null;
  transformMode: "translate" | "rotate" | "scale";
  poseResetNonce: number;
  showSkeletonLines: boolean;
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
  onSelectBone: (index: number) => void;
  bonePoseGetterRef: React.MutableRefObject<(() => Float32Array) | null>;
  bonePoseApplyNonce: number;
  bonePoseToApply: Float32Array | null;
  onBonePoseApplyConsumed: () => void;
  onBonePoseCommit: (beforeTransformSnapshot: Float32Array) => void;
};

export function BonePreviewRig({
  skel,
  draws,
  isInteractionTarget = true,
  selectedBoneIndex,
  transformMode,
  poseResetNonce,
  showSkeletonLines,
  orbitControlsRef,
  onSelectBone,
  bonePoseGetterRef,
  bonePoseApplyNonce,
  bonePoseToApply,
  onBonePoseApplyConsumed,
  onBonePoseCommit,
}: BonePreviewRigProps) {
  const bones = skel.bones;
  const childrenByParent = useMemo(() => buildChildrenByParent(bones), [bones]);
  const roots = useMemo(() => rootBoneIndices(bones), [bones]);

  const armatureRef = useRef<Group>(null);
  const boneRefs = useRef<(Group | null)[]>([]);
  boneRefs.current.length = bones.length;

  const invBindRef = useRef<Matrix4[]>([]);
  const paletteRef = useRef<Matrix4[]>([]);
  const tcDragRef = useRef(false);
  const needsSkinningUpdateRef = useRef(true);
  const lastPoseResetNonceRef = useRef(poseResetNonce);
  const tcDragStartPoseRef = useRef<Float32Array | null>(null);

  const [armatureLayoutTick, setArmatureLayoutTick] = useState(0);

  const lineMat = useDisposableLineMaterial();
  const posScratch = useRef(new Vector3());

  useArmatureRestAndInvBind(
    armatureRef,
    boneRefs,
    invBindRef,
    paletteRef,
    bones,
    poseResetNonce,
    setArmatureLayoutTick,
  );

  useBonePoseGetterRef(bonePoseGetterRef, boneRefs, bones.length, isInteractionTarget);

  useBonePoseApplyLayout(
    armatureRef,
    boneRefs,
    bones.length,
    bonePoseApplyNonce,
    bonePoseToApply,
    onBonePoseApplyConsumed,
    isInteractionTarget,
  );
  if (bonePoseToApply !== null && isInteractionTarget) {
    needsSkinningUpdateRef.current = true;
  }
  if (lastPoseResetNonceRef.current !== poseResetNonce) {
    lastPoseResetNonceRef.current = poseResetNonce;
    needsSkinningUpdateRef.current = true;
  }

  const jointPickRadius = useJointPickRadiusFromBounds(armatureRef, bones, draws, poseResetNonce);

  const lineSegmentCount = useMemo(() => {
    let c = 0;
    for (let i = 0; i < bones.length; i++) {
      const p = bones[i]!.parent_index;
      if (p !== null && p !== undefined) c++;
    }
    return c;
  }, [bones]);

  const { lineGeom, lineGeomRef } = useSkeletonLineGeometry(lineSegmentCount);

  useFrame(() => {
    const shouldUpdateNow = tcDragRef.current || needsSkinningUpdateRef.current;
    if (!shouldUpdateNow) return;
    armatureRef.current?.updateMatrixWorld(true);
    const pal = paletteRef.current;
    const ib = invBindRef.current;
    for (let b = 0; b < bones.length; b++) {
      const g = boneRefs.current[b];
      if (g) {
        pal[b]!.multiplyMatrices(g.matrixWorld, ib[b]!);
      }
    }
    const updateNormals = !tcDragRef.current;
    for (const d of draws) {
      if (d.skin) {
        applyCpuSkinning(d, pal, updateNormals);
      }
    }

    if (showSkeletonLines && lineGeomRef.current) {
      const positions = lineGeomRef.current.getAttribute("position") as BufferAttribute;
      const arr = positions.array as Float32Array;
      let o = 0;
      for (let i = 0; i < bones.length; i++) {
        const p = bones[i]!.parent_index;
        if (p === null || p === undefined) continue;
        const gp = boneRefs.current[p];
        const gc = boneRefs.current[i];
        if (!gp || !gc) continue;
        gp.getWorldPosition(posScratch.current);
        arr[o++] = posScratch.current.x;
        arr[o++] = posScratch.current.y;
        arr[o++] = posScratch.current.z;
        gc.getWorldPosition(posScratch.current);
        arr[o++] = posScratch.current.x;
        arr[o++] = posScratch.current.y;
        arr[o++] = posScratch.current.z;
      }
      positions.needsUpdate = true;
    }
    if (!tcDragRef.current) {
      needsSkinningUpdateRef.current = false;
    }
  });

  const effectiveSelected = isInteractionTarget ? selectedBoneIndex : null;

  const tcObject: Object3D | null =
    isInteractionTarget &&
    selectedBoneIndex !== null &&
    selectedBoneIndex >= 0 &&
    selectedBoneIndex < bones.length
      ? boneRefs.current[selectedBoneIndex]
      : null;

  const onBoneSelect = isInteractionTarget ? onSelectBone : () => {};

  return (
    <group ref={armatureRef}>
      {roots.map((ri) => (
        <BoneTree
          key={ri}
          boneIndex={ri}
          bones={bones}
          childrenByParent={childrenByParent}
          refs={boneRefs}
          selectedBoneIndex={effectiveSelected}
          jointPickRadius={jointPickRadius}
          onSelectBone={onBoneSelect}
        />
      ))}
      {showSkeletonLines && lineSegmentCount > 0 ? (
        <lineSegments geometry={lineGeom}>
          <primitive attach="material" object={lineMat} />
        </lineSegments>
      ) : null}
      {tcObject ? (
        <TransformControls
          key={`${selectedBoneIndex}-${poseResetNonce}-${armatureLayoutTick}`}
          object={tcObject}
          mode={transformMode}
          onMouseDown={() => {
            tcDragRef.current = true;
            needsSkinningUpdateRef.current = true;
            tcDragStartPoseRef.current = new Float32Array(encodeBonePose(boneRefs.current, bones.length));
            const oc = orbitControlsRef.current;
            if (oc) oc.enabled = false;
          }}
          onMouseUp={() => {
            tcDragRef.current = false;
            needsSkinningUpdateRef.current = true;
            const oc = orbitControlsRef.current;
            if (oc) oc.enabled = true;
            const start = tcDragStartPoseRef.current;
            tcDragStartPoseRef.current = null;
            if (start) {
              const end = encodeBonePose(boneRefs.current, bones.length);
              if (!bonePosesEqual(start, end)) {
                onBonePoseCommit(start);
              }
            }
            for (const d of draws) {
              if (d.skin) {
                d.geometry.computeVertexNormals();
              }
            }
          }}
        />
      ) : null}
    </group>
  );
}
