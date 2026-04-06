export type TestTreeNode = {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
  /** Milliseconds since Unix epoch from host metadata (files and folders). */
  mtimeMs?: number;
  /** File size in bytes (files only; omitted for folders). */
  size?: number;
  isLeaf?: boolean;
  children?: TestTreeNode[];
};

export type FolderChangeOp = {
  type: "add" | "remove" | "modify";
  node: TestTreeNode;
  parentId?: string;
};

export type FolderChangePayload = {
  fullTree?: TestTreeNode[];
  ops?: FolderChangeOp[];
};

