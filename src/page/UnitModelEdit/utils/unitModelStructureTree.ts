/**
 * Pure parser that turns a unit-model `_structure.json` into a renderable tree model for the
 * left-side structure viewer. Mirrors the Rust canonical parse (EndMark.endMarkCount can close
 * multiple folders at once) and the semantic role classification used by the extractor.
 *
 * No IO here: callers supply the already-parsed JSON object.
 */

export type UnitModelNodeKind = "folder" | "item";

export type UnitModelFolderRole =
  | "root"
  | "models"
  | "model-group"
  | "texture-container"
  | "weapon-icon"
  | "nuhlpb"
  | "ragdoll"
  | "nudnbb"
  | "unknown";

export interface UnitModelTreeNode {
  id: string;
  kind: UnitModelNodeKind;
  label: string;
  role?: UnitModelFolderRole;
  fileIndex?: number;
  fileType?: string;
  /** On-disk path relative to the `_structure.json` directory. Item nodes only. */
  fileUrl?: string;
  unk2?: string;
  unk3?: number;
  unk5?: number;
  children?: UnitModelTreeNode[];
}

export interface UnitModelStructureSummary {
  magic: number;
  totalFiles: number;
  unkCount: number;
  modelCount: number;
  textureCount: number;
}

export interface UnitModelStructureTree {
  root: UnitModelTreeNode;
  summary: UnitModelStructureSummary;
}

interface SubFileDataEntry {
  fileIndex: number;
  fileType: string;
  fileBaseName?: string;
  fileUrl?: string;
}

type RawEntry = Record<string, unknown>;

const TEXTURE_CONTAINER_UNK3 = 32;

function asArray(value: unknown): RawEntry[] {
  return Array.isArray(value) ? (value as RawEntry[]) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function basename(fileUrl: string): string {
  return (
    fileUrl
      .replace(/\//g, "\\")
      .split("\\")
      .filter((part) => part.length > 0 && part !== ".")
      .pop() ?? fileUrl
  );
}

function extensionOf(fileType: string, fileUrl: string, fileBaseName: string): string {
  const ft = fileType.trim().toLowerCase();
  if (ft.startsWith(".")) return ft;
  const name = fileUrl ? basename(fileUrl) : fileBaseName;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Intermediate node before role/label resolution. */
type Mid =
  | { kind: "folder"; unk2: string; unk3: number; unk5: number; children: Mid[] }
  | { kind: "item"; fileIndex: number; unk2: string; unk3: number; name?: string };

type Token =
  | { t: "folder"; unk2: string; unk3: number; unk5: number }
  | { t: "item"; fileIndex: number; unk2: string; unk3: number; name?: string }
  | { t: "end" };

function tokenize(entries: RawEntry[]): Token[] {
  const tokens: Token[] = [];
  for (const e of entries) {
    const type = asString(e.type);
    if (type === "Folder") {
      tokens.push({
        t: "folder",
        unk2: asString(e.unk2),
        unk3: asNumber(e.unk3),
        unk5: asNumber(e.unk5),
      });
    } else if (type === "Item") {
      const name = typeof e.Name === "string" ? (e.Name as string) : undefined;
      tokens.push({ t: "item", fileIndex: asNumber(e.fileIndex), unk2: asString(e.unk2), unk3: asNumber(e.unk3), name });
    } else if (type === "EndMark") {
      const count = Math.max(0, asNumber(e.endMarkCount));
      for (let i = 0; i < count; i += 1) tokens.push({ t: "end" });
    }
  }
  return tokens;
}

function parseLevel(tokens: Token[], cursor: { i: number }): Mid[] {
  const out: Mid[] = [];
  while (cursor.i < tokens.length) {
    const tok = tokens[cursor.i];
    if (tok.t === "folder") {
      cursor.i += 1;
      const children = parseLevel(tokens, cursor);
      out.push({ kind: "folder", unk2: tok.unk2, unk3: tok.unk3, unk5: tok.unk5, children });
    } else if (tok.t === "item") {
      out.push({ kind: "item", fileIndex: tok.fileIndex, unk2: tok.unk2, unk3: tok.unk3, name: tok.name });
      cursor.i += 1;
    } else {
      cursor.i += 1;
      return out;
    }
  }
  return out;
}

function folderDescendantExts(node: Mid, lookup: Map<number, string>, out: string[]): void {
  if (node.kind === "item") {
    out.push(lookup.get(node.fileIndex) ?? "");
    return;
  }
  for (const c of node.children) folderDescendantExts(c, lookup, out);
}

function folderHasDirectExt(node: Mid, ext: string, lookup: Map<number, string>): boolean {
  if (node.kind !== "folder") return false;
  return node.children.some((c) => c.kind === "item" && lookup.get(c.fileIndex) === ext);
}

function classifyFolder(node: Mid, lookup: Map<number, string>): UnitModelFolderRole {
  if (node.kind !== "folder") return "unknown";
  if (node.unk3 === TEXTURE_CONTAINER_UNK3) return "texture-container";
  const looksLikeModels = node.children.some(
    (c) => c.kind === "folder" && folderHasDirectExt(c, ".numdlb", lookup),
  );
  if (looksLikeModels) return "models";
  if (folderHasDirectExt(node, ".numdlb", lookup)) return "model-group";

  const exts: string[] = [];
  folderDescendantExts(node, lookup, exts);
  const nonEmpty = exts.filter((e) => e.length > 0);
  if (nonEmpty.length === 0) return "unknown";
  if (nonEmpty.every((e) => e === ".nutexb")) return "weapon-icon";
  if (nonEmpty.every((e) => e === ".nuhlpb")) return "nuhlpb";
  if (nonEmpty.some((e) => e === ".hkt" || e === ".rgdprm")) return "ragdoll";
  if (nonEmpty.every((e) => e === ".nudnbb")) return "nudnbb";
  return "unknown";
}

const ROLE_LABELS: Record<UnitModelFolderRole, string> = {
  root: "Package root",
  models: "models",
  "model-group": "model",
  "texture-container": "texture set",
  "weapon-icon": "weapon_icon",
  nuhlpb: "nuhlpb",
  ragdoll: "ragdoll",
  nudnbb: "nudnbb",
  unknown: "folder",
};

function modelGroupName(node: Mid, lookup: Map<number, string>, baseNames: Map<number, string>): string {
  if (node.kind !== "folder") return ROLE_LABELS["model-group"];
  for (const c of node.children) {
    if (c.kind === "item" && lookup.get(c.fileIndex) === ".numdlb") {
      return c.name ?? baseNames.get(c.fileIndex) ?? ROLE_LABELS["model-group"];
    }
  }
  return ROLE_LABELS["model-group"];
}

function toTreeNode(
  node: Mid,
  path: string,
  lookup: Map<number, string>,
  baseNames: Map<number, string>,
  fileUrls: Map<number, string>,
  isRoot: boolean,
): UnitModelTreeNode {
  if (node.kind === "item") {
    const label = node.name ?? baseNames.get(node.fileIndex) ?? `#${node.fileIndex}`;
    return {
      id: `${path}/i${node.fileIndex}`,
      kind: "item",
      label,
      fileIndex: node.fileIndex,
      fileType: lookup.get(node.fileIndex) ?? "",
      fileUrl: fileUrls.get(node.fileIndex),
      unk2: node.unk2,
      unk3: node.unk3,
    };
  }

  const role = isRoot ? "root" : classifyFolder(node, lookup);
  let label = ROLE_LABELS[role];
  if (role === "model-group") label = modelGroupName(node, lookup, baseNames);

  const children = node.children.map((c, idx) =>
    toTreeNode(c, `${path}/${idx}`, lookup, baseNames, fileUrls, false),
  );

  return {
    id: path,
    kind: "folder",
    label,
    role,
    unk2: node.unk2,
    unk3: node.unk3,
    unk5: node.unk5,
    children,
  };
}

function countModels(node: UnitModelTreeNode): number {
  let count = node.role === "model-group" ? 1 : 0;
  for (const c of node.children ?? []) count += countModels(c);
  return count;
}

/**
 * Collect model-group folder labels in structure (DFS) order. The position in this list is the
 * `folder_index` used by `shell_*.shl` records, so it resolves a SHL slot to its model name.
 */
export function collectModelGroupNames(node: UnitModelTreeNode): string[] {
  const out: string[] = [];
  const walk = (n: UnitModelTreeNode) => {
    if (n.role === "model-group") out.push(n.label);
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return out;
}

/**
 * Build the renderable structure tree from a parsed `_structure.json` object.
 * Throws on malformed input (missing or non-array SubFileStructure / SubFileData).
 */
export function buildUnitModelStructureTree(structureJson: unknown): UnitModelStructureTree {
  if (!structureJson || typeof structureJson !== "object") {
    throw new Error("structure JSON must be an object");
  }
  const obj = structureJson as RawEntry;
  const subFileData = asArray(obj.SubFileData);
  const subFileStructure = asArray(obj.SubFileStructure);
  if (subFileStructure.length === 0) {
    throw new Error("structure JSON has no SubFileStructure entries");
  }

  const data: SubFileDataEntry[] = subFileData.map((e) => ({
    fileIndex: asNumber(e.fileIndex),
    fileType: asString(e.fileType),
    fileBaseName: typeof e.fileBaseName === "string" ? (e.fileBaseName as string) : undefined,
    fileUrl: asString(e.fileUrl),
  }));
  const extByIndex = new Map<number, string>();
  const baseNameByIndex = new Map<number, string>();
  const fileUrlByIndex = new Map<number, string>();
  for (const d of data) {
    extByIndex.set(d.fileIndex, extensionOf(d.fileType, d.fileUrl ?? "", d.fileBaseName ?? ""));
    baseNameByIndex.set(
      d.fileIndex,
      d.fileBaseName ?? (d.fileUrl ? basename(d.fileUrl) : `#${d.fileIndex}`),
    );
    if (d.fileUrl) fileUrlByIndex.set(d.fileIndex, d.fileUrl);
  }

  const tokens = tokenize(subFileStructure);
  const cursor = { i: 0 };
  const top = parseLevel(tokens, cursor);
  if (top.length !== 1 || top[0].kind !== "folder") {
    throw new Error("SubFileStructure root must be a single folder");
  }

  const root = toTreeNode(top[0], "root", extByIndex, baseNameByIndex, fileUrlByIndex, true);
  const textureCount = data.filter((d) => extByIndex.get(d.fileIndex) === ".nutexb").length;

  return {
    root,
    summary: {
      magic: asNumber(obj.Magic),
      totalFiles: data.length || asNumber(obj.Fhm2dTotalCount),
      unkCount: asNumber(obj.UnkCount),
      modelCount: countModels(root),
      textureCount,
    },
  };
}
