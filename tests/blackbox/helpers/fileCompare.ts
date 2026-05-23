import fs from "fs/promises";
import path from "path";

export type DirDiffResult = {
  identical: boolean;
  onlyInA: string[];
  onlyInB: string[];
  different: string[];
  sameCount: number;
};

export async function compareDirectories(
  dirA: string,
  dirB: string,
): Promise<DirDiffResult> {
  const filesA = await collectFileSet(dirA);
  const filesB = await collectFileSet(dirB);

  const allPaths = new Set([...filesA.keys(), ...filesB.keys()]);
  const result: DirDiffResult = {
    identical: true,
    onlyInA: [],
    onlyInB: [],
    different: [],
    sameCount: 0,
  };

  for (const p of allPaths) {
    const inA = filesA.has(p);
    const inB = filesB.has(p);
    if (inA && !inB) {
      result.onlyInA.push(p);
      result.identical = false;
    } else if (!inA && inB) {
      result.onlyInB.push(p);
      result.identical = false;
    } else {
      const sizeA = filesA.get(p)!;
      const sizeB = filesB.get(p)!;
      if (sizeA !== sizeB) {
        result.different.push(p);
        result.identical = false;
      } else {
        result.sameCount++;
      }
    }
  }

  return result;
}

async function collectFileSet(
  root: string,
  relativeTo = "",
): Promise<Map<string, number>> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const result = new Map<string, number>();
  for (const entry of entries) {
    const relative = relativeTo ? `${relativeTo}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const sub = await collectFileSet(path.join(root, entry.name), relative);
      for (const [k, v] of sub) result.set(k, v);
    } else {
      const info = await fs.stat(path.join(root, entry.name));
      result.set(relative, info.size);
    }
  }
  return result;
}

export async function compareBinaryFiles(
  pathA: string,
  pathB: string,
): Promise<boolean> {
  const bytesA = await fs.readFile(pathA);
  const bytesB = await fs.readFile(pathB);
  if (bytesA.length !== bytesB.length) return false;
  return bytesA.equals(bytesB);
}
