import { TransformControls } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  Matrix4,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BuiltMeshDraw, BoneJson, SkelDataJson } from "./types";
import { mat4FromSsbhColumns } from "./skeletonLines";

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

function BoneTree({
  boneIndex,
  bones,
  childrenByParent,
  refs,
}: {
  boneIndex: number;
  bones: BoneJson[];
  childrenByParent: number[][];
  refs: React.MutableRefObject<(Group | null)[]>;
}) {
  const kids = childrenByParent[boneIndex] ?? [];
  return (
    <group
      ref={(el) => {
        refs.current[boneIndex] = el;
      }}
      name={bones[boneIndex]!.name}
    >
      {kids.map((ci) => (
        <BoneTree
          key={ci}
          boneIndex={ci}
          bones={bones}
          childrenByParent={childrenByParent}
          refs={refs}
        />
      ))}
    </group>
  );
}

const _restLocalM = new Matrix4();
const _restPos = new Vector3();
const _restQuat = new Quaternion();
const _restScl = new Vector3();

function applyRestLocalMatrices(refs: (Group | null)[], bones: BoneJson[]) {
  for (let i = 0; i < bones.length; i++) {
    const g = refs[i];
    if (!g) continue;
    _restLocalM.copy(mat4FromSsbhColumns(bones[i]!.transform as number[][]));
    _restLocalM.decompose(_restPos, _restQuat, _restScl);
    g.position.copy(_restPos);
    g.quaternion.copy(_restQuat);
    g.scale.copy(_restScl);
    g.matrixAutoUpdate = true;
    g.updateMatrix();
  }
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
  selectedBoneIndex: number | null;
  transformMode: "translate" | "rotate" | "scale";
  poseResetNonce: number;
  showSkeletonLines: boolean;
  orbitControlsRef: React.RefObject<OrbitControlsImpl | null>;
};

export function BonePreviewRig({
  skel,
  draws,
  selectedBoneIndex,
  transformMode,
  poseResetNonce,
  showSkeletonLines,
  orbitControlsRef,
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

  const [armatureLayoutTick, setArmatureLayoutTick] = useState(0);

  const lineGeomRef = useRef<BufferGeometry | null>(null);

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

  const posScratch = useRef(new Vector3());

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
  }, [bones, poseResetNonce]);

  useFrame(() => {
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
  });

  const lineSegmentCount = useMemo(() => {
    let c = 0;
    for (let i = 0; i < bones.length; i++) {
      const p = bones[i]!.parent_index;
      if (p !== null && p !== undefined) c++;
    }
    return c;
  }, [bones]);

  const lineGeom = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(lineSegmentCount * 2 * 3), 3));
    lineGeomRef.current = g;
    return g;
  }, [lineSegmentCount]);

  const tcObject: Object3D | null =
    selectedBoneIndex !== null && selectedBoneIndex >= 0 && selectedBoneIndex < bones.length
      ? boneRefs.current[selectedBoneIndex]
      : null;

  return (
    <group ref={armatureRef}>
      {roots.map((ri) => (
        <BoneTree
          key={ri}
          boneIndex={ri}
          bones={bones}
          childrenByParent={childrenByParent}
          refs={boneRefs}
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
            const oc = orbitControlsRef.current;
            if (oc) oc.enabled = false;
          }}
          onMouseUp={() => {
            tcDragRef.current = false;
            const oc = orbitControlsRef.current;
            if (oc) oc.enabled = true;
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

export function resetSkinnedMeshesToBindPose(draws: BuiltMeshDraw[]) {
  for (const d of draws) {
    if (!d.skin) continue;
    const posAttr = d.geometry.getAttribute("position") as BufferAttribute;
    (posAttr.array as Float32Array).set(d.skin.bindPositions);
    posAttr.needsUpdate = true;
    d.geometry.computeVertexNormals();
  }
}
