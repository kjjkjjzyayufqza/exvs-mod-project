import * as THREE from "three";
import { ColladaLoader } from "three-stdlib";
import { ColladaExporter } from "three-stdlib";
import { FBXLoader } from "three-stdlib";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { copyFile, readFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import {
  getStoredDialogDefaultPath,
  rememberStoredDialogSelection,
} from "@/utils/dialogDefaultPathStore";
import {
  SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY,
  SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY,
  SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY,
} from "./sceneEditorSettings";

export interface DAEImportResult {
  fileName: string;
  filePath: string;
  scene: THREE.Group;
  blobUrl: string;
  boundingSize: THREE.Vector3;
}

export async function loadDAEFromPath(
  filePath: string,
  scaleFactor = 1,
): Promise<DAEImportResult> {
  const loader = new ColladaLoader();
  const content = await readFile(filePath);
  const text = new TextDecoder().decode(content);
  const blob = new Blob([text], { type: "application/xml" });
  const blobUrl = URL.createObjectURL(blob);

  const collada = await new Promise<any>((resolve, reject) => {
    loader.load(blobUrl, resolve, undefined, reject);
  });

  const fileName = filePath.split(/[/\\]/).pop() ?? "model.dae";

  // Bake the SSBH import scale into the preview scene root so the rendered mesh
  // matches the scaled numshb geometry and HKT collision the backend produces from
  // the same scale factor. buildImportedDaeDisplayRoot bakes this root scale into the
  // display geometry, so the viewport, the converted model, and the collision stay aligned.
  if (Number.isFinite(scaleFactor) && scaleFactor > 0 && scaleFactor !== 1) {
    collada.scene.scale.multiplyScalar(scaleFactor);
    collada.scene.updateMatrixWorld(true);
  }

  const bbox = new THREE.Box3().setFromObject(collada.scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  if (!size.x || !Number.isFinite(size.x)) size.x = 1;
  if (!size.y || !Number.isFinite(size.y)) size.y = 1;
  if (!size.z || !Number.isFinite(size.z)) size.z = 1;

  return {
    fileName,
    filePath,
    scene: collada.scene,
    blobUrl,
    boundingSize: size,
  };
}

export async function loadStaticMeshFromPath(
  filePath: string,
  scaleFactor = 1,
): Promise<DAEImportResult> {
  if (!filePath.toLowerCase().endsWith(".fbx")) {
    return loadDAEFromPath(filePath, scaleFactor);
  }

  const loader = new FBXLoader();
  const content = await readFile(filePath);
  const blob = new Blob([content], { type: "application/octet-stream" });
  const blobUrl = URL.createObjectURL(blob);
  const scene = await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(blobUrl, (object) => resolve(object as THREE.Group), undefined, reject);
  });

  const fileName = filePath.split(/[/\\]/).pop() ?? "model.fbx";
  if (Number.isFinite(scaleFactor) && scaleFactor > 0 && scaleFactor !== 1) {
    scene.scale.multiplyScalar(scaleFactor);
    scene.updateMatrixWorld(true);
  }

  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  if (!size.x || !Number.isFinite(size.x)) size.x = 1;
  if (!size.y || !Number.isFinite(size.y)) size.y = 1;
  if (!size.z || !Number.isFinite(size.z)) size.z = 1;

  return {
    fileName,
    filePath,
    scene,
    blobUrl,
    boundingSize: size,
  };
}

export async function loadDAEFromPaths(filePaths: string[]): Promise<DAEImportResult[]> {
  const results: DAEImportResult[] = [];
  for (const filePath of filePaths) {
    results.push(await loadStaticMeshFromPath(filePath));
  }
  return results;
}

export async function importDAEFiles(multiple = false): Promise<DAEImportResult[]> {
  const selected = await open({
    multiple,
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath: await getStoredDialogDefaultPath(SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY),
  });

  if (!selected) return [];

  const paths = Array.isArray(selected) ? selected : [selected];
  const lastPath = paths[paths.length - 1];
  if (lastPath) {
    await rememberStoredDialogSelection(SCENE_IMPORT_DAE_QUICK_DIALOG_PATH_KEY, lastPath, "file");
  }

  return loadDAEFromPaths(paths);
}

function parseDAE(exporter: InstanceType<typeof ColladaExporter>, object: THREE.Object3D): string {
  let callbackResult = "";
  const returned = exporter.parse(object, (res) => {
    callbackResult = res.data;
  }, {});
  const data = returned?.data ?? callbackResult;
  if (!data) {
    throw new Error("ColladaExporter produced empty output — object may lack exportable geometry");
  }
  return data;
}

export function serializeObjectAsDAE(object: THREE.Object3D): string {
  const exporter = new ColladaExporter();
  return parseDAE(exporter, object);
}

export function serializeDaeToBytes(object: THREE.Object3D): number[] {
  const content = serializeObjectAsDAE(object);
  return Array.from(new TextEncoder().encode(content));
}

type ModelExportUpAxis = "y_up" | "z_up";

interface ExportedTextureRef {
  sourcePath: string;
  relativePath: string;
}

interface FbxClusterRecord {
  clusterId: number;
  boneIndex: number;
  indexes: number[];
  weights: number[];
  transform: number[];
  transformLink: number[];
}

interface FbxSkinBinding {
  skinId: number;
  clusters: FbxClusterRecord[];
}

interface FbxBoneRecord {
  name: string;
  modelId: number;
  parentBoneIndex: number | null;
  localTranslation: [number, number, number];
  localRotation: [number, number, number];
  localScaling: [number, number, number];
  bindPoseMatrix: number[];
}

interface FbxExportPayload {
  records: FbxMeshExportRecord[];
  bones: FbxBoneRecord[];
  bindPoseId: number;
}

interface FbxMeshExportRecord {
  name: string;
  geometryId: number;
  modelId: number;
  materialId: number;
  textureId: number | null;
  videoId: number | null;
  materialName: string;
  textureRelativePath: string | null;
  vertices: number[];
  polygonVertexIndices: number[];
  normals: number[];
  uvs: number[];
  color: THREE.Color;
  skin?: FbxSkinBinding;
  bindPoseMatrix?: number[];
}

interface FbxTextureNameState {
  usedNames: Set<string>;
  sourceToRelative: Map<string, string>;
}

function sanitizeExportName(value: string): string {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "_");
  return cleaned || "export";
}

function normalizePathKey(value: string): string {
  return value.trim().replace(/\\/g, "/").toLowerCase();
}

function fileStem(value: string): string {
  const name = value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

function fileExtension(value: string): string {
  const name = value.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? value;
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function nextUniqueExportName(baseName: string, usedNames: Set<string>): string {
  let candidate = sanitizeExportName(baseName);
  if (!usedNames.has(candidate.toLowerCase())) {
    usedNames.add(candidate.toLowerCase());
    return candidate;
  }
  const extIdx = candidate.lastIndexOf(".");
  const stem = extIdx > 0 ? candidate.slice(0, extIdx) : candidate;
  const ext = extIdx > 0 ? candidate.slice(extIdx) : "";
  let index = 1;
  do {
    candidate = `${stem}_${index}${ext}`;
    index += 1;
  } while (usedNames.has(candidate.toLowerCase()));
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function formatFbxNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) < 1e-10) return "0";
  return Number(value.toFixed(7)).toString();
}

function formatFbxArray(values: number[]): string {
  return values.map(formatFbxNumber).join(",");
}

function matrixToFbxArray(matrix: THREE.Matrix4): number[] {
  return Array.from(matrix.elements);
}

function materialArray(material: THREE.Material | THREE.Material[] | undefined): THREE.Material[] {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

function firstMaterial(mesh: THREE.Mesh | THREE.InstancedMesh): THREE.Material | null {
  return materialArray(mesh.material)[0] ?? null;
}

function materialColor(material: THREE.Material | null): THREE.Color {
  const candidate = material as (THREE.Material & { color?: THREE.Color }) | null;
  return candidate?.color instanceof THREE.Color ? candidate.color : new THREE.Color(0.8, 0.8, 0.8);
}

function materialMap(material: THREE.Material | null): THREE.Texture | null {
  const candidate = material as (THREE.Material & { map?: THREE.Texture | null }) | null;
  return candidate?.map ?? null;
}

function textureSourcePath(texture: THREE.Texture | null): string | null {
  const data = texture?.userData as { sceneTexturePath?: unknown; sourcePath?: unknown } | undefined;
  const value = typeof data?.sceneTexturePath === "string"
    ? data.sceneTexturePath
    : typeof data?.sourcePath === "string"
      ? data.sourcePath
      : null;
  return value?.trim() || null;
}

async function exportTextureReference(
  sourcePath: string,
  outputDir: string,
  state: FbxTextureNameState,
): Promise<ExportedTextureRef> {
  const sourceKey = normalizePathKey(sourcePath);
  const cached = state.sourceToRelative.get(sourceKey);
  if (cached) return { sourcePath, relativePath: cached };

  const ext = fileExtension(sourcePath);
  const relativePath = nextUniqueExportName(
    ext === "nutexb" ? `${fileStem(sourcePath)}.png` : (sourcePath.replace(/\\/g, "/").split("/").pop() ?? "texture"),
    state.usedNames,
  );
  const outputPath = `${outputDir.replace(/[/\\]+$/, "")}/${relativePath}`;
  if (ext === "nutexb") {
    await invoke("nutexb_export_png", { inputPath: sourcePath, outputPath });
  } else {
    await copyFile(sourcePath, outputPath);
  }
  state.sourceToRelative.set(sourceKey, relativePath);
  return { sourcePath, relativePath };
}

function addTriangleFromGeometry(
  geometry: THREE.BufferGeometry,
  sourceIndices: [number, number, number],
  transform: THREE.Matrix4,
  normalMatrix: THREE.Matrix3,
  record: FbxMeshExportRecord,
  sourceVertexExportIndices?: Map<number, number[]>,
) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");

  for (let corner = 0; corner < 3; corner += 1) {
    const sourceIndex = sourceIndices[corner];
    const vertexIndex = record.vertices.length / 3;
    const p = new THREE.Vector3().fromBufferAttribute(position, sourceIndex).applyMatrix4(transform);
    record.vertices.push(p.x, p.y, p.z);

    if (normal) {
      const n = new THREE.Vector3().fromBufferAttribute(normal, sourceIndex).applyMatrix3(normalMatrix).normalize();
      record.normals.push(n.x, n.y, n.z);
    } else {
      record.normals.push(0, 1, 0);
    }

    if (uv) {
      const u = uv.getX(sourceIndex);
      // FBX consumers such as Blender expect the V axis to use the opposite
      // origin from the preview UV space we serialize from Three.js.
      const v = 1 - uv.getY(sourceIndex);
      record.uvs.push(u, v);
    } else {
      record.uvs.push(0, 0);
    }

    record.polygonVertexIndices.push(corner === 2 ? -vertexIndex - 1 : vertexIndex);

    if (sourceVertexExportIndices) {
      const exported = sourceVertexExportIndices.get(sourceIndex) ?? [];
      exported.push(vertexIndex);
      sourceVertexExportIndices.set(sourceIndex, exported);
    }
  }
}

function buildFbxMeshRecord(
  mesh: THREE.Mesh | THREE.InstancedMesh,
  transform: THREE.Matrix4,
  rootName: string,
  index: number,
  textureRelativePath: string | null,
  useBindPoseLocalSpace = false,
  sourceVertexExportIndices?: Map<number, number[]>,
): FbxMeshExportRecord | null {
  const sourceGeometry = mesh.geometry;
  if (!sourceGeometry?.getAttribute("position")) return null;

  const geometry = sourceGeometry.clone();
  if (!geometry.getAttribute("normal")) {
    geometry.computeVertexNormals();
  }

  const name = sanitizeExportName(mesh.name || `${rootName}_mesh_${index + 1}`);
  const vertexTransform = useBindPoseLocalSpace ? new THREE.Matrix4() : transform;
  const normalMatrix = useBindPoseLocalSpace
    ? new THREE.Matrix3()
    : new THREE.Matrix3().getNormalMatrix(transform);
  const record: FbxMeshExportRecord = {
    name,
    geometryId: 100000 + index * 10,
    modelId: 200000 + index * 10,
    materialId: 300000 + index * 10,
    textureId: textureRelativePath ? 400000 + index * 10 : null,
    videoId: textureRelativePath ? 500000 + index * 10 : null,
    materialName: `${name}_mat`,
    textureRelativePath,
    vertices: [],
    polygonVertexIndices: [],
    normals: [],
    uvs: [],
    color: materialColor(firstMaterial(mesh)),
  };

  const position = geometry.getAttribute("position");
  const indexed = geometry.index;
  const indexCount = indexed ? indexed.count : position.count;
  for (let i = 0; i + 2 < indexCount; i += 3) {
    const a = indexed ? indexed.getX(i) : i;
    const b = indexed ? indexed.getX(i + 1) : i + 1;
    const c = indexed ? indexed.getX(i + 2) : i + 2;
    addTriangleFromGeometry(
      geometry,
      [a, b, c],
      vertexTransform,
      normalMatrix,
      record,
      useBindPoseLocalSpace ? sourceVertexExportIndices : undefined,
    );
  }

  geometry.dispose();
  return record.vertices.length > 0 ? record : null;
}

function boneLocalTransform(bone: THREE.Bone): {
  translation: [number, number, number];
  rotation: [number, number, number];
  scaling: [number, number, number];
} {
  const euler = new THREE.Euler().setFromQuaternion(bone.quaternion, "XYZ");
  return {
    translation: [bone.position.x, bone.position.y, bone.position.z],
    rotation: [
      THREE.MathUtils.radToDeg(euler.x),
      THREE.MathUtils.radToDeg(euler.y),
      THREE.MathUtils.radToDeg(euler.z),
    ],
    scaling: [bone.scale.x, bone.scale.y, bone.scale.z],
  };
}

function collectBonesFromSkeleton(
  skeleton: THREE.Skeleton,
  rootInverse: THREE.Matrix4,
  baseModelId: number,
): FbxBoneRecord[] {
  skeleton.pose();
  const boneToIndex = new Map<THREE.Bone, number>();
  skeleton.bones.forEach((bone, index) => {
    boneToIndex.set(bone, index);
    bone.updateMatrixWorld(true);
  });

  return skeleton.bones.map((bone, index) => {
    const parentBone = bone.parent?.type === "Bone" ? (bone.parent as THREE.Bone) : null;
    const parentBoneIndex = parentBone ? (boneToIndex.get(parentBone) ?? null) : null;
    const local = boneLocalTransform(bone);
    const bindWorld = rootInverse.clone().multiply(bone.matrixWorld);
    return {
      name: sanitizeExportName(bone.name || `bone_${index + 1}`),
      modelId: baseModelId + index * 10,
      parentBoneIndex,
      localTranslation: local.translation,
      localRotation: local.rotation,
      localScaling: local.scaling,
      bindPoseMatrix: matrixToFbxArray(bindWorld),
    };
  });
}

function remapClusterIndexes(
  clusters: FbxClusterRecord[],
  sourceVertexExportIndices: Map<number, number[]>,
): FbxClusterRecord[] {
  return clusters.map((cluster) => {
    const indexes: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < cluster.indexes.length; i += 1) {
      const exported = sourceVertexExportIndices.get(cluster.indexes[i]) ?? [];
      for (const vertexIndex of exported) {
        indexes.push(vertexIndex);
        weights.push(cluster.weights[i]);
      }
    }
    return { ...cluster, indexes, weights };
  });
}

function collectSkinClusters(
  mesh: THREE.SkinnedMesh,
  rootInverse: THREE.Matrix4,
  skinId: number,
  clusterBaseId: number,
): FbxClusterRecord[] {
  const skeleton = mesh.skeleton;
  const geometry = mesh.geometry;
  const skinIndexAttr = geometry.getAttribute("skinIndex");
  const skinWeightAttr = geometry.getAttribute("skinWeight");
  if (!skinIndexAttr || !skinWeightAttr) return [];

  skeleton.pose();
  mesh.updateMatrixWorld(true);
  const meshWorld = rootInverse.clone().multiply(mesh.matrixWorld);

  const clustersByBone = new Map<number, { indexes: number[]; weights: number[] }>();
  const position = geometry.getAttribute("position");
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    for (let slot = 0; slot < skinIndexAttr.itemSize; slot += 1) {
      const boneIndex = skinIndexAttr.getComponent(vertexIndex, slot);
      const weight = skinWeightAttr.getComponent(vertexIndex, slot);
      if (weight <= 0) continue;
      const cluster = clustersByBone.get(boneIndex) ?? { indexes: [], weights: [] };
      cluster.indexes.push(vertexIndex);
      cluster.weights.push(weight);
      clustersByBone.set(boneIndex, cluster);
    }
  }

  const clusters: FbxClusterRecord[] = [];
  let clusterOffset = 0;
  clustersByBone.forEach((data, boneIndex) => {
    const bone = skeleton.bones[boneIndex];
    if (!bone) return;
    bone.updateMatrixWorld(true);
    const boneWorld = rootInverse.clone().multiply(bone.matrixWorld);
    const transform = boneWorld.clone().invert().multiply(meshWorld);
    clusters.push({
      clusterId: clusterBaseId + clusterOffset,
      boneIndex,
      indexes: data.indexes,
      weights: data.weights,
      transform: matrixToFbxArray(transform),
      transformLink: matrixToFbxArray(boneWorld),
    });
    clusterOffset += 1;
  });

  return clusters;
}

async function collectFbxExportPayload(
  object: THREE.Object3D,
  outputDir: string,
  exportTextures: boolean,
  textureState: FbxTextureNameState,
): Promise<FbxExportPayload> {
  object.updateMatrixWorld(true);
  const rootInverse = object.matrixWorld.clone().invert();
  const records: FbxMeshExportRecord[] = [];
  const texturePromises = new Map<THREE.Texture, Promise<ExportedTextureRef | null>>();

  let sharedSkeleton: THREE.Skeleton | null = null;
  object.traverse((child) => {
    if (sharedSkeleton) return;
    const skinned = child as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton) {
      sharedSkeleton = skinned.skeleton;
    }
  });

  const bones = sharedSkeleton
    ? collectBonesFromSkeleton(sharedSkeleton, rootInverse, 600000)
    : [];
  const bindPoseId = bones.length > 0 ? 800000 : 0;

  const getTextureRel = async (texture: THREE.Texture | null) => {
    if (!exportTextures || !texture) return null;
    const sourcePath = textureSourcePath(texture);
    if (!sourcePath) return null;
    let promise = texturePromises.get(texture);
    if (!promise) {
      promise = exportTextureReference(sourcePath, outputDir, textureState);
      texturePromises.set(texture, promise);
    }
    return (await promise)?.relativePath ?? null;
  };

  const meshEntries: Array<{
    mesh: THREE.Mesh | THREE.InstancedMesh;
    transform: THREE.Matrix4;
    isSkinned: boolean;
  }> = [];

  object.traverse((child) => {
    const maybeMesh = child as THREE.Mesh | THREE.InstancedMesh;
    if (!maybeMesh.isMesh && !(maybeMesh as THREE.InstancedMesh).isInstancedMesh) return;
    const skinned = maybeMesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      meshEntries.push({
        mesh: maybeMesh,
        transform: new THREE.Matrix4(),
        isSkinned: true,
      });
      return;
    }
    maybeMesh.updateWorldMatrix(true, false);
    if ((maybeMesh as THREE.InstancedMesh).isInstancedMesh) {
      const instanced = maybeMesh as THREE.InstancedMesh;
      const instanceMatrix = new THREE.Matrix4();
      for (let i = 0; i < instanced.count; i += 1) {
        instanced.getMatrixAt(i, instanceMatrix);
        meshEntries.push({
          mesh: instanced,
          transform: rootInverse.clone().multiply(instanced.matrixWorld).multiply(instanceMatrix),
          isSkinned: false,
        });
      }
    } else {
      meshEntries.push({
        mesh: maybeMesh,
        transform: rootInverse.clone().multiply(maybeMesh.matrixWorld),
        isSkinned: false,
      });
    }
  });

  for (const entry of meshEntries) {
    const material = firstMaterial(entry.mesh);
    const textureRel = await getTextureRel(materialMap(material));
    const sourceVertexExportIndices = entry.isSkinned ? new Map<number, number[]>() : undefined;
    const record = buildFbxMeshRecord(
      entry.mesh,
      entry.transform,
      object.name || "object",
      records.length,
      textureRel,
      entry.isSkinned,
      sourceVertexExportIndices,
    );
    if (!record) continue;

    if (entry.isSkinned && bones.length > 0 && sourceVertexExportIndices) {
      const skinnedMesh = entry.mesh as THREE.SkinnedMesh;
      skinnedMesh.updateMatrixWorld(true);
      record.bindPoseMatrix = matrixToFbxArray(rootInverse.clone().multiply(skinnedMesh.matrixWorld));
      const skinId = 700000 + records.length * 10;
      const clusterBaseId = 710000 + records.length * 100;
      const clusters = remapClusterIndexes(
        collectSkinClusters(skinnedMesh, rootInverse, skinId, clusterBaseId),
        sourceVertexExportIndices,
      );
      if (clusters.length > 0) {
        record.skin = { skinId, clusters };
      }
    }

    records.push(record);
  }

  return { records, bones, bindPoseId };
}

function serializeFbxExportPayload(
  payload: FbxExportPayload,
  sourceName: string,
  upAxis: ModelExportUpAxis,
): string {
  const { records, bones, bindPoseId } = payload;
  if (records.length === 0) {
    throw new Error("FBX export found no mesh geometry");
  }

  const upAxisIndex = upAxis === "z_up" ? 2 : 1;
  const textureCount = records.filter((record) => record.textureRelativePath).length;
  const skinnedRecords = records.filter((record) => record.skin);
  const clusterCount = skinnedRecords.reduce(
    (count, record) => count + (record.skin?.clusters.length ?? 0),
    0,
  );
  const deformerCount = skinnedRecords.length + clusterCount;
  const definitionCount =
    records.length * 3
    + textureCount * 2
    + bones.length
    + deformerCount
    + (bindPoseId > 0 ? 1 : 0);

  const lines: string[] = [];
  lines.push("; FBX 7.4.0 project file");
  lines.push("; Generated by EXVS2 Scene Editor");
  lines.push("FBXHeaderExtension:  {");
  lines.push("\tFBXHeaderVersion: 1003");
  lines.push("\tFBXVersion: 7400");
  lines.push("\tCreator: \"EXVS2 Scene Editor\"");
  lines.push("}");
  lines.push("GlobalSettings:  {");
  lines.push("\tVersion: 1000");
  lines.push("\tProperties70:  {");
  lines.push(`\t\tP: "UpAxis", "int", "Integer", "",${upAxisIndex}`);
  lines.push("\t\tP: \"UpAxisSign\", \"int\", \"Integer\", \"\",1");
  lines.push("\t\tP: \"FrontAxis\", \"int\", \"Integer\", \"\",2");
  lines.push("\t\tP: \"FrontAxisSign\", \"int\", \"Integer\", \"\",1");
  lines.push("\t\tP: \"CoordAxis\", \"int\", \"Integer\", \"\",0");
  lines.push("\t\tP: \"CoordAxisSign\", \"int\", \"Integer\", \"\",1");
  lines.push("\t\tP: \"UnitScaleFactor\", \"double\", \"Number\", \"\",1");
  lines.push("\t}");
  lines.push("}");
  lines.push("Definitions:  {");
  lines.push("\tVersion: 100");
  lines.push(`\tCount: ${definitionCount}`);
  lines.push(`\tObjectType: "Geometry" { Count: ${records.length} }`);
  lines.push(`\tObjectType: "Model" { Count: ${records.length + bones.length} }`);
  lines.push(`\tObjectType: "Material" { Count: ${records.length} }`);
  if (textureCount > 0) {
    lines.push(`\tObjectType: "Texture" { Count: ${textureCount} }`);
    lines.push(`\tObjectType: "Video" { Count: ${textureCount} }`);
  }
  if (deformerCount > 0) {
    lines.push(`\tObjectType: "Deformer" { Count: ${deformerCount} }`);
  }
  if (bindPoseId > 0) {
    lines.push("\tObjectType: \"Pose\" { Count: 1 }");
  }
  lines.push("}");
  lines.push("Objects:  {");

  for (const record of records) {
    lines.push(`\tGeometry: ${record.geometryId}, "Geometry::${record.name}", "Mesh" {`);
    lines.push(`\t\tVertices: *${record.vertices.length} {`);
    lines.push(`\t\t\ta: ${formatFbxArray(record.vertices)}`);
    lines.push("\t\t}");
    lines.push(`\t\tPolygonVertexIndex: *${record.polygonVertexIndices.length} {`);
    lines.push(`\t\t\ta: ${record.polygonVertexIndices.join(",")}`);
    lines.push("\t\t}");
    lines.push("\t\tGeometryVersion: 124");
    lines.push("\t\tLayerElementNormal: 0 {");
    lines.push("\t\t\tVersion: 101");
    lines.push("\t\t\tName: \"\"");
    lines.push("\t\t\tMappingInformationType: \"ByPolygonVertex\"");
    lines.push("\t\t\tReferenceInformationType: \"Direct\"");
    lines.push(`\t\t\tNormals: *${record.normals.length} {`);
    lines.push(`\t\t\t\ta: ${formatFbxArray(record.normals)}`);
    lines.push("\t\t\t}");
    lines.push("\t\t}");
    lines.push("\t\tLayerElementUV: 0 {");
    lines.push("\t\t\tVersion: 101");
    lines.push("\t\t\tName: \"UVChannel_1\"");
    lines.push("\t\t\tMappingInformationType: \"ByPolygonVertex\"");
    lines.push("\t\t\tReferenceInformationType: \"Direct\"");
    lines.push(`\t\t\tUV: *${record.uvs.length} {`);
    lines.push(`\t\t\t\ta: ${formatFbxArray(record.uvs)}`);
    lines.push("\t\t\t}");
    lines.push("\t\t}");
    lines.push("\t\tLayerElementMaterial: 0 {");
    lines.push("\t\t\tVersion: 101");
    lines.push("\t\t\tName: \"\"");
    lines.push("\t\t\tMappingInformationType: \"AllSame\"");
    lines.push("\t\t\tReferenceInformationType: \"IndexToDirect\"");
    lines.push("\t\t\tMaterials: *1 { a: 0 }");
    lines.push("\t\t}");
    lines.push("\t\tLayer: 0 {");
    lines.push("\t\t\tVersion: 100");
    lines.push("\t\t\tLayerElement: { Type: \"LayerElementNormal\" TypedIndex: 0 }");
    lines.push("\t\t\tLayerElement: { Type: \"LayerElementUV\" TypedIndex: 0 }");
    lines.push("\t\t\tLayerElement: { Type: \"LayerElementMaterial\" TypedIndex: 0 }");
    lines.push("\t\t}");
    lines.push("\t}");

    lines.push(`\tModel: ${record.modelId}, "Model::${record.name}", "Mesh" {`);
    lines.push("\t\tVersion: 232");
    lines.push("\t\tProperties70:  {");
    lines.push("\t\t\tP: \"Lcl Translation\", \"Lcl Translation\", \"\", \"A\",0,0,0");
    lines.push("\t\t\tP: \"Lcl Rotation\", \"Lcl Rotation\", \"\", \"A\",0,0,0");
    lines.push("\t\t\tP: \"Lcl Scaling\", \"Lcl Scaling\", \"\", \"A\",1,1,1");
    lines.push("\t\t}");
    lines.push("\t\tShading: T");
    lines.push("\t\tCulling: \"CullingOff\"");
    lines.push("\t}");

    lines.push(`\tMaterial: ${record.materialId}, "Material::${record.materialName}", "" {`);
    lines.push("\t\tVersion: 102");
    lines.push("\t\tShadingModel: \"phong\"");
    lines.push("\t\tMultiLayer: 0");
    lines.push("\t\tProperties70:  {");
    lines.push(`\t\t\tP: "DiffuseColor", "Color", "", "A",${formatFbxNumber(record.color.r)},${formatFbxNumber(record.color.g)},${formatFbxNumber(record.color.b)}`);
    lines.push("\t\t\tP: \"SpecularColor\", \"Color\", \"\", \"A\",0.2,0.2,0.2");
    lines.push("\t\t\tP: \"Shininess\", \"Number\", \"\", \"A\",20");
    lines.push("\t\t}");
    lines.push("\t}");

    if (record.textureRelativePath && record.textureId && record.videoId) {
      const textureName = sanitizeExportName(fileStem(record.textureRelativePath));
      lines.push(`\tTexture: ${record.textureId}, "Texture::${textureName}", "" {`);
      lines.push("\t\tType: \"TextureVideoClip\"");
      lines.push("\t\tVersion: 202");
      lines.push(`\t\tTextureName: "Texture::${textureName}"`);
      lines.push(`\t\tMedia: "Video::${textureName}"`);
      lines.push(`\t\tFileName: "${record.textureRelativePath}"`);
      lines.push(`\t\tRelativeFilename: "${record.textureRelativePath}"`);
      lines.push("\t\tModelUVTranslation: 0,0");
      lines.push("\t\tModelUVScaling: 1,1");
      lines.push("\t\tTexture_Alpha_Source: \"None\"");
      lines.push("\t\tCropping: 0,0,0,0");
      lines.push("\t}");
      lines.push(`\tVideo: ${record.videoId}, "Video::${textureName}", "Clip" {`);
      lines.push("\t\tType: \"Clip\"");
      lines.push(`\t\tFileName: "${record.textureRelativePath}"`);
      lines.push(`\t\tRelativeFilename: "${record.textureRelativePath}"`);
      lines.push("\t}");
    }

    if (record.skin) {
      lines.push(`\tDeformer: ${record.skin.skinId}, "Deformer::", "Skin" {`);
      lines.push("\t\tVersion: 101");
      for (const cluster of record.skin.clusters) {
        lines.push(`\t\tLink: ${cluster.clusterId}`);
      }
      lines.push("\t}");
      for (const cluster of record.skin.clusters) {
        lines.push(`\tSubDeformer: ${cluster.clusterId}, "SubDeformer::", "Cluster" {`);
        lines.push("\t\tVersion: 100");
        lines.push(`\t\tIndexes: *${cluster.indexes.length} {`);
        lines.push(`\t\t\ta: ${cluster.indexes.join(",")}`);
        lines.push("\t\t}");
        lines.push(`\t\tWeights: *${cluster.weights.length} {`);
        lines.push(`\t\t\ta: ${formatFbxArray(cluster.weights)}`);
        lines.push("\t\t}");
        lines.push(`\t\tTransform: ${formatFbxArray(cluster.transform)}`);
        lines.push(`\t\tTransformLink: ${formatFbxArray(cluster.transformLink)}`);
        lines.push("\t}");
      }
    }
  }

  for (const bone of bones) {
    lines.push(`\tModel: ${bone.modelId}, "Model::${bone.name}", "LimbNode" {`);
    lines.push("\t\tVersion: 232");
    lines.push("\t\tProperties70:  {");
    lines.push(`\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${formatFbxArray(bone.localTranslation)}`);
    lines.push(`\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",${formatFbxArray(bone.localRotation)}`);
    lines.push(`\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",${formatFbxArray(bone.localScaling)}`);
    lines.push("\t\t}");
    lines.push("\t\tShading: Y");
    lines.push("\t\tCulling: \"CullingOff\"");
    lines.push("\t}");
  }

  if (bindPoseId > 0) {
    const poseNodeCount = records.length + bones.length;
    lines.push(`\tPose: ${bindPoseId}, "Pose::BindPose", "BindPose" {`);
    lines.push("\t\tType: \"BindPose\"");
    lines.push("\t\tVersion: 100");
    lines.push(`\t\tNbPoseNodes: ${poseNodeCount}`);
    for (const record of records) {
      lines.push("\t\tPoseNode:  {");
      lines.push(`\t\t\tNode: ${record.modelId}`);
      const bindMatrix = record.bindPoseMatrix ?? matrixToFbxArray(new THREE.Matrix4());
      lines.push(`\t\t\tMatrix: ${formatFbxArray(bindMatrix)}`);
      lines.push("\t\t}");
    }
    for (const bone of bones) {
      lines.push("\t\tPoseNode:  {");
      lines.push(`\t\t\tNode: ${bone.modelId}`);
      lines.push(`\t\t\tMatrix: ${formatFbxArray(bone.bindPoseMatrix)}`);
      lines.push("\t\t}");
    }
    lines.push("\t}");
  }

  lines.push("}");
  lines.push("Connections:  {");
  for (const record of records) {
    lines.push(`\tC: "OO",${record.geometryId},${record.modelId}`);
    lines.push(`\tC: "OO",${record.modelId},0`);
    lines.push(`\tC: "OO",${record.materialId},${record.modelId}`);
    if (record.textureRelativePath && record.textureId && record.videoId) {
      lines.push(`\tC: "OO",${record.videoId},${record.textureId}`);
      lines.push(`\tC: "OP",${record.textureId},${record.materialId},"DiffuseColor"`);
    }
    if (record.skin) {
      lines.push(`\tC: "OO",${record.skin.skinId},${record.geometryId}`);
      for (const cluster of record.skin.clusters) {
        lines.push(`\tC: "OO",${cluster.clusterId},${record.skin.skinId}`);
        const bone = bones[cluster.boneIndex];
        if (bone) {
          lines.push(`\tC: "OO",${bone.modelId},${cluster.clusterId}`);
        }
      }
    }
  }
  for (const bone of bones) {
    if (bone.parentBoneIndex === null) {
      lines.push(`\tC: "OO",${bone.modelId},0`);
      continue;
    }
    const parent = bones[bone.parentBoneIndex];
    if (parent) {
      lines.push(`\tC: "OO",${bone.modelId},${parent.modelId}`);
    }
  }
  if (bindPoseId > 0) {
    lines.push(`\tC: "OO",${bindPoseId},0`);
  }
  lines.push("}");
  lines.push(`; Source: ${sourceName}`);
  return `${lines.join("\n")}\n`;
}

export async function buildFbxExportContent(
  object: THREE.Object3D,
  options?: {
    outputDir?: string;
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
    textureState?: FbxTextureNameState;
  },
): Promise<string> {
  const textureState = options?.textureState ?? {
    usedNames: new Set<string>(),
    sourceToRelative: new Map<string, string>(),
  };
  const payload = await collectFbxExportPayload(
    object,
    options?.outputDir ?? "",
    options?.exportTextures ?? false,
    textureState,
  );
  return serializeFbxExportPayload(payload, object.name || "object", options?.upAxis ?? "y_up");
}

/**
 * Deprecated frontend FBX export path.
 * Keep this as a stopgap until a Rust-side SSBH -> FBX exporter backed by a
 * maintained high-level library is available. Avoid expanding this surface area
 * for new export features.
 */
export async function writeObjectAsFBX(
  object: THREE.Object3D,
  filePath: string,
  options?: {
    outputDir?: string;
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
    textureState?: FbxTextureNameState;
  },
): Promise<string> {
  const outputDir = options?.outputDir ?? filePath.replace(/[/\\][^/\\]*$/, "");
  const textureState = options?.textureState ?? { usedNames: new Set<string>(), sourceToRelative: new Map<string, string>() };
  const payload = await collectFbxExportPayload(object, outputDir, options?.exportTextures ?? false, textureState);
  const content = serializeFbxExportPayload(payload, object.name || "object", options?.upAxis ?? "y_up");
  await writeTextFile(filePath, content);
  return filePath;
}

export async function writeObjectAsDAE(
  object: THREE.Object3D,
  filePath: string,
): Promise<string> {
  const content = serializeObjectAsDAE(object);
  await writeTextFile(filePath, content);
  return filePath;
}

export async function exportObjectAsDAE(
  object: THREE.Object3D,
  defaultName = "export",
): Promise<string | null> {
  const storedDir = await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY);
  const defaultPath = storedDir
    ? `${storedDir.replace(/[/\\]+$/, "")}\\${defaultName}.dae`
    : `${defaultName}.dae`;
  const filePath = await save({
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath,
  });
  if (!filePath) return null;
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY, filePath, "file");

  const exporter = new ColladaExporter();
  const content = parseDAE(exporter, object);
  await writeTextFile(filePath, content);
  toast.success(`Exported: ${filePath.split(/[/\\]/).pop()}`);
  return filePath;
}

export async function exportMultipleObjectsAsDAE(
  objects: Array<{ object: THREE.Object3D; name: string }>,
): Promise<string[]> {
  const outputDir = await open({
    directory: true,
    title: "Select output folder for DAE export",
    defaultPath: await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY),
  });
  if (!outputDir) return [];
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY, outputDir, "directory");

  const exporter = new ColladaExporter();
  const exported: string[] = [];

  for (const { object, name } of objects) {
    const content = parseDAE(exporter, object);
    const filePath = `${outputDir}/${name}.dae`;
    await writeTextFile(filePath, content);
    exported.push(filePath);
  }

  toast.success(`Exported ${exported.length} DAE files`);
  return exported;
}

export async function exportObjectsAsDAEToDirectory(
  objects: Array<{ object: THREE.Object3D; name: string }>,
  outputDir: string,
): Promise<string[]> {
  const exporter = new ColladaExporter();
  const exported: string[] = [];

  for (const { object, name } of objects) {
    const content = parseDAE(exporter, object);
    const safeName = sanitizeExportName(name);
    const filePath = `${outputDir.replace(/[/\\]+$/, "")}/${safeName}.dae`;
    await writeTextFile(filePath, content);
    exported.push(filePath);
  }

  return exported;
}

export async function exportObjectsAsFBXToDirectory(
  objects: Array<{ object: THREE.Object3D; name: string }>,
  outputDir: string,
  options?: {
    exportTextures?: boolean;
    upAxis?: ModelExportUpAxis;
  },
): Promise<string[]> {
  const exported: string[] = [];
  const textureState: FbxTextureNameState = {
    usedNames: new Set<string>(),
    sourceToRelative: new Map<string, string>(),
  };

  for (const { object, name } of objects) {
    const safeName = sanitizeExportName(name);
    const filePath = `${outputDir.replace(/[/\\]+$/, "")}/${safeName}.fbx`;
    await writeObjectAsFBX(object, filePath, {
      outputDir,
      exportTextures: options?.exportTextures ?? false,
      upAxis: options?.upAxis ?? "y_up",
      textureState,
    });
    exported.push(filePath);
  }

  return exported;
}

// ── Rust-backed SSBH → DAE export (high performance) ──────────────────────

export interface BatchDaeExportEntry {
  rootPath: string;
  outputName: string;
}

export interface BatchDaeExportedFile {
  name: string;
  path: string;
  meshCount: number;
  vertexCount: number;
}

export interface BatchDaeExportResult {
  exported: BatchDaeExportedFile[];
  errors: string[];
  totalExported: number;
  totalFailed: number;
}

export async function batchExportStageDae(
  entries: BatchDaeExportEntry[],
  options?: {
    scaleFactor?: number;
    upAxis?: string;
    exportTextures?: boolean;
  },
): Promise<BatchDaeExportResult | null> {
  const outputDir = await open({
    directory: true,
    title: "Select output folder for batch DAE export",
    defaultPath: await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY),
  });
  if (!outputDir) return null;
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FOLDER_DIALOG_PATH_KEY, outputDir, "directory");

  return exportStageDaeBatchToDirectory(entries, outputDir, options);
}

export async function exportStageDaeBatchToDirectory(
  entries: BatchDaeExportEntry[],
  outputDir: string,
  options?: {
    scaleFactor?: number;
    upAxis?: string;
    exportTextures?: boolean;
  },
): Promise<BatchDaeExportResult> {
  const result = await invoke<BatchDaeExportResult>("stage_batch_export_dae", {
    outputDir,
    entries,
    scaleFactor: options?.scaleFactor ?? 1.0,
    upAxis: options?.upAxis ?? "y_up",
    exportTextures: options?.exportTextures ?? false,
  });

  if (result.totalFailed > 0) {
    toast.warning(
      `Exported ${result.totalExported}, failed ${result.totalFailed}`,
      { description: result.errors.slice(0, 3).join("\n") },
    );
  } else {
    toast.success(`Exported ${result.totalExported} DAE files`);
  }
  return result;
}

export async function exportSingleStageDae(
  rootPath: string,
  options?: {
    scaleFactor?: number;
    upAxis?: string;
    exportTextures?: boolean;
  },
): Promise<{ path: string; meshCount: number; vertexCount: number } | null> {
  const baseName = rootPath.split(/[/\\]/).pop() ?? "export";
  const storedDir = await getStoredDialogDefaultPath(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY);
  const defaultPath = storedDir
    ? `${storedDir.replace(/[/\\]+$/, "")}\\${baseName}.dae`
    : `${baseName}.dae`;
  const outputPath = await save({
    filters: [{ name: "Collada DAE", extensions: ["dae"] }],
    defaultPath,
  });
  if (!outputPath) return null;
  await rememberStoredDialogSelection(SCENE_EXPORT_DAE_FILE_DIALOG_PATH_KEY, outputPath, "file");

  const result = await invoke<{ path: string; meshCount: number; vertexCount: number }>(
    "stage_export_single_dae",
    {
      rootPath,
      outputPath,
      scaleFactor: options?.scaleFactor ?? 1.0,
      upAxis: options?.upAxis ?? "y_up",
      exportTextures: options?.exportTextures ?? false,
    },
  );

  toast.success(`Exported: ${result.path.split(/[/\\]/).pop()}`);
  return result;
}
