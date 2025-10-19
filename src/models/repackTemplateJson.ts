export interface TemplateItem {
  type: 'Folder' | 'Item' | 'EndMark';
  Name?: string;
  unk1?: string;
  unk2?: string;
  unk3?: number;
  unk4?: number;
  folderCount?: number;
  fileIndex?: number;
  originalFileIndex?: number;
  endMarkCount?: number;
}

export interface ModelTemplateItem {
  type: 'Folder' | 'Item' | 'EndMark';
  Name?: string;
  unk1?: string;
  unk2?: string;
  unk3?: number;
  unk4?: number;
  folderCount?: number;
  endMarkCount?: number;
  // Note: fileIndex and originalFileIndex will be calculated dynamically
}

export interface ModelTemplate {
  name: string;
  description: string;
  data: ModelTemplateItem[];
}

export interface RepackTemplate {
  name: string;
  description: string;
  data: TemplateItem[];
}

// Internal model templates without hardcoded indices - these define structure only
export const modelTemplates: ModelTemplate[] = [
  {
    name: "Model",
    description: "Model Folder Structure",
    data: [
      {
        "type": "Item",
        "Name": "1",
        "unk1": "00000000",
        "unk2": "10000000",
        "unk3": 0
      },
      {
        "type": "Folder",
        "Name": "7",
        "unk1": "00000000",
        "unk2": "00000000",
        "unk3": 32,
        "unk4": 1,
        "folderCount": 0
      },
      {
        "type": "EndMark",
        "endMarkCount": 1
      },
      {
        "type": "Item",
        "Name": "2",
        "unk1": "00000000",
        "unk2": "21000000",
        "unk3": 1
      },
      {
        "type": "Folder",
        "Name": "8",
        "unk1": "00000000",
        "unk2": "00000000",
        "unk3": 32,
        "unk4": 1,
        "folderCount": 0
      },
      {
        "type": "EndMark",
        "endMarkCount": 1
      },
      {
        "type": "Item",
        "Name": "3",
        "unk1": "00000000",
        "unk2": "21000000",
        "unk3": 1
      },
      {
        "type": "Item",
        "Name": "4",
        "unk1": "00000000",
        "unk2": "30000000",
        "unk3": 0
      },
      {
        "type": "Item",
        "Name": "5",
        "unk1": "00000000",
        "unk2": "40000000",
        "unk3": 0
      },
      {
        "type": "Item",
        "Name": "6",
        "unk1": "00000000",
        "unk2": "50000000",
        "unk3": 0
      },
    ]
  }
];

// Function to convert modelTemplates to repackTemplates with dynamic index calculation
export function createRepackTemplatesFromModelTemplates(
  getMaxAvailableIndex: () => number,
  getMaxAvailableFileIndex: () => number
): RepackTemplate[] {
  return modelTemplates.map(modelTemplate => {
    let currentIndex = getMaxAvailableIndex();
    let currentFileIndex = getMaxAvailableFileIndex();
    
    const processedData: TemplateItem[] = modelTemplate.data.map(item => {
      if (item.type === 'Item') {
        const processedItem: TemplateItem = {
          ...item,
          fileIndex: currentFileIndex,
          originalFileIndex: currentIndex
        };
        currentIndex++;
        currentFileIndex++;
        return processedItem;
      } else {
        // For Folder and EndMark types, just copy as is
        return { ...item } as TemplateItem;
      }
    });

    return {
      name: modelTemplate.name,
      description: modelTemplate.description,
      data: processedData
    };
  });
}

// Export repackTemplates using modelTemplates - will be updated dynamically
export let repackTemplates: RepackTemplate[] = [];

// Function to update repackTemplates with current indices
export function updateRepackTemplates(
  getMaxAvailableIndex: () => number,
  getMaxAvailableFileIndex: () => number
): void {
  repackTemplates = createRepackTemplatesFromModelTemplates(
    getMaxAvailableIndex,
    getMaxAvailableFileIndex
  );
}
