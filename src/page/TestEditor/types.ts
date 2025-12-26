export type TestTreeNode = {
  id: string;
  name: string;
  path: string;
  isDir: boolean;
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

