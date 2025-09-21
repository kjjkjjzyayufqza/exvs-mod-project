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

export interface RepackTemplate {
  name: string;
  description: string;
  data: TemplateItem[];
}

export const repackTemplates: RepackTemplate[] = [
  {
    name: "Model",
    description: "Model Folder Structure",
    data: [
      {
        "type": "Folder",
        "Name": "8",
        "unk1": "00000000",
        "unk2": "00000000",
        "unk3": 0,
        "unk4": 0,
        "folderCount": 8
      },
      {
        "type": "Item",
        "Name": "92",
        "unk1": "00000000",
        "unk2": "10000000",
        "unk3": 0,
        "fileIndex": 105,
        "originalFileIndex": 92
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
        "Name": "153",
        "unk1": "00000000",
        "unk2": "21000000",
        "unk3": 1,
        "fileIndex": 167,
        "originalFileIndex": 153
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
        "Name": "115",
        "unk1": "00000000",
        "unk2": "21000000",
        "unk3": 1,
        "fileIndex": 129,
        "originalFileIndex": 115
      },
      {
        "type": "Item",
        "Name": "173",
        "unk1": "00000000",
        "unk2": "30000000",
        "unk3": 0,
        "fileIndex": 189,
        "originalFileIndex": 173
      },
      {
        "type": "Item",
        "Name": "193",
        "unk1": "00000000",
        "unk2": "40000000",
        "unk3": 0,
        "fileIndex": 210,
        "originalFileIndex": 193
      },
      {
        "type": "Item",
        "Name": "238",
        "unk1": "00000000",
        "unk2": "50000000",
        "unk3": 0,
        "fileIndex": 256,
        "originalFileIndex": 238
      },
      {
        "type": "EndMark",
        "endMarkCount": 1
      }
    ]
  }
];
