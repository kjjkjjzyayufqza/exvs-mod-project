import { v4 as uuidv4 } from "uuid";

import type { TreeDataItem } from "@/lib/utils";

export interface RepackSubFileDataItem {
  index: number;
  fileType: string;
  fileIndex: number;
  fileUrl: string;
  isError?: boolean;
  originChunkCount?: number;
  errorCompBufferData?: unknown;
  errorOriginSize?: number;
  originBinChunkBuffer?: unknown;
}

export interface RepackClipboardProjectData<TSubFileData extends RepackSubFileDataItem = RepackSubFileDataItem> {
  Fhm2dTotalCount: number;
  SubFileData: TSubFileData[];
}

interface PasteClipboardItemsParams<
  TSubFileData extends RepackSubFileDataItem = RepackSubFileDataItem,
  TProjectData extends RepackClipboardProjectData<TSubFileData> = RepackClipboardProjectData<TSubFileData>,
> {
  treeData: TreeDataItem[];
  parentId: string;
  clipboardItems: TreeDataItem[];
  completeProjectData: TProjectData | null;
}

interface PasteClipboardItemsResult<
  TSubFileData extends RepackSubFileDataItem = RepackSubFileDataItem,
  TProjectData extends RepackClipboardProjectData<TSubFileData> = RepackClipboardProjectData<TSubFileData>,
> {
  treeData: TreeDataItem[];
  completeProjectData: TProjectData | null;
  pastedItems: TreeDataItem[];
}

function cloneTreeItem(node: TreeDataItem): TreeDataItem {
  return structuredClone(node) as TreeDataItem;
}

function appendChildrenToFolder(nodes: TreeDataItem[], parentId: string, itemsToAppend: TreeDataItem[]): TreeDataItem[] {
  let changed = false;

  const walk = (items: TreeDataItem[]): TreeDataItem[] =>
    items.map((item) => {
      if (item.id === parentId && item.data?.type === "Folder") {
        changed = true;
        const nextChildren = [...(item.children ?? []), ...itemsToAppend];
        return {
          ...item,
          children: nextChildren,
          data: {
            ...item.data,
            folderCount: nextChildren.length,
          },
        };
      }

      if (item.children && item.children.length > 0) {
        const nextChildren = walk(item.children);
        if (nextChildren !== item.children) {
          changed = true;
          return {
            ...item,
            children: nextChildren,
            data:
              item.data?.type === "Folder"
                ? {
                    ...item.data,
                    folderCount: nextChildren.length,
                  }
                : item.data,
          };
        }
      }

      return item;
    });

  const nextTree = walk(nodes);
  return changed ? nextTree : nodes;
}

export function copyNodesToClipboard(treeData: TreeDataItem[], nodeIds: string[]): TreeDataItem[] {
  if (nodeIds.length === 0) {
    return [];
  }

  const idSet = new Set(nodeIds);
  const copiedItems: TreeDataItem[] = [];

  const walk = (items: TreeDataItem[]) => {
    for (const item of items) {
      if (idSet.has(item.id)) {
        copiedItems.push(cloneTreeItem(item));
      }
      if (item.children && item.children.length > 0) {
        walk(item.children);
      }
    }
  };

  walk(treeData);
  return copiedItems;
}

export function pasteClipboardItems<
  TSubFileData extends RepackSubFileDataItem,
  TProjectData extends RepackClipboardProjectData<TSubFileData>,
>({
  treeData,
  parentId,
  clipboardItems,
  completeProjectData,
}: PasteClipboardItemsParams<TSubFileData, TProjectData>): PasteClipboardItemsResult<TSubFileData, TProjectData> {
  if (clipboardItems.length === 0) {
    return {
      treeData,
      completeProjectData,
      pastedItems: [],
    };
  }

  const nextSubFileData = completeProjectData ? [...completeProjectData.SubFileData] : null;
  let addedFileCount = 0;

  const cloneForPaste = (node: TreeDataItem): TreeDataItem => {
    const nextChildren = node.children?.map(cloneForPaste);

    if (node.data?.type === "Item") {
      const d = node.data;
      if (typeof d.fileIndex !== "number") {
        throw new Error(`Pasted item "${node.name}" is missing fileIndex`);
      }
      const preservedFileIndex = d.fileIndex;
      const preservedIndex = typeof d.index === "number" ? d.index : preservedFileIndex;
      const preservedOriginalFileIndex =
        typeof d.originalFileIndex === "number" ? d.originalFileIndex : preservedFileIndex;

      const nextSubFileDataItem = {
        ...(d._originalSubFileData && typeof d._originalSubFileData === "object"
          ? (structuredClone(d._originalSubFileData) as Partial<TSubFileData>)
          : {}),
        index: preservedIndex,
        fileType: d.fileType ?? ".bin",
        fileIndex: preservedFileIndex,
        fileUrl: d.fileUrl ?? `.\\unknown\\${preservedFileIndex}.bin`,
        isError: d.isError,
        originChunkCount: d.originChunkCount,
        errorCompBufferData: d.errorCompBufferData,
        errorOriginSize: d.errorOriginSize,
        originBinChunkBuffer: d.originBinChunkBuffer,
      } as TSubFileData;

      if (nextSubFileData) {
        nextSubFileData.push(nextSubFileDataItem);
        addedFileCount += 1;
      }

      return {
        ...node,
        id: uuidv4(),
        data: {
          ...d,
          index: preservedIndex,
          fileIndex: preservedFileIndex,
          originalFileIndex: preservedOriginalFileIndex,
          _originalSubFileData: nextSubFileDataItem,
        },
        children: nextChildren,
      };
    }

    if (node.data?.type === "Folder") {
      return {
        ...node,
        id: uuidv4(),
        data: {
          ...node.data,
          folderCount: nextChildren?.length ?? 0,
        },
        children: nextChildren,
      };
    }

    return {
      ...node,
      id: uuidv4(),
      children: nextChildren,
    };
  };

  const pastedItems = clipboardItems.map(cloneForPaste);
  const nextTreeData = appendChildrenToFolder(treeData, parentId, pastedItems);
  const nextProjectData =
    completeProjectData && nextSubFileData
      ? ({
          ...completeProjectData,
          Fhm2dTotalCount: completeProjectData.Fhm2dTotalCount + addedFileCount,
          SubFileData: nextSubFileData,
        } as TProjectData)
      : completeProjectData;

  return {
    treeData: nextTreeData,
    completeProjectData: nextProjectData,
    pastedItems,
  };
}
