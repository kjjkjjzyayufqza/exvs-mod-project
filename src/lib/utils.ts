import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { v4 as uuidv4 } from 'uuid';

export interface TreeDataItem {
  id: string;
  name: string;
  children?: TreeDataItem[];
  data?: {
    type: 'Folder' | 'Item';
    index?: number;
    fileType?: string;
    fileIndex?: number;
    fileUrl?: string;
    originalFileIndex?: number;
    folderCount?: number;
    unk1?: string;
    unk2?: string;
    unk3?: number;
    unk4?: number;
    link?: boolean;
    isError?: boolean;
    originChunkCount?: number;
    errorCompBufferData?: any;
    errorOriginSize?: number;
    originBinChunkBuffer?: any;
  };
}

// Function to convert SubFileStructure to TreeDataItem format
export const convertSubFileStructureToTreeData = (structureData: any[], subFileData: any[] = []): TreeDataItem[] => {
  const result: TreeDataItem[] = [];
  const stack: TreeDataItem[] = [];

  // Create a map of fileIndex to file info for quick lookup
  const fileInfoMap = new Map();
  subFileData.forEach(file => {
    fileInfoMap.set(file.fileIndex, file);
  });

  for (const item of structureData) {
    if (item.type === "Folder") {
      if (item.folderCount === undefined || item.folderCount === null) {
        throw new Error('Folder folderCount is undefined or null');
      }
      
      const folderId = uuidv4();
      // Use Name field if available, otherwise use folderCount as before
      const folderName = item.Name || `${item.folderCount}`;
      
      const folder: TreeDataItem = {
        id: folderId,
        name: folderName,
        children: [],
        data: {
          type: 'Folder',
          index: item.folderCount,
          folderCount: item.folderCount,
          unk1: item.unk1,
          unk2: item.unk2,
          unk3: item.unk3,
          unk4: item.unk4
        }
      };

      if (stack.length === 0) {
        // Root level folder
        result.push(folder);
      } else {
        // Add to current parent folder
        const parent = stack[stack.length - 1];
        parent.children?.push(folder);
      }

      // Push this folder onto stack as current parent
      stack.push(folder);
    } else if (item.type === "Item") {
      if (item.fileIndex === undefined || item.fileIndex === null) {
        throw new Error('Item fileIndex is undefined or null');
      }
      
      const itemId = uuidv4();
      const fileInfo = fileInfoMap.get(item.fileIndex);
      
      if (!fileInfo) {
        throw new Error(`File info not found for fileIndex: ${item.fileIndex}`);
      }
      
      if (fileInfo.fileType === undefined || fileInfo.fileType === null) {
        throw new Error(`File fileType is undefined or null for fileIndex: ${item.fileIndex}`);
      }
      
      if (fileInfo.fileUrl === undefined || fileInfo.fileUrl === null) {
        throw new Error(`File fileUrl is undefined or null for fileIndex: ${item.fileIndex}`);
      }
      
      // Use Name field if available, otherwise use fileIndex as before
      const itemName = item.Name || `${item.fileIndex}`;
      
      const fileItem: TreeDataItem = {
        id: itemId,
        name: itemName,
        data: {
          type: 'Item',
          index: item.originalFileIndex,
          fileType: fileInfo.fileType,
          fileIndex: item.fileIndex,
          fileUrl: fileInfo.fileUrl,
          originalFileIndex: item.originalFileIndex,
          unk1: item.unk1,
          unk2: item.unk2,
          unk3: item.unk3,
          link: item.unk2 && item.unk2 !== "00000000",
          isError: fileInfo.isError,
          originChunkCount: fileInfo.originChunkCount,
          errorCompBufferData: fileInfo.errorCompBufferData,
          errorOriginSize: fileInfo.errorOriginSize,
          originBinChunkBuffer: fileInfo.originBinChunkBuffer
        }
      };

      if (stack.length > 0) {
        // Add to current folder
        const parent = stack[stack.length - 1];
        parent.children?.push(fileItem);
      } else {
        // Root level item
        result.push(fileItem);
      }
    } else if (item.type === "EndMark") {
      // Handle endMarkCount > 1 by popping multiple levels
      const endMarkCount = item.endMarkCount || 1;
      for (let i = 0; i < endMarkCount && stack.length > 0; i++) {
        stack.pop();
      }
    }
  }

  return result;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
